"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui";

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-ink outline-none transition placeholder:text-muted/50 focus:border-brand focus:ring-2 focus:ring-brand/15";

export function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-ink">
          {label}
        </span>
      )}
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={cn(inputClass, "min-h-[90px] resize-y", props.className)}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(inputClass, "appearance-none bg-white pr-9", props.className)}
    />
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  pendingText,
  className,
}: {
  children: ReactNode;
  variant?: "primary" | "soft" | "ghost";
  size?: "sm" | "md";
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(buttonClass(variant, size), className)}
    >
      {pending ? (pendingText ?? "Сохраняю…") : children}
    </button>
  );
}
