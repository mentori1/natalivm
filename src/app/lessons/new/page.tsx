import Link from "next/link";
import { createLesson } from "@/lib/actions";
import { Field, Input, Select, SubmitButton } from "@/components/form";
import { Card } from "@/components/ui";
import { IconArrowLeft } from "@/components/icons";
import { currentMoscowWallClockDate } from "@/lib/domain";

function defaultStart(): string {
  // сегодня 19:00 в формате для datetime-local
  const d = currentMoscowWallClockDate();
  d.setUTCHours(19, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function defaultRepeatUntil(): string {
  const date = currentMoscowWallClockDate();
  date.setUTCDate(date.getUTCDate() + 60);
  return date.toISOString().slice(0, 10);
}

const WEEKDAYS = [
  [1, "Пн"],
  [2, "Вт"],
  [3, "Ср"],
  [4, "Чт"],
  [5, "Пт"],
  [6, "Сб"],
  [7, "Вс"],
] as const;

export default function NewLessonPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/lessons"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <IconArrowLeft className="size-4" />К занятиям
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        Новое занятие
      </h1>

      <form action={createLesson} className="space-y-5">
        <Card className="space-y-4 p-5">
          <Field label="Название (необязательно)">
            <Input name="title" placeholder="Сформируется из формата, даты и времени" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Формат">
              <Select name="format" defaultValue="group">
                <option value="group">Групповое</option>
                <option value="individual">Индивидуальное</option>
              </Select>
            </Field>
            <Field label="Тип">
              <Select name="type" defaultValue="offline">
                <option value="offline">Офлайн</option>
                <option value="online">Онлайн</option>
              </Select>
            </Field>
            <Field label="Мест" hint="По умолчанию: онлайн 20, офлайн 8, индивидуальное 1">
              <Input name="capacity" type="number" min={1} placeholder="8" />
            </Field>
            <Field label="Дата и время первого занятия">
              <Input
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={defaultStart()}
              />
            </Field>
            <Field label="Ссылка на онлайн-занятие">
              <Input name="meetingUrl" type="url" placeholder="https://..." />
            </Field>
            <Field label="Адрес офлайн-занятия">
              <Input name="location" placeholder="Москва, ..." />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <p className="font-bold text-ink">Повторение группового занятия</p>
          </div>
          <Field label="Дни недели">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {WEEKDAYS.map(([value, label]) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface px-2 text-sm font-semibold text-ink has-checked:border-brand has-checked:bg-brand has-checked:text-brand-contrast"
                >
                  <input
                    className="sr-only"
                    type="checkbox"
                    name="repeatWeekdays"
                    value={value}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Создавать до">
            <Input name="repeatUntil" type="date" defaultValue={defaultRepeatUntil()} />
          </Field>
        </Card>
        <div className="flex justify-end">
          <SubmitButton>Создать</SubmitButton>
        </div>
      </form>
    </div>
  );
}
