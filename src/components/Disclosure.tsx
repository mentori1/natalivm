"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui";
import { IconPlus, IconX } from "@/components/icons";

export function Disclosure({
  label,
  children,
  variant = "soft",
}: {
  label: string;
  children: ReactNode;
  variant?: "primary" | "soft" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(buttonClass(variant, "sm"))}
      >
        {open ? <IconX className="size-4" /> : <IconPlus className="size-4" />}
        {open ? "Отмена" : label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
