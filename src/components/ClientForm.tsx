import Link from "next/link";
import { Field, Input, Select, Textarea, SubmitButton } from "@/components/form";
import { Card, buttonClass } from "@/components/ui";
import { IconAlert } from "@/components/icons";
import { cn } from "@/lib/cn";
import {
  CLIENT_STATUS,
  CLIENT_SOURCES,
  type ClientStatus,
  type ClientFormState,
} from "@/lib/domain";

type ClientData = {
  id: number;
  fullName: string;
  phone: string | null;
  telegram: string | null;
  instagram: string | null;
  source: string | null;
  sourceDetail: string | null;
  status: string;
  request: string | null;
  recommendations: string | null;
  birthDate: Date | null;
};

const STATUS_OPTIONS = Object.entries(CLIENT_STATUS) as [
  ClientStatus,
  { label: string },
][];

function dateValue(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function ClientForm({
  action,
  client,
  submitText,
  state,
}: {
  action: (fd: FormData) => void | Promise<void>;
  client?: ClientData;
  submitText: string;
  state?: ClientFormState;
}) {
  // Приоритет: только что введённые значения (если вернулось предупреждение) →
  // значения клиента (при редактировании) → пусто.
  const v = state?.values;
  const duplicates = state?.duplicates ?? [];

  return (
    <form action={action} className="space-y-5">
      {client && <input type="hidden" name="id" value={client.id} />}

      <Card className="space-y-4 p-5">
        <Field label="Имя и фамилия">
          <Input
            name="fullName"
            required
            defaultValue={v?.fullName ?? client?.fullName ?? ""}
            placeholder="Анна Кузнецова"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Статус">
            <Select name="status" defaultValue={v?.status ?? client?.status ?? "lead"}>
              {STATUS_OPTIONS.map(([key, v]) => (
                <option key={key} value={key}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Источник">
            <Select name="source" defaultValue={v?.source ?? client?.source ?? ""}>
              <option value="">—</option>
              {CLIENT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="От кого / детали источника"
          hint="Имя блогера, канал, рекламная кампания — чтобы потом считать, кто привёл клиентов"
        >
          <Input
            name="sourceDetail"
            defaultValue={v?.sourceDetail ?? client?.sourceDetail ?? ""}
            placeholder="Например: блогер @anna_fit"
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Телефон">
            <Input
              name="phone"
              type="tel"
              defaultValue={v?.phone ?? client?.phone ?? ""}
              placeholder="+7 ___ ___-__-__"
            />
          </Field>
          <Field label="Telegram">
            <Input
              name="telegram"
              defaultValue={v?.telegram ?? client?.telegram ?? ""}
              placeholder="@username"
            />
          </Field>
          <Field label="Instagram">
            <Input
              name="instagram"
              defaultValue={v?.instagram ?? client?.instagram ?? ""}
              placeholder="username"
            />
          </Field>
          <Field label="Дата рождения">
            <Input
              name="birthDate"
              type="date"
              defaultValue={v?.birthDate ?? dateValue(client?.birthDate ?? null)}
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <Field
          label="Запрос клиента"
          hint="Зачем пришёл — пригодится для персонализации и допродаж."
        >
          <Textarea
            name="request"
            defaultValue={v?.request ?? client?.request ?? ""}
            placeholder="Например: хочет увереннее двигаться, раскрыть женственность…"
          />
        </Field>
        <Field
          label="Рекомендации для преподавателя"
          hint="Что учитывать на занятии (не диагнозы). Напр.: беречь поясницу, не давать сильную нагрузку."
        >
          <Textarea
            name="recommendations"
            defaultValue={v?.recommendations ?? client?.recommendations ?? ""}
            placeholder="Например: избегать резких прогибов, мягкая нагрузка на колени…"
          />
        </Field>
      </Card>

      {duplicates.length > 0 && (
        <Card className="space-y-3 border border-amber-300 bg-amber-50 p-5">
          <div className="flex items-center gap-2 text-amber-800">
            <IconAlert className="size-5 shrink-0" />
            <p className="font-semibold">
              Возможно, эта клиентка уже есть
            </p>
          </div>
          <p className="text-sm text-amber-900/80">
            Контакты совпадают с теми, кто уже заведён. Проверьте — это тот же
            человек?
          </p>
          <div className="space-y-2">
            {duplicates.map((d) => (
              <Link
                key={d.id}
                href={`/clients/${d.id}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-amber-200 transition hover:ring-amber-400"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{d.fullName}</p>
                  <p className="truncate text-xs text-muted">
                    Совпадает: {d.reasons.join(", ")}
                    {[d.phone, d.telegram].filter(Boolean).length > 0
                      ? ` · ${[d.phone, d.telegram].filter(Boolean).join(" · ")}`
                      : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-brand-dark">
                  Открыть карточку →
                </span>
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              name="force"
              value="1"
              className={cn(
                buttonClass("ghost", "sm"),
                "bg-white ring-1 ring-amber-400 text-amber-900 hover:bg-amber-100",
              )}
            >
              Всё равно создать новую
            </button>
            <span className="text-xs text-muted">
              или измените телефон / Telegram выше
            </span>
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <SubmitButton>{submitText}</SubmitButton>
      </div>
    </form>
  );
}
