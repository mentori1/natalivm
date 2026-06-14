import Link from "next/link";
import { prisma } from "@/lib/db";
import { startOfDay } from "@/lib/queries";
import { SUB_TYPE, formatDateTime, type SubType } from "@/lib/domain";
import { Badge, Card, EmptyState, SectionTitle, buttonClass } from "@/components/ui";
import { IconChevronRight, IconPlus, IconCalendar } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function LessonsPage() {
  const now = new Date();
  const dayStart = startOfDay(now);

  const lessons = await prisma.lesson.findMany({
    include: { attendances: true },
    orderBy: { startsAt: "asc" },
  });

  const upcoming = lessons.filter((l) => l.startsAt >= dayStart);
  const past = lessons
    .filter((l) => l.startsAt < dayStart)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .slice(0, 20);

  return (
    <div className="space-y-7">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Занятия
        </h1>
        <Link href="/lessons/new" className={buttonClass("primary", "sm")}>
          <IconPlus className="size-4" />
          Создать
        </Link>
      </header>

      {lessons.length === 0 && (
        <EmptyState
          icon={<IconCalendar className="size-8" />}
          title="Занятий пока нет"
          hint="Создайте первое занятие — и отмечайте, кто пришёл."
        />
      )}

      {upcoming.length > 0 && (
        <section>
          <SectionTitle>Предстоящие</SectionTitle>
          <div className="space-y-3">
            {upcoming.map((l) => (
              <LessonRow key={l.id} lesson={l} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <SectionTitle>Прошедшие</SectionTitle>
          <div className="space-y-3">
            {past.map((l) => (
              <LessonRow key={l.id} lesson={l} past />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function LessonRow({
  lesson,
  past,
}: {
  lesson: {
    id: number;
    title: string | null;
    type: string;
    startsAt: Date;
    capacity: number | null;
    attendances: { status: string }[];
  };
  past?: boolean;
}) {
  const enrolled = lesson.attendances.filter((a) => a.status !== "absent").length;
  const present = lesson.attendances.filter((a) => a.status === "present").length;
  return (
    <Link href={`/lessons/${lesson.id}`}>
      <Card className="flex items-center gap-4 p-4 transition-colors hover:bg-brand-tint">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-ink">
              {lesson.title ?? "Занятие"}
            </p>
            <Badge tone={lesson.type === "online" ? "blue" : "violet"}>
              {SUB_TYPE[lesson.type as SubType].short}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted capitalize">
            {formatDateTime(lesson.startsAt)}
          </p>
        </div>
        <div className="text-right text-sm">
          {past ? (
            <span className="font-semibold text-ink">{present} пришли</span>
          ) : (
            <span className="text-muted">
              записано {enrolled}
              {lesson.capacity ? ` / ${lesson.capacity}` : ""}
            </span>
          )}
        </div>
        <IconChevronRight className="size-5 shrink-0 text-muted/50" />
      </Card>
    </Link>
  );
}
