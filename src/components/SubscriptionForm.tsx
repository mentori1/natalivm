"use client";

import { useState } from "react";
import { createSubscription } from "@/lib/actions";
import { Field, Input, Select, SubmitButton } from "@/components/form";
import { Card } from "@/components/ui";
import type { PriceOption } from "@/lib/prices";

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
    setLessons((current) => Math.max(current, selected.minLessons ?? 4));
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
                setFormat(e.target.value);
                setPriceItemId(0);
                setTariffName("");
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
              onChange={(e) => setLessons(Number(e.target.value))}
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

        <div className="flex justify-end">
          <SubmitButton size="sm">Добавить абонемент</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
