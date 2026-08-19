"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { logout } from "@/lib/auth-actions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconHome, IconUsers, IconCalendar, IconWallet, IconTag, IconBot } from "./icons";

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
  { href: "/prices", label: "Прайс", Icon: IconTag },
  { href: "/finance", label: "Финансы", Icon: IconWallet },
  { href: "/bot", label: "Бот", Icon: IconBot },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function mobileActiveIndex(pathname: string) {
  const index = NAV.findIndex(({ href, exact }) =>
    isActive(pathname, href, exact),
  );
  if (index >= 0) return index;
  if (pathname.startsWith("/subscriptions/")) {
    return NAV.findIndex(({ href }) => href === "/clients");
  }
  return 0;
}

type LensPosition = {
  x: number;
  y: number;
  width: number;
  height: number;
  ready: boolean;
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const mobileLinkRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [lens, setLens] = useState<LensPosition>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    ready: false,
  });
  const activeMobileIndex = mobileActiveIndex(pathname);

  useLayoutEffect(() => {
    const nav = mobileNavRef.current;
    const activeLink = mobileLinkRefs.current[activeMobileIndex];
    if (!nav || !activeLink) return;

    const updateLens = () => {
      const content = activeLink.querySelector<HTMLElement>("[data-nav-content]");
      if (!content) return;

      const contentWidth = content.getBoundingClientRect().width;
      const width = Math.min(
        activeLink.offsetWidth - 6,
        Math.max(48, contentWidth + 18),
      );

      setLens({
        x: activeLink.offsetLeft + (activeLink.offsetWidth - width) / 2,
        y: activeLink.offsetTop,
        width,
        height: activeLink.offsetHeight,
        ready: true,
      });
    };

    updateLens();
    const observer = new ResizeObserver(updateLens);
    observer.observe(nav);
    observer.observe(activeLink);
    return () => observer.disconnect();
  }, [activeMobileIndex]);

  // Страница входа — без меню и оболочки
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-[100dvh]">
      {/* Боковое меню — десктоп */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/80 px-4 py-6 backdrop-blur md:flex">
        <div className="flex items-center justify-between gap-3">
          <Brand />
          <ThemeToggle />
        </div>
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
                    : "text-ink/70 hover:bg-brand-soft/70 hover:text-ink",
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
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-ink/70 transition-colors hover:bg-brand-soft/70 hover:text-ink"
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
          <div className="mb-2 flex justify-end md:hidden">
            <ThemeToggle />
          </div>
          {children}
        </main>
      </div>

      {/* Нижние табы — мобайл */}
      <nav
        aria-label="Основная навигация"
        data-testid="mobile-nav"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] isolate px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [transform:translateZ(0)] [touch-action:manipulation] md:hidden"
      >
        <div
          ref={mobileNavRef}
          className="mobile-nav-dock pointer-events-auto relative z-10 mx-auto flex max-w-md items-stretch justify-around rounded-[1.65rem] border border-line/70 px-1.5 py-1.5"
        >
          <span
            aria-hidden="true"
            className="mobile-nav-lens"
            style={
              {
                "--lens-x": `${lens.x}px`,
                "--lens-y": `${lens.y}px`,
                "--lens-width": `${lens.width}px`,
                "--lens-height": `${lens.height}px`,
                opacity: lens.ready ? 1 : 0,
              } as CSSProperties
            }
          />
          {NAV.map(({ href, label, Icon }, index) => {
            return (
              <Link
                key={href}
                href={href}
                ref={(node) => {
                  mobileLinkRefs.current[index] = node;
                }}
                aria-current={
                  index === activeMobileIndex ? "page" : undefined
                }
                className={cn(
                  "relative z-10 flex min-w-0 flex-1 touch-manipulation select-none items-center justify-center rounded-xl py-1.5 text-[11px] font-medium transition-colors duration-300 focus:outline-none focus-visible:text-ink",
                  index === activeMobileIndex ? "text-brand-dark" : "text-muted",
                )}
              >
                <span
                  data-nav-content
                  className="flex min-w-0 flex-col items-center gap-1"
                >
                  <Icon className="size-6" />
                  <span>{label}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 px-1.5">
      <span className="flex size-10 items-center justify-center rounded-2xl bg-brand text-lg font-bold text-brand-contrast">
        V
      </span>
      <span className="leading-tight">
        <span className="block font-bold text-ink">VUMEXCLUSIVE</span>
      </span>
    </Link>
  );
}
