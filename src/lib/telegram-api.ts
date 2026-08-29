import { readFile } from "node:fs/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { basename } from "node:path";

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
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

export type TelegramChatMember = {
  status: string;
  user: TelegramUser;
  is_member?: boolean;
};

export type TelegramChatMemberUpdated = {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  business_connection?: TelegramBusinessConnectionUpdate;
  business_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  chat_member?: TelegramChatMemberUpdated;
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

function requestTelegram(
  url: string,
  options: RequestOptions = {},
  body?: Uint8Array,
) {
  return new Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    bytes: Buffer;
  }>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        ...options,
        family: 4,
        timeout: 15_000,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            bytes: Buffer.concat(chunks),
          });
        });
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error("Telegram API: превышено время ожидания"));
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
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
  const body = Buffer.from(JSON.stringify(payload));
  const response = await requestTelegram(
    `https://api.telegram.org/bot${botToken()}/${method}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": body.byteLength,
      },
    },
    body,
  );
  const data = JSON.parse(response.bytes.toString("utf8")) as TelegramApiResponse<T>;
  if (response.status < 200 || response.status >= 300 || !data.ok || data.result === undefined) {
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

export async function sendTelegramMediaBytes({
  chatId,
  bytes,
  fileName,
  mimeType,
  kind,
  caption,
  replyMarkup,
}: {
  chatId: string;
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  kind: "photo" | "document";
  caption?: string;
  replyMarkup?: Record<string, unknown>;
}) {
  const boundary = `----vumexclusive-${Date.now().toString(16)}`;
  const field = kind === "photo" ? "photo" : "document";
  const method = kind === "photo" ? "sendPhoto" : "sendDocument";
  const safeName = fileName.replace(/[\r\n"\\]/g, "_").slice(0, 120) || "receipt";
  const fields: Array<[string, string]> = [["chat_id", chatId]];
  if (caption) fields.push(["caption", caption]);
  if (replyMarkup) fields.push(["reply_markup", JSON.stringify(replyMarkup)]);

  const chunks: Buffer[] = [];
  for (const [name, value] of fields) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${safeName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  const body = Buffer.concat(chunks);
  const response = await requestTelegram(
    `https://api.telegram.org/bot${botToken()}/${method}`,
    {
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": body.byteLength,
      },
    },
    body,
  );
  const data = JSON.parse(response.bytes.toString("utf8")) as TelegramApiResponse<TelegramMessage>;
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !data.ok ||
    data.result === undefined
  ) {
    throw new Error(data.description || `Telegram API: ${method} failed`);
  }
  return data.result;
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
  return sendTelegramMediaBytes({
    chatId,
    bytes,
    fileName: basename(filePath),
    mimeType,
    kind: "photo",
    caption,
    replyMarkup,
  });
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
  const response = await requestTelegram(
    `https://api.telegram.org/file/bot${botToken()}/${file.file_path}`,
  );
  if (response.status < 200 || response.status >= 300) {
    throw new Error("Не удалось загрузить файл из Telegram");
  }
  return {
    bytes: response.bytes,
    contentType:
      (Array.isArray(response.headers["content-type"])
        ? response.headers["content-type"][0]
        : response.headers["content-type"]) || "image/jpeg",
  };
}
