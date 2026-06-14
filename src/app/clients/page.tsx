import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  CLIENT_STATUS,
  SUB_TYPE,
  derivedSubStatus,
  isUsable,
  remaining,
  pluralLessons,
  type ClientStatus,
} from "@/lib/domain";
import { Avatar, Badge, Card, EmptyState, buttonClass } from "@/components/ui";
import { IconChevronRight, IconPlus, IconUsers } from "@/components/icons";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "active", label: "Активные" },
  { key: "trial", label: "Пробные" },
  { key: "expired", label: "Закончились" },
  { key: "lead", label: "Лиды" },
  { key: "barter", label: "Бартер" },
  { key: "inactive", label: "Неактивные" },
];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status = "all", q = "" } = await searchParams;
  const query = q.trim();

  const clients = await prisma.client.findMany({
    where: {
      ...(status !== "all" ? { status } : {}),
      ...(query ? { fullName: { contains: query } } : {}),
    },
    include: { subscriptions: true },
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Клиенты
        </h1>
        <Link href="/clients/new" className={buttonClass("primary", "sm")}>
          <IconPlus className="size-4" />
          Добавить
        </Link>
      </header>

      {/* Поиск */}
      <form method="get" className="relative">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Поиск по имени…"
          className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-ink outline-none transition placeholder:text-muted/50 focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </form>

      {/* Фильтр по статусу */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => {
          const active = f.key === status;
          return (
            <Link
              key={f.key}
              href={f.key === "all" ? "/clients" : `/clients?status=${f.key}`}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand text-white"
                  : "bg-white text-ink/70 ring-1 ring-line hover:bg-brand-tint"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {/* Список */}
      {clients.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="size-8" />}
          title="Клиентов не найдено"
          hint={query ? "Попробуйте изменить запрос." : "Добавьте первого клиента."}
        />
      ) : (
        <Card className="divide-y divide-line overflow-hidden p-0">
          {clients.map((c) => {
            const meta = CLIENT_STATUS[c.status as ClientStatus];
            const usable = c.subscriptions
              .filter((s) => isUsable(s))
              .sort((a, b) => remaining(a) - remaining(b))[0];
            return (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-tint"
              >
                <Avatar name={c.fullName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">
                    {c.fullName}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {usable
                      ? `${SUB_TYPE[usable.type as "online" | "offline"].label} · осталось ${pluralLessons(remaining(usable))}`
                      : (c.telegram ?? c.phone ?? "без абонемента")}
                  </p>
                </div>
                {meta && <Badge tone={meta.tone}>{meta.label}</Badge>}
                <IconChevronRight className="size-5 shrink-0 text-muted/50" />
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
