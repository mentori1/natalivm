import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  setAttendance,
  enrollClient,
  unenrollClient,
  deleteLesson,
} from "@/lib/actions";
import { SUB_TYPE, formatDateTime, type SubType } from "@/lib/domain";
import { Avatar, Badge, Card, SectionTitle, buttonClass } from "@/components/ui";
import { Select, SubmitButton } from "@/components/form";
import { Disclosure } from "@/components/Disclosure";
import { IconArrowLeft, IconCheck, IconX } from "@/components/icons";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {lesson.title ?? "Занятие"}
              </h1>
              <Badge tone={lesson.type === "online" ? "blue" : "violet"}>
                {SUB_TYPE[lesson.type as SubType].short}
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
            <p className="text-lg font-bold text-ink">
              {enrolled}
              {lesson.capacity ? (
                <span className="text-muted"> / {lesson.capacity}</span>
              ) : null}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Пришли</p>
            <p className="text-lg font-bold text-brand-dark">{present}</p>
          </div>
        </div>
      </Card>

      {/* Список и отметка посещений */}
      <section>
        <SectionTitle
          action={
            otherClients.length > 0 ? (
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
                    <p className="truncate font-semibold leading-tight text-ink">
                      {a.client.fullName}
                    </p>
                    {a.status === "present" && (
                      <p className="text-xs text-muted">
                        {a.subscriptionId
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
        <p className="mt-3 px-1 text-xs text-muted">
          «Была» списывает 1 занятие с активного абонемента нужного типа
          (онлайн/офлайн). Если абонемента нет — отметка ставится как разовое.
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
