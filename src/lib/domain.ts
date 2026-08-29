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
export type LessonFormat = "group" | "individual";

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

export const LESSON_FORMAT: Record<
  LessonFormat,
  { label: string; short: string; tone: Tone }
> = {
  group: { label: "Групповое", short: "Группа", tone: "green" },
  individual: { label: "Индивидуальное", short: "Индивидуально", tone: "amber" },
};

/** Текущее московское время, закодированное как UTC wall-clock для расписания. */
export function currentMoscowWallClockDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(
    Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    ),
  );
}

export type Tone = "green" | "amber" | "red" | "slate" | "violet" | "blue";

export const GROUP_BOOKING_CREDIT_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

export type PriceKind = "subscription" | "single" | "trial";

export const PRICE_KIND: Record<PriceKind, { label: string; short: string }> = {
  subscription: { label: "Абонемент", short: "Абонемент" },
  single: { label: "Разовое", short: "Разовое" },
  trial: { label: "Пробное", short: "Пробное" },
};

export type PriceItemLike = {
  name: string;
  kind: PriceKind;
  type: SubType;
  format: "group" | "individual";
  price: number;
  minLessons: number | null;
  active: boolean;
  sortOrder: number;
};

export const DEFAULT_PRICE_ITEMS: PriceItemLike[] = [
  {
    name: "Групповой абонемент",
    kind: "subscription",
    type: "offline",
    format: "group",
    price: 1500,
    minLessons: 4,
    active: true,
    sortOrder: 10,
  },
  {
    name: "Групповой абонемент",
    kind: "subscription",
    type: "online",
    format: "group",
    price: 1200,
    minLessons: 4,
    active: true,
    sortOrder: 20,
  },
  {
    name: "Индивидуальный абонемент",
    kind: "subscription",
    type: "online",
    format: "individual",
    price: 2600,
    minLessons: 4,
    active: true,
    sortOrder: 30,
  },
  {
    name: "Индивидуальный абонемент",
    kind: "subscription",
    type: "offline",
    format: "individual",
    price: 5000,
    minLessons: 4,
    active: true,
    sortOrder: 40,
  },
  {
    name: "Пробное занятие",
    kind: "trial",
    type: "offline",
    format: "group",
    price: 1000,
    minLessons: null,
    active: true,
    sortOrder: 50,
  },
  {
    name: "Пробное занятие",
    kind: "trial",
    type: "online",
    format: "group",
    price: 500,
    minLessons: null,
    active: true,
    sortOrder: 60,
  },
  {
    name: "Разовое групповое занятие",
    kind: "single",
    type: "offline",
    format: "group",
    price: 2300,
    minLessons: null,
    active: true,
    sortOrder: 70,
  },
  {
    name: "Разовое групповое занятие",
    kind: "single",
    type: "online",
    format: "group",
    price: 2300,
    minLessons: null,
    active: true,
    sortOrder: 80,
  },
  {
    name: "Индивидуальное занятие",
    kind: "single",
    type: "online",
    format: "individual",
    price: 3000,
    minLessons: null,
    active: true,
    sortOrder: 90,
  },
  {
    name: "Индивидуальное занятие",
    kind: "single",
    type: "offline",
    format: "individual",
    price: 5500,
    minLessons: null,
    active: true,
    sortOrder: 100,
  },
];

export const CLIENT_SOURCES = [
  "Instagram",
  "Telegram",
  "Сарафан",
  "Блогер",
  "Реклама",
  "Бартер",
  "Другое",
];

const SOURCE_DETAIL_ALIASES = new Map<string, string>([
  ["от анюты", "Анюта Солнечная"],
  ["анюта солнечная", "Анюта Солнечная"],
  ["от анечки", "Анюта Солнечная"],
  ["солнечная анюта", "Анюта Солнечная"],
  ["от ани", "Анюта Солнечная"],
  ["от анюты солнечной", "Анюта Солнечная"],
]);

