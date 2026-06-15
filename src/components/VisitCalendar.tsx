"use client";

import { useState, useTransition } from "react";
import { toggleVisit } from "@/lib/actions";
import { cn } from "@/lib/cn";

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const pad = (n: number) => String(n).padStart(2, "0");

export function VisitCalendar({
  subId,
  visitDates,
}: {
  subId: number;
  visitDates: string[]; // "YYYY-MM-DD"
}) {
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [pending, startT] = useTransition();
  const visits = new Set(visitDates);

  const startWd = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Пн = 0
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prev = () =>
    setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const next = () =>
    setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));

  return (
    <div className={cn("select-none transition-opacity", pending && "opacity-50")}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prev}
          className="flex size-9 items-center justify-center rounded-xl text-ink hover:bg-black/5"
          aria-label="Прошлый месяц"
        >
          ‹
        </button>
        <span className="font-semibold text-ink">
          {MONTHS[view.m]} {view.y}
        </span>
        <button
          type="button"
          onClick={next}
          className="flex size-9 items-center justify-center rounded-xl text-ink hover:bg-black/5"
          aria-label="Следующий месяц"
        >
          ›
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const ds = `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
          const active = visits.has(ds);
          const isToday = ds === todayStr;
          return (
            <button
              key={i}
              type="button"
              disabled={pending}
              onClick={() => startT(() => toggleVisit(subId, ds))}
              className={cn(
                "flex aspect-square items-center justify-center rounded-lg text-sm transition-colors",
                active
                  ? "bg-brand font-semibold text-white"
                  : "text-ink hover:bg-brand-tint",
                isToday && !active && "ring-1 ring-brand/40",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted">
        Нажми на день, в который клиент был — занятие спишется. Нажми ещё раз — вернётся.
      </p>
    </div>
  );
}
