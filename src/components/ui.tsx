import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { initials as makeInitials, type Tone } from "@/lib/domain";

const TONE: Record<Tone, string> = {
  green: "bg-green-50 text-green-700 ring-green-600/15",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/15",
  red: "bg-red-50 text-red-600 ring-red-600/15",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/15",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/15",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/15",
};

export function Badge({
  tone = "slate",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({
  name,
  size = 44,
}: {
  name: string;
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-dark uppercase"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {makeInitials(name)}
    </span>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted/60">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

/** Кнопка-ссылка в фирменном стиле */
export function buttonClass(
  variant: "primary" | "soft" | "ghost" = "primary",
  size: "sm" | "md" = "md",
): string {
  const sizes = {
    sm: "h-9 px-3.5 text-sm",
    md: "h-11 px-5 text-sm",
  };
  const variants = {
    primary:
      "bg-brand text-white hover:bg-brand-dark shadow-sm active:scale-[0.99]",
    soft: "bg-brand-soft text-brand-dark hover:bg-brand-soft/70",
    ghost: "text-ink hover:bg-black/5",
  };
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none",
    sizes[size],
    variants[variant],
  );
}
