"use client";

import { useState } from "react";

export function PortalLinkCard({ clientId }: { clientId: number }) {
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
      setError(linkError instanceof Error ? linkError.message : "Не удалось создать ссылку");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold text-ink">Подключение личного кабинета</p>
        <p className="mt-1 text-sm text-muted">
          Ссылка действует 7 дней и привязывает Telegram и аватар именно к этой карточке.
        </p>
      </div>
      {url ? (
        <div className="flex flex-col gap-2 sm:flex-row">
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
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void createLink()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast disabled:opacity-50"
        >
          {busy ? "Создаю…" : "Создать персональную ссылку"}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
