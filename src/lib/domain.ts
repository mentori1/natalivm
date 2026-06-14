// Доменная логика CRM: статусы, расчёт остатков абонементов, напоминания.
// Чистые функции без зависимости от БД — легко переиспользовать и тестировать.

export type ClientStatus =
  | "lead"
  | "trial"
  | "active"
  | "expired"
  | "inactive"
  | "barter";

export type SubType = "online" | "offline";

export type SubStatus =
  | "active"
  | "ending"
  | "finished_lessons"
  | "finished_term"
  | "frozen";

export const CLIENT_STATUS: Record<
  ClientStatus,
  { label: string; tone: Tone }
> = {
  lead: { label: "Лид", tone: "slate" },
  trial: { label: "Был на пробном", tone: "violet" },
  active: { label: "Активный", tone: "green" },
  expired: { label: "Абонемент закончился", tone: "amber" },
  inactive: { label: "Неактивный", tone: "red" },
  barter: { label: "Бартер", tone: "blue" },
};

export const SUB_STATUS: Record<SubStatus, { label: string; tone: Tone }> = {
  active: { label: "Активен", tone: "green" },
  ending: { label: "Скоро закончится", tone: "amber" },
  finished_lessons: { label: "Закончился по занятиям", tone: "red" },
  finished_term: { label: "Закончился по сроку", tone: "red" },
  frozen: { label: "Заморожен", tone: "blue" },
};

export const SUB_TYPE: Record<SubType, { label: string; short: string }> = {
  online: { label: "Онлайн", short: "Онлайн" },
  offline: { label: "Офлайн", short: "Офлайн" },
};

export type Tone = "green" | "amber" | "red" | "slate" | "violet" | "blue";

export const CLIENT_SOURCES = [
  "Instagram",
  "Сарафан",
  "Реклама",
  "Telegram",
  "Бартер",
  "Другое",
];

// ───────────────────────── расчёты по абонементам ─────────────────────────

const DAY = 24 * 60 * 60 * 1000;
/** Сколько дней между датами (b - a), округление вниз */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY);
}

export interface SubLike {
  totalLessons: number;
  usedLessons: number;
  expiresAt: Date;
  frozen: boolean;
  status: string;
}

export function remaining(sub: SubLike): number {
  return Math.max(0, sub.totalLessons - sub.usedLessons);
}

/** Живой статус абонемента (вычисляется, не из БД), учитывает срок и остаток */
export function derivedSubStatus(sub: SubLike, now = new Date()): SubStatus {
  if (sub.frozen) return "frozen";
  if (remaining(sub) <= 0) return "finished_lessons";
  if (sub.expiresAt.getTime() < now.getTime()) return "finished_term";
  const left = remaining(sub);
  const daysLeft = daysBetween(now, sub.expiresAt);
  if (left <= 2 || daysLeft <= 7) return "ending";
  return "active";
}

/** Абонемент ещё можно использовать (есть занятия и срок не вышел) */
export function isUsable(sub: SubLike, now = new Date()): boolean {
  const s = derivedSubStatus(sub, now);
  return s === "active" || s === "ending";
}

// ───────────────────────── напоминания (дашборд) ─────────────────────────

export type ReminderKind =
  | "low_lessons"
  | "ending_term"
  | "finished"
  | "trial_followup"
  | "disappeared";

export interface Reminder {
  clientId: number;
  clientName: string;
  kind: ReminderKind;
  message: string;
  severity: 1 | 2 | 3; // 1 — самое срочное
}

export interface ClientForReminders {
  id: number;
  fullName: string;
  status: string;
  firstContact: Date;
  lastVisitAt: Date | null;
  subscriptions: SubLike[];
}

/**
 * Строит список «Требуют внимания» по клиенту.
 * Один клиент может дать несколько напоминаний (напр. мало занятий + скоро срок).
 */
export function buildReminders(
  clients: ClientForReminders[],
  now = new Date(),
): Reminder[] {
  const out: Reminder[] = [];

  for (const c of clients) {
    const usable = c.subscriptions.filter((s) => isUsable(s, now));
    const anySub = c.subscriptions.length > 0;

    // Мало занятий осталось в активном абонементе
    for (const s of usable) {
      const left = remaining(s);
      if (left > 0 && left <= 2) {
        out.push({
          clientId: c.id,
          clientName: c.fullName,
          kind: "low_lessons",
          message:
            left === 1 ? "Осталось 1 занятие" : `Осталось ${left} занятия`,
          severity: 1,
        });
      }
    }

    // Скоро кончается срок
    for (const s of usable) {
      const d = daysBetween(now, s.expiresAt);
      if (d >= 0 && d <= 7) {
        out.push({
          clientId: c.id,
          clientName: c.fullName,
          kind: "ending_term",
          message:
            d === 0
              ? "Абонемент кончается сегодня"
              : `Абонемент кончится через ${pluralDays(d)}`,
          severity: d <= 3 ? 1 : 2,
        });
      }
    }

    // Закончился абонемент, а клиент ещё «активный/закончился» — допродажа
    const finished = c.subscriptions.some((s) => {
      const st = derivedSubStatus(s, now);
      return st === "finished_lessons" || st === "finished_term";
    });
    if (finished && usable.length === 0 && c.status !== "inactive") {
      out.push({
        clientId: c.id,
        clientName: c.fullName,
        kind: "finished",
        message: "Абонемент закончился — предложить продление",
        severity: 2,
      });
    }

    // Был на пробном и ничего не купил
    if (c.status === "trial" && !anySub) {
      const d = daysBetween(c.firstContact, now);
      if (d >= 1) {
        out.push({
          clientId: c.id,
          clientName: c.fullName,
          kind: "trial_followup",
          message: `Был на пробном ${pluralDays(d)} назад`,
          severity: d >= 7 ? 1 : 2,
        });
      }
    }

    // Пропал — давно не приходил
    if (c.lastVisitAt) {
      const d = daysBetween(c.lastVisitAt, now);
      if (d >= 30 && c.status !== "inactive") {
        out.push({
          clientId: c.id,
          clientName: c.fullName,
          kind: "disappeared",
          message: `Не приходил ${pluralDays(d)}`,
          severity: d >= 60 ? 1 : 3,
        });
      }
    }
  }

  return out.sort((a, b) => a.severity - b.severity);
}

// ───────────────────────── форматирование ─────────────────────────

const moneyFmt = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});
export function formatMoney(n: number): string {
  return `${moneyFmt.format(Math.round(n))} ₽`;
}

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});
export function formatDate(d: Date | null): string {
  return d ? dateFmt.format(d) : "—";
}

const timeFmt = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});
export function formatTime(d: Date): string {
  return timeFmt.format(d);
}

const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
export function formatDateTime(d: Date): string {
  return dateTimeFmt.format(d);
}

/** «5 дней» / «1 день» / «3 дня» */
export function pluralDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  let word = "дней";
  if (abs < 11 || abs > 14) {
    if (last === 1) word = "день";
    else if (last >= 2 && last <= 4) word = "дня";
  }
  return `${n} ${word}`;
}

/** «3 занятия» / «1 занятие» / «5 занятий» */
export function pluralLessons(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  let word = "занятий";
  if (abs < 11 || abs > 14) {
    if (last === 1) word = "занятие";
    else if (last >= 2 && last <= 4) word = "занятия";
  }
  return `${n} ${word}`;
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}
