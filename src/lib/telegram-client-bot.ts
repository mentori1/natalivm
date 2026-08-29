import { join } from "node:path";
import { getBotCopy, type BotCopy } from "@/lib/bot-content";
import { attributeClientSourceFromStart } from "@/lib/telegram-channel";
import { DEFAULT_BOT_TEXT, getBotSettings } from "@/lib/bot-settings";
import { prisma, usesPostgres } from "@/lib/db";
import {
  currentMoscowWallClockDate,
  formatDateTime,
  isUsable,
  remaining,
} from "@/lib/domain";
import { ensureDefaultPriceItems } from "@/lib/prices";
import {
  bindClientWithPortalToken,
  findClientByTelegram,
  syncTelegramClient,
} from "@/lib/telegram-client-sync";
import {
  sendTelegramMessage,
  sendTelegramPhotoFile,
  telegramAdminIds,
  telegramApi,
  telegramDisplayName,
  type TelegramCallbackQuery,
  type TelegramMessage,
  type TelegramUser,
} from "@/lib/telegram-api";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const ACTIVE_HOLD_STATUSES = ["awaiting_receipt", "review"];
const BOT_PHOTO_PATHS = {
  bookingPhotoFileId: join(process.cwd(), "public", "bot-booking.jpg"),
  myLessonsPhotoFileId: join(process.cwd(), "public", "bot-my-lessons.jpg"),
  trainerPhotoFileId: join(process.cwd(), "public", "bot-trainer.jpg"),
  pricesPhotoFileId: join(process.cwd(), "public", "bot-prices.jpg"),
} as const;
type BotPhotoField = keyof typeof BOT_PHOTO_PATHS;

function mainMenu(_copy: BotCopy) {
  return { remove_keyboard: true };
}

function typeMenu(copy: BotCopy) {
  return {
    inline_keyboard: [
      [
        { text: copy.text("buttonOnline"), callback_data: "client:type:online" },
        { text: copy.text("buttonOffline"), callback_data: "client:type:offline" },
      ],
    ],
  };
}

