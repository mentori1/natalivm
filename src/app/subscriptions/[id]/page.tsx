import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  freezeSubscription,
  unfreezeSubscription,
  deleteSubscription,
  setUsedLessons,
} from "@/lib/actions";
import {
  SUB_TYPE,
  SUB_STATUS,
  derivedSubStatus,
  remaining,
  formatDate,
  formatDateTime,
  formatMoney,
  pluralLessons,
  type SubType,
  type SubStatus,
} from "@/lib/domain";
import { Avatar, Badge, Card, SectionTitle, EmptyState } from "@/components/ui";
import { Field, Input, SubmitButton } from "@/components/form";
import { Disclosure } from "@/components/Disclosure";
import { VisitCalendar } from "@/components/VisitCalendar";
import {
  IconArrowLeft,
  IconSnow,
  IconCalendar,
  IconClock,
} from "@/components/icons";

export const dynamic = "force-dynamic";

function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function SubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sub = await prisma.subscription.findUnique({
    where: { id: Number(id) },
    include: {
      client: true,
      attendances: {
        where: { status: "present" },
        include: { lesson: true },
      },
      visits: { orderBy: { date: "desc" } },
    },
  });
  if (!sub) notFound();

  const st = derivedSubStatus(sub);
  const left = remaining(sub);
  const pct =
    sub.totalLessons > 0
      ? Math.round((sub.usedLessons / sub.totalLessons) * 100)
      : 0;

  // даты отмеченных в календаре посещений (для подсветки)
  const visitDates = sub.visits.map((v) => v.date.toISOString().slice(0, 10));

  // объединённая история: занятия из расписания + отметки в календаре
  const history = [
    ...sub.attendances.map((a) => ({
      key: `a${a.id}`,
      date: a.lesson.startsAt,
      label: a.lesson.title ?? "Занятие",
    })),
    ...sub.visits.map((v) => ({
      key: `v${v.id}`,
      date: v.date,
      label: "Отмечено в календаре",
    })),
  ].sort((x, y) => y.date.getTime() - x.date.getTime());

  const recorded = history.length;
  const untracked = Math.max(0, sub.usedLessons - recorded);

  return (
    <div className="space-y-7">
      <Link
        href={`/clients/${sub.clientId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <IconArrowLeft className="size-4" />К карточке клиента
      </Link>

      {/* Шапка абонемента */}
      <Card className="p-5">
        <Link
          href={`/clients/${sub.clientId}`}
          className="mb-4 flex items-center gap-3"
        >
          <Avatar name={sub.client.fullName} size={40} />
          <span className="font-semibold text-ink">{sub.client.fullName}</span>
        </Link>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-ink">
              {SUB_TYPE[sub.type as SubType].label}
            </span>
            <Badge tone={SUB_STATUS[st as SubStatus].tone}>
              {SUB_STATUS[st as SubStatus].label}
            </Badge>
          </div>
          <span className="text-sm font-semibold text-brand-dark">
            осталось {left}
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Row label="Использовано" value={`${sub.usedLessons} из ${sub.totalLessons}`} />
          <Row label="Осталось" value={pluralLessons(left)} />
          <Row
            label="Стоимость"
            value={
              sub.pricePerLesson > 0
                ? formatMoney(sub.totalLessons * sub.pricePerLesson)
                : "бартер"
            }
          />
          <Row label="Куплен" value={formatDate(sub.purchasedAt)} />
          <Row label="Действует до" value={formatDate(sub.expiresAt)} />
        </div>
      </Card>

      {/* Отметить посещения: календарь + ручная правка */}
      <section>
        <SectionTitle>Отметить посещения</SectionTitle>
        <Card className="space-y-5 p-5">
          <VisitCalendar subId={sub.id} visitDates={visitDates} />

          <div className="border-t border-line pt-4">
            <form action={setUsedLessons} className="flex items-end gap-3">
              <input type="hidden" name="id" value={sub.id} />
              <Field label="Или поставить число вручную">
                <Input
                  name="used"
                  type="number"
                  min={0}
                  max={sub.totalLessons}
                  defaultValue={sub.usedLessons}
                  className="w-28"
                />
              </Field>
              <SubmitButton variant="soft" size="md">
                Сохранить
              </SubmitButton>
            </form>
            <p className="mt-1.5 text-xs text-muted">
              Меньше числа отмеченных в календаре дней поставить нельзя.
            </p>
          </div>
        </Card>
      </section>

      {/* Заморозка */}
      <section>
        <SectionTitle>Заморозка</SectionTitle>
        {sub.frozen ? (
          <Card className="border-sky-200 bg-sky-50/60 p-5">
            <div className="flex items-start gap-3">
              <IconSnow className="mt-0.5 size-5 shrink-0 text-sky-500" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">
                  Заморожен{sub.frozenUntil ? ` до ${formatDate(sub.frozenUntil)}` : ""}
                </p>
                {sub.freezeReason && (
                  <p className="mt-0.5 text-sm text-muted">
                    Причина: {sub.freezeReason}
                  </p>
                )}
              </div>
            </div>
            <form action={unfreezeSubscription} className="mt-4">
              <input type="hidden" name="id" value={sub.id} />
              <SubmitButton variant="soft" size="sm">
                Разморозить
              </SubmitButton>
            </form>
          </Card>
        ) : (
          <Disclosure label="Заморозить" variant="soft">
            <Card className="p-4">
              <form action={freezeSubscription} className="space-y-4">
                <input type="hidden" name="id" value={sub.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Заморозить до" hint="До какого числа">
                    <Input
                      name="frozenUntil"
                      type="date"
                      defaultValue={plusDays(14)}
                    />
                  </Field>
                  <Field label="Причина">
                    <Input
                      name="freezeReason"
                      placeholder="Болезнь, отпуск, травма…"
                    />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <SubmitButton size="sm">
                    <IconSnow className="size-4" />
                    Заморозить
                  </SubmitButton>
                </div>
              </form>
            </Card>
          </Disclosure>
        )}
      </section>

      {/* История занятий */}
      <section>
        <SectionTitle>История занятий</SectionTitle>
        {recorded === 0 ? (
          <EmptyState
            icon={<IconCalendar className="size-8" />}
            title="Пока нет отмеченных дат"
            hint={
              untracked > 0
                ? `Ранее списано ${pluralLessons(untracked)} без записи дат. Отметь дни в календаре выше — даты появятся здесь.`
                : "Отметь дни в календаре выше — даты появятся здесь."
            }
          />
        ) : (
          <>
            <Card className="divide-y divide-line overflow-hidden p-0">
              {history.map((h) => (
                <div key={h.key} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
                    <IconClock className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink capitalize">
                      {formatDateTime(h.date)}
                    </p>
                    <p className="text-sm text-muted">{h.label}</p>
                  </div>
                </div>
              ))}
            </Card>
            {untracked > 0 && (
              <p className="mt-2 px-1 text-xs text-muted">
                + ещё {pluralLessons(untracked)} списано ранее без записи дат.
              </p>
            )}
          </>
        )}
      </section>

      {/* Удаление */}
      <div className="flex justify-center border-t border-line pt-6">
        <form action={deleteSubscription}>
          <input type="hidden" name="id" value={sub.id} />
          <SubmitButton
            variant="ghost"
            size="sm"
            className="text-red-500 hover:bg-red-50"
          >
            Удалить абонемент
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{value}</p>
    </div>
  );
}
