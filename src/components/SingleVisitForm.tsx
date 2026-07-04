"use client";

import { useState } from "react";
import { addSingleVisit } from "@/lib/actions";
import { Field, Input, Select, SubmitButton } from "@/components/form";
import { Card } from "@/components/ui";
import type { PriceOption } from "@/lib/prices";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SingleVisitForm({
  clientId,
  prices,
}: {
  clientId: number;
  prices: PriceOption[];
}) {
  const options = prices.filter(
    (p) => (p.kind === "trial" || p.kind === "single") && p.active,
  );
  const initial = options[0] ?? null;
  const [priceItemId, setPriceItemId] = useState(initial?.id ?? 0);
  const [kind, setKind] = useState(initial?.kind ?? "trial");
  const [type, setType] = useState(initial?.type ?? "offline");
  const [tariffName, setTariffName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial?.price ?? 1000);

  function selectTariff(id: number) {
    const selected = options.find((p) => p.id === id);
    setPriceItemId(id);
    if (!id) {
      setTariffName("");
      return;
    }
    if (!selected) return;
    setKind(selected.kind);
    setType(selected.type);
    setTariffName(selected.name);
    setAmount(selected.price);
  }

  return (
    <Card className="p-4">
      <form action={addSingleVisit} className="space-y-4">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="type" value={type} />
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
                  {p.kind === "trial" ? "Пробное" : "Разовое"} ·{" "}
                  {p.type === "online" ? "Онлайн" : "Офлайн"} · {p.name} ·{" "}
                  {p.price.toLocaleString("ru-RU")} ₽
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Тип визита">
            <Select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPriceItemId(0);
                setTariffName("");
              }}
            >
              <option value="trial">Пробное</option>
              <option value="single">Разовое</option>
            </Select>
          </Field>
          <Field label="Формат">
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
          <Field label="Сумма, ₽">
            <Input
              name="amount"
              type="number"
              min={0}
              step={50}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </Field>
          <Field label="Дата">
            <Input name="date" type="date" defaultValue={today()} />
          </Field>
        </div>

        <div className="flex justify-end">
          <SubmitButton size="sm">Добавить визит</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