async function deleteMessage(chatId: string, messageId: number | null | undefined) {
  if (!messageId) return;
  await telegramApi<boolean>("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  }).catch(() => undefined);
}

async function clearRecentChat(chatId: string, beforeMessageId: number) {
  const firstMessageId = Math.max(1, beforeMessageId - 12);
  for (let messageId = beforeMessageId - 1; messageId >= firstMessageId; messageId -= 1) {
    await deleteMessage(chatId, messageId);
  }
}

async function clearPreviousScreen(chatId: string) {
  const session = await prisma.botSession.findUnique({
    where: { telegramChatId: chatId },
  });
  let ids: number[] = [];
  if (session?.lastScreenMessageIds) {
    try {
      const parsed = JSON.parse(session.lastScreenMessageIds) as unknown;
      if (Array.isArray(parsed)) {
        ids = parsed.filter(
          (value): value is number => Number.isInteger(value) && value > 0,
        );
      }
    } catch {
      ids = [];
    }
  }
  if (ids.length === 0 && session?.lastScreenMessageId) {
    ids = [session.lastScreenMessageId];
  }
  for (const messageId of ids) {
    await deleteMessage(chatId, messageId);
  }
}

async function saveScreen(chatId: string, messageIds: number[]) {
  const lastScreenMessageId = messageIds.at(-1) ?? null;
  await prisma.botSession.upsert({
    where: { telegramChatId: chatId },
    create: {
      telegramChatId: chatId,
      lastScreenMessageId,
      lastScreenMessageIds: JSON.stringify(messageIds),
    },
    update: {
      lastScreenMessageId,
      lastScreenMessageIds: JSON.stringify(messageIds),
    },
  });
}

async function replaceScreen(
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>,
) {
  const copy = replyMarkup ? null : await getBotCopy();
  await clearPreviousScreen(chatId);
  const message = await sendTelegramMessage(
    chatId,
    text,
    replyMarkup ?? mainMenu(copy!),
  );
  await saveScreen(chatId, [message.message_id]);
  return message;
}

async function replaceWelcomeScreen(
  chatId: string,
  caption: string,
  photoFileId: string | null,
) {
  const copy = await getBotCopy();
  await clearPreviousScreen(chatId);

  const message = photoFileId
    ? await telegramApi<TelegramMessage>("sendPhoto", {
        chat_id: chatId,
        photo: photoFileId,
        caption,
        reply_markup: mainMenu(copy),
      })
    : await sendTelegramPhotoFile(
        chatId,
        join(process.cwd(), "public", "bot-welcome.png"),
        caption,
        mainMenu(copy),
      );

  const uploadedPhotoFileId = message.photo?.at(-1)?.file_id;
  if (!photoFileId && uploadedPhotoFileId) {
    await prisma.botSettings.update({
      where: { id: 1 },
      data: { welcomePhotoFileId: uploadedPhotoFileId },
    });
  }
  await saveScreen(chatId, [message.message_id]);
}

async function savePhotoFileId(field: BotPhotoField, fileId: string) {
  const data =
    field === "bookingPhotoFileId"
      ? { bookingPhotoFileId: fileId }
      : field === "myLessonsPhotoFileId"
        ? { myLessonsPhotoFileId: fileId }
        : field === "trainerPhotoFileId"
          ? { trainerPhotoFileId: fileId }
          : { pricesPhotoFileId: fileId };
  await prisma.botSettings.update({ where: { id: 1 }, data });
}

async function replacePhotoScreen(
  chatId: string,
  field: BotPhotoField,
  photoFileId: string | null,
  text: string,
  replyMarkup?: Record<string, unknown>,
  videoFileId?: string | null,
) {
  const copy = await getBotCopy();
  const finalReplyMarkup = replyMarkup ?? mainMenu(copy);
  await clearPreviousScreen(chatId);

  const captionFits = text.length <= 1024;
  const photoReplyMarkup =
    captionFits && !videoFileId ? finalReplyMarkup : undefined;
  const photo = photoFileId
    ? await telegramApi<TelegramMessage>("sendPhoto", {
        chat_id: chatId,
        photo: photoFileId,
        ...(captionFits ? { caption: text } : {}),
        ...(photoReplyMarkup ? { reply_markup: photoReplyMarkup } : {}),
      })
    : await sendTelegramPhotoFile(
        chatId,
        BOT_PHOTO_PATHS[field],
        captionFits ? text : "",
        photoReplyMarkup,
      );
  const messageIds = [photo.message_id];
  const uploadedFileId = photo.photo?.at(-1)?.file_id;
  if (!photoFileId && uploadedFileId) {
    await savePhotoFileId(field, uploadedFileId);
  }

  if (!captionFits) {
    const textMessage = await sendTelegramMessage(
      chatId,
      text,
      videoFileId ? undefined : finalReplyMarkup,
    );
    messageIds.push(textMessage.message_id);
  }
  if (videoFileId) {
    const video = await telegramApi<TelegramMessage>("sendVideo", {
      chat_id: chatId,
      video: videoFileId,
      reply_markup: finalReplyMarkup,
    });
    messageIds.push(video.message_id);
  }
  await saveScreen(chatId, messageIds);
}

async function answerCallback(
  queryId: string,
  text?: string,
  showAlert = false,
) {
  await telegramApi<boolean>("answerCallbackQuery", {
    callback_query_id: queryId,
    ...(text ? { text, show_alert: showAlert } : {}),
  }).catch(() => undefined);
}

async function editCallbackButtons(query: TelegramCallbackQuery) {
  if (!query.message) return;
  await telegramApi<boolean>("editMessageReplyMarkup", {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => undefined);
}

async function sendWelcome(chatId: string) {
  const settings = await getBotSettings();
  if (!settings.enabled) {
    await replaceScreen(
      chatId,
      telegramAdminIds().has(chatId)
        ? "Клиентский режим бота пока выключен. Включите его в разделе «Бот» внутри CRM."
        : "Бот сейчас настраивается. Пожалуйста, попробуйте немного позже.",
    );
    return;
  }
  const text = settings.welcomeText || "Добро пожаловать в VUMEXCLUSIVE.";
  await replaceWelcomeScreen(
    chatId,
    text,
    settings.welcomePhotoFileId,
  ).catch(() => replaceScreen(chatId, text));
}

function channelUrl(chatId: string | null, configuredUrl: string | null) {
  if (configuredUrl) return configuredUrl;
  if (chatId?.startsWith("@")) return `https://t.me/${chatId.slice(1)}`;
  return null;
}

async function hasRequiredSubscription(userId: string) {
  const settings = await getBotSettings();
  if (!settings.requiredChannelChatId) return true;
  try {
    const member = await telegramApi<{ status: string }>("getChatMember", {
      chat_id: settings.requiredChannelChatId,
      user_id: Number(userId),
    });
    return !["left", "kicked"].includes(member.status);
  } catch {
    return false;
  }
}

async function askForSubscription(chatId: string) {
  const settings = await getBotSettings();
  const copy = await getBotCopy();
  const url = channelUrl(
    settings.requiredChannelChatId,
    settings.requiredChannelUrl,
  );
  const rows: { text: string; url?: string; callback_data?: string }[][] = [];
  if (url) rows.push([{ text: copy.text("buttonSubscribe"), url }]);
  rows.push([
    {
      text: copy.text("buttonCheckSubscription"),
      callback_data: "client:check",
    },
  ]);
  rows.push([
    { text: copy.text("buttonMenu"), callback_data: "client:menu" },
  ]);
  await replaceScreen(
    chatId,
    copy.text("subscriptionPrompt"),
    { inline_keyboard: rows },
  );
}

async function requireSubscription(chatId: string, userId: string) {
  if (await hasRequiredSubscription(userId)) return true;
  await askForSubscription(chatId);
  return false;
}

async function expireOldHolds(notify = false) {
  const copy = notify ? await getBotCopy() : null;
  const now = new Date();
  const expired = await prisma.botBooking.findMany({
    where: {
      status: { in: ACTIVE_HOLD_STATUSES },
      holdExpiresAt: { lte: now },
    },
    select: { id: true, telegramChatId: true, status: true },
  });
  for (const booking of expired) {
    const changed = await prisma.botBooking.updateMany({
      where: {
        id: booking.id,
        status: { in: ACTIVE_HOLD_STATUSES },
      },
      data: { status: "expired" },
    });
    if (notify && changed.count > 0) {
      await replaceScreen(
        booking.telegramChatId,
        copy!.text("holdExpired"),
      ).catch(() => undefined);
    }
  }
}

async function availableLessons(type: "online" | "offline") {
  await expireOldHolds();
  const now = currentMoscowWallClockDate();
  const lessons = await prisma.lesson.findMany({
    where: {
      format: "group",
      type,
      startsAt: { gte: now },
      capacity: { not: null },
    },
    include: {
      attendances: { select: { status: true } },
      botBookings: {
        where: {
          status: { in: ACTIVE_HOLD_STATUSES },
          holdExpiresAt: { gt: new Date() },
        },
        select: { id: true },
      },
    },
    orderBy: { startsAt: "asc" },
    take: 20,
  });

  return lessons
    .map((lesson) => {
      const enrolled = lesson.attendances.filter(
        (attendance) => attendance.status !== "absent",
      ).length;
      const free = Math.max(
        0,
        (lesson.capacity ?? 0) - enrolled - lesson.botBookings.length,
      );
      return { lesson, free };
    })
    .filter(({ free }) => free > 0)
    .slice(0, 8);
}

function scarcity(free: number, copy: BotCopy) {
  if (free > 3) return "";
  const label = free === 1 ? "место" : "места";
  return ` · ${copy.text("scarcity", { count: free, places: label })}`;
}

async function sendDirectSchedule(
  chatId: string,
  userId: string,
  type: "online" | "offline",
) {
  if (!(await requireSubscription(chatId, userId))) return;
  const copy = await getBotCopy();
  const settings = await getBotSettings();
  const available = await availableLessons(type);
  if (available.length === 0) {
    await replacePhotoScreen(
      chatId,
      "bookingPhotoFileId",
      settings.bookingPhotoFileId,
      copy.text("noAvailableLessons", {
        format: type === "online" ? "онлайн" : "офлайн",
      }),
    );
    return;
  }

  await replacePhotoScreen(
    chatId,
    "bookingPhotoFileId",
    settings.bookingPhotoFileId,
    copy.text("scheduleTitle", {
      format: type === "online" ? "онлайн" : "офлайн",
    }),
    {
      inline_keyboard: [
        ...available.map(({ lesson, free }) => [
          {
            text: `${formatDateTime(lesson.startsAt)}${scarcity(free, copy)}`,
            callback_data: `client:lesson:${lesson.id}`,
          },
        ]),
        [
          {
            text: copy.text("buttonBack"),
            callback_data: "client:schedule",
          },
        ],
      ],
    },
  );
}

async function showBookingTypeMenu(chatId: string, confirmation?: string) {
  const settings = await getBotSettings();
  const copy = await getBotCopy();
  await replacePhotoScreen(
    chatId,
    "bookingPhotoFileId",
    settings.bookingPhotoFileId,
    confirmation
      ? `${confirmation}\n\n${copy.text("chooseFormat")}`
      : copy.text("chooseFormat"),
    typeMenu(copy),
  );
}

async function showMyLessons(chatId: string, user: TelegramUser) {
  const copy = await getBotCopy();
  const settings = await getBotSettings();
  const client = await findClientByTelegram(user);
  if (!client) {
    await replacePhotoScreen(
      chatId,
      "myLessonsPhotoFileId",
      settings.myLessonsPhotoFileId,
      copy.text("myLessonsFirst", {
        bookButton: copy.text("buttonBook"),
      }),
    );
    return;
  }
  const now = currentMoscowWallClockDate();
  const attendances = await prisma.attendance.findMany({
    where: {
      clientId: client.id,
      status: { not: "absent" },
      lesson: { startsAt: { gte: now } },
    },
    include: { lesson: true },
    orderBy: { lesson: { startsAt: "asc" } },
    take: 10,
  });
  const pending = await prisma.botBooking.findMany({
    where: {
      clientId: client.id,
      status: { in: ACTIVE_HOLD_STATUSES },
      lesson: { startsAt: { gte: now } },
    },
    include: { lesson: true },
    orderBy: { lesson: { startsAt: "asc" } },
    take: 5,
  });
  const confirmedIds = new Set(attendances.map((item) => item.lessonId));
  const lines = [
    ...attendances.map(
      (item, index) =>
        `${index + 1}. ${formatDateTime(item.lesson.startsAt)} · ${
          item.lesson.type === "online" ? "онлайн" : "офлайн"
        }${item.lesson.title ? `\n${item.lesson.title}` : ""}`,
    ),
    ...pending
      .filter((item) => !confirmedIds.has(item.lessonId))
      .map(
        (item, index) =>
          `${attendances.length + index + 1}. ${formatDateTime(
            item.lesson.startsAt,
          )} · ${item.lesson.type === "online" ? "онлайн" : "офлайн"}\n${
            item.status === "review"
              ? copy.text("receiptReviewStatus")
              : copy.text("receiptAwaitingStatus")
          }`,
      ),
  ];
  await replacePhotoScreen(
    chatId,
    "myLessonsPhotoFileId",
    settings.myLessonsPhotoFileId,
    lines.length
      ? `${copy.text("myLessonsTitle")}\n\n${lines.join("\n\n")}`
      : copy.text("myLessonsEmpty"),
  );
}

async function showPrices(chatId: string) {
  const copy = await getBotCopy();
  const settings = await getBotSettings();
  await replacePhotoScreen(
    chatId,
    "pricesPhotoFileId",
    settings.pricesPhotoFileId,
    copy.text("pricesCaption"),
  );
}

async function showTrainer(chatId: string) {
  const settings = await getBotSettings();
  const text = settings.trainerText || DEFAULT_BOT_TEXT.trainer;
  await replacePhotoScreen(
    chatId,
    "trainerPhotoFileId",
    settings.trainerPhotoFileId,
    text,
    undefined,
    settings.trainerVideoFileId,
  );
}

async function acceptTrainerVideo(message: TelegramMessage) {
  if (
    !message.from ||
    !telegramAdminIds().has(String(message.from.id)) ||
    !message.video ||
    message.caption?.trim().toLowerCase() !== "/тренажер"
  ) {
    return false;
  }
  await prisma.botSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      trainerVideoFileId: message.video.file_id,
    },
    update: { trainerVideoFileId: message.video.file_id },
  });
  await replaceScreen(
    String(message.chat.id),
    "Видео для раздела «Тренажёр» сохранено.",
  );
  return true;
}

