import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { downloadTelegramFile } from "@/lib/telegram-api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return new NextResponse(null, { status: 404 });
  }
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { telegramAvatarFileId: true },
  });
  if (!client?.telegramAvatarFileId) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    const file = await downloadTelegramFile(client.telegramAvatarFileId);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "content-type": file.contentType,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
