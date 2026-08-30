import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  currentMoscowWallClockDate,
  derivedSubStatus,
  formatDateTime,
  remaining,
  TRAINER_PRICE_DEFAULT,
  TRAINER_PROFIT_DEFAULT,
} from "@/lib/domain";
import { DEFAULT_BOT_TEXT, getBotSettings } from "@/lib/bot-settings";
import {
  approveBookingPayment,
  approveSubscriptionPayment,
  approveTrainerPayment,
  rejectBookingPayment,
  rejectSubscriptionPayment,
  rejectTrainerPayment,
} from "@/lib/payment-review";
import { ensureDefaultPriceItems } from "@/lib/prices";
import {
  createBooking,
  hasUsedTrial,
  requireSubscription,
} from "@/lib/telegram-client-bot";
import { sendTelegramMessage, telegramAdminIds } from "@/lib/telegram-api";
import { validateTelegramMiniAppData } from "@/lib/telegram-miniapp-auth";
import {
  cancelGroupLesson,
  cancelIndividualLesson,
  rescheduleIndividualLesson,
  scheduleIndividualLesson,
  transferGroupLesson,
} from "@/lib/portal-schedule";
import {
  bindClientWithPortalToken,
  syncTelegramClient,
} from "@/lib/telegram-client-sync";

export const dynamic = "force-dynamic";

type PortalPayment = {
  kind: "booking" | "subscription" | "trainer" | "visit" | "legacy_subscription";
  id: number;
  title: string;
  detail: string;
  amount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  hasReceipt: boolean;
  receiptName: string | null;
  receiptMimeType: string | null;
  clientName?: string;
};

type PortalLessonHistory = {
  id: string;
  startsAt: string;
  hasTime: boolean;
  type: string;
  format: string;
  title: string;
};

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function identity(req: NextRequest) {
  return validateTelegramMiniAppData(
    req.headers.get("x-telegram-init-data") || "",
  );
}

async function resolveClient(req: NextRequest) {
  const auth = identity(req);
  const client = auth.startParam?.startsWith("link_")
    ? await bindClientWithPortalToken(auth.startParam.slice(5), auth.user)
    : await syncTelegramClient(auth.user);
  return { ...auth, client };
}

function errorResponse(error: unknown, status = 400) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Не удалось выполнить действие" },
    { status },
  );
}

