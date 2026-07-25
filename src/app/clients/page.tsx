import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  CLIENT_STATUS,
  SUB_TYPE,
  isUsable,
  remaining,
  pluralLessons,
  effectiveClientStatus,
  type ClientStatus,
} from "@/lib/domain";
import { Avatar, Badge, Card, EmptyState, buttonClass } from "@/components/ui";
import { IconChevronRight, IconPlus, IconUsers } from "@/components/icons";

export const dynamic = "force-dynamic";

const SUMMARY: { key: "all" | ClientStatus; label: string; hint: string }[] = [
  { key: "all", label: "Всего", hint: "в базе" },
  { key: "lead", label: "Лиды", hint: "ещё не были" },
  { key: "trial", label: "Пробные", hint: "были на пробном" },
  { key: "active", label: "Активные", hint: "есть абонемент" },
  { key: "expired", label: "Закончились", hint: "нужно продлить" },
  { key: "barter", label: "Бартер", hint: "особый статус" },
  { key: "inactive", label: "Неактивные", hint: "не ходят" },
];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status = "all", q = "" } = await searchParams;
  const query = q.trim();
  const handleQuery = query.replace(/^@+/, "");

  const all = await prisma.client.findMany({
    where: query
      ? {
          OR: [
            { fullName: { contains: query, mode: "insensitive" } },
            { telegram: { contains: handleQuery, mode: "insensitive" } },
            { telegramUserId: { equals: handleQuery } },
            { phone: { contains: query } },
            { instagram: { contains: handleQuery, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { subscriptions: true },
    orderBy: [{ fullName: "asc" }],
  });
  // Статус считаем по абонементам и по нему же фильтруем
  const withStatus = all.map((c) => ({
    ...c,
    effStatus: effectiveClientStatus(c.status, c.subscriptions),
  }));
  const counts: Record<"all" | ClientStatus, number> = {
    all: withStatus.length,
    lead: 0,
    trial: 0,
    active: 0,
    expired: 0,
    inactive: 0,
    barter: 0,
  };
  for (const c of withStatus) counts[c.effStatus] += 1;

  const clients = withStatus.filter(
    (c) => status === "all" || c.effStatus === status,
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Клиенты
        </h1>
        <div className="flex items-center gap-2">
          <Link href="/sources" className={buttonClass("soft", "sm")}>
            Источники
          </Link>
          <Link href="/clients/new" className={buttonClass("primary", "sm")}>
            <IconPlus className="size-4" />
            Добавить
          </Link>
        </div>
      </header>

      {/* Поиск */}
      <form method="get" className="relative">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Имя, телефон или @username…"
          className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-ink outline-none transition placeholder:text-muted/50 focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </form>

      {/* Счётчики по статусам */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {SUMMARY.map((item) => {
          const active = item.key === status;
          const meta = item.key === "all" ? null : CLIENT_STATUS[item.key];
          return (
            <Link
              key={item.key}
              href={item.key === "all" ? "/clients" : `/clients?status=${item.key}`}
              className={`rounded-2xl border p-3 transition-colors ${
                active
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-white hover:bg-brand-tint"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-xs font-semibold uppercase ${
                    active ? "text-white/80" : "text-muted"
                  }`}
                >
                  {item.label}
                </span>
                {meta && (
                  <span
                    className={`size-2 rounded-full ${
                      active ? "bg-white/80" : "bg-brand/60"
                    }`}
                  />
                )}
              </div>
              <p className="mt-1 text-2xl font-bold leading-none">
                {counts[item.key]}
              </p>
              <p className={`mt-1 text-xs ${active ? "text-white/75" : "text-muted"}`}>
                {item.hint}
              </p>
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
            const meta = CLIENT_STATUS[c.effStatus];
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
                      ? `${SUB_TYPE[usable.type as "online" | "offline"].label}${usable.tariffName ? ` · ${usable.tariffName}` : ""} · осталось ${pluralLessons(remaining(usable))}`
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
