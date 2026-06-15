"use client";

import { useState } from "react";
import { addSingleVisit } from "@/lib/actions";
import { SINGLE_VISIT_KIND } from "@/lib/domain";
import { Field, Input, Select, SubmitButton } from "@/components/form";
import { Card } from "@/components/ui";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SingleVisitForm({ clientId }: { clientId: number }) {
  const [kind, setKind] = useState("trial");
  const [amount, setAmount] = useState(SINGLE_VISIT_KIND.trial.defaultAmount);

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
                setAmount(SINGLE_VISIT_KIND[k]?.defaultAmount ?? amount);
              }}
            >
              <option value="trial">Пробное</option>
              <option value="single">Разовое</option>
            </Select>
          </Field>
          <Field label="Формат">
            <Select name="type" defaultValue="offline">
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
