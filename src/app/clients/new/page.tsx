import Link from "next/link";
import { createClient } from "@/lib/actions";
import { ClientForm } from "@/components/ClientForm";
import { IconArrowLeft } from "@/components/icons";

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <IconArrowLeft className="size-4" />К клиентам
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        Новый клиент
      </h1>
      <ClientForm action={createClient} submitText="Создать клиента" />
    </div>
  );
}
