import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  downloadTelegramFile,
  sendTelegramMediaBytes,
  sendTelegramMessage,
  telegramAdminIds,
  telegramApi,
  type TelegramMessage,
} from "@/lib/telegram-api";
import { validateTelegramMiniAppData } from "@/lib/telegram-miniapp-auth";
import { syncTelegramClient } from "@/lib/telegram-client-sync";

export const dynamic = "force-dynamic";

type PaymentKind = "booking" | "subscription";

function identity(req: NextRequest) {
  return validateTelegramMiniAppData(
    req.headers.get("x-telegram-init-data") || "",
  );
}

function paymentKind(value: FormDataEntryValue | string | null): PaymentKind {
  if (value === "booking" || value === "subscription") return value;
  throw new Error("Платёж не выбран");
}

function paymentId(value: FormDataEntryValue | string | null) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error("Платёж не найден");
  return id;
}

function errorResponse(error: unknown, status = 400) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Не удалось обработать чек" },
    { status },
  );
}

async function resolveClient(req: NextRequest) {
  const auth = identity(req);
  const client = await syncTelegramClient(auth.user);
  return { ...auth, client };
}

export async function GET(req: NextRequest) {
  try {
    const { user, client } = await resolveClient(req);
    const kind = paymentKind(req.nextUrl.searchParams.get("kind"));
    const id = paymentId(req.nextUrl.searchParams.get("id"));
    const isAdmin = telegramAdminIds().has(String(user.id));
    const payment = kind === "booking"
      ? await prisma.botBooking.findUnique({
          where: { id },
          select: {
            clientId: true,
            receiptFileId: true,
            receiptFileName: true,
            receiptMimeType: true,
          },
        })
      : await prisma.subscriptionOrder.findUnique({
          where: { id },
          select: {
            clientId: true,
            receiptFileId: true,
            receiptFileName: true,
            receiptMimeType: true,
          },
        });
    if (!payment || (!isAdmin && payment.clientId !== client.id)) {
      return new NextResponse(null, { status: 404 });
    }
    if (!payment.receiptFileId) {
      return new NextResponse(null, { status: 404 });
    }
    const file = await downloadTelegramFile(payment.receiptFileId);
    const fileName = (payment.receiptFileName || "receipt")
      .replace(/[\r\n"\\]/g, "_")
      .slice(0, 120);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "content-type": payment.receiptMimeType || file.contentType,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, client } = await resolveClient(req);
    const form = await req.formData();
    const kind = paymentKind(form.get("kind"));
    const id = paymentId(form.get("id"));
    const receipt = form.get("receipt");
    if (!(receipt instanceof File) || receipt.size === 0) {
      throw new Error("Выберите фотографию или PDF с чеком");
    }
    if (receipt.size > 10 * 1024 * 1024) {
      throw new Error("Чек должен быть не больше 10 МБ");
    }
    const mimeType = receipt.type.toLowerCase();
    if (mimeType !== "application/pdf" && !mimeType.startsWith("image/")) {
      throw new Error("Можно загрузить фотографию или PDF");
    }

    const now = new Date();
    const booking = kind === "booking"
      ? await prisma.botBooking.findFirst({
          where: {
            id,
            clientId: client.id,
            status: { in: ["awaiting_receipt", "rejected"] },
          },
          include: { lesson: true },
        })
      : null;
    const order = kind === "subscription"
      ? await prisma.subscriptionOrder.findFirst({
          where: {
            id,
            clientId: client.id,
            status: { in: ["awaiting_receipt", "rejected"] },
          },
        })
      : null;
    if (!booking && !order) {
      throw new Error("Этот платёж уже отправлен или больше не действует");
    }
    if (booking && booking.lesson.startsAt <= now) {
      throw new Error("Занятие уже прошло, выберите другую дату");
    }

    const admins = [...telegramAdminIds()];
    if (admins.length === 0) throw new Error("Администратор оплаты не настроен");
    const bytes = new Uint8Array(await receipt.arrayBuffer());
    const isTelegramPhoto = ["image/jpeg", "image/png"].includes(mimeType);
    const method = isTelegramPhoto ? "sendPhoto" : "sendDocument";
    const field = isTelegramPhoto ? "photo" : "document";
    const callbackPrefix = kind === "booking" ? "" : "-sub";
    const title = booking
      ? `${booking.displayName || client.fullName}\n${booking.lesson.type === "online" ? "Онлайн" : "Офлайн"} · ${booking.tariffName || "Занятие"}`
      : `${client.fullName}\n${order!.tariffName} · ${order!.totalLessons} занятий`;
    const amount = booking?.amount ?? order!.amount;
    const caption =
      `Проверка оплаты №${id}\n\n${title}\n${amount.toLocaleString("ru-RU")} ₽`;
    const replyMarkup = {
      inline_keyboard: [[
        {
          text: "Подтвердить",
          callback_data: `admin:approve${callbackPrefix}:${id}`,
        },
        {
          text: "Отклонить",
          callback_data: `admin:reject${callbackPrefix}:${id}`,
        },
      ]],
    };

    const firstMessage = await sendTelegramMediaBytes({
      chatId: admins[0],
      bytes,
      fileName: receipt.name || (isTelegramPhoto ? "receipt.jpg" : "receipt.pdf"),
      mimeType,
      kind: isTelegramPhoto ? "photo" : "document",
      caption,
      replyMarkup,
    });
    const receiptFileId = isTelegramPhoto
      ? firstMessage.photo?.at(-1)?.file_id
      : firstMessage.document?.file_id;
    if (!receiptFileId) throw new Error("Telegram не сохранил чек");

    if (booking) {
      const reviewUntil = new Date(
        Math.min(booking.lesson.startsAt.getTime(), now.getTime() + 12 * 60 * 60 * 1000),
      );
      await prisma.botBooking.update({
        where: { id: booking.id },
        data: {
          status: "review",
          receiptFileId,
          receiptFileName: receipt.name || "Чек",
          receiptMimeType: mimeType,
          holdExpiresAt: reviewUntil,
          reviewedAt: null,
          reviewedByTelegramId: null,
        },
      });
    } else {
      await prisma.subscriptionOrder.update({
        where: { id: order!.id },
        data: {
          status: "review",
          receiptFileId,
          receiptFileName: receipt.name || "Чек",
          receiptMimeType: mimeType,
          reviewedAt: null,
          reviewedByTelegramId: null,
        },
      });
    }

    for (const adminId of admins.slice(1)) {
      await telegramApi<TelegramMessage>(method, {
        chat_id: adminId,
        [field]: receiptFileId,
        caption,
        reply_markup: replyMarkup,
      }).catch(() => undefined);
    }
    await sendTelegramMessage(
      String(user.id),
      "Чек получен и отправлен на проверку. Статус можно посмотреть в личном кабинете.",
    ).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      message: "Чек отправлен на проверку",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
