"use client";

import { deleteClient } from "@/lib/actions";
import { SubmitButton } from "@/components/form";
import { IconX } from "@/components/icons";

export function DeleteClientButton({
  id,
  name,
}: {
  id: number;
  name: string;
}) {
  return (
    <form
      action={deleteClient}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Удалить клиента «${name}»?\n\nВместе с ним удалятся все абонементы, заметки и история посещений. Это действие нельзя отменить.`,
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        variant="ghost"
        size="sm"
        pendingText="Удаляю…"
        className="text-red-500 hover:bg-red-50"
      >
        <IconX className="size-4" />
        Удалить клиента
      </SubmitButton>
    </form>
  );
}