async function quoteForClient(
  clientId: number,
  type: "online" | "offline",
  lessonDate: Date,
) {
  const subscriptions = await prisma.subscription.findMany({
    where: { clientId, type, format: "group" },
  });
  const subscription = subscriptions
    .filter((item) => isUsable(item, lessonDate) && remaining(item) > 0)
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())[0];
  if (subscription) {
    return {
      kind: "subscription",
      tariffName: subscription.tariffName || "Действующий абонемент",
      amount: 0,
    };
  }

  const subscriptionCount = await prisma.subscription.count({ where: { clientId } });
  const singleVisitCount = await prisma.singleVisit.count({ where: { clientId } });
  const presentCount = await prisma.attendance.count({
    where: { clientId, status: "present" },
  });
  const confirmedBotCount = await prisma.botBooking.count({
    where: { clientId, status: "confirmed" },
  });
  const firstVisit =
    subscriptionCount + singleVisitCount + presentCount + confirmedBotCount === 0;
  const kind = firstVisit ? "trial" : "single";
  await ensureDefaultPriceItems();
  let tariff = await prisma.priceItem.findFirst({
    where: { active: true, kind, type, format: "group" },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  if (!tariff && firstVisit) {
    tariff = await prisma.priceItem.findFirst({
      where: { active: true, kind: "single", type, format: "group" },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }
  return tariff
    ? { kind: tariff.kind, tariffName: tariff.name, amount: tariff.price }
    : null;
}

export async function createBooking(
  chatId: string,
  user: TelegramUser,
  lessonId: number,
) {
  if (!(await requireSubscription(chatId, String(user.id)))) return;
  const settings = await getBotSettings();
  const copy = await getBotCopy();
  if (!settings.enabled) return sendWelcome(chatId);

  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (
    !lesson ||
    lesson.format !== "group" ||
    lesson.startsAt < currentMoscowWallClockDate()
  ) {
    await replaceScreen(chatId, copy.text("lessonUnavailable"));
    return;
  }

  const client = await syncTelegramClient(user);
  if (client.status === "barter") {
    await replaceScreen(
      chatId,
      copy.text("barterBooking"),
    );
    return;
  }
  const quote = await quoteForClient(client.id, lesson.type as "online" | "offline", lesson.startsAt);
  if (!quote) {
    await replaceScreen(
      chatId,
      copy.text("priceMissing"),
    );
    return;
  }

  const now = new Date();
  const holdMinutes = Math.max(5, Math.min(180, settings.bookingHoldMinutes));
  const result = await prisma.$transaction(async (tx) => {
    if (usesPostgres) {
      await tx.$executeRaw`select pg_advisory_xact_lock(${lessonId})`;
    }
    const existingConfirmed = await tx.botBooking.findFirst({
      where: {
        telegramUserId: String(user.id),
        lessonId,
        status: "confirmed",
      },
      select: { id: true },
    });
    const existingAttendance = await tx.attendance.findUnique({
      where: { lessonId_clientId: { lessonId, clientId: client.id } },
      select: { status: true },
    });
    if (
      existingConfirmed ||
      (existingAttendance && existingAttendance.status !== "absent")
    ) {
      return { ok: true as const, alreadyBooked: true as const };
    }

    await tx.botBooking.updateMany({
      where: {
        telegramUserId: String(user.id),
        status: { in: ACTIVE_HOLD_STATUSES },
      },
      data: { status: "cancelled" },
    });
    const currentLesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      include: {
        attendances: { select: { clientId: true, status: true } },
        botBookings: {
          where: {
            status: { in: ACTIVE_HOLD_STATUSES },
            holdExpiresAt: { gt: now },
          },
          select: { id: true },
        },
      },
    });
    if (!currentLesson?.capacity) return { ok: false as const };
    const alreadyEnrolled = currentLesson.attendances.some(
      (item) => item.clientId === client.id && item.status !== "absent",
    );
    const enrolled = currentLesson.attendances.filter(
      (item) => item.status !== "absent",
    ).length;
    if (
      !alreadyEnrolled &&
      enrolled + currentLesson.botBookings.length >= currentLesson.capacity
    ) {
      return { ok: false as const };
    }

    if (quote.amount === 0) {
      await tx.attendance.upsert({
        where: { lessonId_clientId: { lessonId, clientId: client.id } },
        create: { lessonId, clientId: client.id, status: "enrolled" },
        update: { status: "enrolled" },
      });
    }
    const booking = await tx.botBooking.create({
      data: {
        telegramChatId: chatId,
        telegramUserId: String(user.id),
        username: user.username ?? null,
        displayName: telegramDisplayName(user),
        clientId: client.id,
        lessonId,
        status: quote.amount === 0 ? "confirmed" : "awaiting_receipt",
        kind: quote.kind,
        tariffName: quote.tariffName,
        amount: quote.amount,
        holdExpiresAt:
          quote.amount === 0
            ? lesson.startsAt
            : new Date(now.getTime() + holdMinutes * MINUTE),
        ...(quote.amount === 0 ? { reviewedAt: now } : {}),
      },
    });
    return { ok: true as const, alreadyBooked: false as const, booking };
  });

  if (!result.ok) {
    await replacePhotoScreen(
      chatId,
      "bookingPhotoFileId",
      settings.bookingPhotoFileId,
      copy.text("lastPlaceTaken"),
      typeMenu(copy),
    );
    return;
  }
  if (result.alreadyBooked) {
    await replaceScreen(
      chatId,
      copy.text("alreadyBooked", {
        date: formatDateTime(lesson.startsAt),
        format: lesson.type === "online" ? "онлайн" : "офлайн",
      }),
    );
    return;
  }
  if (quote.amount === 0) {
    await replaceScreen(
      chatId,
      copy.text("subscriptionBooked", {
        date: formatDateTime(lesson.startsAt),
        format: lesson.type === "online" ? "онлайн" : "офлайн",
      }),
    );
    return;
  }
  if (!settings.paymentDetails) {
    await prisma.botBooking.update({
      where: { id: result.booking.id },
      data: { status: "cancelled" },
    });
    await replaceScreen(
      chatId,
      copy.text("paymentMissing"),
    );
    return;
  }

  await replaceScreen(
    chatId,
    copy.text("paymentInstructions", {
      date: formatDateTime(lesson.startsAt),
      format: lesson.type === "online" ? "онлайн" : "офлайн",
      tariff: quote.tariffName,
      amount: quote.amount.toLocaleString("ru-RU"),
      paymentDetails: settings.paymentDetails,
      holdMinutes,
    }),
    {
      inline_keyboard: [
        [
          {
            text: copy.text("buttonCancelBooking"),
            callback_data: `client:cancel:${result.booking.id}`,
          },
        ],
        [{ text: copy.text("buttonMenu"), callback_data: "client:menu" }],
      ],
    },
  );
}

async function acceptSubscriptionReceipt(
  message: TelegramMessage,
  file: {
    id: string;
    name: string;
    mime: string;
    method: string;
    field: string;
  },
) {
  if (!message.from) return false;
  const order = await prisma.subscriptionOrder.findFirst({
    where: {
      telegramChatId: String(message.chat.id),
      telegramUserId: String(message.from.id),
      status: "awaiting_receipt",
    },
    orderBy: { createdAt: "desc" },
  });
  if (!order) return false;
  const copy = await getBotCopy();
  await prisma.subscriptionOrder.update({
    where: { id: order.id },
    data: {
      status: "review",
      receiptFileId: file.id,
      receiptFileName: file.name,
      receiptMimeType: file.mime,
    },
  });
  await replaceScreen(
    order.telegramChatId,
    "Чек получен и отправлен на проверку. После подтверждения абонемент появится в личном кабинете.",
  );
  const caption =
    `Проверка абонемента №${order.id}\n\n` +
    `${order.tariffName}\n${order.totalLessons} занятий · ${order.amount.toLocaleString("ru-RU")} ₽`;
  for (const adminId of telegramAdminIds()) {
    await telegramApi<TelegramMessage>(file.method, {
      chat_id: adminId,
      [file.field]: file.id,
      caption,
      reply_markup: {
        inline_keyboard: [[
          {
            text: copy.text("buttonApprove"),
            callback_data: `admin:approve-sub:${order.id}`,
          },
          {
            text: copy.text("buttonReject"),
            callback_data: `admin:reject-sub:${order.id}`,
          },
        ]],
      },
    }).catch(() => undefined);
  }
  return true;
}

async function acceptReceipt(message: TelegramMessage) {
  if (!message.from) return false;
  const copy = await getBotCopy();
  const file =
    message.document?.mime_type === "application/pdf"
      ? {
          id: message.document.file_id,
          name: message.document.file_name ?? "Чек.pdf",
          mime: message.document.mime_type,
          method: "sendDocument",
          field: "document",
        }
      : message.photo?.length
        ? {
            id: message.photo[message.photo.length - 1].file_id,
            name: "Фото чека",
            mime: "image/jpeg",
            method: "sendPhoto",
            field: "photo",
          }
        : null;
  if (!file) return false;

  const now = new Date();
  const booking = await prisma.botBooking.findFirst({
    where: {
      telegramChatId: String(message.chat.id),
      telegramUserId: String(message.from.id),
      status: "awaiting_receipt",
      holdExpiresAt: { gt: now },
    },
    include: { lesson: true },
    orderBy: { createdAt: "desc" },
  });
  if (!booking) {
    if (await acceptSubscriptionReceipt(message, file)) return true;
    await replaceScreen(
      String(message.chat.id),
      copy.text("receiptWithoutBooking"),
    );
    return true;
  }

  const reviewUntil = new Date(
    Math.min(
      booking.lesson.startsAt.getTime(),
      now.getTime() + 12 * HOUR,
    ),
  );
  await prisma.botBooking.update({
    where: { id: booking.id },
    data: {
      status: "review",
      receiptFileId: file.id,
      receiptFileName: file.name,
      receiptMimeType: file.mime,
      holdExpiresAt: reviewUntil,
    },
  });
  await replaceScreen(
    booking.telegramChatId,
    copy.text("receiptReceived"),
  );

  const username = booking.username ? `@${booking.username}` : "без username";
  const caption =
    `Проверка оплаты №${booking.id}\n\n` +
    `${booking.displayName || "Клиент"} · ${username}\n` +
    `${formatDateTime(booking.lesson.startsAt)} · ${booking.lesson.type === "online" ? "онлайн" : "офлайн"}\n` +
    `${booking.tariffName || "Занятие"} · ${booking.amount.toLocaleString("ru-RU")} ₽`;
  for (const adminId of telegramAdminIds()) {
    await telegramApi<TelegramMessage>(file.method, {
      chat_id: adminId,
      [file.field]: file.id,
      caption,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: copy.text("buttonApprove"),
              callback_data: `admin:approve:${booking.id}`,
            },
            {
              text: copy.text("buttonReject"),
              callback_data: `admin:reject:${booking.id}`,
            },
          ],
        ],
      },
    }).catch(() => undefined);
  }
  return true;
}

