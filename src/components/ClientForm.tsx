import { Field, Input, Select, Textarea, SubmitButton } from "@/components/form";
import { Card } from "@/components/ui";
import { CLIENT_STATUS, CLIENT_SOURCES, type ClientStatus } from "@/lib/domain";

type ClientData = {
  id: number;
  fullName: string;
  phone: string | null;
  telegram: string | null;
  instagram: string | null;
  source: string | null;
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
}: {
  action: (fd: FormData) => void | Promise<void>;
  client?: ClientData;
  submitText: string;
}) {
  return (
    <form action={action} className="space-y-5">
      {client && <input type="hidden" name="id" value={client.id} />}

      <Card className="space-y-4 p-5">
        <Field label="Имя и фамилия">
          <Input
            name="fullName"
            required
            defaultValue={client?.fullName ?? ""}
            placeholder="Анна Кузнецова"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Статус">
            <Select name="status" defaultValue={client?.status ?? "lead"}>
              {STATUS_OPTIONS.map(([key, v]) => (
                <option key={key} value={key}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Источник">
            <Select name="source" defaultValue={client?.source ?? ""}>
              <option value="">—</option>
              {CLIENT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Телефон">
            <Input
              name="phone"
              type="tel"
              defaultValue={client?.phone ?? ""}
              placeholder="+7 ___ ___-__-__"
            />
          </Field>
          <Field label="Telegram">
            <Input
              name="telegram"
              defaultValue={client?.telegram ?? ""}
              placeholder="@username"
            />
          </Field>
          <Field label="Instagram">
            <Input
              name="instagram"
              defaultValue={client?.instagram ?? ""}
              placeholder="username"
            />
          </Field>
          <Field label="Дата рождения">
            <Input
              name="birthDate"
              type="date"
              defaultValue={dateValue(client?.birthDate ?? null)}
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
            defaultValue={client?.request ?? ""}
            placeholder="Например: хочет увереннее двигаться, раскрыть женственность…"
          />
        </Field>
        <Field
          label="Рекомендации для преподавателя"
          hint="Что учитывать на занятии (не диагнозы). Напр.: беречь поясницу, не давать сильную нагрузку."
        >
          <Textarea
            name="recommendations"
            defaultValue={client?.recommendations ?? ""}
            placeholder="Например: избегать резких прогибов, мягкая нагрузка на колени…"
          />
        </Field>
      </Card>

      <div className="flex justify-end gap-3">
        <SubmitButton>{submitText}</SubmitButton>
      </div>
    </form>
  );
}
