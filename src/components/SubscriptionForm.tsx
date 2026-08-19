"use client";

import { useState } from "react";
import { createSubscription } from "@/lib/actions";
import { Field, Input, Select, SubmitButton } from "@/components/form";
import { Card } from "@/components/ui";
import { IconCalendar, IconPlus, IconX } from "@/components/icons";
import type { PriceOption } from "@/lib/prices";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type ScheduleSlot = { id: number; value: string };

function emptySchedule(count: number): ScheduleSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    value: "",
  }));
}

export function SubscriptionForm({
  clientId,
  prices,
}: {
  clientId: number;
  prices: PriceOption[];
}) {
  const options = prices.filter((p) => p.kind === "subscription" && p.active);
  const initial = options[0] ?? null;
  const [priceItemId, setPriceItemId] = useState(initial?.id ?? 0);
  const [type, setType] = useState(initial?.type ?? "offline");
  const [format, setFormat] = useState(initial?.format ?? "group");
  const [tariffName, setTariffName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial?.price ?? 1500);
  const [lessons, setLessons] = useState(initial?.minLessons ?? 4);
  const [schedule, setSchedule] = useState<ScheduleSlot[]>(() =>
    emptySchedule(initial?.minLessons ?? 4),
  );

  function resizeSchedule(count: number) {
    setSchedule((current) => {
      if (current.length >= count) return current.slice(0, count);
      const nextId = Math.max(0, ...current.map((slot) => slot.id)) + 1;
      return [
        ...current,
        ...Array.from({ length: count - current.length }, (_, index) => ({
          id: nextId + index,
          value: "",
        })),
      ];
    });
  }

  function selectTariff(id: number) {
    const selected = options.find((p) => p.id === id);
    setPriceItemId(id);
    if (!id) {
      setTariffName("");
      return;
    }
    if (!selected) return;
    setType(selected.type);
    setFormat(selected.format);
    setTariffName(selected.name);
    setPrice(selected.price);
    const nextLessons = Math.max(lessons, selected.minLessons ?? 4);
    setLessons(nextLessons);
    if (selected.format === "individual") resizeSchedule(nextLessons);
  }

  return (
    <Card className="space-y-4 p-4">
      <form action={createSubscription} className="space-y-4">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="format" value={format} />
        <input type="hidden" name="tariffName" value={tariffName} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Тариф">
            <Select
              name="priceItemId"
              value={priceItemId}
              onChange={(e) => selectTariff(Number(e.target.value))}
            >
              <option value={0}>Вручную</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.type === "online" ? "Онлайн" : "Офлайн"} · {p.name} ·{" "}
                  {p.price.toLocaleString("ru-RU")} ₽
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Проведение">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPriceItemId(0);
                setTariffName("");
              }}
            >
              <option value="offline">Офлайн</option>
              <option value="online">Онлайн</option>
            </Select>
          </Field>
          <Field label="Формат занятия">
            <Select
              value={format}
              onChange={(e) => {
                const nextFormat = e.target.value;
                setFormat(nextFormat);
                setPriceItemId(0);
                setTariffName("");
                if (nextFormat === "individual") resizeSchedule(lessons);
              }}
            >
              <option value="group">Групповой</option>
              <option value="individual">Индивидуальный</option>
            </Select>
          </Field>
          <Field label="Куплено занятий" hint="Минимум 4">
            <Input
              name="totalLessons"
              type="number"
              min={4}
              step={1}
              value={lessons}
              onChange={(e) => {
                const nextLessons = Math.max(4, Number(e.target.value) || 4);
                setLessons(nextLessons);
                if (format === "individual") resizeSchedule(nextLessons);
              }}
              required
            />
          </Field>
          <Field label="Цена за занятие, ₽">
            <Input
              name="pricePerLesson"
              type="number"
              min={0}
              step={50}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
          </Field>
          <Field label="Дата покупки">
            <Input name="purchasedAt" type="date" defaultValue={today()} />
          </Field>
          <Field
            label="Срок действия, дней"
            hint="По умолчанию 45 (~1.5 месяца)"
          >
            <Input name="termDays" type="number" min={1} defaultValue={45} />
          </Field>
        </div>

        {format === "individual" && (
          <section className="border-t border-line pt-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <IconCalendar className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  Расписание индивидуальных занятий
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Выберите даты и время. На каждую заполненную дату занятие
                  появится в расписании автоматически.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {schedule.map((slot, index) => (
                <div key={slot.id} className="flex min-w-0 items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Field label={`Занятие ${index + 1}`}>
                      <Input
                        name="individualStartsAt"
                        type="datetime-local"
                        value={slot.value}
                        onChange={(event) =>
                          setSchedule((current) =>
                            current.map((item) =>
                              item.id === slot.id
                                ? { ...item, value: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSchedule((current) =>
                        current.filter((item) => item.id !== slot.id),
                      )
                    }
                    className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-red-50 hover:text-red-600"
                    aria-label={`Убрать занятие ${index + 1}`}
                    title="Убрать дату"
                  >
                    <IconX className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            {schedule.length < lessons && (
              <button
                type="button"
                onClick={() =>
                  setSchedule((current) => [
                    ...current,
                    {
                      id: Math.max(0, ...current.map((slot) => slot.id)) + 1,
                      value: "",
                    },
                  ])
                }
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand transition hover:bg-brand-soft"
              >
                <IconPlus className="size-4" />
                Добавить дату
              </button>
            )}
          </section>
        )}

        <div className="flex justify-end">
          <SubmitButton size="sm" pendingText="Создаю…">
            Добавить абонемент
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
