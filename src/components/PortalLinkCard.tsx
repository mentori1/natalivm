"use client";

import { useState } from "react";
import { IconSend } from "@/components/icons";

export function PortalLinkCard({
  clientId,
  connected,
}: {
  clientId: number;
  connected: boolean;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createLink() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch(`/api/clients/${clientId}/portal-link`, {
        method: "POST",
      });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        throw new Error(result.error || "Не удалось создать ссылку");
      }
      setUrl(result.url);
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "Не удалось создать ссылку",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
            <IconSend className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {connected ? "Telegram подключён" : "Подключить Telegram"}
            </p>
            <p className="text-xs text-muted">
              {connected
                ? "Можно создать новую ссылку"
                : "Персональная ссылка на 7 дней"}
            </p>
          </div>
        </div>
        {!url && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void createLink()}
            className="h-9 rounded-full bg-brand-tint px-3.5 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-soft disabled:opacity-50"
          >
            {busy ? "Создаю…" : connected ? "Новая ссылка" : "Создать ссылку"}
          </button>
        )}
      </div>
      {url && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={url}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm text-ink"
          />
          <button
            type="button"
            onClick={() => void copyLink()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast"
          >
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
