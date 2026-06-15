import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, SectionTitle, EmptyState } from "@/components/ui";
import { IconArrowLeft, IconUsers, IconSparkle } from "@/components/icons";

export const dynamic = "force-dynamic";

const PERIODS: { key: string; label: string; months: number | null }[] = [
  { key: "all", label: "Всё время", months: null },
  { key: "6m", label: "6 месяцев", months: 6 },
  { key: "3m", label: "3 месяца", months: 3 },
  { key: "1m", label: "Месяц", months: 1 },
];

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period = "6m" } = await searchParams;
  const conf = PERIODS.find((p) => p.key === period) ?? PERIODS[1];

  let since: Date | null = null;
  if (conf.months) {
    since = new Date();
    since.setMonth(since.getMonth() - conf.months);
  }

  const clients = await prisma.client.findMany({
    where: since ? { firstContact: { gte: since } } : {},
    include: { subscriptions: { select: { id: true } } },
  });

  // группировка по источнику и по конкретному блогеру/каналу
  const bySource = new Map<string, { count: number; converted: number }>();
  const byDetail = new Map<
    string,
    { count: number; converted: number; source: string }
  >();

  for (const c of clients) {
    const src = c.source?.trim() || "Не указан";
    const conv = c.subscriptions.length > 0;

    const s = bySource.get(src) ?? { count: 0, converted: 0 };
    s.count++;
    if (conv) s.converted++;
    bySource.set(src, s);

    const detail = c.sourceDetail?.trim();
    if (detail) {
      const d = byDetail.get(detail) ?? { count: 0, converted: 0, source: src };
      d.count++;
      if (conv) d.converted++;
      byDetail.set(detail, d);
    }
  }

  const sources = [...bySource.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count);
  const details = [...byDetail.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count);

  const total = clients.length;
  const maxSrc = Math.max(1, ...sources.map((s) => s.count));
  const maxDet = Math.max(1, ...details.map((d) => d.count));

  return (
    <div className="space-y-6">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <IconArrowLeft className="size-4" />К клиентам
      </Link>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Источники лидов
        </h1>
        <p className="mt-1 text-sm text-muted">
          Откуда приходят клиенты и кто из блогеров приводит больше.
        </p>
      </header>

      {/* Период */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {PERIODS.map((p) => {
          const active = p.key === period;
          return (
            <Link
              key={p.key}
              href={`/sources?period=${p.key}`}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand text-white"
                  : "bg-white text-ink/70 ring-1 ring-line hover:bg-brand-tint"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      <Card className="flex items-center gap-4 p-5">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-dark">
          <IconUsers className="size-6" />
        </div>
        <div>
          <p className="text-sm text-muted">Всего лидов за период</p>
          <p className="text-2xl font-bold text-ink">{total}</p>
        </div>
      </Card>

      {/* По источникам */}
      <section>
        <SectionTitle>По источникам</SectionTitle>
        {sources.length === 0 ? (
          <EmptyState title="Нет данных за период" />
        ) : (
          <Card className="divide-y divide-line overflow-hidden p-0">
            {sources.map((s) => (
              <div key={s.name} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-ink">{s.name}</span>
                  <span className="text-sm text-muted">
                    <b className="text-ink">{s.count}</b> · купили {s.converted}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.round((s.count / maxSrc) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* По блогерам / каналам */}
      <section>
        <SectionTitle>По блогерам и каналам</SectionTitle>
        {details.length === 0 ? (
          <EmptyState
            icon={<IconSparkle className="size-8" />}
            title="Пока никто не указан"
            hint="Заполняй у клиента поле «от кого / детали источника» (имя блогера) — и здесь появится статистика по каждому."
          />
        ) : (
          <Card className="divide-y divide-line overflow-hidden p-0">
            {details.map((d) => (
              <div key={d.name} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold text-ink">
                    {d.name}
                    <span className="ml-1.5 text-xs font-normal text-muted">
                      {d.source}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-muted">
                    <b className="text-ink">{d.count}</b> · купили {d.converted}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.round((d.count / maxDet) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
