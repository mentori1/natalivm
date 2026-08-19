"use client";

import { IconMoon, IconSun } from "@/components/icons";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark";

const STORAGE_KEY = "vumexclusive-theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#1A0A0F" : "#F6E6EA");
}

export function ThemeToggle({ className }: { className?: string }) {
  function toggleTheme() {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "theme-toggle flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface/72 text-ink shadow-sm backdrop-blur-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 active:scale-95",
        className,
      )}
      aria-label="Сменить тему"
      title="Сменить тему"
    >
      <span className="theme-toggle-icon theme-toggle-icon-light" aria-hidden="true">
        <IconMoon className="size-5" />
      </span>
      <span className="theme-toggle-icon theme-toggle-icon-dark" aria-hidden="true">
        <IconSun className="size-5" />
      </span>
    </button>
  );
}
