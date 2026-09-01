import Link from "next/link";
import { prisma } from "@/lib/db";
import { getDashboard, startOfMonth, endOfMonth } from "@/lib/queries";
import { addExpense, deleteExpense } from "@/lib/actions";
import { reviewPaymentInCrm } from "@/lib/payment-actions";
import {
  SUB_TYPE,
  SINGLE_VISIT_KIND,
  TRAINER_PROFIT_DEFAULT,
  EXPENSE_CATEGORIES,
  formatMoney,
  formatDate,
  formatDateTime,
  subscriptionCashRevenue,
  type SubType,
} from "@/lib/domain";
import { buttonClass, Card, SectionTitle } from "@/components/ui";
import { Field, Input, SubmitButton } from "@/components/form";
import { Disclosure } from "@/components/Disclosure";
import { IconChevronRight, IconX, IconSparkle } from "@/components/icons";
import { ConfirmActionForm } from "@/components/ConfirmActionForm";

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
  const botPayments = await prisma.botBooking.findMany({
    where: {
      status: { in: ["confirmed", "credit"] },
      amount: { gt: 0 },
      reviewedAt: { gte: mStart, lte: mEnd },
    },
    include: { client: true, lesson: true },
  });
  const expenses = await prisma.expense.findMany({
    where: { date: { gte: mStart, lte: mEnd } },
    orderBy: { date: "desc" },
  });

  const [reviewBookings, reviewSubscriptions, reviewTrainers] = await Promise.all([
    prisma.botBooking.findMany({
      where: { status: "review" },
      include: { client: true, lesson: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.subscriptionOrder.findMany({
      where: { status: "review" },
      include: { client: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.trainerOrder.findMany({
      where: { status: "review" },
      include: { client: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const reviewPayments = [
    ...reviewBookings.map((item) => ({
      kind: "booking" as const,
      id: item.id,
      clientId: item.clientId,
      name: item.client?.fullName || item.displayName || "Клиент из Telegram",
      title: item.tariffName || "Занятие",
      detail: `${formatDateTime(item.lesson.startsAt)} · ${item.lesson.type === "online" ? "онлайн" : "офлайн"}`,
      amount: item.amount,
      updatedAt: item.updatedAt,
      hasReceipt: Boolean(item.receiptFileId),
    })),
    ...reviewSubscriptions.map((item) => ({
      kind: "subscription" as const,
      id: item.id,
      clientId: item.clientId,
      name: item.client.fullName,
      title: item.tariffName,
      detail: `${item.totalLessons} занятий · ${item.type === "online" ? "онлайн" : "офлайн"}`,
      amount: item.amount,
      updatedAt: item.updatedAt,
      hasReceipt: Boolean(item.receiptFileId),
    })),
    ...reviewTrainers.map((item) => ({
      kind: "trainer" as const,
      id: item.id,
      clientId: item.clientId,
      name: item.client.fullName,
      title: "Тренажёр «Волна»",
      detail: "Покупка тренажёра",
      amount: item.amount,
      updatedAt: item.updatedAt,
      hasReceipt: Boolean(item.receiptFileId),
    })),
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const income = [
    ...subsMonth.map((s) => ({
      key: `s${s.id}`,
      clientId: s.clientId,
      name: s.client.fullName,
      desc: `${SUB_TYPE[s.type as SubType].label}${s.tariffName ? ` · ${s.tariffName}` : ""} · ${s.totalLessons} занятий${s.creditApplied > 0 ? ` · зачтено ${formatMoney(s.creditApplied)}` : ""} · ${formatDate(s.purchasedAt)}`,
      amount: subscriptionCashRevenue(s),
      date: s.purchasedAt,
    })),
    ...singleVisits.map((v) => ({
      key: `v${v.id}`,
      clientId: v.clientId,
      name: v.client.fullName,
      desc: `${SINGLE_VISIT_KIND[v.kind]?.label ?? v.kind}${v.tariffName ? ` · ${v.tariffName}` : ""} · ${formatDate(v.date)}`,
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
    ...botPayments.map((booking) => ({
      key: `b${booking.id}`,
      clientId: booking.clientId,
      name: booking.client?.fullName || booking.displayName || "Клиент из Telegram",
      desc: `Оплата через бот · ${booking.tariffName || "занятие"} · ${formatDate(
        booking.reviewedAt,
      )}`,
      amount: booking.amount,
      date: booking.reviewedAt ?? booking.createdAt,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
  const visibleIncome = income.slice(0, 7);
  const hiddenIncome = income.slice(7);

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
            className="flex size-9 items-center justify-center rounded-xl text-ink hover:bg-brand-soft/70"
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
              className="flex size-9 items-center justify-center rounded-xl text-ink hover:bg-brand-soft/70"
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

      <section>
        <SectionTitle
          action={
            reviewPayments.length > 0 ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {reviewPayments.length} ждут
              </span>
            ) : undefined
          }
        >
          Платежи на проверке
        </SectionTitle>
        {reviewPayments.length === 0 ? (
          <Card className="p-5 text-sm text-muted">
            Новых чеков на проверке нет.
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden p-0">
            {reviewPayments.map((payment) => (
              <div key={`${payment.kind}-${payment.id}`} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={payment.clientId ? `/clients/${payment.clientId}` : "/bot"}
                      className="font-semibold text-ink hover:text-brand-dark"
                    >
                      {payment.name}
                    </Link>
                    <p className="mt-1 text-sm text-ink">{payment.title}</p>
                    <p className="text-xs text-muted">{payment.detail}</p>
                  </div>
                  <span className="shrink-0 font-bold text-ink">
                    {formatMoney(payment.amount)}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {payment.hasReceipt ? (
                    <a
                      href={`/api/payments/receipt?kind=${payment.kind}&id=${payment.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClass("soft", "sm")}
                    >
                      Открыть чек
                    </a>
                  ) : (
                    <span className="rounded-full bg-brand-tint px-3 py-2 text-xs font-semibold text-muted">
                      Чек не приложен
                    </span>
                  )}
                  <ConfirmActionForm
                    action={reviewPaymentInCrm}
                    message={`Подтвердить платёж ${payment.name} на ${formatMoney(payment.amount)}?`}
                  >
                    <input type="hidden" name="paymentKind" value={payment.kind} />
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <SubmitButton size="sm" pendingText="Подтверждаю…">
                      Подтвердить
                    </SubmitButton>
                  </ConfirmActionForm>
                  <ConfirmActionForm
                    action={reviewPaymentInCrm}
                    message={`Отклонить чек ${payment.name}? Клиент сможет загрузить новый.`}
                  >
                    <input type="hidden" name="paymentKind" value={payment.kind} />
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <SubmitButton
                      variant="ghost"
                      size="sm"
                      pendingText="Отклоняю…"
                      className="text-red-600 hover:bg-red-50"
                    >
                      Отклонить
                    </SubmitButton>
                  </ConfirmActionForm>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Доходы за месяц */}
      <section>
        <SectionTitle>Доходы за месяц</SectionTitle>
        {income.length === 0 ? (
          <Card className="p-5 text-sm text-muted">
            В этом месяце доходов не было.
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden p-0">
            {visibleIncome.map((item) => (
              <IncomeRow key={item.key} item={item} />
            ))}
            {hiddenIncome.length > 0 && (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-tint [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">
                    Посмотреть все · {income.length}
                  </span>
                  <span className="hidden group-open:inline">Свернуть</span>
                  <IconChevronRight className="size-4 transition-transform group-open:rotate-90" />
                </summary>
                <div className="divide-y divide-line border-t border-line">
                  {hiddenIncome.map((item) => (
                    <IncomeRow key={item.key} item={item} />
                  ))}
                </div>
              </details>
            )}
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
                  <ConfirmActionForm
                    action={deleteExpense}
                    message={`Удалить расход «${e.title}» на ${formatMoney(e.amount)}?\n\nЭто действие нельзя отменить.`}
                  >
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      aria-label="Удалить расход"
                      className="flex size-7 items-center justify-center rounded-full text-muted/40 hover:bg-red-50 hover:text-red-500"
                    >
                      <IconX className="size-4" />
                    </button>
                  </ConfirmActionForm>
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

function IncomeRow({
  item,
}: {
  item: {
    clientId: number | null;
    name: string;
    desc: string;
    amount: number;
  };
}) {
  return (
    <Link
      href={item.clientId ? `/clients/${item.clientId}` : "/bot"}
      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brand-tint"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{item.name}</p>
        <p className="text-xs text-muted">{item.desc}</p>
      </div>
      <span className="shrink-0 font-semibold text-green-600">
        +{formatMoney(item.amount)}
      </span>
    </Link>
  );
}