export async function GET(req: NextRequest) {
  try {
    const { user, client } = await resolveClient(req);
    const now = currentMoscowWallClockDate();
    await ensureDefaultPriceItems();

    const fullClient = await prisma.client.findUniqueOrThrow({
      where: { id: client.id },
      include: {
        subscriptions: { orderBy: { purchasedAt: "desc" } },
      },
    });
    const subscriptionsWithStatus = fullClient.subscriptions.map((item) => ({
      item,
      status: derivedSubStatus(item, now),
    }));
    const visibleSubscriptions = subscriptionsWithStatus.filter(
      ({ status }) => status !== "finished_lessons" && status !== "finished_term",
    );
    const hasSubscriptionHistory = fullClient.subscriptions.length > 0;
    const subscriptionTypes = new Set(
      fullClient.subscriptions.map((item) => item.type),
    );
    const usableSubscriptionFormats = new Set(
      subscriptionsWithStatus
        .filter(
          ({ item, status }) =>
            (status === "active" || status === "ending") &&
            !item.frozen &&
            remaining(item) > 0,
        )
        .map(({ item }) => item.format),
    );
    const hasOnlyIndividualSubscription =
      usableSubscriptionFormats.size === 1 &&
      usableSubscriptionFormats.has("individual");
    const lessons = await prisma.lesson.findMany({
      where: { startsAt: { gte: now }, format: "group" },
      include: {
        attendances: {
          where: { status: { not: "absent" } },
          select: { id: true, clientId: true, enrollmentSource: true },
        },
        botBookings: {
          where: {
            status: { in: ["awaiting_receipt", "review"] },
            holdExpiresAt: { gt: new Date() },
          },
          select: { id: true },
        },
      },
      orderBy: { startsAt: "asc" },
      take: 40,
    });
    const scheduledAttendances = await prisma.attendance.findMany({
      where: {
        clientId: client.id,
        status: "enrolled",
        enrollmentSource: { not: "auto" },
        lesson: { startsAt: { gte: now } },
      },
      include: { lesson: true },
      orderBy: { lesson: { startsAt: "asc" } },
      take: 100,
    });
    const bookings = await prisma.botBooking.findMany({
      where: {
        clientId: client.id,
        status: { in: ["awaiting_receipt", "review", "confirmed"] },
        lesson: { startsAt: { gte: now } },
      },
      include: { lesson: true },
      orderBy: { lesson: { startsAt: "asc" } },
    });
    const prices = await prisma.priceItem.findMany({
      where: { active: true },
      orderBy: [
        { type: "asc" },
        { format: "asc" },
        { sortOrder: "asc" },
        { id: "asc" },
      ],
    });
    const singleVisits = await prisma.singleVisit.findMany({
      where: { clientId: client.id },
      orderBy: { date: "desc" },
      take: 200,
    });
    const attendanceHistory = await prisma.attendance.findMany({
      where: { clientId: client.id, status: "present" },
      include: { lesson: true, subscription: true },
      orderBy: { lesson: { startsAt: "desc" } },
      take: 200,
    });
    const subscriptionVisitHistory = await prisma.subscriptionVisit.findMany({
      where: { subscription: { clientId: client.id } },
      include: { subscription: true },
      orderBy: { date: "desc" },
      take: 200,
    });
    const confirmedTrialBookings = await prisma.botBooking.findMany({
      where: {
        clientId: client.id,
        kind: "trial",
        status: { in: ["confirmed", "credit"] },
      },
      select: {
        lesson: {
          select: {
            type: true,
            attendances: {
              where: { clientId: client.id, status: "present" },
              select: { id: true },
            },
          },
        },
      },
    });
    const settings = await getBotSettings();
    const bookingPayments = await prisma.botBooking.findMany({
      where: {
        clientId: client.id,
        amount: { gt: 0 },
        status: { not: "cancelled" },
      },
      include: { lesson: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const hasGroupBookingCredit = bookingPayments.some(
      (item) => item.status === "credit" && item.holdExpiresAt > now,
    );
    const showGroupSchedule =
      !hasOnlyIndividualSubscription || hasGroupBookingCredit;
    const subscriptionPayments = await prisma.subscriptionOrder.findMany({
      where: {
        clientId: client.id,
        status: { not: "cancelled" },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const trainerPayments = await prisma.trainerOrder.findMany({
      where: {
        clientId: client.id,
        status: { not: "cancelled" },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const hasMatchingSubscriptionOrder = (subscription: typeof fullClient.subscriptions[number]) =>
      subscriptionPayments.some((order) => {
        if (order.status !== "confirmed") return false;
        const reviewedAt = order.reviewedAt || order.updatedAt;
        return order.type === subscription.type &&
          order.format === subscription.format &&
          order.totalLessons === subscription.totalLessons &&
          Math.abs(reviewedAt.getTime() - subscription.purchasedAt.getTime()) < 5 * 60 * 1000;
      });
    const payments: PortalPayment[] = [
      ...bookingPayments.map((item) => ({
        kind: "booking" as const,
        id: item.id,
        title: item.tariffName || "Занятие",
        detail: item.status === "credit"
          ? `В запасе до ${formatDateTime(item.holdExpiresAt)} · ${item.lesson.type === "online" ? "онлайн" : "офлайн"}`
          : `${formatDateTime(item.lesson.startsAt)} · ${item.lesson.type === "online" ? "онлайн" : "офлайн"}`,
        amount: item.amount,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        hasReceipt: Boolean(item.receiptFileId),
        receiptName: item.receiptFileName,
        receiptMimeType: item.receiptMimeType,
      })),
      ...subscriptionPayments.map((item) => ({
        kind: "subscription" as const,
        id: item.id,
        title: item.tariffName,
        detail: `${item.totalLessons} занятий · ${item.type === "online" ? "онлайн" : "офлайн"}`,
        amount: item.amount,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        hasReceipt: Boolean(item.receiptFileId),
        receiptName: item.receiptFileName,
        receiptMimeType: item.receiptMimeType,
      })),
      ...trainerPayments.map((item) => ({
        kind: "trainer" as const,
        id: item.id,
        title: "Тренажёр «Волна»",
        detail: "Покупка тренажёра",
        amount: item.amount,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        hasReceipt: Boolean(item.receiptFileId),
        receiptName: item.receiptFileName,
        receiptMimeType: item.receiptMimeType,
      })),
      ...singleVisits
        .filter((item) => item.amount > 0)
        .map((item) => ({
          kind: "visit" as const,
          id: item.id,
          title: item.tariffName ||
            (item.kind === "trial" ? "Пробное занятие" : "Разовое занятие"),
          detail: `${item.kind === "trial" ? "Пробное" : "Разовое"} · ${item.type === "online" ? "онлайн" : "офлайн"}`,
          amount: Math.round(item.amount),
          status: "confirmed",
          createdAt: item.date.toISOString(),
          updatedAt: item.createdAt.toISOString(),
          hasReceipt: false,
          receiptName: null,
          receiptMimeType: null,
        })),
      ...fullClient.subscriptions
        .filter((item) =>
          item.pricePerLesson > 0 &&
          item.totalLessons > 0 &&
          !hasMatchingSubscriptionOrder(item)
        )
        .map((item) => ({
          kind: "legacy_subscription" as const,
          id: item.id,
          title: item.tariffName || "Абонемент",
          detail: `${item.totalLessons} занятий · ${item.type === "online" ? "онлайн" : "офлайн"}`,
          amount: Math.round(item.pricePerLesson * item.totalLessons),
          status: "confirmed",
          createdAt: item.purchasedAt.toISOString(),
          updatedAt: item.createdAt.toISOString(),
          hasReceipt: false,
          receiptName: null,
          receiptMimeType: null,
        })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const attendanceKeys = new Set(
      attendanceHistory.map((item) => `${dayKey(item.lesson.startsAt)}:${item.lesson.type}`),
    );
    const lessonHistory: PortalLessonHistory[] = [
      ...attendanceHistory.map((item) => {
        const matchingVisit = singleVisits.find(
          (visit) =>
            visit.type === item.lesson.type &&
            dayKey(visit.date) === dayKey(item.lesson.startsAt),
        );
        return {
          id: `attendance:${item.id}`,
          startsAt: item.lesson.startsAt.toISOString(),
          hasTime: true,
          type: item.lesson.type,
          format: item.lesson.format,
          title: matchingVisit?.tariffName ||
            item.subscription?.tariffName ||
            item.lesson.title ||
            "Занятие",
        };
      }),
      ...singleVisits
        .filter((item) => !attendanceKeys.has(`${dayKey(item.date)}:${item.type}`))
        .map((item) => ({
          id: `visit:${item.id}`,
          startsAt: item.date.toISOString(),
          hasTime: false,
          type: item.type,
          format: "group",
          title: item.tariffName ||
            (item.kind === "trial" ? "Пробное занятие" : "Разовое занятие"),
        })),
      ...subscriptionVisitHistory
        .filter((item) => !attendanceKeys.has(
          `${dayKey(item.date)}:${item.subscription.type}`,
        ))
        .map((item) => ({
          id: `subscription-visit:${item.id}`,
          startsAt: item.date.toISOString(),
          hasTime: false,
          type: item.subscription.type,
          format: item.subscription.format,
          title: item.subscription.tariffName || "Занятие по абонементу",
        })),
    ].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const trainerOrderStatus = trainerPayments.find((item) =>
      ["awaiting_receipt", "review", "rejected"].includes(item.status)
    )?.status || null;
    const finishedSubscriptions = subscriptionsWithStatus.filter(
      ({ status }) => status === "finished_lessons" || status === "finished_term",
    ).length;
    const shouldOfferTrainer =
      !fullClient.hasTrainer &&
      fullClient.status !== "barter" &&
      !trainerOrderStatus &&
      (
        finishedSubscriptions > 0 ||
        fullClient.subscriptions.length >= 2 ||
        lessonHistory.length >= 8
      );
    const trainerUpsell = shouldOfferTrainer
      ? {
          title: "Добавьте домашнюю практику",
          text: fullClient.subscriptions.length >= 2
            ? "Вы уже занимаетесь не первый абонемент. Тренажёр «Волна» поможет закреплять технику дома между занятиями."
            : finishedSubscriptions > 0
              ? "Первый абонемент уже пройден. Тренажёр «Волна» поможет продолжать практику дома и усилить результат."
              : `У вас уже ${lessonHistory.length} занятий. Тренажёр «Волна» поможет глубже чувствовать работу мышц между тренировками.`,
        }
      : null;

    const isAdmin = telegramAdminIds().has(String(user.id));
    const adminBookingPayments = isAdmin
      ? await prisma.botBooking.findMany({
          where: {
            receiptFileId: { not: null },
            status: { in: ["review", "confirmed", "rejected", "expired"] },
          },
          include: { lesson: true, client: true },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      : [];
    const adminSubscriptionPayments = isAdmin
      ? await prisma.subscriptionOrder.findMany({
          where: {
            receiptFileId: { not: null },
            status: { in: ["review", "confirmed", "rejected"] },
          },
          include: { client: true },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      : [];
    const adminTrainerPayments = isAdmin
      ? await prisma.trainerOrder.findMany({
          where: {
            receiptFileId: { not: null },
            status: { in: ["review", "confirmed", "rejected"] },
          },
          include: { client: true },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      : [];
    const adminPayments: PortalPayment[] = [
      ...adminBookingPayments.map((item) => ({
        kind: "booking" as const,
        id: item.id,
        title: item.tariffName || "Занятие",
        detail: `${formatDateTime(item.lesson.startsAt)} · ${item.lesson.type === "online" ? "онлайн" : "офлайн"}`,
        amount: item.amount,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        hasReceipt: true,
        receiptName: item.receiptFileName,
        receiptMimeType: item.receiptMimeType,
        clientName: item.client?.fullName || item.displayName || "Клиент",
      })),
      ...adminSubscriptionPayments.map((item) => ({
        kind: "subscription" as const,
        id: item.id,
        title: item.tariffName,
        detail: `${item.totalLessons} занятий · ${item.type === "online" ? "онлайн" : "офлайн"}`,
        amount: item.amount,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        hasReceipt: true,
        receiptName: item.receiptFileName,
        receiptMimeType: item.receiptMimeType,
        clientName: item.client.fullName,
      })),
      ...adminTrainerPayments.map((item) => ({
        kind: "trainer" as const,
        id: item.id,
        title: "Тренажёр «Волна»",
        detail: "Покупка тренажёра",
        amount: item.amount,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        hasReceipt: true,
        receiptName: item.receiptFileName,
        receiptMimeType: item.receiptMimeType,
        clientName: item.client.fullName,
      })),
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const availableLessons = lessons
      .map((lesson) => {
        const occupied =
          lesson.attendances.filter(
            (attendance) =>
              attendance.clientId !== client.id ||
              attendance.enrollmentSource !== "auto",
          ).length + lesson.botBookings.length;
        const free = lesson.capacity ? Math.max(0, lesson.capacity - occupied) : null;
        return {
          id: lesson.id,
          title: lesson.title || "Групповое занятие",
          type: lesson.type,
          startsAt: lesson.startsAt.toISOString(),
          free,
          available: free === null || free > 0,
        };
      })
      .filter((lesson) => lesson.available);
    const usedTrialTypes = new Set([
      ...singleVisits.filter((visit) => visit.kind === "trial").map((visit) => visit.type),
      ...confirmedTrialBookings.map((booking) => booking.lesson.type),
    ]);
    const attendedTrialTypes = new Set([
      ...singleVisits.filter((visit) => visit.kind === "trial").map((visit) => visit.type),
      ...confirmedTrialBookings
        .filter((booking) => booking.lesson.attendances.length > 0)
        .map((booking) => booking.lesson.type),
    ]);
    const onlineTrialPrice = prices.find(
      (price) =>
        price.kind === "trial" &&
        price.type === "online" &&
        price.format === "group",
    );
    const hasUpcomingOnlineTrial = bookings.some(
      (booking) => booking.kind === "trial" && booking.lesson.type === "online",
    );
    const trialCrossSell =
      !subscriptionTypes.has("online") &&
      attendedTrialTypes.has("offline") &&
      !usedTrialTypes.has("online") &&
      !hasUpcomingOnlineTrial &&
      onlineTrialPrice &&
      availableLessons.some((lesson) => lesson.type === "online")
        ? { priceItemId: onlineTrialPrice.id, price: onlineTrialPrice.price }
        : null;

    return NextResponse.json({
      user: {
        firstName: user.first_name,
        photoUrl: user.photo_url ?? null,
        username: user.username ? `@${user.username}` : null,
      },
      client: {
        id: fullClient.id,
        fullName: fullClient.fullName,
        telegram: fullClient.telegram,
      },
      subscriptions: visibleSubscriptions.map(({ item, status }) => ({
        id: item.id,
        type: item.type,
        format: item.format,
        name: item.tariffName || "Абонемент",
        totalLessons: item.totalLessons,
        unlimited: item.unlimited,
        usedLessons: item.usedLessons,
        remaining: remaining(item),
        expiresAt: item.expiresAt.toISOString(),
        status,
        frozen: item.frozen,
        scheduledLessons: scheduledAttendances.filter(
          (attendance) => attendance.plannedSubscriptionId === item.id,
        ).length,
      })),
      hasSubscriptionHistory,
      bookingCredits: bookingPayments
        .filter((item) => item.status === "credit" && item.holdExpiresAt > now)
        .map((item) => ({
          id: item.id,
          title: item.tariffName || "Оплаченное занятие",
          kind: item.kind,
          type: item.lesson.type,
          expiresAt: item.holdExpiresAt.toISOString(),
        })),
      lessons: availableLessons,
      scheduledLessons: scheduledAttendances.map((attendance) => ({
        attendanceId: attendance.id,
        lessonId: attendance.lessonId,
        startsAt: attendance.lesson.startsAt.toISOString(),
        type: attendance.lesson.type,
        format: attendance.lesson.format,
        title: attendance.lesson.title ||
          (attendance.lesson.format === "individual"
            ? "Индивидуальное занятие"
            : "Групповое занятие"),
        plannedSubscriptionId: attendance.plannedSubscriptionId,
      })),
      bookings: bookings.map((item) => ({
        id: item.id,
        lessonId: item.lessonId,
        status: item.status,
        kind: item.kind,
        amount: item.amount,
        startsAt: item.lesson.startsAt.toISOString(),
        type: item.lesson.type,
        title: item.lesson.title || "Занятие",
      })),
      prices: prices
        .filter(
          (item) =>
            item.kind !== "trial" ||
            (!subscriptionTypes.has(item.type) && !usedTrialTypes.has(item.type)),
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          kind: item.kind,
          format: item.format,
          price: item.price,
          minLessons: item.kind === "subscription" ? (item.minLessons || 4) : 1,
          requiresLesson: item.kind !== "subscription" && item.format === "group",
        })),
      trialCrossSell,
      showGroupSchedule,
      lessonHistory,
      trainerUpsell,
      paymentReady: Boolean(settings.paymentDetails),
      paymentDetails: settings.paymentDetails || "",
      payments,
      isAdmin,
      adminPayments,
      adminPendingCount: adminPayments.filter((item) => item.status === "review").length,
      trainer: {
        text: settings.trainerText || DEFAULT_BOT_TEXT.trainer,
        imageUrl: "/miniapp-trainer-product-fast.jpg",
        hasTrainer: fullClient.hasTrainer,
        price: TRAINER_PRICE_DEFAULT,
        orderStatus: trainerOrderStatus,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, client } = await resolveClient(req);
    const body = (await req.json()) as {
      action?: string;
      lessonId?: number;
      priceItemId?: number;
      totalLessons?: number;
      paymentKind?: "booking" | "subscription" | "trainer";
      paymentId?: number;
      decision?: "approve" | "reject";
      attendanceId?: number;
      targetLessonId?: number;
      subscriptionId?: number;
      startsAt?: string;
    };

    if (["book", "purchaseTariff"].includes(body.action || "")) {
      const subscribed = await requireSubscription(String(user.id), String(user.id));
      if (!subscribed) {
        throw new Error("Сначала подпишитесь на канал @VUMEXCLUSIVE и повторите действие");
      }
    }

    if (body.action === "scheduleIndividual") {
      const subscriptionId = Number(body.subscriptionId);
      const startsAt = new Date(`${String(body.startsAt || "")}Z`);
      if (!Number.isInteger(subscriptionId) || subscriptionId < 1) {
        throw new Error("Абонемент не выбран");
      }
      await scheduleIndividualLesson(client.id, subscriptionId, startsAt);
      return NextResponse.json({ ok: true, message: "Занятие добавлено в расписание" });
    }

    if (body.action === "cancelIndividual") {
      const attendanceId = Number(body.attendanceId);
      if (!Number.isInteger(attendanceId) || attendanceId < 1) {
        throw new Error("Занятие не найдено");
      }
      const result = await cancelIndividualLesson(client.id, attendanceId);
      return NextResponse.json({
        ok: true,
        message: result.late
          ? "Занятие отменено и списано, потому что осталось меньше 30 минут"
          : "Занятие отменено без списания",
      });
    }

    if (body.action === "rescheduleIndividual") {
      const attendanceId = Number(body.attendanceId);
      const startsAt = new Date(`${String(body.startsAt || "")}Z`);
      if (!Number.isInteger(attendanceId) || attendanceId < 1) {
        throw new Error("Занятие не найдено");
      }
      const result = await rescheduleIndividualLesson(client.id, attendanceId, startsAt);
      return NextResponse.json({
        ok: true,
        message: result.late
          ? "Новая дата сохранена, прежнее занятие списано по правилу 30 минут"
          : "Занятие перенесено без списания",
      });
    }

    if (body.action === "transferGroup") {
      const attendanceId = Number(body.attendanceId);
      const targetLessonId = Number(body.targetLessonId);
      if (
        !Number.isInteger(attendanceId) ||
        attendanceId < 1 ||
        !Number.isInteger(targetLessonId) ||
        targetLessonId < 1
      ) {
        throw new Error("Выберите занятие для переноса");
      }
      await transferGroupLesson(client.id, attendanceId, targetLessonId);
      return NextResponse.json({ ok: true, message: "Запись перенесена без списания" });
    }

    if (body.action === "cancelGroup") {
      const attendanceId = Number(body.attendanceId);
      if (!Number.isInteger(attendanceId) || attendanceId < 1) {
        throw new Error("Занятие не найдено");
      }
      const result = await cancelGroupLesson(client.id, attendanceId);
      return NextResponse.json({
        ok: true,
        message: result.reserveUntil
          ? `Запись отменена. Оплаченное занятие в запасе до ${formatDateTime(result.reserveUntil)}`
          : "Запись отменена без списания с абонемента",
      });
    }

    if (body.action === "cancelPayment") {
      const id = Number(body.paymentId);
      if (!Number.isInteger(id) || id < 1 || !body.paymentKind) {
        throw new Error("Покупка не найдена");
      }
      let cancelled = 0;
      if (body.paymentKind === "booking") {
        const result = await prisma.botBooking.updateMany({
          where: {
            id,
            clientId: client.id,
            status: { in: ["awaiting_receipt", "rejected"] },
          },
          data: { status: "cancelled" },
        });
        cancelled = result.count;
      } else if (body.paymentKind === "subscription") {
        const result = await prisma.subscriptionOrder.updateMany({
          where: {
            id,
            clientId: client.id,
            status: { in: ["awaiting_receipt", "rejected"] },
          },
          data: { status: "cancelled" },
        });
        cancelled = result.count;
      } else if (body.paymentKind === "trainer") {
        const result = await prisma.trainerOrder.updateMany({
          where: {
            id,
            clientId: client.id,
            status: { in: ["awaiting_receipt", "rejected"] },
          },
          data: { status: "cancelled" },
        });
        cancelled = result.count;
      }
      if (!cancelled) {
        throw new Error("Эту покупку уже нельзя отменить: чек на проверке или оплата подтверждена");
      }
      return NextResponse.json({ ok: true, message: "Покупка и бронь места отменены" });
    }

    if (body.action === "reviewPayment") {
      const adminId = String(user.id);
      if (!telegramAdminIds().has(adminId)) throw new Error("Нет доступа");
      const id = Number(body.paymentId);
      if (!Number.isInteger(id) || id < 1) throw new Error("Платёж не найден");
      if (!body.paymentKind || !body.decision) throw new Error("Действие не выбрано");

      if (body.paymentKind === "booking" && body.decision === "approve") {
        const result = await approveBookingPayment(id, adminId);
        if (!result.ok) {
          if (result.reason === "trial_used" && result.booking) {
            const format = result.booking.lesson.type === "online" ? "онлайн" : "офлайн";
            await sendTelegramMessage(
              result.booking.telegramChatId,
              `Пробное ${format}-занятие уже было использовано. Выберите разовое занятие или абонемент.`,
            ).catch(() => undefined);
          }
          throw new Error(
            result.reason === "full"
              ? "Занятие уже прошло или мест больше нет"
              : result.reason === "trial_used"
                ? "Пробное этого формата уже использовано"
              : "Платёж уже обработан",
          );
        }
        await sendTelegramMessage(
          result.booking.telegramChatId,
          `Оплата подтверждена. Вы записаны: ${formatDateTime(result.booking.lesson.startsAt)}, ${result.booking.lesson.type === "online" ? "онлайн" : "офлайн"}.`,
        ).catch(() => undefined);
        return NextResponse.json({ ok: true, message: "Оплата подтверждена" });
      }

      if (body.paymentKind === "booking" && body.decision === "reject") {
        const settings = await getBotSettings();
        const booking = await rejectBookingPayment(
          id,
          adminId,
          settings.bookingHoldMinutes,
        );
        if (!booking) throw new Error("Платёж уже обработан");
        await sendTelegramMessage(
          booking.telegramChatId,
          "Чек отклонён. Загрузите корректную фотографию или PDF в личном кабинете.",
        ).catch(() => undefined);
        return NextResponse.json({ ok: true, message: "Чек отклонён" });
      }

      if (body.paymentKind === "subscription" && body.decision === "approve") {
        const result = await approveSubscriptionPayment(id, adminId);
        if (!result.ok) throw new Error("Платёж уже обработан");
        const until = new Intl.DateTimeFormat("ru-RU", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(result.expiresAt);
        await sendTelegramMessage(
          result.order.telegramChatId,
          `Оплата подтверждена. Абонемент на ${result.order.totalLessons} занятий активирован до ${until}.`,
        ).catch(() => undefined);
        return NextResponse.json({ ok: true, message: "Абонемент активирован" });
      }

      if (body.paymentKind === "subscription" && body.decision === "reject") {
        const order = await rejectSubscriptionPayment(id, adminId);
        if (!order) throw new Error("Платёж уже обработан");
        await sendTelegramMessage(
          order.telegramChatId,
          "Чек отклонён. Загрузите корректную фотографию или PDF в личном кабинете.",
        ).catch(() => undefined);
        return NextResponse.json({ ok: true, message: "Чек отклонён" });
      }

      if (body.paymentKind === "trainer" && body.decision === "approve") {
        const result = await approveTrainerPayment(id, adminId);
        if (!result.ok) throw new Error("Платёж уже обработан");
        await sendTelegramMessage(
          result.order.telegramChatId,
          "Оплата подтверждена. Тренажёр «Волна» отмечен в вашем личном кабинете.",
        ).catch(() => undefined);
        return NextResponse.json({ ok: true, message: "Покупка тренажёра подтверждена" });
      }

      if (body.paymentKind === "trainer" && body.decision === "reject") {
        const order = await rejectTrainerPayment(id, adminId);
        if (!order) throw new Error("Платёж уже обработан");
        await sendTelegramMessage(
          order.telegramChatId,
          "Чек отклонён. Загрузите корректную фотографию или PDF в личном кабинете.",
        ).catch(() => undefined);
        return NextResponse.json({ ok: true, message: "Чек отклонён" });
      }
    }

    if (body.action === "book") {
      const lessonId = Number(body.lessonId);
      if (!Number.isInteger(lessonId) || lessonId < 1) {
        throw new Error("Занятие не выбрано");
      }
      if (body.priceItemId) {
        const selectedPrice = await prisma.priceItem.findFirst({
          where: { id: Number(body.priceItemId), active: true },
          select: { kind: true, type: true },
        });
        if (!selectedPrice) throw new Error("Тариф больше недоступен");
        if (
          selectedPrice.kind === "trial" &&
          (selectedPrice.type === "online" || selectedPrice.type === "offline") &&
          await hasUsedTrial(client.id, selectedPrice.type)
        ) {
          const format = selectedPrice.type === "online" ? "онлайн" : "офлайн";
          throw new Error(
            `Пробное ${format}-занятие уже использовано. Выберите разовое занятие или абонемент.`,
          );
        }
      }
      await createBooking(String(user.id), user, lessonId, {
        notifyChat: false,
        priceItemId: body.priceItemId,
      });
      const booking = await prisma.botBooking.findFirst({
        where: {
          clientId: client.id,
          lessonId,
          status: { in: ["awaiting_receipt", "review", "confirmed"] },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({
        ok: true,
        paymentRequired: booking?.status === "awaiting_receipt" || booking?.status === "review",
        message:
          booking?.status === "awaiting_receipt"
            ? "Место сохранено. Оплатите и прикрепите чек."
            : "Вы записаны на занятие",
      });
    }

    if (body.action === "buyTrainer") {
      const currentClient = await prisma.client.findUniqueOrThrow({
        where: { id: client.id },
        select: { hasTrainer: true },
      });
      if (currentClient.hasTrainer) {
        throw new Error("Тренажёр уже отмечен как купленный");
      }
      const settings = await getBotSettings();
      if (!settings.paymentDetails) {
        throw new Error("Реквизиты для оплаты пока не заполнены");
      }
      const existing = await prisma.trainerOrder.findFirst({
        where: {
          clientId: client.id,
          status: { in: ["awaiting_receipt", "review", "rejected"] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!existing) {
        await prisma.trainerOrder.create({
          data: {
            clientId: client.id,
            telegramChatId: String(user.id),
            telegramUserId: String(user.id),
            amount: TRAINER_PRICE_DEFAULT,
            profit: TRAINER_PROFIT_DEFAULT,
          },
        });
      }
      return NextResponse.json({
        ok: true,
        paymentRequired: true,
        message: existing?.status === "review"
          ? "Чек уже находится на проверке"
          : "Заявка создана. Оплатите и прикрепите чек в личном кабинете.",
      });
    }

    if (body.action === "purchaseTariff") {
      const priceItem = await prisma.priceItem.findFirst({
        where: {
          id: Number(body.priceItemId),
          active: true,
        },
      });
      if (!priceItem) throw new Error("Тариф больше недоступен");
      if (priceItem.kind !== "subscription" && priceItem.format === "group") {
        throw new Error("Для пробного или разового занятия сначала выберите дату");
      }
      const minLessons = priceItem.kind === "subscription"
        ? Math.max(4, priceItem.minLessons || 4)
        : 1;
      const totalLessons = priceItem.kind === "subscription"
        ? Math.max(minLessons, Number(body.totalLessons) || minLessons)
        : 1;
      if (!Number.isInteger(totalLessons) || totalLessons > 100) {
        throw new Error("Проверьте количество занятий");
      }
      const settings = await getBotSettings();
      if (!settings.paymentDetails) {
        throw new Error("Реквизиты для оплаты пока не заполнены");
      }
      await prisma.subscriptionOrder.updateMany({
        where: {
          clientId: client.id,
          status: "awaiting_receipt",
        },
        data: { status: "cancelled" },
      });
      await prisma.subscriptionOrder.create({
        data: {
          clientId: client.id,
          priceItemId: priceItem.id,
          telegramChatId: String(user.id),
          telegramUserId: String(user.id),
          type: priceItem.type,
          format: priceItem.format,
          tariffName: priceItem.name,
          totalLessons,
          pricePerLesson: priceItem.price,
          amount: priceItem.price * totalLessons,
        },
      });
      return NextResponse.json({
        ok: true,
        paymentRequired: true,
        message: "Заявка создана. Оплатите и прикрепите чек в личном кабинете.",
      });
    }

    throw new Error("Неизвестное действие");
  } catch (error) {
    return errorResponse(error);
  }
}
