import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateClient } from "@/lib/actions";
import { ClientForm } from "@/components/ClientForm";
import { IconArrowLeft } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id: Number(id) },
  });
  if (!client) notFound();

  return (
    <div className="space-y-6">
      <Link
        href={`/clients/${client.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <IconArrowLeft className="size-4" />
        Назад к карточке
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        Редактирование
      </h1>
      <ClientForm
        action={updateClient}
        client={client}
        submitText="Сохранить"
      />
    </div>
  );
}
