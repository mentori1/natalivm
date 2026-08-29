import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramPortalUser } from "@/lib/telegram-client-sync";

export type MiniAppIdentity = {
  user: TelegramPortalUser;
  startParam: string | null;
};

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан");
  return token;
}

export function validateTelegramMiniAppData(raw: string): MiniAppIdentity {
  if (!raw && process.env.NODE_ENV !== "production") {
    const id = Number(process.env.MINIAPP_DEV_USER_ID || "6876234451");
    return {
      user: {
        id,
        first_name: process.env.MINIAPP_DEV_FIRST_NAME || "Тестовый клиент",
        username: process.env.MINIAPP_DEV_USERNAME || "Mentori_Re",
      },
      startParam: null,
    };
  }

  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const userRaw = params.get("user");
  if (!hash || !authDate || !userRaw) {
    throw new Error("Telegram не передал данные для входа");
  }
  const age = Math.abs(Date.now() / 1000 - authDate);
  if (age > 24 * 60 * 60) {
    throw new Error("Сессия Telegram устарела, откройте кабинет заново");
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData")
    .update(botToken())
    .digest();
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");
  const actualBuffer = Buffer.from(hash, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("Не удалось подтвердить вход через Telegram");
  }

  const user = JSON.parse(userRaw) as TelegramPortalUser;
  if (!Number.isInteger(user.id) || !user.first_name) {
    throw new Error("Telegram передал неполные данные пользователя");
  }
  return { user, startParam: params.get("start_param") };
}
