import { NextRequest, NextResponse } from "next/server";
import {
  handleTelegramUpdate,
  type TelegramUpdate,
} from "@/lib/telegram-bot";

async function derivedWebhookSecret() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;

  const bytes = new TextEncoder().encode(`dance-crm-webhook:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const fallbackSecret = await derivedWebhookSecret();
  const actual = request.headers.get("x-telegram-bot-api-secret-token");
  const valid =
    Boolean(actual) &&
    (actual === configuredSecret || actual === fallbackSecret);
  if (!valid) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  await handleTelegramUpdate(update);
  return NextResponse.json({ ok: true });
}
