// Простая авторизация под одного преподавателя: один пароль (APP_PASSWORD).
// После входа в куку кладётся HMAC-подпись — подделать без AUTH_SECRET нельзя.
// Файл edge-совместимый (используется в middleware) — без Node-API, только Web Crypto.

export const SESSION_COOKIE = "dance_session";

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toHex(sig);
}

function secret(): string {
  return process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
}

/** Значение сессионной куки */
export async function sessionToken(): Promise<string> {
  return hmacHex(secret(), "authenticated:v1");
}

/** Сравнение строк за постоянное время (защита от тайминг-атак) */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Валидна ли сессия по значению куки */
export async function isValidSession(
  cookieValue: string | undefined,
): Promise<boolean> {
  if (!cookieValue) return false;
  return timingSafeEqual(cookieValue, await sessionToken());
}
