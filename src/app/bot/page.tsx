import Link from "next/link";
import { logout } from "@/lib/auth-actions";
import { updateBotContent, updateBotSettings } from "@/lib/actions";
import {
  BOT_CONTENT_DEFINITIONS,
  BOT_CONTENT_GROUPS,
  getBotContentValues,
} from "@/lib/bot-content";
import { DEFAULT_BOT_TEXT, getBotSettings } from "@/lib/bot-settings";
import { prisma } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/domain";
import { Field, Input, SubmitButton, Textarea } from "@/components/form";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS = {
  awaiting_receipt: { label: "Ждёт чек", tone: "amber" as const },
  review: { label: "На проверке", tone: "violet" as const },
  confirmed: { label: "Подтверждена", tone: "green" as const },
  rejected: { label: "Отклонена", tone: "red" as const },
  expired: { label: "Истекла", tone: "slate" as const },
  cancelled: { label: "Отменена", tone: "slate" as const },
};

export default async function BotPage() {
  const settings = await getBotSettings();
  const contentValues = await getBotContentValues();
  const bookings = await prisma.botBooking.findMany({
    include: { lesson: true, client: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <div className="space-y-7">
      <PageHeader
        title="Telegram-бот"
        subtitle="Запись, проверка оплаты и напоминания"
        action={
          <Badge tone={settings.enabled ? "green" : "slate"}>
            {settings.enabled ? "Включён" : "Выключен"}
          </Badge>
        }
      />

      <form action={updateBotSettings} className="space-y-6">
        <section>
          <SectionTitle>Запуск</SectionTitle>
          <Card className="space-y-4 p-5">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-semibold text-ink">
                  Клиентский режим
                </span>
                <span className="block text-sm text-muted">
                  {settings.enabled
                    ? "Бот принимает новые записи"
                    : "Пока выключен, бот не принимает новые записи"}
                </span>
              </span>
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={settings.enabled}
                className="size-5 accent-[var(--color-brand)]"
              />
            </label>
            <Field
              label="Сколько минут держать место"
              hint="Если чек не отправлен вовремя, бронь снимается автоматически"
            >
              <Input
                name="bookingHoldMinutes"
                type="number"
                min={5}
                max={180}
                defaultValue={settings.bookingHoldMinutes}
              />
            </Field>
          </Card>
        </section>

        <section>
          <SectionTitle>Тексты</SectionTitle>
          <Card className="grid gap-4 p-5">
            <Field label="Приветствие">
              <Textarea
                name="welcomeText"
                defaultValue={settings.welcomeText ?? ""}
                rows={5}
              />
            </Field>
            <Field
              label="О тренажёре"
              hint={
                settings.trainerVideoFileId
                  ? "Видео загружено"
                  : "Для видео отправьте его боту с подписью /тренажер"
              }
            >
              <Textarea
                name="trainerText"
                defaultValue={settings.trainerText ?? DEFAULT_BOT_TEXT.trainer}
                rows={5}
              />
            </Field>
            <input
              type="hidden"
              name="classesText"
              value={settings.classesText ?? ""}
            />
            <input
              type="hidden"
              name="teacherText"
              value={settings.teacherText ?? ""}
            />
          </Card>
        </section>

        <section>
          <SectionTitle>Канал</SectionTitle>
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field
              label="Канал для проверки"
              hint="@username публичного канала или числовой ID"
            >
              <Input
                name="requiredChannelChatId"
                defaultValue={settings.requiredChannelChatId ?? ""}
                placeholder="@vumexclusive"
              />
            </Field>
            <Field label="Ссылка на канал">
              <Input
                name="requiredChannelUrl"
                type="url"
                defaultValue={settings.requiredChannelUrl ?? ""}
                placeholder="https://t.me/..."
              />
            </Field>
            <p className="text-sm text-muted sm:col-span-2">
              Подписка не ограничивает доступ к боту и кабинету. Канал рекомендуется
              клиенту после подтверждения оплаты, а бот сообщает администратору о
              подписках и отписках.
            </p>
          </Card>
        </section>

        <section>
          <SectionTitle>Оплата и адреса</SectionTitle>
          <Card className="grid gap-4 p-5">
            <Field label="Реквизиты для оплаты">
              <Textarea
                name="paymentDetails"
                defaultValue={settings.paymentDetails ?? ""}
                placeholder="Банк, номер телефона или карты, получатель"
                rows={4}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Общий адрес офлайн">
                <Input
                  name="offlineAddress"
                  defaultValue={settings.offlineAddress ?? ""}
                  placeholder="Москва, ..."
                />
              </Field>
              <Field label="Общая ссылка на онлайн">
                <Input
                  name="onlineMeetingUrl"
                  type="url"
                  defaultValue={settings.onlineMeetingUrl ?? ""}
                  placeholder="https://..."
                />
              </Field>
            </div>
          </Card>
        </section>

        <div className="flex justify-end">
          <SubmitButton pendingText="Сохраняю настройки…">
            Сохранить настройки
          </SubmitButton>
        </div>
      </form>

      <section>
        <SectionTitle>Редактор сообщений и кнопок</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          Меняйте подписи кнопок и тексты экранов. Переменные в фигурных скобках
          удалять не нужно: бот подставляет в них дату, сумму и другие данные.
        </p>
        <form action={updateBotContent} className="space-y-4">
          {BOT_CONTENT_GROUPS.map((group, groupIndex) => {
            const definitions = BOT_CONTENT_DEFINITIONS.filter(
              (definition) => definition.group === group.key,
            );
            return (
              <details
                key={group.key}
                open={groupIndex === 0}
                className="rounded-lg border border-line bg-surface"
              >
                <summary className="cursor-pointer px-5 py-4 font-semibold text-ink">
                  {group.label}
                </summary>
                <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2">
                  {definitions.map((definition) => (
                    <Field
                      key={definition.key}
                      label={definition.label}
                      hint={definition.hint}
                    >
                      {definition.kind === "button" ? (
                        <Input
                          name={definition.key}
                          defaultValue={
                            contentValues.get(definition.key) ??
                            definition.defaultValue
                          }
                        />
                      ) : (
                        <Textarea
                          name={definition.key}
                          defaultValue={
                            contentValues.get(definition.key) ??
                            definition.defaultValue
                          }
                          rows={Math.min(
                            8,
                            Math.max(
                              3,
                              definition.defaultValue.split("\n").length + 1,
                            ),
                          )}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </details>
            );
          })}
          <div className="flex justify-end">
            <SubmitButton pendingText="Сохраняю тексты…">
              Сохранить сообщения и кнопки
            </SubmitButton>
          </div>
        </form>
      </section>

      <section>
        <SectionTitle>Последние заявки</SectionTitle>
        {bookings.length === 0 ? (
          <Card className="p-5 text-sm text-muted">
            Заявок из бота пока нет.
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden p-0">
            {bookings.map((booking) => {
              const meta =
                STATUS[booking.status as keyof typeof STATUS] ?? STATUS.cancelled;
              return (
                <div
                  key={booking.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    {booking.clientId ? (
                      <Link
                        href={`/clients/${booking.clientId}`}
                        className="font-semibold text-ink hover:text-brand"
                      >
                        {booking.client?.fullName ||
                          booking.displayName ||
                          "Клиент"}
                      </Link>
                    ) : (
                      <p className="font-semibold text-ink">
                        {booking.displayName || "Клиент"}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDateTime(booking.lesson.startsAt)} ·{" "}
                      {booking.lesson.type === "online" ? "онлайн" : "офлайн"} ·{" "}
                      {booking.tariffName || "без тарифа"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="text-sm font-semibold text-ink">
                      {formatMoney(booking.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <form action={logout} className="md:hidden">
        <SubmitButton variant="ghost" className="w-full text-red-500">
          Выйти из CRM
        </SubmitButton>
      </form>
    </div>
  );
}
