import { prisma, usesPostgres } from "@/lib/db";
import {
  currentMoscowWallClockDate,
  formatDateTime,
  normalizeHandle,
} from "@/lib/domain";
import {
  telegramAdminIds,
  telegramApi,
  telegramDisplayName,
  type TelegramCallbackQuery,
  type TelegramChat,
  type TelegramMessage,
  type TelegramUpdate,
  type TelegramUser,
} from "@/lib/telegram-api";
import {
  handleClientBotCallback,
  handleClientBotMessage,
  runClientBookingReminders,
} from "@/lib/telegram-client-bot";
import { handleTelegramChannelPost } from "@/lib/telegram-channel";

export type { TelegramUpdate } from "@/lib/telegram-api";
export { telegramApi } from "@/lib/telegram-api";
export { syncTelegramBotProfile } from "@/lib/telegram-channel";

const HOUR = 60 * 60 * 1000;

function adminIds() {
  return telegramAdminIds();
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
  return telegramDisplayName(user);
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
    if (usesPostgres) {
      await tx.$executeRaw`select pg_advisory_xact_lock(${lessonId})`;
    }
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
      create: {
        lessonId,
        clientId: client.id,
        status: "enrolled",
        enrollmentSource: "bot",
      },
      update: { status: "enrolled", enrollmentSource: "bot" },
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

  if (update.message && !update.message.business_connection_id) {
    await handleClientBotMessage(update.message);
  }
  if (update.channel_post) await handleTelegramChannelPost(update.channel_post);
  if (update.business_message) await handleBusinessMessage(update.business_message);
  if (update.callback_query?.message?.business_connection_id) {
    await handleCallback(update.callback_query);
  } else if (update.callback_query) {
    await handleClientBotCallback(update.callback_query);
  }
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
  // В личных Business-чатах автоматических дожимов больше нет.
  // Фоновая задача обслуживает только записи в отдельном клиентском боте.
  await runClientBookingReminders();
}
