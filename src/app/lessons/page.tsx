import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  LESSON_FORMAT,
  SUB_TYPE,
  currentMoscowWallClockDate,
  formatDateTime,
  type LessonFormat,
  type SubType,
} from "@/lib/domain";
import { Badge, Card, EmptyState, SectionTitle, buttonClass } from "@/components/ui";
import { IconChevronRight, IconPlus, IconCalendar } from "@/components/icons";

export const dynamic = "force-dynamic";

type LessonTypeFilter = "all" | "online" | "offline";
type LessonFormatFilter = "all" | "group" | "individual";
type LessonView = "list" | "calendar";

const TYPE_FILTERS: { key: LessonTypeFilter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "offline", label: "Офлайн" },
  { key: "online", label: "Онлайн" },
];

const FORMAT_FILTERS: { key: LessonFormatFilter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "group", label: "Групповые" },
  { key: "individual", label: "Индивидуальные" },
];

const VIEWS: { key: LessonView; label: string }[] = [
  { key: "list", label: "Список" },
  { key: "calendar", label: "Календарь" },
];

export default async function LessonsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    format?: string;
    view?: string;
    m?: string;
    d?: string;
  }>;
}) {
  const params = await searchParams;
  const type: LessonTypeFilter =
    params.type === "online" || params.type === "offline" ? params.type : "all";
  const format: LessonFormatFilter =
    params.format === "group" || params.format === "individual"
      ? params.format
      : "all";
  const view: LessonView = params.view === "calendar" ? "calendar" : "list";
  const now = currentMoscowWallClockDate();
  const selectedMonth = parseMonth(params.m) ?? new Date(now.getFullYear(), now.getMonth(), 1);

  const lessons = await prisma.lesson.findMany({
    include: { attendances: true },
    orderBy: { startsAt: "asc" },
  });
  const filteredLessons = lessons.filter(
    (lesson) =>
      (type === "all" || lesson.type === type) &&
      (format === "all" || lesson.format === format),
  );

  // «Предстоящие» — те, что ещё не начались; начавшиеся уходят в «Прошедшие»
  const upcoming = filteredLessons.filter((l) => l.startsAt >= now);
  const past = filteredLessons
    .filter((l) => l.startsAt < now)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .slice(0, 20);
  const selectedDate =
    parseDate(params.d) ??
    upcoming.find((l) => sameMonth(l.startsAt, selectedMonth))?.startsAt ??
    now;
  const selectedKey = dayKey(selectedDate);
  const selectedDayLessons = filteredLessons
    .filter((l) => dayKey(l.startsAt) === selectedKey)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-3">
          <Segmented
            items={FORMAT_FILTERS.map((f) => ({
              key: f.key,
              label: f.label,
              href: lessonsHref({
                type,
                format: f.key,
                view,
                m: monthKey(selectedMonth),
                d: selectedKey,
              }),
            }))}
            active={format}
          />
          <Segmented
            items={TYPE_FILTERS.map((f) => ({
              key: f.key,
              label: f.label,
              href: lessonsHref({
                type: f.key,
                format,
                view,
                m: monthKey(selectedMonth),
                d: selectedKey,
              }),
            }))}
            active={type}
          />
        </div>
        <Segmented
          items={VIEWS.map((v) => ({
            key: v.key,
            label: v.label,
            href: lessonsHref({
              type,
              format,
              view: v.key,
              m: monthKey(selectedMonth),
              d: selectedKey,
            }),
          }))}
          active={view}
        />
      </div>

      {filteredLessons.length === 0 && (
        <EmptyState
          icon={<IconCalendar className="size-8" />}
          title={lessons.length === 0 ? "Занятий пока нет" : "Занятий не найдено"}
          hint={
            lessons.length === 0
              ? "Создайте первое занятие — и отмечайте, кто пришёл."
              : "Попробуйте другой фильтр."
          }
        />
      )}

      {filteredLessons.length > 0 && view === "calendar" && (
        <CalendarView
          lessons={filteredLessons}
          selectedMonth={selectedMonth}
          selectedKey={selectedKey}
          selectedDayLessons={selectedDayLessons}
          type={type}
          format={format}
        />
      )}

      {filteredLessons.length > 0 && view === "list" && (
        <>
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
        </>
      )}
    </div>
  );
}

