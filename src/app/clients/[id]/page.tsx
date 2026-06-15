import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { clientStats } from "@/lib/queries";
import {
  addGoal,
  addNote,
  deleteGoal,
  deleteNote,
  toggleTrainer,
  deleteSingleVisit,
} from "@/lib/actions";
import {
  CLIENT_STATUS,
  SUB_STATUS,
  SUB_TYPE,
  SINGLE_VISIT_KIND,
  TRAINER_PROFIT,
  derivedSubStatus,
  effectiveClientStatus,
  remaining,
  formatDate,
  formatMoney,
  pluralLessons,
  type SubStatus,
  type SubType,
} from "@/lib/domain";
import { Avatar, Badge, Card, SectionTitle, buttonClass } from "@/components/ui";
import { Field, Input, Textarea, SubmitButton } from "@/components/form";
import { Disclosure } from "@/components/Disclosure";
import { SubscriptionForm } from "@/components/SubscriptionForm";
import { SingleVisitForm } from "@/components/SingleVisitForm";
import { DeleteClientButton } from "@/components/DeleteClientButton";
import {
  IconArrowLeft,
  IconPhone,
  IconSend,
  IconHeart,
  IconShield,
  IconX,
  IconPlus,
  IconChevronRight,
} from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function ClientCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clientId = Number(id);
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      subscriptions: { orderBy: { createdAt: "desc" } },
      singleVisits: { orderBy: { date: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
      goals: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!client) notFound();

  const meta = CLIENT_STATUS[effectiveClientStatus(client.status, client.subscriptions)];
  const { visits, spent } = clientStats(client.subscriptions);
  const singleSpent = client.singleVisits.reduce((s, v) => s + v.amount, 0);

  return (
    <div className="space-y-7">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <IconArrowLeft className="size-4" />К клиентам
      </Link>

      {/* Шапка */}
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <Avatar name={client.fullName} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {client.fullName}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {meta && <Badge tone={meta.tone}>{meta.label}</Badge>}
              {client.source && (
                <span className="text-xs text-muted">
                  {client.source}
                  {client.sourceDetail ? ` · ${client.sourceDetail}` : ""}
                </span>
              )}
            </div>
          </div>
          <Link
            href={`/clients/${client.id}/edit`}
            className={buttonClass("ghost", "sm")}
          >
            Изменить
          </Link>
        </div>

        {/* Контакты */}
        {(client.phone || client.telegram || client.instagram) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {client.phone && (
              <a
                href={`tel:${client.phone}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1.5 text-sm text-ink hover:bg-brand-soft"
              >
                <IconPhone className="size-4 text-brand" />
                {client.phone}
              </a>
            )}
            {client.telegram && (
              <a
                href={`https://t.me/${client.telegram.replace(/^@/, "")}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1.5 text-sm text-ink hover:bg-brand-soft"
              >
                <IconSend className="size-4 text-brand" />
                {client.telegram}
              </a>
            )}
            {client.instagram && (
              <a
                href={`https://instagram.com/${client.instagram.replace(/^@/, "")}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1.5 text-sm text-ink hover:bg-brand-soft"
              >
                <IconHeart className="size-4 text-brand" />
                {client.instagram}
              </a>
            )}
          </div>
        )}
      </Card>

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Посещений всего"
          value={String(visits + client.singleVisits.length)}
        />
        <Stat label="Сумма покупок" value={formatMoney(spent + singleSpent)} />
        <Stat label="Последнее занятие" value={formatDate(client.lastVisitAt)} />
        <Stat label="Первый контакт" value={formatDate(client.firstContact)} />
      </div>

      {/* Абонементы */}
      <section>
        <SectionTitle
          action={
            <Disclosure label="Абонемент">
              <SubscriptionForm clientId={client.id} />
            </Disclosure>
          }
        >
          Абонементы
        </SectionTitle>
        {client.subscriptions.length === 0 ? (
          <Card className="p-5 text-sm text-muted">
            Пока нет абонементов. Добавьте первый — кнопкой выше.
          </Card>
        ) : (
          <div className="space-y-3">
            {client.subscriptions.map((s) => {
              const st = derivedSubStatus(s);
              const left = remaining(s);
              const pct =
                s.totalLessons > 0
                  ? Math.round((s.usedLessons / s.totalLessons) * 100)
                  : 0;
              return (
                <Card key={s.id} className="p-4">
                  <Link
                    href={`/subscriptions/${s.id}`}
                    className="-m-1 block rounded-xl p-1 transition-colors hover:bg-brand-tint"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">
                          {SUB_TYPE[s.type as SubType].label}
                        </span>
                        <Badge tone={SUB_STATUS[st as SubStatus].tone}>
                          {SUB_STATUS[st as SubStatus].label}
                        </Badge>
                      </div>
                      <span className="flex items-center gap-0.5 text-sm font-semibold text-brand-dark">
                        осталось {left}
                        <IconChevronRight className="size-4 text-muted/50" />
                      </span>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Использовано {s.usedLessons} из {s.totalLessons} ·{" "}
                      {s.pricePerLesson > 0
                        ? formatMoney(s.totalLessons * s.pricePerLesson)
                        : "бартер"}{" "}
                      · до {formatDate(s.expiresAt)}
                    </p>
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Разовые и пробные посещения */}
      <section>
        <SectionTitle
          action={
            <Disclosure label="Визит">
              <SingleVisitForm clientId={client.id} />
            </Disclosure>
          }
        >
          Разовые и пробные
        </SectionTitle>
        {client.singleVisits.length === 0 ? (
          <Card className="p-5 text-sm text-muted">
            Разовых и пробных визитов пока нет. Добавь — кнопкой выше.
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden p-0">
            {client.singleVisits.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {SINGLE_VISIT_KIND[v.kind]?.label ?? v.kind} ·{" "}
                    {SUB_TYPE[v.type as SubType].short}
                  </p>
                  <p className="text-sm text-muted">
                    {formatDate(v.date)} · {formatMoney(v.amount)}
                  </p>
                </div>
                <form action={deleteSingleVisit}>
                  <input type="hidden" name="id" value={v.id} />
                  <input type="hidden" name="clientId" value={client.id} />
                  <button
                    type="submit"
                    aria-label="Удалить визит"
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted/50 hover:bg-red-50 hover:text-red-500"
                  >
                    <IconX className="size-4" />
                  </button>
                </form>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Тренажёр */}
      <section>
        <SectionTitle>Тренажёр</SectionTitle>
        <Card
          className={`flex items-center justify-between gap-3 p-5 ${
            client.hasTrainer ? "border-green-200 bg-green-50/50" : ""
          }`}
        >
          <div className="min-w-0">
            <p className="font-semibold text-ink">
              {client.hasTrainer ? "Тренажёр куплен" : "Тренажёр не куплен"}
            </p>
            {client.hasTrainer && client.trainerPurchasedAt && (
              <p className="mt-0.5 text-sm text-muted">
                {formatDate(client.trainerPurchasedAt)} · прибыль{" "}
                {formatMoney(TRAINER_PROFIT)}
              </p>
            )}
          </div>
          <form action={toggleTrainer}>
            <input type="hidden" name="clientId" value={client.id} />
            <SubmitButton
              variant={client.hasTrainer ? "ghost" : "primary"}
              size="sm"
            >
              {client.hasTrainer ? "Отменить" : "Отметить покупку"}
            </SubmitButton>
          </form>
        </Card>
      </section>

      {/* Запрос клиента */}
      {client.request && (
        <section>
          <SectionTitle>Запрос клиента</SectionTitle>
          <Card className="p-5 text-ink">{client.request}</Card>
        </section>
      )}

      {/* Цели */}
      <section>
        <SectionTitle>Цели</SectionTitle>
        <Card className="space-y-3 p-5">
          {client.goals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {client.goals.map((g) => (
                <span
                  key={g.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 py-1 pr-1.5 pl-3 text-sm text-violet-700"
                >
                  {g.text}
                  <form action={deleteGoal}>
                    <input type="hidden" name="id" value={g.id} />
                    <input type="hidden" name="clientId" value={client.id} />
                    <button
                      type="submit"
                      className="flex size-5 items-center justify-center rounded-full text-violet-400 hover:bg-violet-100 hover:text-violet-700"
                      aria-label="Удалить цель"
                    >
                      <IconX className="size-3.5" />
                    </button>
                  </form>
                </span>
              ))}
            </div>
          )}
          <form action={addGoal} className="flex gap-2">
            <input type="hidden" name="clientId" value={client.id} />
            <Input name="text" placeholder="Добавить цель…" required />
            <SubmitButton variant="soft" size="md">
              <IconPlus className="size-4" />
            </SubmitButton>
          </form>
        </Card>
      </section>

      {/* Рекомендации для преподавателя */}
      {client.recommendations && (
        <section>
          <SectionTitle>Рекомендации для преподавателя</SectionTitle>
          <Card className="flex items-start gap-3 border-amber-200 bg-amber-50/60 p-5">
            <IconShield className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <p className="text-ink">{client.recommendations}</p>
          </Card>
        </section>
      )}

      {/* Заметки */}
      <section>
        <SectionTitle>Заметки</SectionTitle>
        <Card className="space-y-4 p-5">
          <form action={addNote} className="space-y-3">
            <input type="hidden" name="clientId" value={client.id} />
            <Field>
              <Textarea
                name="body"
                placeholder="Например: после занятия стала свободнее в паре, меньше зажима…"
                required
              />
            </Field>
            <div className="flex justify-end">
              <SubmitButton size="sm">Добавить заметку</SubmitButton>
            </div>
          </form>

          {client.notes.length > 0 && (
            <ul className="space-y-3 border-t border-line pt-4">
              {client.notes.map((n) => (
                <li key={n.id} className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">{n.body}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDate(n.createdAt)}
                    </p>
                  </div>
                  <form action={deleteNote}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="clientId" value={client.id} />
                    <button
                      type="submit"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted/50 hover:bg-red-50 hover:text-red-500"
                      aria-label="Удалить заметку"
                    >
                      <IconX className="size-4" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Удаление клиента */}
      <div className="flex justify-center border-t border-line pt-6">
        <DeleteClientButton id={client.id} name={client.fullName} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-base font-bold tracking-tight text-ink">{value}</p>
    </Card>
  );
}
