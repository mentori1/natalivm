import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { downloadTelegramFile } from "@/lib/telegram-api";

export const dynamic = "force-dynamic";

type PaymentKind = "booking" | "subscription" | "trainer";

function paymentKind(value: string | null): PaymentKind | null {
  return value === "booking" || value === "subscription" || value === "trainer"
    ? value
    : null;
}

export async function GET(req: NextRequest) {
  if (
    process.env.APP_PASSWORD &&
    !(await isValidSession(req.cookies.get(SESSION_COOKIE)?.value))
  ) {
    return new NextResponse(null, { status: 401 });
  }
  const kind = paymentKind(req.nextUrl.searchParams.get("kind"));
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!kind || !Number.isInteger(id) || id < 1) {
    return new NextResponse(null, { status: 404 });
  }

  const payment = kind === "booking"
    ? await prisma.botBooking.findUnique({
        where: { id },
        select: { receiptFileId: true, receiptFileName: true, receiptMimeType: true },
      })
    : kind === "subscription"
      ? await prisma.subscriptionOrder.findUnique({
          where: { id },
          select: { receiptFileId: true, receiptFileName: true, receiptMimeType: true },
        })
      : await prisma.trainerOrder.findUnique({
          where: { id },
          select: { receiptFileId: true, receiptFileName: true, receiptMimeType: true },
        });
  if (!payment?.receiptFileId) return new NextResponse(null, { status: 404 });

  try {
    const file = await downloadTelegramFile(payment.receiptFileId);
    const fileName = (payment.receiptFileName || "receipt")
      .replace(/[\r\n"\\]/g, "_")
      .slice(0, 120);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "content-type": payment.receiptMimeType || file.contentType,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