function Segmented({
  items,
  active,
}: {
  items: { key: string; label: string; href: string }[];
  active: string;
}) {
  return (
    <div className="inline-flex w-fit rounded-full border border-line bg-white p-1">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
            item.key === active
              ? "bg-brand text-white"
              : "text-muted hover:bg-brand-tint hover:text-ink"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function CalendarView({
  lessons,
  selectedMonth,
  selectedKey,
  selectedDayLessons,
  type,
  format,
}: {
  lessons: Lesson[];
  selectedMonth: Date;
  selectedKey: string;
  selectedDayLessons: Lesson[];
  type: LessonTypeFilter;
  format: LessonFormatFilter;
}) {
  const days = calendarDays(selectedMonth);
  const lessonMap = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    const key = dayKey(lesson.startsAt);
    lessonMap.set(key, [...(lessonMap.get(key) ?? []), lesson]);
  }
  const prev = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1);
  const next = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1);

  return (
    <section className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <Link
            href={lessonsHref({ type, format, view: "calendar", m: monthKey(prev) })}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-brand-tint"
          >
            ‹
          </Link>
          <h2 className="font-bold text-ink capitalize">
            {monthTitle(selectedMonth)}
          </h2>
          <Link
            href={lessonsHref({ type, format, view: "calendar", m: monthKey(next) })}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-brand-tint"
          >
            ›
          </Link>
        </div>

        <div className="grid grid-cols-7 border-b border-line bg-brand-tint text-center text-xs font-semibold text-muted">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = dayKey(day);
            const dayLessons = lessonMap.get(key) ?? [];
            const inMonth = sameMonth(day, selectedMonth);
            const selected = key === selectedKey;
            const hasOnline = dayLessons.some((l) => l.type === "online");
            const hasOffline = dayLessons.some((l) => l.type === "offline");
            return (
              <Link
                key={key}
                href={lessonsHref({
                  type,
                  format,
                  view: "calendar",
                  m: monthKey(selectedMonth),
                  d: key,
                })}
                className={`min-h-16 border-r border-b border-line p-2 transition-colors hover:bg-brand-tint ${
                  selected ? "bg-brand-tint ring-2 ring-inset ring-brand/30" : "bg-white"
                } ${inMonth ? "" : "opacity-35"}`}
              >
                <span className="text-sm font-semibold text-ink">{day.getDate()}</span>
                {dayLessons.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {hasOffline && <span className="size-2 rounded-full bg-violet-500" />}
                    {hasOnline && <span className="size-2 rounded-full bg-sky-500" />}
                    {dayLessons.length > 1 && (
                      <span className="text-[10px] font-semibold text-muted">
                        {dayLessons.length}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </Card>

      <section>
        <SectionTitle>{formatSelectedDay(selectedKey)}</SectionTitle>
        {selectedDayLessons.length === 0 ? (
          <Card className="p-5 text-sm text-muted">В этот день занятий нет.</Card>
        ) : (
          <div className="space-y-3">
            {selectedDayLessons.map((lesson) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                past={lesson.startsAt < currentMoscowWallClockDate()}
              />
            ))}
          </div>
        )}
      </section>
    </section>
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
    format: string;
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
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 basis-full truncate font-semibold text-ink sm:basis-auto">
              {lesson.title ?? "Занятие"}
            </p>
            <Badge tone={lesson.type === "online" ? "blue" : "violet"}>
              {SUB_TYPE[lesson.type as SubType].short}
            </Badge>
            <Badge tone={LESSON_FORMAT[lesson.format as LessonFormat].tone}>
              {LESSON_FORMAT[lesson.format as LessonFormat].short}
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
            <span className="text-muted">записано {enrolled}</span>
          )}
        </div>
        <IconChevronRight className="size-5 shrink-0 text-muted/50" />
      </Card>
    </Link>
  );
}

type Lesson = {
  id: number;
  title: string | null;
  type: string;
  format: string;
  startsAt: Date;
  capacity: number | null;
  attendances: { status: string }[];
};

function lessonsHref({
  type,
  format,
  view,
  m,
  d,
}: {
  type?: LessonTypeFilter;
  format?: LessonFormatFilter;
  view?: LessonView;
  m?: string;
  d?: string;
}) {
  const params = new URLSearchParams();
  if (type && type !== "all") params.set("type", type);
  if (format && format !== "all") params.set("format", format);
  if (view && view !== "list") params.set("view", view);
  if (m) params.set("m", m);
  if (d) params.set("d", d);
  const query = params.toString();
  return query ? `/lessons?${query}` : "/lessons";
}

function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseDate(v?: string) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function parseMonth(v?: string) {
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return null;
  const [y, m] = v.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function calendarDays(month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = (start.getDay() + 6) % 7;
  const first = new Date(start);
  first.setDate(start.getDate() - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d;
  });
}

const monthFmt = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});

function monthTitle(d: Date) {
  return monthFmt.format(d);
}

const dayFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});

function formatSelectedDay(key: string) {
  return dayFmt.format(parseDate(key) ?? new Date());
}
