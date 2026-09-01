import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  freezeSubscription,
  unfreezeSubscription,
  deleteSubscription,
  setUsedLessons,
  scheduleIndividualFromCrm,
} from "@/lib/actions";
import {
  SUB_TYPE,
  SUB_STATUS,
  derivedSubStatus,
  remaining,
  formatDate,
  formatDateTime,
  formatMoney,
  subscriptionCashRevenue,
  subscriptionFaceValue,
  pluralLessons,
  type SubType,
  type SubStatus,
} from "@/lib/domain";
import { Avatar, Badge, Card, SectionTitle, EmptyState } from "@/components/ui";
import { Field, Input, SubmitButton } from "@/components/form";
import { Disclosure } from "@/components/Disclosure";
import { VisitCalendar } from "@/components/VisitCalendar";
import { ConfirmActionForm } from "@/components/ConfirmActionForm";
import {
  INDIVIDUAL_WEEKDAYS,
  parseIndividualAvailability,
} from "@/lib/individual-availability";
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
    sub.unlimited
      ? 100
      : sub.totalLessons > 0
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
  const availability = parseIndividualAvailability(sub.availabilitySlots);

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
              {sub.tariffName ? ` · ${sub.tariffName}` : ""}
            </span>
            <Badge tone={SUB_STATUS[st as SubStatus].tone}>
              {SUB_STATUS[st as SubStatus].label}
            </Badge>
          </div>
          <span className="text-sm font-semibold text-brand-dark">
            {sub.unlimited ? "безлимит" : `осталось ${left}`}
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Row
            label="Использовано"
            value={sub.unlimited ? pluralLessons(sub.usedLessons) : `${sub.usedLessons} из ${sub.totalLessons}`}
          />
          <Row label="Осталось" value={sub.unlimited ? "Без ограничений" : pluralLessons(left)} />
          <Row
            label="Стоимость"
            value={
              sub.pricePerLesson > 0
                ? formatMoney(subscriptionFaceValue(sub))
                : "бартер"
            }
          />
          {sub.creditApplied > 0 && (
            <>
              <Row label="Оплачено деньгами" value={formatMoney(subscriptionCashRevenue(sub))} />
              <Row label="Зачтено остатком" value={formatMoney(sub.creditApplied)} />
            </>
          )}
          <Row label="Куплен" value={formatDate(sub.purchasedAt)} />
          <Row label="Действует до" value={sub.unlimited ? "Без срока" : formatDate(sub.expiresAt)} />
        </div>
      </Card>

      {sub.format === "individual" && (
        <section>
          <SectionTitle>Планирование занятий</SectionTitle>
          <Card className="space-y-5 p-5">
            <div>
              <p className="text-sm font-semibold text-ink">
                Удобные дни и время клиента
              </p>
              {availability.length ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {availability.map((slot) => {
                    const day = INDIVIDUAL_WEEKDAYS.find(
                      (item) => item.value === slot.weekday,
                    );
                    return (
                      <div
                        key={slot.weekday}
                        className="flex items-center justify-between gap-3 rounded-xl bg-brand-tint px-3 py-2.5"
                      >
                        <span className="text-sm font-semibold text-ink">
                          {day?.label}
                        </span>
                        <span className="text-sm text-muted">
                          {slot.from}–{slot.to}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Клиент пока не указал пожелания в личном кабинете.
                </p>
              )}
              {sub.availabilityUpdatedAt && (
                <p className="mt-2 text-xs text-muted">
                  Обновлено {formatDateTime(sub.availabilityUpdatedAt)}
                </p>
              )}
            </div>

            <form
              action={scheduleIndividualFromCrm}
              className="border-t border-line pt-4"
            >
              <input type="hidden" name="subscriptionId" value={sub.id} />
              <input type="hidden" name="clientId" value={sub.clientId} />
              <div className="flex flex-wrap items-end gap-3">
                <Field
                  label="Конкретная дата и время"
                  hint="После сохранения занятие появится в расписании"
                >
                  <Input
                    name="startsAt"
                    type="datetime-local"
                    required
                    className="min-w-56"
                  />
                </Field>
                <SubmitButton size="md" pendingText="Ставлю…">
                  Поставить занятие
                </SubmitButton>
              </div>
              <p className="mt-2 text-xs text-muted">
                Клиент получит сообщение в Telegram, если кабинет уже привязан.
              </p>
            </form>
          </Card>
        </section>
      )}

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
                  max={sub.unlimited ? undefined : sub.totalLessons}
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
        <ConfirmActionForm
          action={deleteSubscription}
          message="Удалить этот абонемент?\n\nУдалятся его ручная история посещений и связи со списанными занятиями. Это действие нельзя отменить."
        >
          <input type="hidden" name="id" value={sub.id} />
          <SubmitButton
            variant="ghost"
            size="sm"
            className="text-red-500 hover:bg-red-50"
          >
            Удалить абонемент
          </SubmitButton>
        </ConfirmActionForm>
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
