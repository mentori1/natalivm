import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  currentMoscowWallClockDate,
  derivedSubStatus,
  formatDateTime,
  remaining,
} from "@/lib/domain";
import { DEFAULT_BOT_TEXT, getBotSettings } from "@/lib/bot-settings";
import {
  approveBookingPayment,
  approveSubscriptionPayment,
  rejectBookingPayment,
  rejectSubscriptionPayment,
} from "@/lib/payment-review";
import { ensureDefaultPriceItems } from "@/lib/prices";
import { createBooking } from "@/lib/telegram-client-bot";
import { sendTelegramMessage, telegramAdminIds } from "@/lib/telegram-api";
import { validateTelegramMiniAppData } from "@/lib/telegram-miniapp-auth";
import {
  bindClientWithPortalToken,
  syncTelegramClient,
} from "@/lib/telegram-client-sync";

export const dynamic = "force-dynamic";

type PortalPayment = {
  kind: "booking" | "subscription";
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
        portalPreference: true,
      },
    });
    const lessons = await prisma.lesson.findMany({
      where: { startsAt: { gte: now }, format: "group" },
      include: {
        attendances: {
          where: { status: { not: "absent" } },
          select: { id: true },
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
    const subscriptionPayments = await prisma.subscriptionOrder.findMany({
      where: {
        clientId: client.id,
        status: { not: "cancelled" },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const payments: PortalPayment[] = [
      ...bookingPayments.map((item) => ({
        kind: "booking" as const,
        id: item.id,
        title: item.tariffName || "Занятие",
        detail: `${formatDateTime(item.lesson.startsAt)} · ${item.lesson.type === "online" ? "онлайн" : "офлайн"}`,
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
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

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
      subscriptions: fullClient.subscriptions.map((item) => ({
        id: item.id,
        type: item.type,
        format: item.format,
        name: item.tariffName || "Абонемент",
        totalLessons: item.totalLessons,
        usedLessons: item.usedLessons,
        remaining: remaining(item),
        expiresAt: item.expiresAt.toISOString(),
        status: derivedSubStatus(item),
        frozen: item.frozen,
      })),
      lessons: lessons
        .map((lesson) => {
          const occupied = lesson.attendances.length + lesson.botBookings.length;
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
        .filter((lesson) => lesson.available),
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
      prices: prices.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        kind: item.kind,
        format: item.format,
        price: item.price,
        minLessons: item.minLessons || 4,
        purchasable: item.kind === "subscription" && item.format === "group",
      })),
      preferences: {
        preferredType: fullClient.portalPreference?.preferredType || "both",
        preferredWeekdays: fullClient.portalPreference?.preferredWeekdays
          ? JSON.parse(fullClient.portalPreference.preferredWeekdays)
          : [],
      },
      paymentReady: Boolean(settings.paymentDetails),
      paymentDetails: settings.paymentDetails || "",
      payments,
      isAdmin,
      adminPayments,
      adminPendingCount: adminPayments.filter((item) => item.status === "review").length,
      trainer: {
        text: settings.trainerText || DEFAULT_BOT_TEXT.trainer,
        imageUrl: "/bot-trainer.jpg",
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
      preferredType?: string;
      preferredWeekdays?: number[];
      priceItemId?: number;
      totalLessons?: number;
      paymentKind?: "booking" | "subscription";
      paymentId?: number;
      decision?: "approve" | "reject";
    };

    if (body.action === "reviewPayment") {
      const adminId = String(user.id);
      if (!telegramAdminIds().has(adminId)) throw new Error("Нет доступа");
      const id = Number(body.paymentId);
      if (!Number.isInteger(id) || id < 1) throw new Error("Платёж не найден");
      if (!body.paymentKind || !body.decision) throw new Error("Действие не выбрано");

      if (body.paymentKind === "booking" && body.decision === "approve") {
        const result = await approveBookingPayment(id, adminId);
        if (!result.ok) {
          throw new Error(
            result.reason === "full"
              ? "Занятие уже прошло или мест больше нет"
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
    }

    if (body.action === "book") {
      if (!Number.isInteger(body.lessonId) || Number(body.lessonId) < 1) {
        throw new Error("Занятие не выбрано");
      }
      await createBooking(String(user.id), user, Number(body.lessonId), {
        notifyChat: false,
      });
      const booking = await prisma.botBooking.findFirst({
        where: {
          clientId: client.id,
          lessonId: Number(body.lessonId),
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

    if (body.action === "preferences") {
      const preferredType = ["online", "offline", "both"].includes(
        body.preferredType || "",
      )
        ? body.preferredType
        : "both";
      const preferredWeekdays = [...new Set(body.preferredWeekdays || [])]
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
        .sort();
      await prisma.clientPortalPreference.upsert({
        where: { clientId: client.id },
        create: {
          clientId: client.id,
          preferredType,
          preferredWeekdays: JSON.stringify(preferredWeekdays),
        },
        update: {
          preferredType,
          preferredWeekdays: JSON.stringify(preferredWeekdays),
        },
      });
      return NextResponse.json({ ok: true, message: "Удобные дни сохранены" });
    }

    if (body.action === "subscription") {
      const priceItem = await prisma.priceItem.findFirst({
        where: {
          id: Number(body.priceItemId),
          active: true,
          kind: "subscription",
          format: "group",
        },
      });
      if (!priceItem) throw new Error("Тариф больше недоступен");
      const minLessons = Math.max(4, priceItem.minLessons || 4);
      const totalLessons = Math.max(minLessons, Number(body.totalLessons) || minLessons);
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
