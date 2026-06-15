"use client";

import { useState } from "react";
import { addSingleVisit } from "@/lib/actions";
import { SINGLE_VISIT_PRICE } from "@/lib/domain";
import { Field, Input, Select, SubmitButton } from "@/components/form";
import { Card } from "@/components/ui";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function priceFor(kind: string, type: string): number {
  return SINGLE_VISIT_PRICE[kind]?.[type] ?? 0;
}

export function SingleVisitForm({ clientId }: { clientId: number }) {
  const [kind, setKind] = useState("trial");
  const [type, setType] = useState("offline");
  const [amount, setAmount] = useState(priceFor("trial", "offline"));

  return (
    <Card className="p-4">
      <form action={addSingleVisit} className="space-y-4">
        <input type="hidden" name="clientId" value={clientId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Тип визита">
            <Select
              name="kind"
              value={kind}
              onChange={(e) => {
                const k = e.target.value;
                setKind(k);
                setAmount(priceFor(k, type));
              }}
            >
              <option value="trial">Пробное</option>
              <option value="single">Разовое</option>
            </Select>
          </Field>
          <Field label="Формат">
            <Select
              name="type"
              value={type}
              onChange={(e) => {
                const t = e.target.value;
                setType(t);
                setAmount(priceFor(kind, t));
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