/** Объединяет известные варианты имени одного источника лидов. */
export function normalizeSourceDetail(
  value: string | null | undefined,
): string {
  const cleaned = (value ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return SOURCE_DETAIL_ALIASES.get(cleaned.toLocaleLowerCase("ru-RU")) ?? cleaned;
}

// ───────────────────────── защита от дублей клиентов ─────────────────────────

/** Телефон → последние 10 цифр: +7, 8, скобки и пробелы не мешают сравнению. */
export function normalizePhone(v: string | null | undefined): string {
  const digits = (v ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Приводит российский номер к виду +7 (999) 123-45-67, сохраняя неполный ввод. */
export function formatRussianPhone(v: string | null | undefined): string {
  let digits = (v ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  else if (!digits.startsWith("7")) digits = `7${digits}`;
  digits = digits.slice(0, 11);

  const local = digits.slice(1);
  let result = "+7";
  if (!local) return result;
  result += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) result += ")";
  if (local.length > 3) result += ` ${local.slice(3, 6)}`;
  if (local.length > 6) result += `-${local.slice(6, 8)}`;
  if (local.length > 8) result += `-${local.slice(8, 10)}`;
  return result;
}

/** Юзернейм (Telegram/Instagram) → без ссылки и «@», в нижнем регистре. */
export function normalizeHandle(v: string | null | undefined): string {
  return (v ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^(?:www\.)?(?:t\.me|telegram\.me|instagram\.com)\//, "")
    .replace(/^@+/, "")
    .split(/[/?#\s]/, 1)[0];
}

/** Текст для нечувствительного к регистру поиска по имени. */
export function normalizeSearchText(v: string | null | undefined): string {
  return (v ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

/** Найденный возможный дубль клиента (для предупреждения в форме). */
export type DuplicateMatch = {
  id: number;
  fullName: string;
  phone: string | null;
  telegram: string | null;
  reasons: string[]; // по чему совпало: «телефон», «Telegram», «Instagram»
};

/** Введённые в форму клиента значения — чтобы вернуть их при предупреждении. */
export type ClientFormValues = {
  fullName: string;
  status: string;
  source: string;
  sourceDetail: string;
  phone: string;
  telegram: string;
  instagram: string;
  firstContact: string;
  birthDate: string;
  request: string;
  recommendations: string;
};

/** Состояние формы клиента: либо чисто, либо найдены возможные дубли. */
export type ClientFormState = {
  duplicates: DuplicateMatch[];
  values: ClientFormValues;
} | null;

// ───────────────────────── расчёты по абонементам ─────────────────────────

const DAY = 24 * 60 * 60 * 1000;
/** Сколько дней между датами (b - a), округление вниз */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY);
}

export interface SubLike {
  totalLessons: number;
  unlimited?: boolean;
  usedLessons: number;
  expiresAt: Date;
  frozen: boolean;
  status: string;
}

export function remaining(sub: SubLike): number {
  if (sub.unlimited) return Number.MAX_SAFE_INTEGER;
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

/**
 * Фактический статус клиента: для active/expired считается по абонементам.
 * Ручные статусы (лид, пробный, бартер, неактивный) не меняются.
 */
export function effectiveClientStatus(
  storedStatus: string,
  subs: SubLike[],
  now = new Date(),
): ClientStatus {
  if (storedStatus === "barter" || storedStatus === "inactive") {
    return storedStatus;
  }

  // есть рабочий или замороженный абонемент → активный
  const hasLive = subs.some((s) => {
    const st = derivedSubStatus(s, now);
    return st === "active" || st === "ending" || st === "frozen";
  });
  if (hasLive) return "active";

  // были абонементы, но все закончились → «абонемент закончился»
  if (subs.length > 0) return "expired";

  // Если абонементов нет, клиент не должен случайно оставаться «активным».
  if (storedStatus === "active" || storedStatus === "expired") return "lead";
  return storedStatus === "trial" ? "trial" : "lead";
}

// ───────────────────────── напоминания (дашборд) ─────────────────────────

export type ReminderKind =
  | "low_lessons"
  | "ending_term"
  | "finished"
  | "trial_followup"
  | "disappeared"
  | "trainer_upsell";

export const SINGLE_VISIT_KIND: Record<string, { label: string }> = {
  trial: { label: "Пробное" },
  single: { label: "Разовое" },
};

/// Цена по умолчанию: [тип визита][формат]
export const SINGLE_VISIT_PRICE: Record<string, Record<string, number>> = {
  trial: { offline: 1000, online: 500 },
  single: { offline: 2300, online: 2300 },
};

/// Прибыль преподавателя с НОВОЙ продажи тренажёра, ₽.
/// У каждой продажи прибыль фиксируется в Client.trainerProfit,
/// поэтому старые продажи остаются по своей сумме и не пересчитываются.
export const TRAINER_PROFIT_DEFAULT = 5000;

/// Текущая цена продажи тренажёра клиентке, ₽.
/// В истории сохраняется TrainerOrder.amount, поэтому будущая смена цены
/// не влияет на уже созданные заявки и подтверждённые покупки.
export const TRAINER_PRICE_DEFAULT = 12000;

/// Готовые категории расходов (можно выбрать или вписать свою)
export const EXPENSE_CATEGORIES = [
  "Аренда зала",
  "Оборудование",
  "Реклама",
  "Прочее",
];

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
  hasTrainer: boolean;
  subscriptions: SubLike[];
}

const REMINDER_KIND_PRIORITY: Record<ReminderKind, number> = {
  low_lessons: 1,
  finished: 2,
  ending_term: 3,
  trial_followup: 4,
  trainer_upsell: 5,
  disappeared: 6,
};

/**
 * Строит список «Требуют внимания».
 * На главную отдаём один самый важный повод на клиента, чтобы один человек
 * не занимал несколько строк одновременно.
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

    // Отходил 2+ абонемента, но не купил тренажёр — предложить
    if (c.subscriptions.length >= 2 && !c.hasTrainer) {
      out.push({
        clientId: c.id,
        clientName: c.fullName,
        kind: "trainer_upsell",
        message: `Прошёл ${c.subscriptions.length} абонемента — предложить тренажёр`,
        severity: 2,
      });
    }
  }

  const bestByClient = new Map<number, Reminder>();
  for (const reminder of out) {
    const current = bestByClient.get(reminder.clientId);
    if (!current || compareClientReminders(reminder, current) < 0) {
      bestByClient.set(reminder.clientId, reminder);
    }
  }

  return Array.from(bestByClient.values()).sort(compareReminders);
}

function compareClientReminders(a: Reminder, b: Reminder): number {
  return (
    REMINDER_KIND_PRIORITY[a.kind] - REMINDER_KIND_PRIORITY[b.kind] ||
    a.severity - b.severity ||
    a.clientName.localeCompare(b.clientName, "ru")
  );
}

function compareReminders(a: Reminder, b: Reminder): number {
  return (
    a.severity - b.severity ||
    REMINDER_KIND_PRIORITY[a.kind] - REMINDER_KIND_PRIORITY[b.kind] ||
    a.clientName.localeCompare(b.clientName, "ru")
  );
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
  timeZone: "UTC",
});
export function formatDate(d: Date | null): string {
  return d ? dateFmt.format(d) : "—";
}

const timeFmt = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
export function formatTime(d: Date): string {
  return timeFmt.format(d);
}

const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
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
