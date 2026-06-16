"use client";

import { useActionState } from "react";
import { createClient } from "@/lib/actions";
import { ClientForm } from "@/components/ClientForm";

// Обёртка для нового клиента: useActionState ловит предупреждение о дубле
// и передаёт его в форму, не теряя введённые данные.
export function NewClientForm() {
  const [state, formAction] = useActionState(createClient, null);
  return (
    <ClientForm
      action={formAction}
      submitText="Создать клиента"
      state={state}
    />
  );
}
