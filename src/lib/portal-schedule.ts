import { Prisma } from "@/generated/prisma/client";
import { prisma, usesPostgres } from "@/lib/db";
import {
  currentMoscowWallClockDate,
  derivedSubStatus,
  formatDateTime,
  GROUP_BOOKING_CREDIT_VALIDITY_MS,
  isUsable,
  remaining,
} from "@/lib/domain";
import {
  sendTelegramMessage,
  telegramAdminIds,
} from "@/lib/telegram-api";

const CANCELLATION_LIMIT_MS = 30 * 60 * 1000;

async function notifyAdmins(message: string) {
  await Promise.allSettled(
    [...telegramAdminIds()].map((chatId) => sendTelegramMessage(chatId, message)),
  );
}

async function lockNumber(
  tx: Prisma.TransactionClient,
  value: number,
) {
  if (usesPostgres) {
    await tx.$executeRaw`select pg_advisory_xact_lock(${value})`;
  }
}

function validateIndividualStart(startsAt: Date) {
  if (Number.isNaN(startsAt.getTime())) throw new Error("Проверьте дату и время");
  if (startsAt <= currentMoscowWallClockDate()) {
    throw new Error("Выберите будущее время занятия");
  }
}

async function ensureIndividualTimeIsFree(
  tx: Prisma.TransactionClient,
  startsAt: Date,
  exceptLessonId?: number,
) {
  const conflict = await tx.lesson.findFirst({
    where: {
      startsAt,
      ...(exceptLessonId ? { id: { not: exceptLessonId } } : {}),
      attendances: { some: { status: { not: "absent" } } },
    },
    select: { id: true },
  });
  if (conflict) throw new Error("Это время уже занято. Выберите другое");
}

export async function scheduleIndividualLesson(
  clientId: number,
  subscriptionId: number,
  startsAt: Date,
) {
  validateIndividualStart(startsAt);
  const result = await prisma.$transaction(async (tx) => {
    await lockNumber(tx, subscriptionId);
    await lockNumber(tx, Math.floor(startsAt.getTime() / 60_000));
    const subscription = await tx.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        client: {
          select: { fullName: true, telegram: true, telegramUserId: true },
        },
      },
    });
    if (
      !subscription ||
      subscription.clientId !== clientId ||
      subscription.format !== "individual"
    ) {
      throw new Error("Индивидуальный абонемент не найден");
    }
    if (!isUsable(subscription, startsAt)) {
      throw new Error("На выбранную дату абонемент уже не действует");
    }
    const scheduled = await tx.attendance.count({
      where: {
        plannedSubscriptionId: subscription.id,
        status: "enrolled",
        lesson: { startsAt: { gte: currentMoscowWallClockDate() } },
      },
    });
    if (scheduled >= remaining(subscription)) {
      throw new Error("Все оставшиеся занятия уже стоят в расписании");
    }
    await ensureIndividualTimeIsFree(tx, startsAt);
    const lesson = await tx.lesson.create({
      data: {
        title: `Индивидуальное · ${subscription.client.fullName}`,
        type: subscription.type,
        format: "individual",
        startsAt,
        capacity: 1,
        attendances: {
          create: {
            clientId,
            status: "enrolled",
            enrollmentSource: "individual",
            plannedSubscriptionId: subscription.id,
          },
        },
      },
    });
    if (subscription.client.telegramUserId) {
      await tx.botBooking.create({
        data: {
          telegramChatId: subscription.client.telegramUserId,
          telegramUserId: subscription.client.telegramUserId,
          username: subscription.client.telegram?.replace(/^@/, "") || null,
          displayName: subscription.client.fullName,
          clientId,
          lessonId: lesson.id,
          status: "confirmed",
          kind: "subscription",
          tariffName: subscription.tariffName,
          amount: 0,
          holdExpiresAt: startsAt,
          reviewedAt: new Date(),
        },
      });
    }
    return { lesson, clientName: subscription.client.fullName, type: subscription.type };
  });
  await notifyAdmins(
    `${result.clientName} запланировала индивидуальное занятие: ${formatDateTime(result.lesson.startsAt)}, ${result.type === "online" ? "онлайн" : "офлайн"}.`,
  );
  return result;
}