async function approveBooking(query: TelegramCallbackQuery, bookingId: number) {
  const adminId = String(query.from.id);
  const copy = await getBotCopy();
  if (!telegramAdminIds().has(adminId)) {
    await answerCallback(query.id, "Нет доступа", true);
    return;
  }
  const now = new Date();
  const initial = await prisma.botBooking.findUnique({
    where: { id: bookingId },
    include: { lesson: true },
  });
  if (!initial) {
    await answerCallback(query.id, "Заявка не найдена", true);
    return;
  }
  if (initial.status === "confirmed") {
    await answerCallback(query.id, "Уже подтверждено");
    await editCallbackButtons(query);
    return;
  }
  if (initial.status !== "review") {
    await answerCallback(query.id, "Заявка уже не ожидает проверки", true);
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
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
        data: { status: "expired", reviewedByTelegramId: adminId, reviewedAt: now },
      });
      return { ok: false as const, reason: "full" as const };
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
      },
      update: { status: "enrolled" },
    });
    await tx.botBooking.update({
      where: { id: bookingId },
      data: {
        status: "confirmed",
        reviewedByTelegramId: adminId,
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

  await editCallbackButtons(query);
  if (!result.ok) {
    await answerCallback(
      query.id,
      result.reason === "full"
        ? "Занятие уже прошло или мест больше нет"
        : "Заявка уже изменилась",
      true,
    );
    if (result.reason === "full") {
      await replaceScreen(
        initial.telegramChatId,
        copy.text("paymentUnavailable"),
      ).catch(() => undefined);
    }
    return;
  }

  await answerCallback(query.id, "Оплата подтверждена");
  await replaceScreen(
    result.booking.telegramChatId,
    copy
      .text("paymentConfirmed", {
        date: formatDateTime(result.booking.lesson.startsAt),
        format:
          result.booking.lesson.type === "online" ? "онлайн" : "офлайн",
      })
      .replace("3 часа", "2 часа"),
  );
}

async function rejectBooking(query: TelegramCallbackQuery, bookingId: number) {
  const adminId = String(query.from.id);
  const copy = await getBotCopy();
  if (!telegramAdminIds().has(adminId)) {
    await answerCallback(query.id, "Нет доступа", true);
    return;
  }
  const booking = await prisma.botBooking.findUnique({
    where: { id: bookingId },
  });
  if (!booking || booking.status !== "review") {
    await answerCallback(query.id, "Заявка уже не ожидает проверки", true);
    return;
  }
  const settings = await getBotSettings();
  await prisma.botBooking.update({
    where: { id: bookingId },
    data: {
      status: "awaiting_receipt",
      receiptFileId: null,
      receiptFileName: null,
      receiptMimeType: null,
      reviewedByTelegramId: adminId,
      reviewedAt: new Date(),
      holdExpiresAt: new Date(
        Date.now() + Math.max(5, settings.bookingHoldMinutes) * MINUTE,
      ),
    },
  });
  await editCallbackButtons(query);
  await answerCallback(query.id, "Чек отклонён");
  await replaceScreen(
    booking.telegramChatId,
    copy.text("paymentRejected"),
  );
}

async function approveSubscriptionOrder(
  query: TelegramCallbackQuery,
  orderId: number,
) {
  const adminId = String(query.from.id);
  if (!telegramAdminIds().has(adminId)) {
    await answerCallback(query.id, "Нет доступа", true);
    return;
  }
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
        reviewedByTelegramId: adminId,
        reviewedAt: now,
      },
    });
    await tx.client.updateMany({
      where: { id: order.clientId, status: { not: "barter" } },
      data: { status: "active" },
    });
    return { order, subscription };
  });
  if (!result) {
    await answerCallback(query.id, "Заявка уже обработана", true);
    return;
  }
  await editCallbackButtons(query);
  await answerCallback(query.id, "Абонемент активирован");
  const until = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(expiresAt);
  await replaceScreen(
    result.order.telegramChatId,
    `Оплата подтверждена. Абонемент на ${result.order.totalLessons} занятий активирован до ${until}.`,
  );
}

