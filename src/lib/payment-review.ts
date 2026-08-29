import { prisma, usesPostgres } from "@/lib/db";
import { currentMoscowWallClockDate } from "@/lib/domain";

const HOUR = 60 * 60 * 1000;

export async function approveBookingPayment(
  bookingId: number,
  adminTelegramId: string,
) {
  const now = new Date();
  const initial = await prisma.botBooking.findUnique({
    where: { id: bookingId },
    include: { lesson: true },
  });
  if (!initial) return { ok: false as const, reason: "not_found" as const };
  if (initial.status === "confirmed") {
    return { ok: false as const, reason: "already" as const, booking: initial };
  }
  if (initial.status !== "review") {
    return { ok: false as const, reason: "changed" as const, booking: initial };
  }

  return prisma.$transaction(async (tx) => {
    if (usesPostgres) {
      await tx.$executeRaw`select pg_advisory_xact_lock(${initial.lessonId})`;
    }
    const booking = await tx.botBooking.findUnique({
      where: { id: bookingId },
      include: { lesson: { include: { attendances: true } } },
    });
    if (!booking || booking.status !== "review" || !booking.clientId) {
      return { ok: false as const, reason: "changed" as const };
    }
    const enrolled = booking.lesson.attendances.filter(
      (item) => item.status !== "absent",
    ).length;
    const alreadyEnrolled = booking.lesson.attendances.some(
      (item) => item.clientId === booking.clientId && item.status !== "absent",
    );
    if (
      booking.lesson.startsAt < currentMoscowWallClockDate() ||
      (!alreadyEnrolled &&
        booking.lesson.capacity &&
        enrolled >= booking.lesson.capacity)
    ) {
      await tx.botBooking.update({
        where: { id: bookingId },
        data: {
          status: "expired",
          reviewedByTelegramId: adminTelegramId,
          reviewedAt: now,
        },
      });
      return { ok: false as const, reason: "full" as const, booking };
    }
    await tx.attendance.upsert({
      where: {
        lessonId_clientId: {
          lessonId: booking.lessonId,
          clientId: booking.clientId,
        },
      },
      create: {
        lessonId: booking.lessonId,
        clientId: booking.clientId,
        status: "enrolled",
        enrollmentSource: "bot",
      },
      update: { status: "enrolled", enrollmentSource: "bot" },
    });
    await tx.botBooking.update({
      where: { id: bookingId },
      data: {
        status: "confirmed",
        reviewedByTelegramId: adminTelegramId,
        reviewedAt: now,
        holdExpiresAt: booking.lesson.startsAt,
      },
    });
    if (booking.kind === "trial") {
      await tx.client.updateMany({
        where: { id: booking.clientId, status: "lead" },
        data: { status: "trial" },
      });
    }
    return { ok: true as const, booking };
  });
}

export async function rejectBookingPayment(
  bookingId: number,
  adminTelegramId: string,
  holdMinutes: number,
) {
  const booking = await prisma.botBooking.findUnique({
    where: { id: bookingId },
    include: { lesson: true },
  });
  if (!booking || booking.status !== "review") return null;
  await prisma.botBooking.update({
    where: { id: bookingId },
    data: {
      status: "rejected",
      reviewedByTelegramId: adminTelegramId,
      reviewedAt: new Date(),
      holdExpiresAt: new Date(
        Math.min(
          booking.lesson.startsAt.getTime(),
          Date.now() + Math.max(5, holdMinutes) * 60 * 1000,
        ),
      ),
    },
  });
  return booking;
}

export async function approveSubscriptionPayment(
  orderId: number,
  adminTelegramId: string,
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 45 * 24 * HOUR);
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.subscriptionOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "review") return null;
    const subscription = await tx.subscription.create({
      data: {
        clientId: order.clientId,
        type: order.type,
        format: order.format,
        tariffName: order.tariffName,
        purchasedAt: now,
        totalLessons: order.totalLessons,
        usedLessons: 0,
        pricePerLesson: order.pricePerLesson,
        expiresAt,
        status: "active",
      },
    });
    await tx.subscriptionOrder.update({
      where: { id: order.id },
      data: {
        status: "confirmed",
        reviewedByTelegramId: adminTelegramId,
        reviewedAt: now,
      },
    });
    await tx.client.updateMany({
      where: { id: order.clientId, status: { not: "barter" } },
      data: { status: "active" },
    });
    return { order, subscription, expiresAt };
  });
  if (result) return { ok: true as const, ...result };

  const existing = await prisma.subscriptionOrder.findUnique({
    where: { id: orderId },
  });
  return {
    ok: false as const,
    reason: existing?.status === "confirmed" ? "already" as const : "changed" as const,
    order: existing,
  };
}

export async function rejectSubscriptionPayment(
  orderId: number,
  adminTelegramId: string,
) {
  const order = await prisma.subscriptionOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "review") return null;
  await prisma.subscriptionOrder.update({
    where: { id: orderId },
    data: {
      status: "rejected",
      reviewedByTelegramId: adminTelegramId,
      reviewedAt: new Date(),
    },
  });
  return order;
}

export async function approveTrainerPayment(
  orderId: number,
  adminTelegramId: string,
) {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.trainerOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "review") return null;

    await tx.trainerOrder.update({
      where: { id: order.id },
      data: {
        status: "confirmed",
        reviewedByTelegramId: adminTelegramId,
        reviewedAt: now,
      },
    });
    await tx.client.update({
      where: { id: order.clientId },
      data: {
        hasTrainer: true,
        trainerPurchasedAt: now,
        trainerProfit: order.profit,
      },
    });
    return order;
  });
  if (result) return { ok: true as const, order: result };

  const existing = await prisma.trainerOrder.findUnique({ where: { id: orderId } });
  return {
    ok: false as const,
    reason: existing?.status === "confirmed" ? "already" as const : "changed" as const,
    order: existing,
  };
}

export async function rejectTrainerPayment(
  orderId: number,
  adminTelegramId: string,
) {
  const order = await prisma.trainerOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "review") return null;
  await prisma.trainerOrder.update({
    where: { id: orderId },
    data: {
      status: "rejected",
      reviewedByTelegramId: adminTelegramId,
      reviewedAt: new Date(),
    },
  });
  return order;
}
