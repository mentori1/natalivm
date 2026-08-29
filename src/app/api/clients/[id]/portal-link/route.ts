import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { telegramApi } from "@/lib/telegram-api";
import { createPortalLink } from "@/lib/telegram-client-sync";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId)) {
    return NextResponse.json({ error: "Некорректный клиент" }, { status: 400 });
  }
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }
  const { token, expiresAt } = await createPortalLink(clientId);
  const configured = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();
  const me = configured
    ? { username: configured }
    : await telegramApi<{ username?: string }>("getMe");
  if (!me.username) {
    return NextResponse.json({ error: "Username бота не найден" }, { status: 500 });
  }
  return NextResponse.json({
    url: `https://t.me/${me.username}?start=link_${token}`,
    expiresAt: expiresAt.toISOString(),
  });
}