async function rejectSubscriptionOrder(
  query: TelegramCallbackQuery,
  orderId: number,
) {
  const adminId = String(query.from.id);
  if (!telegramAdminIds().has(adminId)) {
    await answerCallback(query.id, "Нет доступа", true);
    return;
  }
  const result = await prisma.subscriptionOrder.updateMany({
    where: { id: orderId, status: "review" },
    data: {
      status: "awaiting_receipt",
      receiptFileId: null,
      receiptFileName: null,
      receiptMimeType: null,
      reviewedByTelegramId: adminId,
      reviewedAt: new Date(),
    },
  });
  await editCallbackButtons(query);
  await answerCallback(
    query.id,
    result.count ? "Чек отклонён" : "Заявка уже обработана",
    !result.count,
  );
  if (result.count) {
    const order = await prisma.subscriptionOrder.findUnique({ where: { id: orderId } });
    if (order) {
      await replaceScreen(
        order.telegramChatId,
        "Платёж пока не подтверждён. Проверьте чек и отправьте корректный PDF или фотографию ещё раз.",
      );
    }
  }
}

export async function handleClientBotMessage(message: TelegramMessage) {
  const chatId = String(message.chat.id);
  if (message.chat.type !== "private") return;
  if (await acceptTrainerVideo(message)) return;
  const rawText = message.text?.trim() ?? "";
  const text = rawText.toLowerCase();
  const startMatch = rawText.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/i);
  const payload = startMatch?.[1];
  const isPortalLink = Boolean(payload?.startsWith("link_"));
  const client = message.from && !isPortalLink
    ? await syncTelegramClient(message.from).catch(() => undefined)
    : undefined;
  if (await acceptReceipt(message)) return;
  const copy = await getBotCopy();
  if (startMatch || text === "/menu" || text === "меню") {
    if (message.from && payload?.startsWith("link_")) {
      try {
        await bindClientWithPortalToken(payload.slice(5), message.from);
        await sendTelegramMessage(
          chatId,
          "Личный кабинет подключён. Telegram и фотография привязаны к вашей карточке.",
        );
      } catch (error) {
        await sendTelegramMessage(
          chatId,
          error instanceof Error ? error.message : "Не удалось подключить кабинет",
        );
      }
    } else if (client && payload) {
      await attributeClientSourceFromStart(client.id, payload);
    }
    await clearRecentChat(chatId, message.message_id);
    await deleteMessage(chatId, message.message_id);
    await sendWelcome(chatId);
    return;
  }
  if (text === copy.text("buttonBook").trim().toLowerCase()) {
    await deleteMessage(chatId, message.message_id);
    if (message.from && (await requireSubscription(chatId, String(message.from.id)))) {
      await showBookingTypeMenu(chatId);
    }
    return;
  }
  if (text === copy.text("buttonMyLessons").trim().toLowerCase()) {
    await deleteMessage(chatId, message.message_id);
    if (message.from) await showMyLessons(chatId, message.from);
    return;
  }
  if (text === copy.text("buttonPrices").trim().toLowerCase()) {
    await deleteMessage(chatId, message.message_id);
    await showPrices(chatId);
    return;
  }
  if (
    text === copy.text("buttonTrainer").trim().toLowerCase() ||
    text === "тренажёр" ||
    text === "тренажер"
  ) {
    await deleteMessage(chatId, message.message_id);
    await showTrainer(chatId);
    return;
  }
  if (text && !text.startsWith("/")) {
    await replaceScreen(chatId, copy.text("unknownMessage"));
  }
}