export async function cancelIndividualLesson(clientId: number, attendanceId: number) {
  const result = await prisma.$transaction(async (tx) => {
    await lockNumber(tx, attendanceId);
    const attendance = await tx.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        lesson: true,
        client: { select: { fullName: true } },
        plannedSubscription: true,
      },
    });
    if (
      !attendance ||
      attendance.clientId !== clientId ||
      attendance.lesson.format !== "individual" ||
      attendance.status !== "enrolled" ||
      !attendance.plannedSubscription
    ) {
      throw new Error("Запланированное занятие не найдено");
    }
    const now = currentMoscowWallClockDate();
    if (attendance.lesson.startsAt <= now) {
      throw new Error("Прошедшее занятие отменить нельзя");
    }
    const late = attendance.lesson.startsAt.getTime() - now.getTime() < CANCELLATION_LIMIT_MS;
    if (!late) {
      await tx.lesson.delete({ where: { id: attendance.lessonId } });
    } else {
      await lockNumber(tx, attendance.plannedSubscription.id);
      if (remaining(attendance.plannedSubscription) <= 0) {
        throw new Error("В абонементе больше нет занятий");
      }
      const usedLessons = attendance.plannedSubscription.usedLessons + 1;
      await tx.subscription.update({
        where: { id: attendance.plannedSubscription.id },
        data: {
          usedLessons,
          status: derivedSubStatus({ ...attendance.plannedSubscription, usedLessons }, now),
        },
      });
      await tx.attendance.update({
        where: { id: attendance.id },
        data: {
          status: "absent",
          subscriptionId: attendance.plannedSubscription.id,
        },
      });
      await tx.lesson.update({
        where: { id: attendance.lessonId },
        data: { title: `Поздняя отмена · ${attendance.client.fullName}` },
      });
      await tx.botBooking.updateMany({
        where: {
          clientId,
          lessonId: attendance.lessonId,
          status: "confirmed",
        },
        data: { status: "cancelled" },
      });
    }
    return {
      late,
      clientName: attendance.client.fullName,
      startsAt: attendance.lesson.startsAt,
      type: attendance.lesson.type,
    };
  });
  await notifyAdmins(
    `${result.clientName} отменила индивидуальное занятие ${formatDateTime(result.startsAt)}, ${result.type === "online" ? "онлайн" : "офлайн"}.${result.late ? " Отмена менее чем за 30 минут, занятие списано." : " Отмена вовремя, занятие не списано."}`,
  );
  return result;
}

