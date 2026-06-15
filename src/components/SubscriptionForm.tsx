"use client";

import { useState } from "react";
import { createSubscription } from "@/lib/actions";
import { Field, Input, Select, SubmitButton } from "@/components/form";
import { Card } from "@/components/ui";

// Цена за занятие по умолчанию в зависимости от типа
const DEFAULT_PRICE: Record<string, number> = { offline: 1500, online: 1200 };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SubscriptionForm({ clientId }: { clientId: number }) {
  const [type, setType] = useState("offline");
  const [price, setPrice] = useState(DEFAULT_PRICE.offline);

  return (
    <Card className="space-y-4 p-4">
      <form action={createSubscription} className="space-y-4">
        <input type="hidden" name="clientId" value={clientId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Тип">
            <Select
              name="type"
              value={type}
              onChange={(e) => {
                const t = e.target.value;
                setType(t);
                setPrice(DEFAULT_PRICE[t] ?? price);
              }}
            >
              <option value="offline">Офлайн</option>
              <option value="online">Онлайн</option>
            </Select>
          </Field>
          <Field label="Куплено занятий" hint="Минимум 4">
            <Input
              name="totalLessons"
              type="number"
              min={4}
              step={1}
              defaultValue={4}
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
