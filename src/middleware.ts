import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  if (process.env.LOCAL_AUTH_BYPASS === "1") {
    return NextResponse.next();
  }
  // Авторизация включается, только когда задан пароль (APP_PASSWORD).
  // Без него сайт открыт — удобно для демо до настройки входа.
  if (!process.env.APP_PASSWORD) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(cookie)) {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

// Telegram webhook имеет собственный секрет в заголовке и должен быть доступен Telegram.
// Всё остальное защищаем паролем кабинета.
export const config = {
  matcher: [
    "/((?!login|miniapp|api/miniapp|api/telegram/webhook|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