export async function handleClientBotCallback(query: TelegramCallbackQuery) {
  const message = query.message;
  const data = query.data;
  if (!message || !data) return;
  const chatId = String(message.chat.id);
  const userId = String(query.from.id);
  const copy = await getBotCopy();

  if (data === "client:menu") {
    await answerCallback(query.id);
    await sendWelcome(chatId);
    return;
  }
  if (data === "client:classes" || data === "client:teacher") {
    await answerCallback(query.id);
    await sendWelcome(chatId);
    return;
  }
  if (data === "client:check") {
    const subscribed = await hasRequiredSubscription(userId);
    await answerCallback(
      query.id,
      subscribed ? "Подписка подтверждена" : "Подписка пока не найдена",
      !subscribed,
    );
    if (subscribed) {
      await showBookingTypeMenu(chatId, copy.text("subscriptionConfirmed"));
    } else {
      await askForSubscription(chatId);
    }
    return;
  }
  if (data === "client:schedule") {
    await answerCallback(query.id);
    if (await requireSubscription(chatId, userId)) {
      await showBookingTypeMenu(chatId);
    }
    return;
  }
  if (data === "client:type:online" || data === "client:type:offline") {
    await answerCallback(query.id);
    await sendDirectSchedule(
      chatId,
      userId,
      data.endsWith("online") ? "online" : "offline",
    );
    return;
  }
  if (data.startsWith("client:lesson:")) {
    await answerCallback(query.id);
    const lessonId = Number(data.slice("client:lesson:".length));
    if (Number.isInteger(lessonId) && lessonId > 0) {
      await createBooking(chatId, query.from, lessonId);
    }
    return;
  }
  if (data.startsWith("client:cancel:")) {
    const id = Number(data.slice("client:cancel:".length));
    const result = await prisma.botBooking.updateMany({
      where: {
        id,
        telegramUserId: userId,
        status: { in: ACTIVE_HOLD_STATUSES },
      },
      data: { status: "cancelled" },
    });
    await answerCallback(
      query.id,
      result.count > 0 ? "Бронь отменена" : "Бронь уже закрыта",
    );
    if (result.count > 0) {
      await replaceScreen(chatId, copy.text("bookingCancelled"));
    }
    return;
  }
  if (data.startsWith("admin:approve:")) {
    const id = Number(data.slice("admin:approve:".length));
    if (Number.isInteger(id)) await approveBooking(query, id);
    return;
  }
  if (data.startsWith("admin:reject:")) {
    const id = Number(data.slice("admin:reject:".length));
    if (Number.isInteger(id)) await rejectBooking(query, id);
    return;
  }
  if (data.startsWith("admin:approve-sub:")) {
    const id = Number(data.slice("admin:approve-sub:".length));
    if (Number.isInteger(id)) await approveSubscriptionOrder(query, id);
    return;
  }
  if (data.startsWith("admin:reject-sub:")) {
    const id = Number(data.slice("admin:reject-sub:".length));
    if (Number.isInteger(id)) await rejectSubscriptionOrder(query, id);
    return;
  }
  await answerCallback(query.id);
}

