import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { normalizeHandle } from "@/lib/domain";
import {
  telegramApi,
  telegramDisplayName,
  type TelegramUser,
} from "@/lib/telegram-api";

export type TelegramPortalUser = TelegramUser & {
  photo_url?: string;
};

function linkHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function findClientByTelegram(user: TelegramUser) {
  const telegramUserId = String(user.id);
  let client = await prisma.client.findUnique({ where: { telegramUserId } });
  if (!client && user.username) {
    const normalized = normalizeHandle(user.username);
    const candidates = await prisma.client.findMany({
      where: { telegram: { not: null } },
    });
    client =
      candidates.find(
        (candidate) => normalizeHandle(candidate.telegram) === normalized,
      ) ?? null;
  }
  return client;
}

async function getTelegramAvatarFileId(
  user: TelegramUser,
  previous: string | null = null,
) {
  const profile = await telegramApi<{
    total_count: number;
    photos: { file_id: string; width: number; height: number }[][];
  }>("getUserProfilePhotos", {
    user_id: user.id,
    offset: 0,
    limit: 1,
  }).catch(() => undefined);
  return profile?.photos[0]?.at(-1)?.file_id ?? previous;
}

export async function syncTelegramClient(
  user: TelegramUser,
  forcedClientId?: number,
) {
  const telegramUserId = String(user.id);
  const client = forcedClientId
    ? await prisma.client.findUnique({ where: { id: forcedClientId } })
    : await findClientByTelegram(user);

  const occupied = await prisma.client.findUnique({ where: { telegramUserId } });
  if (forcedClientId && occupied && occupied.id !== forcedClientId) {
    throw new Error("Этот Telegram уже привязан к другой карточке клиента");
  }

  const telegram = user.username ? `@${user.username}` : null;
  const name = telegramDisplayName(user) ?? `Telegram ${user.id}`;
  const telegramAvatarFileId = await getTelegramAvatarFileId(
    user,
    client?.telegramAvatarFileId ?? null,
  );

  if (!client) {
    return prisma.client.create({
      data: {
        fullName: name,
        telegram,
        telegramUserId,
        telegramAvatarFileId,
        source: "Telegram",
        status: "lead",
      },
    });
  }

  return prisma.client.update({
    where: { id: client.id },
    data: {
      telegramUserId,
      telegram: telegram ?? client.telegram,
      telegramAvatarFileId,
      ...(client.fullName.startsWith("Telegram ") ? { fullName: name } : {}),
    },
  });
}

export async function createPortalLink(clientId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.clientPortalLink.create({
    data: { clientId, tokenHash: linkHash(token), expiresAt },
  });
  return { token, expiresAt };
}

export async function bindClientWithPortalToken(
  token: string,
  user: TelegramUser,
) {
  const now = new Date();
  const link = await prisma.clientPortalLink.findUnique({
    where: { tokenHash: linkHash(token) },
  });
  if (
    link?.usedAt &&
    link.usedByTelegramUserId === String(user.id)
  ) {
    return syncTelegramClient(user, link.clientId);
  }
  if (!link || link.usedAt || link.expiresAt <= now) {
    throw new Error("Ссылка недействительна или уже использована");
  }

  const client = await syncTelegramClient(user, link.clientId);
  await prisma.clientPortalLink.update({
    where: { id: link.id },
    data: {
      usedAt: now,
      usedByTelegramUserId: String(user.id),
    },
  });
  return client;
}
