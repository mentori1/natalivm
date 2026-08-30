export type IndividualAvailabilitySlot = {
  weekday: number;
  from: string;
  to: string;
};

export const INDIVIDUAL_WEEKDAYS = [
  { value: 1, short: "Пн", label: "Понедельник" },
  { value: 2, short: "Вт", label: "Вторник" },
  { value: 3, short: "Ср", label: "Среда" },
  { value: 4, short: "Чт", label: "Четверг" },
  { value: 5, short: "Пт", label: "Пятница" },
  { value: 6, short: "Сб", label: "Суббота" },
  { value: 7, short: "Вс", label: "Воскресенье" },
] as const;

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function normalizeIndividualAvailability(
  value: unknown,
): IndividualAvailabilitySlot[] {
  if (!Array.isArray(value)) return [];
  const slots = new Map<number, IndividualAvailabilitySlot>();
  for (const raw of value.slice(0, 14)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const weekday = Number(item.weekday);
    const from = String(item.from ?? "");
    const to = String(item.to ?? "");
    if (
      !Number.isInteger(weekday) ||
      weekday < 1 ||
      weekday > 7 ||
      !TIME_PATTERN.test(from) ||
      !TIME_PATTERN.test(to) ||
      from >= to
    ) {
      continue;
    }
    slots.set(weekday, { weekday, from, to });
  }
  return [...slots.values()].sort((a, b) => a.weekday - b.weekday);
}

export function parseIndividualAvailability(
  value: string | null | undefined,
): IndividualAvailabilitySlot[] {
  if (!value) return [];
  try {
    return normalizeIndividualAvailability(JSON.parse(value));
  } catch {
    return [];
  }
}

export function formatIndividualAvailability(
  slots: IndividualAvailabilitySlot[],
): string {
  return slots
    .map((slot) => {
      const day = INDIVIDUAL_WEEKDAYS.find((item) => item.value === slot.weekday);
      return `${day?.short ?? slot.weekday} ${slot.from}–${slot.to}`;
    })
    .join(", ");
}