function reminderPlace(
  type: string,
  lessonUrl: string | null,
  lessonLocation: string | null,
  copy: BotCopy,
  settings: {
    onlineMeetingUrl: string | null;
    offlineAddress: string | null;
  },
) {
  if (type === "online") {
    const url = lessonUrl || settings.onlineMeetingUrl;
    return url ? copy.text("meetingLink", { value: url }) : "";
  }
  const address = lessonLocation || settings.offlineAddress;
  return address ? copy.text("meetingAddress", { value: address }) : "";
}

export async function runClientBookingReminders() {
  await expireOldHolds(true);
  const settings = await getBotSettings();
  const copy = await getBotCopy();
  if (!settings.enabled) return;
  const now = currentMoscowWallClockDate();
  const max = new Date(now.getTime() + 2 * HOUR + 10 * MINUTE);
  const min = new Date(now.getTime() - 15 * MINUTE);
  const bookings = await prisma.botBooking.findMany({
    where: {
      status: "confirmed",
      lesson: { startsAt: { gte: min, lte: max } },
      OR: [{ reminder3hSentAt: null }, { reminder1hSentAt: null }],
    },
    include: { lesson: true },
    orderBy: { lesson: { startsAt: "asc" } },
  });

  for (const booking of bookings) {
    const until = booking.lesson.startsAt.getTime() - now.getTime();
    if (until <= 2 * HOUR && until > HOUR && !booking.reminder3hSentAt) {
      await sendTelegramMessage(
        booking.telegramChatId,
        copy.text("reminder2h", {
          date: formatDateTime(booking.lesson.startsAt),
          format: booking.lesson.type === "online" ? "онлайн" : "офлайн",
        }),
      );
      await prisma.botBooking.update({
        where: { id: booking.id },
        data: { reminder3hSentAt: new Date() },
      });
    }
    if (until <= HOUR && until > -15 * MINUTE && !booking.reminder1hSentAt) {
      await sendTelegramMessage(
        booking.telegramChatId,
        copy.text("reminder1h", {
          date: formatDateTime(booking.lesson.startsAt),
          place: reminderPlace(
            booking.lesson.type,
            booking.lesson.meetingUrl,
            booking.lesson.location,
            copy,
            settings,
          ),
        }),
      );
      await prisma.botBooking.update({
        where: { id: booking.id },
        data: { reminder1hSentAt: new Date() },
      });
    }
  }

  const trialCutoff = new Date(now.getTime() - 7 * 24 * HOUR);
  const trialWindowStart = new Date(now.getTime() - 45 * 24 * HOUR);
  const trials = await prisma.botBooking.findMany({
    where: {
      status: "confirmed",
      kind: "trial",
      trialFollowupSentAt: null,
      clientId: { not: null },
      lesson: { startsAt: { gte: trialWindowStart, lte: trialCutoff } },
    },
    include: {
      lesson: {
        include: { attendances: { where: { status: "present" } } },
      },
    },
    orderBy: { lesson: { startsAt: "asc" } },
    take: 100,
  });
  for (const trial of trials) {
    if (!trial.clientId) continue;
    const attended = trial.lesson.attendances.some(
      (attendance) => attendance.clientId === trial.clientId,
    );
    if (!attended) continue;
    const purchasedAfter = await prisma.subscription.count({
      where: {
        clientId: trial.clientId,
        purchasedAt: { gte: trial.lesson.startsAt },
      },
    });
    if (purchasedAfter === 0) {
      const miniAppUrl = process.env.MINIAPP_URL?.trim();
      await sendTelegramMessage(
        trial.telegramChatId,
        `Вы были у нас на пробном ${trial.lesson.type === "online" ? "онлайн" : "офлайн"}-занятии. Чтобы продолжить тренировки, выберите подходящий абонемент в личном кабинете.`,
        miniAppUrl
          ? {
              inline_keyboard: [[
                {
                  text: "Выбрать абонемент",
                  web_app: { url: miniAppUrl },
                },
              ]],
            }
          : undefined,
      );
    }
    await prisma.botBooking.update({
      where: { id: trial.id },
      data: { trialFollowupSentAt: new Date() },
    });
  }
}
