import { NextRequest, NextResponse } from "next/server";
import {
  handleTelegramUpdate,
  type TelegramUpdate,
} from "@/lib/telegram-bot";

export async function POST(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const actual = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || actual !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  await handleTelegramUpdate(update);
  return NextResponse.json({ ok: true });
}

