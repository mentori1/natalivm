import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  currentMoscowWallClockDate,
  derivedSubStatus,
  formatDateTime,
  remaining,
} from "@/lib/domain";
import { DEFAULT_BOT_TEXT, getBotSettings } from "@/lib/bot-settings";
import { ensureDefaultPriceItems } from "@/lib/prices";
import { createBooking } from "@/lib/telegram-client-bot";
import { sendTelegramMessage } from "@/lib/telegram-api";
import { validateTelegramMiniAppData } from "@/lib/telegram-miniapp-auth";
import {
  bindClientWithPortalToken,
  syncTelegramClient,
} from "@/lib/telegram-client-sync";

export const dynamic = "force-dynamic";

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
    };

    if (body.action === "book") {
      if (!Number.isInteger(body.lessonId) || Number(body.lessonId) < 1) {
        throw new Error("Занятие не выбрано");
      }
      await createBooking(String(user.id), user, Number(body.lessonId));
      return NextResponse.json({
        ok: true,
        message: "Заявка создана. Подтверждение и оплата отправлены в чат с ботом.",
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
      const order = await prisma.subscriptionOrder.create({
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
      await sendTelegramMessage(
        String(user.id),
        `Абонемент: ${order.tariffName}\n${order.totalLessons} занятий · ${order.amount.toLocaleString("ru-RU")} ₽\n\nРеквизиты:\n${settings.paymentDetails}\n\nПосле оплаты отправьте сюда чек PDF или фотографией.`,
      );
      return NextResponse.json({
        ok: true,
        message: "Реквизиты отправлены в чат с ботом. После оплаты пришлите туда чек.",
      });
    }

    throw new Error("Неизвестное действие");
  } catch (error) {
    return errorResponse(error);
  }
}
