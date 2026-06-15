"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { logout } from "@/lib/auth-actions";
import { IconHome, IconUsers, IconCalendar, IconWallet } from "./icons";

const IconLogout = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
    <path d="M10 17l-5-5 5-5M5 12h11" />
  </svg>
);

const NAV = [
  { href: "/", label: "Главная", Icon: IconHome, exact: true },
  { href: "/clients", label: "Клиенты", Icon: IconUsers },
  { href: "/lessons", label: "Занятия", Icon: IconCalendar },
  { href: "/finance", label: "Финансы", Icon: IconWallet },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Страница входа — без меню и оболочки
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-[100dvh]">
      {/* Боковое меню — десктоп */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/80 px-4 py-6 backdrop-blur md:flex">
        <Brand />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map(({ href, label, Icon, exact }) => {
            const active = isActive(pathname, href, exact);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-soft text-brand-dark"
                    : "text-ink/70 hover:bg-black/5 hover:text-ink",
                )}
              >
                <Icon className={cn("size-5", active && "text-brand")} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2">
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-ink/70 transition-colors hover:bg-black/5 hover:text-ink"
            >
              <IconLogout className="size-5" />
              Выйти
            </button>
          </form>
          <p className="px-2 text-xs text-muted/70">
            Личный кабинет преподавателя
          </p>
        </div>
      </aside>

      {/* Контент */}
      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-28 sm:px-6 md:pb-12 lg:max-w-4xl">
          {children}
        </main>
      </div>

      {/* Нижние табы — мобайл */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {NAV.map(({ href, label, Icon, exact }) => {
            const active = isActive(pathname, href, exact);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors",
                  active ? "text-brand" : "text-muted",
                )}
              >
                <Icon className="size-6" />
                {label}
              </Link>
            );
          })}
          <form action={logout} className="flex flex-1">
            <button
              type="submit"
              className="flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium text-muted"
            >
              <IconLogout className="size-6" />
              Выйти
            </button>
          </form>
        </div>
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 px-1.5">
      <span className="flex size-10 items-center justify-center rounded-2xl bg-brand text-lg font-bold text-white">
        Н
      </span>
      <span className="leading-tight">
        <span className="block font-bold text-ink">Наташа</span>
        <span className="block text-xs text-muted">студия танца</span>
      </span>
    </Link>
  );
}
