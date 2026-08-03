import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramDocument = {
  file_id: string;
  file_name?: string;
  mime_type?: string;
};

export type TelegramPhoto = {
  file_id: string;
  width: number;
  height: number;
};

export type TelegramVideo = {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  duration: number;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  sender_business_bot?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  document?: TelegramDocument;
  photo?: TelegramPhoto[];
  video?: TelegramVideo;
  business_connection_id?: string;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramBusinessConnectionUpdate = {
  id: string;
  user: TelegramUser;
  is_enabled: boolean;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  business_connection?: TelegramBusinessConnectionUpdate;
  business_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || token.includes("ВСТАВЬ_")) {
    throw new Error("TELEGRAM_BOT_TOKEN не задан");
  }
  return token;
}

export function telegramAdminIds() {
  return new Set(
    (process.env.TELEGRAM_ADMIN_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function telegramDisplayName(user?: TelegramUser | TelegramChat) {
  if (!user) return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name || user.username || null;
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

export async function sendTelegramMessage(
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

export async function sendTelegramPhotoFile(
  chatId: string,
  filePath: string,
  caption: string,
  replyMarkup?: Record<string, unknown>,
) {
  const bytes = await readFile(filePath);
  const mimeType = filePath.toLowerCase().endsWith(".png")
    ? "image/png"
    : "image/jpeg";
  const body = new FormData();
  body.set("chat_id", chatId);
  body.set("caption", caption);
  body.set(
    "photo",
    new Blob([new Uint8Array(bytes)], { type: mimeType }),
    basename(filePath),
  );
  if (replyMarkup) body.set("reply_markup", JSON.stringify(replyMarkup));

  const response = await fetch(
    `https://api.telegram.org/bot${botToken()}/sendPhoto`,
    {
      method: "POST",
      body,
    },
  );
  const data = (await response.json()) as TelegramApiResponse<TelegramMessage>;
  if (!response.ok || !data.ok || data.result === undefined) {
    throw new Error(data.description || "Telegram API: sendPhoto failed");
  }
  return data.result;
}

export async function setTelegramProfilePhotoFile(filePath: string) {
  const bytes = await readFile(filePath);
  const body = new FormData();
  body.set(
    "photo",
    JSON.stringify({ type: "static", photo: "attach://profile_photo" }),
  );
  body.set(
    "profile_photo",
    new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
    basename(filePath),
  );

  const response = await fetch(
    `https://api.telegram.org/bot${botToken()}/setMyProfilePhoto`,
    { method: "POST", body },
  );
  const data = (await response.json()) as TelegramApiResponse<boolean>;
  if (!response.ok || !data.ok || data.result === undefined) {
    throw new Error(data.description || "Telegram API: setMyProfilePhoto failed");
  }
  return data.result;
}

export async function downloadTelegramFile(fileId: string) {
  const file = await telegramApi<{ file_path?: string }>("getFile", {
    file_id: fileId,
  });
  if (!file.file_path) throw new Error("Telegram не вернул путь к файлу");
  const response = await fetch(
    `https://api.telegram.org/file/bot${botToken()}/${file.file_path}`,
  );
  if (!response.ok) throw new Error("Не удалось загрузить файл из Telegram");
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") || "image/jpeg",
  };
}