export async function rescheduleIndividualLesson(
  clientId: number,
  attendanceId: number,
  startsAt: Date,
) {
  validateIndividualStart(startsAt);
  const result = await prisma.$transaction(async (tx) => {
    await lockNumber(tx, attendanceId);
    await lockNumber(tx, Math.floor(startsAt.getTime() / 60_000));
    const attendance = await tx.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        lesson: true,
        client: {
          select: { fullName: true, telegram: true, telegramUserId: true },
        },
        plannedSubscription: true,
      },
    });
    if (
      !attendance ||
      attendance.clientId !== clientId ||
      attendance.lesson.format !== "individual" ||
      attendance.status !== "enrolled" ||
      !attendance.plannedSubscription
    ) {
      throw new Error("Запланированное занятие не найдено");
    }
    const now = currentMoscowWallClockDate();
    if (attendance.lesson.startsAt <= now) {
      throw new Error("Прошедшее занятие перенести нельзя");
    }
    if (!isUsable(attendance.plannedSubscription, startsAt)) {
      throw new Error("На новую дату абонемент уже не действует");
    }
    await lockNumber(tx, attendance.plannedSubscription.id);
    await ensureIndividualTimeIsFree(tx, startsAt, attendance.lessonId);

    const late = attendance.lesson.startsAt.getTime() - now.getTime() < CANCELLATION_LIMIT_MS;
    const usedLessons =
      attendance.plannedSubscription.usedLessons + (late ? 1 : 0);
    const otherScheduled = await tx.attendance.count({
      where: {
        plannedSubscriptionId: attendance.plannedSubscription.id,
        status: "enrolled",
        id: { not: attendance.id },
        lesson: { startsAt: { gte: now } },
      },
    });
    if (otherScheduled >= Math.max(0, attendance.plannedSubscription.totalLessons - usedLessons)) {
      throw new Error(
        late
          ? "Поздняя отмена списывает занятие, свободного остатка для новой даты нет"
          : "Все оставшиеся занятия уже стоят в расписании",
      );
    }

    if (late) {
      await tx.subscription.update({
        where: { id: attendance.plannedSubscription.id },
        data: {
          usedLessons,
          status: derivedSubStatus(
            { ...attendance.plannedSubscription, usedLessons },
            now,
          ),
        },
      });
      await tx.attendance.update({
        where: { id: attendance.id },
        data: {
          status: "absent",
          subscriptionId: attendance.plannedSubscription.id,
        },
      });
      await tx.lesson.update({
        where: { id: attendance.lessonId },
        data: { title: `Поздний перенос · ${attendance.client.fullName}` },
      });
    } else {
      await tx.lesson.delete({ where: { id: attendance.lessonId } });
    }

    const newLesson = await tx.lesson.create({
      data: {
        title: `Индивидуальное · ${attendance.client.fullName}`,
        type: attendance.lesson.type,
        format: "individual",
        startsAt,
        capacity: 1,
        attendances: {
          create: {
            clientId,
            status: "enrolled",
            enrollmentSource: "individual",
            plannedSubscriptionId: attendance.plannedSubscription.id,
          },
        },
      },
    });
    const movedReminder = await tx.botBooking.updateMany({
      where: {
        clientId,
        lessonId: attendance.lessonId,
        status: "confirmed",
      },
      data: {
        lessonId: newLesson.id,
        holdExpiresAt: newLesson.startsAt,
        reminder3hSentAt: null,
        reminder1hSentAt: null,
      },
    });
    if (movedReminder.count === 0 && attendance.client.telegramUserId) {
      await tx.botBooking.create({
        data: {
          telegramChatId: attendance.client.telegramUserId,
          telegramUserId: attendance.client.telegramUserId,
          username: attendance.client.telegram?.replace(/^@/, "") || null,
          displayName: attendance.client.fullName,
          clientId,
          lessonId: newLesson.id,
          status: "confirmed",
          kind: "subscription",
          tariffName: attendance.plannedSubscription.tariffName,
          amount: 0,
          holdExpiresAt: newLesson.startsAt,
          reviewedAt: new Date(),
        },
      });
    }
    return {
      late,
      clientName: attendance.client.fullName,
      oldStartsAt: attendance.lesson.startsAt,
      newStartsAt: newLesson.startsAt,
      type: attendance.lesson.type,
    };
  });
  await notifyAdmins(
    `${result.clientName} перенесла индивидуальное занятие: ${formatDateTime(result.oldStartsAt)} → ${formatDateTime(result.newStartsAt)}, ${result.type === "online" ? "онлайн" : "офлайн"}.${result.late ? " Перенос менее чем за 30 минут, прежнее занятие списано." : " Занятие не списано."}`,
  );
  return result;
}

