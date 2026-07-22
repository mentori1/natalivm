import { prisma } from "@/lib/db";
import {
  currentMoscowWallClockDate,
  formatDateTime,
  normalizeHandle,
} from "@/lib/domain";

type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  sender_business_bot?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  business_connection_id?: string;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

type TelegramBusinessConnection = {
  id: string;
  user: TelegramUser;
  is_enabled: boolean;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  business_connection?: TelegramBusinessConnection;
  business_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

const HOUR = 60 * 60 * 1000;

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || token.includes("ВСТАВЬ_")) {
    throw new Error("TELEGRAM_BOT_TOKEN не задан в .env.bot.local");
  }
  return token;
}

function adminIds() {
  return new Set(
    (process.env.TELEGRAM_ADMIN_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export async function telegramApi<T>(
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !data.ok || data.result === undefined) {
    throw new Error(data.description || `Telegram API: ${method} failed`);
  }
  return data.result;
}

async function sendDirectMessage(
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>,
) {
  return telegramApi<TelegramMessage>("sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function sendBusinessMessage(
  connectionId: string,
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>,
) {
  const message = await telegramApi<TelegramMessage>("sendMessage", {
    business_connection_id: connectionId,
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  await prisma.telegramConversation.updateMany({
    where: { businessConnectionId: connectionId, telegramChatId: chatId },
    data: { lastBotMessageAt: new Date() },
  });
  return message;
}

async function deleteOwnerCommand(connectionId: string, messageId: number) {
  try {
    await telegramApi<boolean>("deleteBusinessMessages", {
      business_connection_id: connectionId,
      message_ids: [messageId],
    });
  } catch {
    // Право удаления выдаётся отдельно. Без него команда просто останется в чате.
  }
}

function displayName(user?: TelegramUser | TelegramChat) {
  if (!user) return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name || user.username || null;
}

async function findExistingClientByTelegram(
  telegramUserId: string,
  username?: string,
) {
  let client = await prisma.client.findUnique({ where: { telegramUserId } });
  if (!client && username) {
    const candidates = await prisma.client.findMany({
      where: { telegram: { not: null } },
    });
    client =
      candidates.find(
        (candidate) => normalizeHandle(candidate.telegram) === normalizeHandle(username),
      ) ?? null;
    if (client && !client.telegramUserId) {
      client = await prisma.client.update({
        where: { id: client.id },
        data: { telegramUserId },
      });
    }
  }
  return client;
}

async function getConversation(
  connectionId: string,
  message: TelegramMessage,
  senderIsClient = true,
) {
  const from = message.from;
  const telegramUserId = senderIsClient && from
    ? String(from.id)
    : String(message.chat.id);
  const username = senderIsClient
    ? from?.username ?? message.chat.username
    : message.chat.username;
  const name = senderIsClient
    ? displayName(from) ?? displayName(message.chat)
    : displayName(message.chat);
  const existingClient = await findExistingClientByTelegram(
    telegramUserId,
    username,
  );
  const isBarter = existingClient?.status === "barter";
  return prisma.telegramConversation.upsert({
    where: {
      businessConnectionId_telegramChatId: {
        businessConnectionId: connectionId,
        telegramChatId: String(message.chat.id),
      },
    },
    create: {
      businessConnectionId: connectionId,
      telegramChatId: String(message.chat.id),
      telegramUserId,
      username: username ?? null,
      displayName: name,
      clientId: existingClient?.id,
      state: isBarter ? "closed" : "idle",
      stopped: isBarter,
    },
    update: {
      telegramUserId,
      username: username ?? undefined,
      displayName: name ?? undefined,
      clientId: existingClient?.id,
      ...(isBarter
        ? { state: "closed", stopped: true, followupDueAt: null }
        : {}),
    },
  });
}

async function sendTypeQuestion(connectionId: string, chatId: string) {
  await sendBusinessMessage(
    connectionId,
    chatId,
    "Подскажите, вам удобнее заниматься онлайн или офлайн?",
    {
      inline_keyboard: [
        [
          { text: "Онлайн", callback_data: "schedule:online" },
          { text: "Офлайн", callback_data: "schedule:offline" },
        ],
      ],
    },
  );
}

async function sendSchedule(
  connectionId: string,
  chatId: string,
  type: "online" | "offline",
) {
  const conversation = await prisma.telegramConversation.findUnique({
    where: {
      businessConnectionId_telegramChatId: {
        businessConnectionId: connectionId,
        telegramChatId: chatId,
      },
    },
    include: { client: true },
  });
  if (conversation?.stopped || conversation?.client?.status === "barter") return;

  const lessons = await prisma.lesson.findMany({
    where: {
      format: "group",
      type,
      startsAt: { gte: currentMoscowWallClockDate() },
      capacity: { not: null },
    },
    include: { attendances: true },
    orderBy: { startsAt: "asc" },
    take: 20,
  });

  const available = lessons
    .map((lesson) => {
      const enrolled = lesson.attendances.filter((item) => item.status !== "absent").length;
      return {
        lesson,
        free: Math.max(0, (lesson.capacity ?? 0) - enrolled),
      };
    })
    .filter((item) => item.free > 0)
    .slice(0, 5);

  if (available.length === 0) {
    await sendBusinessMessage(
      connectionId,
      chatId,
      `Сейчас свободных мест на групповые ${type === "online" ? "онлайн" : "офлайн"}-занятия нет. Наталья уточнит ближайшие варианты и напишет вам лично.`,
    );
    return;
  }

  const scarcityText = (free: number) => {
    if (free > 3) return "";
    const places = free === 1 ? "свободное место" : "свободных места";
    return ` — осталось всего ${free} ${places}`;
  };

  const lines = available.map(
    ({ lesson, free }, index) =>
      `${index + 1}. ${formatDateTime(lesson.startsAt)}${scarcityText(free)}`,
  );
  await sendBusinessMessage(
    connectionId,
    chatId,
    `Ближайшие групповые ${type === "online" ? "онлайн" : "офлайн"}-занятия:\n\n${lines.join("\n")}\n\nНажмите на подходящую дату, и я вас запишу.`,
    {
      inline_keyboard: available.map(({ lesson, free }) => [
        {
          text: `${formatDateTime(lesson.startsAt)}${free <= 3 ? ` · осталось ${free}` : ""}`,
          callback_data: `book:${lesson.id}`,
        },
      ]),
    },
  );

  await prisma.telegramConversation.updateMany({
    where: { businessConnectionId: connectionId, telegramChatId: chatId },
    data: {
      state: "options_sent",
      preferredType: type,
      reminderSentAt: null,
      followupDueAt: new Date(Date.now() + 48 * HOUR),
      stopped: false,
    },
  });
}

async function findOrCreateClient(
  conversationId: number,
  user: TelegramUser,
) {
  const telegramUserId = String(user.id);
  let client = await findExistingClientByTelegram(telegramUserId, user.username);

  if (!client) {
    client = await prisma.client.create({
      data: {
        fullName: displayName(user) ?? `Telegram ${user.id}`,
        telegram: user.username ? `@${user.username}` : null,
        telegramUserId,
        source: "Telegram",
        status: "lead",
      },
    });
  } else {
    const telegram = user.username ? `@${user.username}` : null;
    const telegramName = displayName(user);
    const shouldRefreshGeneratedName =
      client.fullName === `Telegram ${user.id}` && Boolean(telegramName);

    client = await prisma.client.update({
      where: { id: client.id },
      data: {
        telegramUserId,
        telegram,
        ...(shouldRefreshGeneratedName ? { fullName: telegramName! } : {}),
      },
    });
  }

  await prisma.telegramConversation.update({
    where: { id: conversationId },
    data: { clientId: client.id },
  });
  return client;
}

async function bookLesson(
  connectionId: string,
  chatId: string,
  lessonId: number,
  user: TelegramUser,
) {
  const conversation = await prisma.telegramConversation.findUnique({
    where: {
      businessConnectionId_telegramChatId: {
        businessConnectionId: connectionId,
        telegramChatId: chatId,
      },
    },
  });
  if (!conversation || conversation.stopped) return;
  const client = await findOrCreateClient(conversation.id, user);
  if (client.status === "barter") {
    await prisma.telegramConversation.update({
      where: { id: conversation.id },
      data: { state: "closed", stopped: true, followupDueAt: null },
    });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(${lessonId})`;
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      include: { attendances: true },
    });
    if (
      !lesson ||
      lesson.format !== "group" ||
      lesson.startsAt < currentMoscowWallClockDate() ||
      !lesson.capacity
    ) {
      return { ok: false as const, reason: "unavailable" as const };
    }
    const enrolled = lesson.attendances.filter((item) => item.status !== "absent").length;
    if (enrolled >= lesson.capacity) {
      return { ok: false as const, reason: "full" as const };
    }
    await tx.attendance.upsert({
      where: { lessonId_clientId: { lessonId, clientId: client.id } },
      create: { lessonId, clientId: client.id, status: "enrolled" },
      update: { status: "enrolled" },
    });
    return { ok: true as const, lesson };
  });

  if (!result.ok) {
    await sendBusinessMessage(
      connectionId,
      chatId,
      result.reason === "full"
        ? "На это занятие только что заняли последнее место. Сейчас покажу другие варианты."
        : "Это занятие уже недоступно. Сейчас покажу актуальные варианты.",
    );
    if (conversation.preferredType === "online" || conversation.preferredType === "offline") {
      await sendSchedule(connectionId, chatId, conversation.preferredType);
    }
    return;
  }

  await prisma.telegramConversation.update({
    where: { id: conversation.id },
    data: { state: "booked", followupDueAt: null, reminderSentAt: null },
  });
  await sendBusinessMessage(
    connectionId,
    chatId,
    `Записала вас: ${formatDateTime(result.lesson.startsAt)}, ${result.lesson.type === "online" ? "онлайн" : "офлайн"}. Если планы изменятся, просто напишите сюда.`,
  );
}

async function handleOwnerCommand(
  connection: { id: string; ownerTelegramId: string },
  message: TelegramMessage,
) {
  const text = message.text?.trim().toLowerCase();
  if (!text?.startsWith("/")) return;
  if (!adminIds().has(connection.ownerTelegramId)) return;

  const chatId = String(message.chat.id);
  const conversation = await getConversation(connection.id, message, false);
  await deleteOwnerCommand(connection.id, message.message_id);
  await prisma.telegramConversation.update({
    where: { id: conversation.id },
    data: { lastOwnerCommandAt: new Date() },
  });
  if (conversation.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: conversation.clientId },
      select: { status: true },
    });
    if (client?.status === "barter") {
      await prisma.telegramConversation.update({
        where: { id: conversation.id },
        data: { state: "closed", stopped: true, followupDueAt: null },
      });
      return;
    }
  }

  if (text === "/человек") {
    await prisma.telegramConversation.update({
      where: { id: conversation.id },
      data: { state: "human_takeover", stopped: true, followupDueAt: null },
    });
    return;
  }
  if (text === "/бот") {
    await prisma.telegramConversation.update({
      where: { id: conversation.id },
      data: { state: "idle", stopped: false },
    });
    return;
  }
  if (text === "/запись") {
    await prisma.telegramConversation.update({
      where: { id: conversation.id },
      data: {
        state: "awaiting_type",
        stopped: false,
        reminderSentAt: null,
        followupDueAt: new Date(Date.now() + 48 * HOUR),
      },
    });
    await sendTypeQuestion(connection.id, chatId);
    return;
  }
  if (text === "/онлайн") {
    await sendSchedule(connection.id, chatId, "online");
    return;
  }
  if (text === "/офлайн") {
    await sendSchedule(connection.id, chatId, "offline");
  }
}

async function handleBusinessMessage(message: TelegramMessage) {
  const connectionId = message.business_connection_id;
  if (!connectionId || message.sender_business_bot) return;
  const connection = await prisma.telegramBusinessConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection?.enabled || !message.from) return;

  if (String(message.from.id) === connection.ownerTelegramId) {
    await handleOwnerCommand(connection, message);
    return;
  }

  const conversation = await getConversation(connectionId, message);
  await prisma.telegramConversation.update({
    where: { id: conversation.id },
    data: {
      telegramUserId: String(message.from.id),
      username: message.from.username ?? conversation.username,
      displayName: displayName(message.from) ?? conversation.displayName,
      lastIncomingAt: new Date(message.date * 1000),
    },
  });

  if (conversation.stopped || conversation.state !== "awaiting_type") return;
  const text = message.text?.toLowerCase() ?? "";
  if (text.includes("онлайн")) await sendSchedule(connectionId, String(message.chat.id), "online");
  else if (text.includes("офлайн")) {
    await sendSchedule(connectionId, String(message.chat.id), "offline");
  }
}

async function handleCallback(query: TelegramCallbackQuery) {
  const message = query.message;
  const connectionId = message?.business_connection_id;
  const data = query.data;
  if (!message || !connectionId || !data) return;

  await telegramApi<boolean>("answerCallbackQuery", { callback_query_id: query.id });
  const chatId = String(message.chat.id);
  if (data === "schedule:online" || data === "schedule:offline") {
    await sendSchedule(connectionId, chatId, data.endsWith("online") ? "online" : "offline");
    return;
  }
  if (data.startsWith("book:")) {
    const lessonId = Number(data.slice(5));
    if (Number.isInteger(lessonId) && lessonId > 0) {
      await bookLesson(connectionId, chatId, lessonId, query.from);
    }
  }
}

async function processUpdate(update: TelegramUpdate) {
  if (update.business_connection) {
    const connection = update.business_connection;
    await prisma.telegramBusinessConnection.upsert({
      where: { id: connection.id },
      create: {
        id: connection.id,
        ownerTelegramId: String(connection.user.id),
        ownerUsername: connection.user.username ?? null,
        enabled: connection.is_enabled,
      },
      update: {
        ownerTelegramId: String(connection.user.id),
        ownerUsername: connection.user.username ?? null,
        enabled: connection.is_enabled,
      },
    });
  }

  if (update.message?.text?.trim().toLowerCase() === "/start") {
    const id = String(update.message.from?.id ?? update.message.chat.id);
    const allowed = adminIds().has(id);
    await sendDirectMessage(
      String(update.message.chat.id),
      `Ваш Telegram ID: ${id}\n\n${
        allowed
          ? "Доступ администратора включён. Теперь подключите этого бота в настройках Telegram Business."
          : "Добавьте этот ID в TELEGRAM_ADMIN_IDS через запятую и перезапустите бота."
      }`,
    );
  }
  if (update.business_message) await handleBusinessMessage(update.business_message);
  if (update.callback_query) await handleCallback(update.callback_query);
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const id = String(update.update_id);
  const exists = await prisma.telegramUpdate.findUnique({ where: { id } });
  if (exists) return;
  await prisma.telegramUpdate.create({ data: { id } });
  try {
    await processUpdate(update);
  } catch (error) {
    await prisma.telegramUpdate.delete({ where: { id } }).catch(() => undefined);
    throw error;
  }
}

export async function runScheduledTelegramJobs() {
  const now = new Date();
  const reminderThreshold = new Date(now.getTime() - 20 * HOUR);
  const replyWindow = new Date(now.getTime() - 23 * HOUR);
  const reminderCandidates = await prisma.telegramConversation.findMany({
    where: {
      state: "options_sent",
      stopped: false,
      reminderSentAt: null,
      lastIncomingAt: { lte: reminderThreshold, gte: replyWindow },
      OR: [
        { clientId: null },
        { client: { is: { status: { not: "barter" } } } },
      ],
    },
  });

  for (const conversation of reminderCandidates) {
    await sendBusinessMessage(
      conversation.businessConnectionId,
      conversation.telegramChatId,
      `${conversation.displayName ? `${conversation.displayName}, здравствуйте! ` : "Здравствуйте! "}Вы спрашивали про занятия. Подсказать, какой из свободных вариантов вам лучше подойдёт?`,
    );
    await prisma.telegramConversation.update({
      where: { id: conversation.id },
      data: { reminderSentAt: now },
    });
  }

  const followups = await prisma.telegramConversation.findMany({
    where: {
      state: { in: ["awaiting_type", "options_sent"] },
      stopped: false,
      followupDueAt: { lte: now },
      OR: [
        { clientId: null },
        { client: { is: { status: { not: "barter" } } } },
      ],
    },
    include: { tasks: { where: { type: "manual_followup" } } },
  });

  for (const conversation of followups) {
    if (conversation.tasks.length > 0) continue;
    const task = await prisma.botTask.create({
      data: {
        conversationId: conversation.id,
        type: "manual_followup",
        dueAt: conversation.followupDueAt ?? now,
      },
    });
    const link = conversation.username
      ? `https://t.me/${conversation.username}`
      : conversation.telegramUserId
        ? `tg://user?id=${conversation.telegramUserId}`
        : null;
    const name = conversation.displayName || conversation.username || "Клиент";
    const text = `${name} спрашивала расписание 2 дня назад, но запись не завершена.\n\nГотовый текст:\n«${name}, здравствуйте! Вы спрашивали про занятия. Подсказать актуальные свободные даты?»`;

    for (const adminId of adminIds()) {
      await sendDirectMessage(adminId, text, link ? {
        inline_keyboard: [[{ text: "Открыть чат", url: link }]],
      } : undefined);
    }
    await prisma.botTask.update({
      where: { id: task.id },
      data: { status: "notified", notificationSentAt: new Date() },
    });
    await prisma.telegramConversation.update({
      where: { id: conversation.id },
      data: { state: "manual_followup", followupDueAt: null },
    });
  }
}
