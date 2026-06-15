import Link from "next/link";
import { getDashboard } from "@/lib/queries";
import {
  formatMoney,
  formatTime,
  SUB_TYPE,
  type ReminderKind,
  type Tone,
} from "@/lib/domain";
import { Avatar, Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import {
  IconChevronRight,
  IconCalendar,
  IconSparkle,
  IconHeart,
} from "@/components/icons";

export const dynamic = "force-dynamic";

const KIND: Record<ReminderKind, { label: string; tone: Tone }> = {
  low_lessons: { label: "Мало занятий", tone: "amber" },
  ending_term: { label: "Скоро срок", tone: "amber" },
  finished: { label: "Закончился", tone: "red" },
  trial_followup: { label: "Пробное", tone: "violet" },
  disappeared: { label: "Пропал", tone: "slate" },
  trainer_upsell: { label: "Тренажёр", tone: "green" },
};

const ruDate = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export default async function DashboardPage() {
  const { reminders, todayLessons, finance } = await getDashboard();
  const today = ruDate.format(new Date());

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted capitalize">{today}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Здравствуйте, Наташа
        </h1>
      </header>

      {/* Быстрые показатели */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Активных" value={String(finance.activeClients)} />
        <StatTile label="Выручка, мес" value={formatMoney(finance.revenueMonth)} />
        <StatTile label="Занятий сегодня" value={String(todayLessons.length)} />
        <StatTile label="К продлению" value={String(finance.expectedRenewals)} />
      </div>

      {/* Требуют внимания */}
      <section>
        <SectionTitle>Требуют внимания</SectionTitle>
        {reminders.length === 0 ? (
          <EmptyState
            icon={<IconHeart className="size-8" />}
            title="Всё под контролем"
            hint="Нет клиентов, которым прямо сейчас нужно продление или внимание."
          />
        ) : (
          <Card className="divide-y divide-line overflow-hidden p-0">
            {reminders.map((r, i) => {
              const meta = KIND[r.kind];
              return (
                <Link
                  key={`${r.clientId}-${r.kind}-${i}`}
                  href={`/clients/${r.clientId}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-tint"
                >
                  <Avatar name={r.clientName} size={42} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">
                      {r.clientName}
                    </p>
                    <p className="truncate text-sm text-muted">{r.message}</p>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <IconChevronRight className="size-5 shrink-0 text-muted/50" />
                </Link>
              );
            })}
          </Card>
        )}
      </section>

      {/* Сегодня */}
      <section>
        <SectionTitle>Сегодня</SectionTitle>
        {todayLessons.length === 0 ? (
          <EmptyState
            icon={<IconCalendar className="size-8" />}
            title="Сегодня занятий нет"
          />
        ) : (
          <div className="space-y-3">
            {todayLessons.map((l) => (
              <Link key={l.id} href={`/lessons/${l.id}`}>
                <Card className="flex items-center gap-4 p-4 transition-colors hover:bg-brand-tint">
                  <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-soft text-brand-dark">
                    <span className="text-lg font-bold leading-none">
                      {formatTime(l.startsAt)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {l.title ?? "Занятие"}
                    </p>
                    <p className="text-sm text-muted">
                      {SUB_TYPE[l.type as "online" | "offline"]?.label} · записано{" "}
                      {l.enrolled}
                      {l.free !== null && ` · свободно ${l.free}`}
                    </p>
                  </div>
                  <IconChevronRight className="size-5 shrink-0 text-muted/50" />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Финансы */}
      <section>
        <SectionTitle>Финансы месяца</SectionTitle>
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
            <Metric label="Выручка" value={formatMoney(finance.revenueMonth)} />
            <Metric label="Расходы" value={formatMoney(finance.expensesMonth)} />
            <Metric
              label="Прибыль"
              value={formatMoney(finance.profitMonth)}
              accent
            />
            <Metric label="Средний чек" value={formatMoney(finance.avgCheck)} />
            <Metric
              label="Активных клиентов"
              value={String(finance.activeClients)}
            />
            <Metric
              label="Ждут продления"
              value={String(finance.expectedRenewals)}
            />
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-brand-tint p-4">
            <IconSparkle className="mt-0.5 size-5 shrink-0 text-brand" />
            <p className="text-sm text-ink">
              Прогноз: при продлении <b>{finance.expectedRenewals}</b>{" "}
              {declClient(finance.expectedRenewals)} ожидаемая выручка следующего
              месяца —{" "}
              <b className="text-brand-dark">
                {formatMoney(finance.potentialRevenue)}
              </b>
              .
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-ink">{value}</p>
    </Card>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-0.5 text-lg font-bold tracking-tight ${accent ? "text-brand-dark" : "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}

function declClient(n: number): string {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return "клиентов";
  if (last === 1) return "клиента";
  if (last >= 2 && last <= 4) return "клиентов";
  return "клиентов";
}
