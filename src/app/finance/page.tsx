import Link from "next/link";
import { prisma } from "@/lib/db";
import { getDashboard, startOfMonth, endOfMonth } from "@/lib/queries";
import { addExpense, deleteExpense } from "@/lib/actions";
import { SUB_TYPE, formatMoney, formatDate, type SubType } from "@/lib/domain";
import { Card, SectionTitle } from "@/components/ui";
import { Field, Input, SubmitButton } from "@/components/form";
import { Disclosure } from "@/components/Disclosure";
import { IconX, IconSparkle } from "@/components/icons";

export const dynamic = "force-dynamic";

const ruMonth = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });

export default async function FinancePage() {
  const now = new Date();
  const { finance } = await getDashboard();

  const subsThisMonth = await prisma.subscription.findMany({
    where: { purchasedAt: { gte: startOfMonth(now), lte: endOfMonth(now) } },
    include: { client: true },
    orderBy: { purchasedAt: "desc" },
  });
  const expenses = await prisma.expense.findMany({
    where: { date: { gte: startOfMonth(now), lte: endOfMonth(now) } },
    orderBy: { date: "desc" },
  });

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm text-muted capitalize">{ruMonth.format(now)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Финансы
        </h1>
      </header>

      {/* Главные метрики */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Big label="Выручка" value={formatMoney(finance.revenueMonth)} />
        <Big label="Расходы" value={formatMoney(finance.expensesMonth)} />
        <Big label="Прибыль" value={formatMoney(finance.profitMonth)} accent />
        <Big label="Средний чек" value={formatMoney(finance.avgCheck)} />
        <Big label="Активных клиентов" value={String(finance.activeClients)} />
        <Big label="Ждут продления" value={String(finance.expectedRenewals)} />
      </div>

      <Card className="flex items-start gap-3 p-5">
        <IconSparkle className="mt-0.5 size-5 shrink-0 text-brand" />
        <p className="text-sm text-ink">
          Прогноз выручки следующего месяца при продлении{" "}
          {finance.expectedRenewals} активных абонементов —{" "}
          <b className="text-brand-dark">
            {formatMoney(finance.potentialRevenue)}
          </b>
          .
        </p>
      </Card>

      {/* Доходы — проданные абонементы */}
      <section>
        <SectionTitle>Доходы за месяц</SectionTitle>
        {subsThisMonth.length === 0 ? (
          <Card className="p-5 text-sm text-muted">
            В этом месяце абонементы ещё не продавались.
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden p-0">
            {subsThisMonth.map((s) => (
              <Link
                key={s.id}
                href={`/clients/${s.clientId}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brand-tint"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {s.client.fullName}
                  </p>
                  <p className="text-xs text-muted">
                    {SUB_TYPE[s.type as SubType].label} · {s.totalLessons} занятий
                    · {formatDate(s.purchasedAt)}
                  </p>
                </div>
                <span className="font-semibold text-green-600">
                  +{formatMoney(s.totalLessons * s.pricePerLesson)}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      {/* Расходы */}
      <section>
        <SectionTitle
          action={
            <Disclosure label="Расход">
              <Card className="p-4">
                <form action={addExpense} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Название">
                      <Input name="title" placeholder="Аренда зала" required />
                    </Field>
                    <Field label="Сумма, ₽">
                      <Input
                        name="amount"
                        type="number"
                        min={1}
                        placeholder="25000"
                        required
                      />
                    </Field>
                    <Field label="Категория">
                      <Input name="category" placeholder="аренда" />
                    </Field>
                    <Field label="Дата">
                      <Input
                        name="date"
                        type="date"
                        defaultValue={now.toISOString().slice(0, 10)}
                      />
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <SubmitButton size="sm">Добавить расход</SubmitButton>
                  </div>
                </form>
              </Card>
            </Disclosure>
          }
        >
          Расходы за месяц
        </SectionTitle>
        {expenses.length === 0 ? (
          <Card className="p-5 text-sm text-muted">
            Расходов пока нет.
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden p-0">
            {expenses.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{e.title}</p>
                  <p className="text-xs text-muted">
                    {e.category ? `${e.category} · ` : ""}
                    {formatDate(e.date)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-red-500">
                    −{formatMoney(e.amount)}
                  </span>
                  <form action={deleteExpense}>
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      aria-label="Удалить расход"
                      className="flex size-7 items-center justify-center rounded-full text-muted/40 hover:bg-red-50 hover:text-red-500"
                    >
                      <IconX className="size-4" />
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function Big({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className="px-4 py-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tracking-tight ${accent ? "text-brand-dark" : "text-ink"}`}
      >
        {value}
      </p>
    </Card>
  );
}
