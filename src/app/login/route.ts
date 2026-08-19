import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  isValidSession,
  sessionToken,
  timingSafeEqual,
} from "@/lib/auth";

const PAGE_STYLE = `
  * { box-sizing: border-box; }
  :root {
    --canvas: #f6e6ea;
    --surface: #fff9fb;
    --ink: #1a0a0f;
    --muted: #735c64;
    --line: #e2c5cd;
    --brand: #1a0a0f;
    --contrast: #f6e6ea;
    color-scheme: light;
  }
  :root[data-theme="dark"] {
    --canvas: #1a0a0f;
    --surface: #28141a;
    --ink: #f6e6ea;
    --muted: #c6aab2;
    --line: #4a2a33;
    --brand: #f6e6ea;
    --contrast: #1a0a0f;
    color-scheme: dark;
  }
  html, body { margin: 0; min-height: 100%; }
  body {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background: var(--canvas);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { position: relative; width: 100%; max-width: 384px; }
  header { margin-bottom: 24px; text-align: center; }
  .mark {
    width: 56px;
    height: 56px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    background: var(--brand);
    color: var(--contrast);
    font-size: 24px;
    font-weight: 750;
  }
  h1 { margin: 12px 0 0; font-size: 21px; line-height: 1.25; }
  .subtitle { margin: 5px 0 0; color: var(--muted); font-size: 14px; }
  .card {
    padding: 24px;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--surface);
    box-shadow: 0 8px 24px -16px rgba(44, 34, 40, .18);
  }
  label { display: block; font-size: 14px; font-weight: 650; }
  input {
    width: 100%;
    height: 46px;
    margin-top: 7px;
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 16px;
    outline: none;
    -webkit-appearance: none;
  }
  input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(115, 92, 100, .18); }
  .submit {
    width: 100%;
    height: 44px;
    margin-top: 16px;
    border: 0;
    border-radius: 999px;
    background: var(--brand);
    color: var(--contrast);
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    -webkit-appearance: none;
  }
  .submit:active { opacity: .84; }
  .theme-toggle {
    position: absolute;
    top: -8px;
    right: 0;
    width: 40px;
    height: 40px;
    margin: 0;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 78%, transparent);
    color: var(--ink);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  .theme-toggle:active { transform: scale(.95); }
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
  <meta name="theme-color" content="#F6E6EA">
  <script>(function(){try{var t=localStorage.getItem('vumexclusive-theme')==='dark'?'dark':'light';document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=t==='dark'?'#1A0A0F':'#F6E6EA'}catch(e){document.documentElement.dataset.theme='light'}})();</script>
  <title>Вход · VUMEXCLUSIVE CRM</title>
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <main>
    <button class="theme-toggle" type="button" aria-label="Сменить тему" title="Сменить тему" onclick="var d=document.documentElement;var t=d.dataset.theme==='dark'?'light':'dark';d.dataset.theme=t;d.style.colorScheme=t;localStorage.setItem('vumexclusive-theme',t);document.querySelector('meta[name=theme-color]').content=t==='dark'?'#1A0A0F':'#F6E6EA';this.textContent=t==='dark'?'☀':'☾'">☾</button>
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
        <button class="submit" type="submit">Войти</button>
      </form>
    </section>
  </main>
  <script>document.querySelector('.theme-toggle').textContent=document.documentElement.dataset.theme==='dark'?'☀':'☾';</script>
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

function publicUrl(request: NextRequest, pathname: string) {
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",", 1)[0].trim() ||
    request.nextUrl.protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host")?.split(",", 1)[0].trim() ||
    request.headers.get("host") ||
    request.nextUrl.host;
  return new URL(pathname, `${protocol}://${host}`);
}

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(cookie)) {
    return NextResponse.redirect(publicUrl(request, "/"), 303);
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

  const response = NextResponse.redirect(publicUrl(request, "/"), 303);
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