export async function transferGroupLesson(
  clientId: number,
  attendanceId: number,
  targetLessonId: number,
) {
  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        lesson: true,
        client: { select: { fullName: true } },
      },
    });
    if (
      !source ||
      source.clientId !== clientId ||
      source.lesson.format !== "group" ||
      source.lesson.startsAt <= currentMoscowWallClockDate() ||
      source.status !== "enrolled" ||
      source.enrollmentSource === "auto" ||
      source.subscriptionId
    ) {
      throw new Error("Активная запись на групповое занятие не найдена");
    }
    const lockIds = [source.lessonId, targetLessonId].sort((a, b) => a - b);
    for (const id of lockIds) await lockNumber(tx, id);
    const target = await tx.lesson.findUnique({
      where: { id: targetLessonId },
      include: {
        attendances: true,
        botBookings: {
          where: {
            status: { in: ["awaiting_receipt", "review"] },
            holdExpiresAt: { gt: new Date() },
          },
          select: { id: true },
        },
      },
    });
    const now = currentMoscowWallClockDate();
    if (
      !target ||
      target.id === source.lessonId ||
      target.format !== "group" ||
      target.type !== source.lesson.type ||
      target.startsAt <= now
    ) {
      throw new Error("Для переноса выберите другое будущее занятие того же формата");
    }
    const existingTarget = target.attendances.find(
      (item) => item.clientId === clientId,
    );
    if (
      existingTarget &&
      existingTarget.status !== "absent" &&
      existingTarget.enrollmentSource !== "auto"
    ) {
      throw new Error("Вы уже записаны на выбранное занятие");
    }
    const occupied = target.attendances.filter(
      (item) =>
        item.status !== "absent" &&
        item.id !== existingTarget?.id,
    ).length + target.botBookings.length;
    if (target.capacity && occupied >= target.capacity) {
      throw new Error("На выбранном занятии больше нет мест");
    }
    if (existingTarget) {
      await tx.attendance.delete({ where: { id: existingTarget.id } });
    }
    await tx.attendance.update({
      where: { id: source.id },
      data: { lessonId: target.id, enrollmentSource: "portal" },
    });
    await tx.botBooking.updateMany({
      where: {
        clientId,
        lessonId: source.lessonId,
        status: "confirmed",
      },
      data: {
        lessonId: target.id,
        holdExpiresAt: target.startsAt,
        reminder3hSentAt: null,
        reminder1hSentAt: null,
      },
    });
    return {
      clientName: source.client.fullName,
      oldStartsAt: source.lesson.startsAt,
      newStartsAt: target.startsAt,
      type: target.type,
    };
  });
  await notifyAdmins(
    `${result.clientName} перенесла групповое занятие: ${formatDateTime(result.oldStartsAt)} → ${formatDateTime(result.newStartsAt)}, ${result.type === "online" ? "онлайн" : "офлайн"}. С абонемента ничего не списано.`,
  );
  return result;
}

export async function cancelGroupLesson(clientId: number, attendanceId: number) {
  const result = await prisma.$transaction(async (tx) => {
    await lockNumber(tx, attendanceId);
    const attendance = await tx.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        lesson: true,
        client: { select: { fullName: true } },
      },
    });
    const now = currentMoscowWallClockDate();
    if (
      !attendance ||
      attendance.clientId !== clientId ||
      attendance.lesson.format !== "group" ||
      attendance.lesson.startsAt <= now ||
      attendance.status !== "enrolled" ||
      attendance.enrollmentSource === "auto" ||
      attendance.subscriptionId
    ) {
      throw new Error("Активная запись на групповое занятие не найдена");
    }

    const booking = await tx.botBooking.findFirst({
      where: {
        clientId,
        lessonId: attendance.lessonId,
        status: "confirmed",
      },
      orderBy: { createdAt: "desc" },
    });
    const keepInReserve = Boolean(
      booking &&
      booking.amount > 0 &&
      ["trial", "single"].includes(booking.kind),
    );
    const reserveUntil = keepInReserve
      ? new Date(now.getTime() + GROUP_BOOKING_CREDIT_VALIDITY_MS)
      : null;

    await tx.attendance.delete({ where: { id: attendance.id } });
    if (booking && reserveUntil) {
      await tx.botBooking.update({
        where: { id: booking.id },
        data: {
          status: "credit",
          holdExpiresAt: reserveUntil,
          reminder3hSentAt: null,
          reminder1hSentAt: null,
        },
      });
    } else {
      await tx.botBooking.updateMany({
        where: {
          clientId,
          lessonId: attendance.lessonId,
          status: "confirmed",
        },
        data: { status: "cancelled" },
      });
    }

    return {
      clientName: attendance.client.fullName,
      startsAt: attendance.lesson.startsAt,
      type: attendance.lesson.type,
      reserveUntil,
    };
  });

  await notifyAdmins(
    `${result.clientName} отменила групповое занятие ${formatDateTime(result.startsAt)}, ${result.type === "online" ? "онлайн" : "офлайн"}.${result.reserveUntil ? ` Оплаченное занятие сохранено в запасе до ${formatDateTime(result.reserveUntil)}.` : " С абонемента ничего не списано."}`,
  );
  return result;
}
