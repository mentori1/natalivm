import Link from "next/link";
import { createLesson } from "@/lib/actions";
import { Field, Input, Select, SubmitButton } from "@/components/form";
import { Card } from "@/components/ui";
import { IconArrowLeft } from "@/components/icons";

function defaultStart(): string {
  // сегодня 19:00 в формате для datetime-local
  const d = new Date();
  d.setHours(19, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
          <Field label="Название">
            <Input name="title" placeholder="Оффлайн группа" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Тип">
              <Select name="type" defaultValue="offline">
                <option value="offline">Офлайн</option>
                <option value="online">Онлайн</option>
              </Select>
            </Field>
            <Field label="Мест" hint="Необязательно">
              <Input name="capacity" type="number" min={1} placeholder="8" />
            </Field>
            <Field label="Дата и время">
              <Input
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={defaultStart()}
              />
            </Field>
          </div>
        </Card>
        <div className="flex justify-end">
          <SubmitButton>Создать занятие</SubmitButton>
        </div>
      </form>
    </div>
  );
}
