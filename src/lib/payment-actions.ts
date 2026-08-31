"use server";

import { revalidatePath } from "next/cache";
import { getBotSettings } from "@/lib/bot-settings";
import { formatDateTime } from "@/lib/domain";
import {
  approveBookingPayment,
  approveSubscriptionPayment,
  approveTrainerPayment,
  rejectBookingPayment,
  rejectSubscriptionPayment,
  rejectTrainerPayment,
} from "@/lib/payment-review";
import { withChannelRecommendation } from "@/lib/payment-copy";
import { sendTelegramMessage } from "@/lib/telegram-api";

type PaymentKind = "booking" | "subscription" | "trainer";
type PaymentDecision = "approve" | "reject";

function paymentId(fd: FormData) {
  const id = Number(fd.get("paymentId"));
  if (!Number.isInteger(id) || id < 1) throw new Error("Платёж не найден");
  return id;
}

function paymentKind(fd: FormData): PaymentKind {
  const value = String(fd.get("paymentKind") || "");
  if (value === "booking" || value === "subscription" || value === "trainer") {
    return value;
  }
  throw new Error("Вид платежа не определён");
}

function paymentDecision(fd: FormData): PaymentDecision {
  const value = String(fd.get("decision") || "");
  if (value === "approve" || value === "reject") return value;
  throw new Error("Действие не выбрано");
}

export async function reviewPaymentInCrm(fd: FormData) {
  const id = paymentId(fd);
  const kind = paymentKind(fd);
  const decision = paymentDecision(fd);
  const reviewer = "crm";

  if (kind === "booking" && decision === "approve") {
    const result = await approveBookingPayment(id, reviewer);
    if (!result.ok) throw new Error("Платёж уже обработан или мест больше недоступно");
    await sendTelegramMessage(
      result.booking.telegramChatId,
      withChannelRecommendation(
        `Оплата подтверждена. Вы записаны: ${formatDateTime(result.booking.lesson.startsAt)}, ${result.booking.lesson.type === "online" ? "онлайн" : "офлайн"}.`,
      ),
    ).catch(() => undefined);
    revalidatePath(`/lessons/${result.booking.lessonId}`);
    if (result.booking.clientId) revalidatePath(`/clients/${result.booking.clientId}`);
  } else if (kind === "booking" && decision === "reject") {
    const settings = await getBotSettings();
    const booking = await rejectBookingPayment(id, reviewer, settings.bookingHoldMinutes);
    if (!booking) throw new Error("Платёж уже обработан");
    await sendTelegramMessage(
      booking.telegramChatId,
      "Чек отклонён. Загрузите корректную фотографию или PDF в личном кабинете.",
    ).catch(() => undefined);
  } else if (kind === "subscription" && decision === "approve") {
    const result = await approveSubscriptionPayment(id, reviewer);
    if (!result.ok) throw new Error("Платёж уже обработан");
    const until = new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(result.expiresAt);
    await sendTelegramMessage(
      result.order.telegramChatId,
      withChannelRecommendation(
        `Оплата подтверждена. Абонемент на ${result.order.totalLessons} занятий активирован до ${until}.`,
      ),
    ).catch(() => undefined);
    revalidatePath(`/clients/${result.order.clientId}`);
  } else if (kind === "subscription" && decision === "reject") {
    const order = await rejectSubscriptionPayment(id, reviewer);
    if (!order) throw new Error("Платёж уже обработан");
    await sendTelegramMessage(
      order.telegramChatId,
      "Чек отклонён. Загрузите корректную фотографию или PDF в личном кабинете.",
    ).catch(() => undefined);
  } else if (kind === "trainer" && decision === "approve") {
    const result = await approveTrainerPayment(id, reviewer);
    if (!result.ok) throw new Error("Платёж уже обработан");
    await sendTelegramMessage(
      result.order.telegramChatId,
      withChannelRecommendation(
        "Оплата подтверждена. Тренажёр «Волна» отмечен в вашем личном кабинете.",
      ),
    ).catch(() => undefined);
    revalidatePath(`/clients/${result.order.clientId}`);
  } else {
    const order = await rejectTrainerPayment(id, reviewer);
    if (!order) throw new Error("Платёж уже обработан");
    await sendTelegramMessage(
      order.telegramChatId,
      "Чек отклонён. Загрузите корректную фотографию или PDF в личном кабинете.",
    ).catch(() => undefined);
  }

  revalidatePath("/finance");
  revalidatePath("/");
}
