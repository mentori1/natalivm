import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  setAttendance,
  enrollClient,
  unenrollClient,
  deleteLesson,
  updateLessonSettings,
} from "@/lib/actions";
import {
  LESSON_FORMAT,
  SUB_TYPE,
  formatDateTime,
  type LessonFormat,
  type SubType,
} from "@/lib/domain";
import { Avatar, Badge, Card, SectionTitle, buttonClass } from "@/components/ui";
import { Input, Select, SubmitButton } from "@/components/form";
import { Disclosure } from "@/components/Disclosure";
import { IconArrowLeft, IconCheck, IconX } from "@/components/icons";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const lessonId = Number(id);

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      attendances: {
        include: { client: true },
        orderBy: { client: { fullName: "asc" } },
      },
    },
  });
  if (!lesson) notFound();

  const enrolledIds = new Set(lesson.attendances.map((a) => a.clientId));
  const otherClients = await prisma.client.findMany({
    where: { id: { notIn: [...enrolledIds] } },
    orderBy: { fullName: "asc" },
  });

  const enrolled = lesson.attendances.filter(
    (a) => a.status !== "absent",
  ).length;
  const present = lesson.attendances.filter(
    (a) => a.status === "present",
  ).length;
  const canEnroll = !lesson.capacity || enrolled < lesson.capacity;

  return (
    <div className="space-y-7">
      <Link
        href="/lessons"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <IconArrowLeft className="size-4" />К занятиям
      </Link>

      {/* Шапка занятия */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {lesson.title ?? "Занятие"}
              </h1>
              <Badge tone={lesson.type === "online" ? "blue" : "violet"}>
                {SUB_TYPE[lesson.type as SubType].short}
              </Badge>
              <Badge tone={LESSON_FORMAT[lesson.format as LessonFormat].tone}>
                {LESSON_FORMAT[lesson.format as LessonFormat].short}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted capitalize">
              {formatDateTime(lesson.startsAt)}
            </p>
          </div>
          <form action={deleteLesson}>
            <input type="hidden" name="id" value={lesson.id} />
            <SubmitButton
              variant="ghost"
              size="sm"
              className="text-red-500 hover:bg-red-50"
            >
              Удалить
            </SubmitButton>
          </form>
        </div>

        <div className="mt-4 flex gap-6">
          <div>
            <p className="text-xs text-muted">Записано</p>
            <p className="text-lg font-bold text-ink">{enrolled}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Пришли</p>
            <p className="text-lg font-bold text-brand-dark">{present}</p>
          </div>
          {lesson.capacity ? (
            <div>
              <p className="text-xs text-muted">Мест</p>
              <p className="text-lg font-bold text-ink">{lesson.capacity}</p>
            </div>
          ) : null}
        </div>

        <form
          action={updateLessonSettings}
          className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3"
        >
          <input type="hidden" name="id" value={lesson.id} />
          <label className="min-w-0 text-sm font-medium text-ink">
            Формат занятия
            <Select name="format" defaultValue={lesson.format} className="mt-1">
              <option value="group">Групповое</option>
              <option value="individual">Индивидуальное</option>
            </Select>
          </label>
          <label className="min-w-0 text-sm font-medium text-ink">
            Онлайн / офлайн
            <Select name="type" defaultValue={lesson.type} className="mt-1">
              <option value="offline">Офлайн</option>
              <option value="online">Онлайн</option>
            </Select>
          </label>
          <label className="min-w-0 text-sm font-medium text-ink">
            Количество мест
            <Input
              name="capacity"
              type="number"
              min={1}
              defaultValue={lesson.capacity ?? ""}
              placeholder={lesson.format === "individual" ? "1" : "Укажите для бота"}
              className="mt-1"
            />
          </label>
          <div className="sm:col-span-3 sm:flex sm:justify-end">
            <SubmitButton variant="soft" size="md">
              Сохранить настройки
            </SubmitButton>
          </div>
        </form>
      </Card>

      {query.error === "full" && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          Записать не получилось: на занятии уже заняты все места.
        </Card>
      )}

      {/* Список и отметка посещений */}
      <section>
        <SectionTitle
          action={
            otherClients.length > 0 && canEnroll ? (
              <Disclosure label="Записать">
                <Card className="p-4">
                  <form action={enrollClient} className="flex gap-2">
                    <input type="hidden" name="lessonId" value={lesson.id} />
                    <Select name="clientId" required defaultValue="">
                      <option value="" disabled>
                        Выберите клиента…
                      </option>
                      {otherClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton variant="soft" size="md">
                      Добавить
                    </SubmitButton>
                  </form>
                </Card>
              </Disclosure>
            ) : undefined
          }
        >
          Кто на занятии
        </SectionTitle>

        {lesson.attendances.length === 0 ? (
          <Card className="p-5 text-sm text-muted">
            Пока никто не записан. Добавьте клиентов кнопкой «Записать».
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden p-0">
            {lesson.attendances.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
              >
                <Link
                  href={`/clients/${a.clientId}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar name={a.client.fullName} size={40} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold leading-tight text-ink">
                        {a.client.fullName}
                      </p>
                      {a.client.status === "barter" && (
                        <Badge tone="blue">Бартер</Badge>
                      )}
                    </div>
                    {a.status === "present" && (
                      <p className="text-xs text-muted">
                        {a.client.status === "barter"
                          ? "занятие по бартеру"
                          : a.subscriptionId
                          ? "списано с абонемента"
                          : "вне абонемента"}
                      </p>
                    )}
                  </div>
                </Link>

                {/* Кнопки была / не была */}
                <div className="flex items-center justify-end gap-1.5">
                  <StatusButton
                    attId={a.id}
                    lessonId={lesson.id}
                    target="present"
                    active={a.status === "present"}
                  />
                  <StatusButton
                    attId={a.id}
                    lessonId={lesson.id}
                    target="absent"
                    active={a.status === "absent"}
                  />
                  <form action={unenrollClient}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="lessonId" value={lesson.id} />
                    <button
                      type="submit"
                      aria-label="Убрать из занятия"
                      className="flex size-7 items-center justify-center rounded-full text-muted/40 hover:bg-black/5 hover:text-muted"
                    >
                      <IconX className="size-4" />
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </Card>
        )}
        {!canEnroll && (
          <p className="mt-3 px-1 text-sm font-medium text-amber-700">
            Запись закрыта: заняты все {lesson.capacity} мест.
          </p>
        )}
        <p className="mt-3 px-1 text-xs text-muted">
          «Была» списывает 1 занятие с активного абонемента нужного типа
          (онлайн/офлайн). Для бартерных клиенток доход не создаётся.
        </p>
      </section>
    </div>
  );
}

function StatusButton({
  attId,
  lessonId,
  target,
  active,
}: {
  attId: number;
  lessonId: number;
  target: "present" | "absent";
  active: boolean;
}) {
  // повторное нажатие активной кнопки сбрасывает статус в «записан»
  const nextStatus = active ? "enrolled" : target;
  const isPresent = target === "present";
  return (
    <form action={setAttendance}>
      <input type="hidden" name="id" value={attId} />
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="status" value={nextStatus} />
      <button
        type="submit"
        aria-label={isPresent ? "Отметить «была»" : "Отметить «не была»"}
        className={cn(
          "flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold transition-colors",
          isPresent
            ? active
              ? "bg-green-500 text-white"
              : "bg-green-50 text-green-700 hover:bg-green-100"
            : active
              ? "bg-red-500 text-white"
              : "bg-red-50 text-red-600 hover:bg-red-100",
        )}
      >
        {isPresent ? (
          <IconCheck className="size-4" />
        ) : (
          <IconX className="size-4" />
        )}
        {isPresent ? "Была" : "Нет"}
      </button>
    </form>
  );
}
