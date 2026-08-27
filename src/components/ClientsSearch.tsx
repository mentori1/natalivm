"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconX } from "@/components/icons";
import { buttonClass } from "@/components/ui";

type Props = {
  initialQuery: string;
};

export function ClientsSearch({ initialQuery }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const latestParams = useRef(searchParams.toString());

  useEffect(() => {
    latestParams.current = searchParams.toString();
  }, [searchParams]);

  function openResults(value: string) {
    const params = new URLSearchParams(latestParams.current);
    const cleaned = value.trim();

    if (cleaned) params.set("q", cleaned);
    else params.delete("q");

    // Поиск всегда идёт по всей базе, а не только внутри открытого статуса.
    params.delete("status");
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (query.trim() === (searchParams.get("q") ?? "").trim()) return;
    const timeout = window.setTimeout(() => openResults(query), 300);
    return () => window.clearTimeout(timeout);
    // openResults intentionally uses the latest params through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchParams]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openResults(query);
  }

  function clear() {
    setQuery("");
    openResults("");
  }

  return (
    <form onSubmit={submit} role="search" className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Имя, телефон или @username…"
          aria-label="Поиск клиента"
          autoComplete="off"
          className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 pr-11 text-ink outline-none transition placeholder:text-muted/50 focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label="Очистить поиск"
            title="Очистить поиск"
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-brand-tint hover:text-brand"
          >
            <IconX className="size-4" />
          </button>
        )}
      </div>
      <button type="submit" className={buttonClass("soft", "sm")}>
        Найти
      </button>
    </form>
  );
}
