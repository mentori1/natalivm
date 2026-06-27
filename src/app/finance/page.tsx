import Link from "next/link";
import { prisma } from "@/lib/db";
import { getDashboard, startOfMonth, endOfMonth } from "@/lib/queries";
import { addExpense, deleteExpense } from "@/lib/actions";
import {
  SUB_TYPE,
  SINGLE_VISIT_KIND,
  TRAINER_PROFIT_DEFAULT,
  EXPENSE_CATEGORIES,
  formatMoney,
  formatDate,
  type SubType,
} from "@/lib/domain";
import { Card, SectionTitle } from "@/components/ui";
import { Field, Input, SubmitButton } from "@/components/form";
import { Disclosure } from "@/components/Disclosure";
import { IconX, IconSparkle } from "@/components/icons";

export const dynamic = "force-dynamic";

const ruMonth = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});
const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const now = new Date();

  // выбранный месяц (по умолчанию текущий)
  let sel = new Date(now.getFullYear(), now.getMonth(), 1);
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split("-").map(Number);
    sel = new Date(y, mo - 1, 1);
  }
  const mStart = startOfMonth(sel);
  const mEnd = endOfMonth(sel);
  const prevDate = new Date(sel.getFullYear(), sel.getMonth() - 1, 1);
  const nextDate = new Date(sel.getFullYear(), sel.getMonth() + 1, 1);
  const canNext = monthKey(sel) < monthKey(now);

  const { finance } = await getDashboard();

  // категории для подсказок: готовые + уже использованные
  const usedCats = await prisma.expense.findMany({
    where: { category: { not: null } },
    select: { category: true },
    distinct: ["category"],
  });
  const categories = Array.from(
    new Set([
      ...EXPENSE_CATEGORIES,
      ...usedCats.map((c) => c.category).filter((c): c is string => !!c),
    ]),
  );

  // доходы и расходы за ВЫБРАННЫЙ месяц
  const subsMonth = await prisma.subscription.findMany({
    where: { purchasedAt: { gte: mStart, lte: mEnd } },
    include: { client: true },
  });
  const singleVisits = await prisma.singleVisit.findMany({
    where: { date: { gte: mStart, lte: mEnd } },
    include: { client: true },
  });
  const trainerClients = await prisma.client.findMany({
    where: { trainerPurchasedAt: { gte: mStart, lte: mEnd } },
  });
  const expenses = await prisma.expense.findMany({
    where: { date: { gte: mStart, lte: mEnd } },
    orderBy: { date: "desc" },
  });

  const income = [
    ...subsMonth.map((s) => ({
      key: `s${s.id}`,
      clientId: s.clientId,
      name: s.client.fullName,
      desc: `${SUB_TYPE[s.type as SubType].label} · ${s.totalLessons} занятий · ${formatDate(s.purchasedAt)}`,
      amount: s.totalLessons * s.pricePerLesson,
      date: s.purchasedAt,
    })),
    ...singleVisits.map((v) => ({
      key: `v${v.id}`,
      clientId: v.clientId,
      name: v.client.fullName,
      desc: `${SINGLE_VISIT_KIND[v.kind]?.label ?? v.kind} · ${formatDate(v.date)}`,
      amount: v.amount,
      date: v.date,
    })),
    ...trainerClients.map((c) => ({
      key: `t${c.id}`,
      clientId: c.id,
      name: c.fullName,
      desc: `Тренажёр · ${c.trainerPurchasedAt ? formatDate(c.trainerPurchasedAt) : ""}`,
      amount: c.trainerProfit ?? TRAINER_PROFIT_DEFAULT,
      date: c.trainerPurchasedAt ?? sel,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const revenue = income.reduce((s, i) => s + i.amount, 0);
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const profit = revenue - expensesTotal;

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Финансы
        </h1>
        {/* Переключатель месяцев */}
        <div className="mt-3 flex items-center gap-2">
          <Link
            href={`/finance?m=${monthKey(prevDate)}`}
            className="flex size-9 items-center justify-center rounded-xl text-ink hover:bg-black/5"
            aria-label="Прошлый месяц"
          >
            ‹
          </Link>
          <span className="min-w-[150px] text-center font-semibold text-ink capitalize">
            {ruMonth.format(sel)}
          </span>
          {canNext ? (
            <Link
              href={`/finance?m=${monthKey(nextDate)}`}
              className="flex size-9 items-center justify-center rounded-xl text-ink hover:bg-black/5"
              aria-label="Следующий месяц"
            >
              ›
            </Link>
          ) : (
            <span className="flex size-9 items-center justify-center rounded-xl text-muted/30">
              ›
            </span>
          )}
        </div>
      </header>

      {/* Итоги за выбранный месяц */}
      <div className="grid grid-cols-3 gap-3">
        <Big label="Выручка" value={formatMoney(revenue)} />
        <Big label="Расходы" value={formatMoney(expensesTotal)} />
        <Big label="Прибыль" value={formatMoney(profit)} accent />
      </div>

      {/* Доходы за месяц */}
      <section>
        <SectionTitle>Доходы за месяц</SectionTitle>
        {income.length === 0 ? (
          <Card className="p-5 text-sm text-muted">
            В этом месяце доходов не было.
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden p-0">
            {income.map((i) => (
              <Link
                key={i.key}
                href={`/clients/${i.clientId}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brand-tint"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{i.name}</p>
                  <p className="text-xs text-muted">{i.desc}</p>
                </div>
                <span className="shrink-0 font-semibold text-green-600">
                  +{formatMoney(i.amount)}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      {/* Расходы за месяц */}
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
                      <Input
                        name="category"
                        list="expense-cats"
                        placeholder="Выбери или впиши свою"
                      />
                      <datalist id="expense-cats">
                        {categories.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
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
          <Card className="p-5 text-sm text-muted">Расходов не было.</Card>
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

      {/* Текущее состояние (не зависит от выбранного месяца) */}
      <section>
        <SectionTitle>Сейчас</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <Big label="Средний чек" value={formatMoney(finance.avgCheck)} />
          <Big label="Активных" value={String(finance.activeClients)} />
          <Big label="Ждут продления" value={String(finance.expectedRenewals)} />
        </div>
        <Card className="mt-3 flex items-start gap-3 p-5">
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
        className={`mt-1 text-lg font-bold tracking-tight ${accent ? "text-brand-dark" : "text-ink"}`}
      >
        {value}
      </p>
    </Card>
  );
}
