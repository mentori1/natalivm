import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  isValidSession,
  sessionToken,
  timingSafeEqual,
} from "@/lib/auth";

const PAGE_STYLE = `
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background: #faf6f3;
    color: #2c2228;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { width: 100%; max-width: 384px; }
  header { margin-bottom: 24px; text-align: center; }
  .mark {
    width: 56px;
    height: 56px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    background: #b14a6b;
    color: #fff;
    font-size: 24px;
    font-weight: 750;
  }
  h1 { margin: 12px 0 0; font-size: 21px; line-height: 1.25; }
  .subtitle { margin: 5px 0 0; color: #8a7d83; font-size: 14px; }
  .card {
    padding: 24px;
    border: 1px solid #efe6e2;
    border-radius: 20px;
    background: #fff;
    box-shadow: 0 8px 24px -16px rgba(44, 34, 40, .18);
  }
  label { display: block; font-size: 14px; font-weight: 650; }
  input {
    width: 100%;
    height: 46px;
    margin-top: 7px;
    padding: 0 14px;
    border: 1px solid #efe6e2;
    border-radius: 12px;
    background: #fff;
    color: #2c2228;
    font: inherit;
    font-size: 16px;
    outline: none;
    -webkit-appearance: none;
  }
  input:focus { border-color: #b14a6b; box-shadow: 0 0 0 3px rgba(177, 74, 107, .14); }
  button {
    width: 100%;
    height: 44px;
    margin-top: 16px;
    border: 0;
    border-radius: 999px;
    background: #b14a6b;
    color: #fff;
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    -webkit-appearance: none;
  }
  button:active { background: #8f3a56; }
  .error {
    margin: 12px 0 0;
    color: #b42318;
    font-size: 14px;
    font-weight: 650;
  }
`;

function loginPage(error?: string) {
  const errorMarkup = error
    ? `<p class="error" role="alert">${error}</p>`
    : "";

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#b14a6b">
  <title>Вход · VUMEXCLUSIVE CRM</title>
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <main>
    <header>
      <div class="mark" aria-hidden="true">Н</div>
      <h1>Кабинет преподавателя</h1>
      <p class="subtitle">VUMEXCLUSIVE</p>
    </header>
    <section class="card">
      <form method="post" action="/login">
        <label>
          Пароль
          <input name="password" type="password" autocomplete="current-password" required autofocus placeholder="Введите пароль">
        </label>
        ${errorMarkup}
        <button type="submit">Войти</button>
      </form>
    </section>
  </main>
</body>
</html>`;
}

function htmlResponse(html: string, status = 200) {
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(cookie)) {
    return NextResponse.redirect(new URL("/", request.url), 303);
  }
  return htmlResponse(loginPage());
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const expected = process.env.APP_PASSWORD ?? "";

  if (!expected) {
    return htmlResponse(loginPage("Пароль не настроен на сервере."), 503);
  }
  if (!timingSafeEqual(password, expected)) {
    return htmlResponse(loginPage("Неверный пароль"), 401);
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    .trim();
  response.cookies.set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: forwardedProto
      ? forwardedProto === "https"
      : request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
