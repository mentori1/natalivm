import { existsSync } from "node:fs";
import { join } from "node:path";
import { getBotCopy } from "@/lib/bot-content";
import { prisma } from "@/lib/db";
import {
  sendTelegramMessage,
  setTelegramProfilePhotoFile,
  telegramAdminIds,
  telegramApi,
  type TelegramMessage,
} from "@/lib/telegram-api";

const CHANNEL_START_PREFIX = "channel_";

function channelCommand(text?: string) {
  const token = text?.trim().toLowerCase().split(/\s+/)[0]?.split("@")[0];
  return token === "/закрепить" || token === "/запись";
}

async function notifyAdmins(text: string) {
  for (const chatId of telegramAdminIds()) {
    await sendTelegramMessage(chatId, text).catch(() => undefined);
  }
}

export async function syncTelegramBotProfile() {
  const copy = await getBotCopy();
  await telegramApi<boolean>("setMyDescription", {
    description: copy.text("botProfileDescription").slice(0, 512),
  });
  await telegramApi<boolean>("setMyShortDescription", {
    short_description: copy.text("botShortDescription").slice(0, 120),
  });

  const me = await telegramApi<{ id: number }>("getMe");
  const photos = await telegramApi<{ total_count: number }>(
    "getUserProfilePhotos",
    { user_id: me.id, offset: 0, limit: 1 },
  ).catch(() => null);
  const profilePath = join(process.cwd(), "public", "bot-profile.jpg");
  if (photos?.total_count === 0 && existsSync(profilePath)) {
    await setTelegramProfilePhotoFile(profilePath);
  }
}

export async function handleTelegramChannelPost(message: TelegramMessage) {
  if (message.chat.type !== "channel" || !channelCommand(message.text)) return;

  const chatId = String(message.chat.id);
  const title = message.chat.title?.trim() || message.chat.username || "Telegram-канал";
  const existing = await prisma.botChannel.findUnique({
    where: { telegramChatId: chatId },
  });
  const copy = await getBotCopy();
  const me = await telegramApi<{ username?: string }>("getMe");
  if (!me.username) throw new Error("Telegram не вернул username бота");

  const startPayload = `${CHANNEL_START_PREFIX}${chatId}`;
  const post = await sendTelegramMessage(
    chatId,
    copy.text("channelPostText"),
    {
      inline_keyboard: [
        [
          {
            text: copy.text("channelPostButton"),
            url: `https://t.me/${me.username}?start=${startPayload}`,
          },
        ],
      ],
    },
  );

  let pinned = true;
  try {
    await telegramApi<boolean>("pinChatMessage", {
      chat_id: chatId,
      message_id: post.message_id,
      disable_notification: true,
    });
  } catch {
    pinned = false;
  }

  await prisma.botChannel.upsert({
    where: { telegramChatId: chatId },
    create: {
      telegramChatId: chatId,
      title,
      username: message.chat.username ?? null,
      postMessageId: post.message_id,
    },
    update: {
      title,
      username: message.chat.username ?? null,
      postMessageId: post.message_id,
    },
  });

  if (existing?.postMessageId && existing.postMessageId !== post.message_id) {
    await telegramApi<boolean>("deleteMessage", {
      chat_id: chatId,
      message_id: existing.postMessageId,
    }).catch(() => undefined);
  }
  await telegramApi<boolean>("deleteMessage", {
    chat_id: chatId,
    message_id: message.message_id,
  }).catch(() => undefined);

  await notifyAdmins(
    pinned
      ? `Пост с кнопкой «${copy.text("channelPostButton")}» опубликован и закреплён в канале «${title}».`
      : `Пост с кнопкой опубликован в канале «${title}», но Telegram не разрешил его закрепить. Выдайте боту право редактировать сообщения или закрепите пост вручную.`,
  );
}

export async function attributeClientSourceFromStart(
  clientId: number,
  payload: string | undefined,
) {
  if (!payload?.startsWith(CHANNEL_START_PREFIX)) return;
  const telegramChatId = payload.slice(CHANNEL_START_PREFIX.length);
  const channel = await prisma.botChannel.findUnique({
    where: { telegramChatId },
  });
  if (!channel) return;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { source: true, sourceDetail: true },
  });
  if (
    !client ||
    client.sourceDetail ||
    (client.source && client.source !== "Telegram")
  ) {
    return;
  }
  await prisma.client.update({
    where: { id: clientId },
    data: { source: "Telegram", sourceDetail: `Канал: ${channel.title}` },
  });
}
