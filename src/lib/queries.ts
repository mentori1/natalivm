import { prisma } from "@/lib/db";
import {
  buildReminders,
  derivedSubStatus,
  isUsable,
  normalizeHandle,
  normalizePhone,
  remaining,
  TRAINER_PROFIT_DEFAULT,
  type ClientForReminders,
  type DuplicateMatch,
} from "@/lib/domain";

/**
 * Ищет уже заведённых клиентов, похожих на нового, по телефону / Telegram / Instagram.
 * Имя НЕ сравниваем — оно может повторяться. Сравнение по нормализованным значениям
 * (телефон без +7/8 и пробелов; юзернейм без «@» и регистра). excludeId — не сравнивать
 * клиента с самим собой при редактировании.
 */
export async function findClientDuplicates(
  fields: {
    phone?: string | null;
    telegram?: string | null;
    instagram?: string | null;
  },
  excludeId?: number,
): Promise<DuplicateMatch[]> {
  const phone = normalizePhone(fields.phone);
  const tg = normalizeHandle(fields.telegram);
  const ig = normalizeHandle(fields.instagram);
  if (!phone && !tg && !ig) return [];

  const candidates = await prisma.client.findMany({
    where: excludeId ? { id: { not: excludeId } } : undefined,
    select: {
      id: true,
      fullName: true,
      phone: true,
      telegram: true,
      instagram: true,
    },
  });

  const matches: DuplicateMatch[] = [];
  for (const c of candidates) {
    const reasons: string[] = [];
    if (phone && normalizePhone(c.phone) === phone) reasons.push("телефон");
    if (tg && normalizeHandle(c.telegram) === tg) reasons.push("Telegram");
    if (ig && normalizeHandle(c.instagram) === ig) reasons.push("Instagram");
    if (reasons.length > 0) {
      matches.push({
        id: c.id,
        fullName: c.fullName,
        phone: c.phone,
        telegram: c.telegram,
        reasons,
      });
    }
  }
  return matches;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Суммарные показатели по клиенту (для карточки и списка) */
export function clientStats(subs: {
  totalLessons: number;
  usedLessons: number;
  pricePerLesson: number;
}[]) {
  const visits = subs.reduce((s, x) => s + x.usedLessons, 0);
  const spent = subs.reduce((s, x) => s + x.totalLessons * x.pricePerLesson, 0);
  return { visits, spent };
}

export async function getDashboard() {
  const now = new Date();

  const clients = await prisma.client.findMany({
    include: { subscriptions: true, singleVisits: true },
  });
  const reminders = buildReminders(clients as ClientForReminders[], now);

  const todayLessonsRaw = await prisma.lesson.findMany({
    where: { startsAt: { gte: startOfDay(now), lte: endOfDay(now) } },
    include: { attendances: true },
    orderBy: { startsAt: "asc" },
  });
  const subsThisMonth = await prisma.subscription.findMany({
    where: { purchasedAt: { gte: startOfMonth(now), lte: endOfMonth(now) } },
  });
  const expenses = await prisma.expense.aggregate({
    _sum: { amount: true },
    where: { date: { gte: startOfMonth(now), lte: endOfMonth(now) } },
  });

  const todayLessons = todayLessonsRaw.map((l) => {
    const enrolled = l.attendances.filter((a) => a.status !== "absent").length;
    return {
      id: l.id,
      title: l.title,
      type: l.type,
      startsAt: l.startsAt,
      capacity: l.capacity,
      enrolled,
      free: l.capacity ? Math.max(0, l.capacity - enrolled) : null,
    };
  });

  const mStart = startOfMonth(now);
  const mEnd = endOfMonth(now);
  const inMonth = (d: Date) => d >= mStart && d <= mEnd;

  const subsRevenue = subsThisMonth.reduce(
    (s, x) => s + x.totalLessons * x.pricePerLesson,
    0,
  );
  const singleRevenue = clients.reduce(
    (s, c) =>
      s +
      c.singleVisits
        .filter((v) => inMonth(v.date))
        .reduce((a, v) => a + v.amount, 0),
    0,
  );
  const trainerRevenue = clients
    .filter((c) => c.trainerPurchasedAt && inMonth(c.trainerPurchasedAt))
    .reduce((s, c) => s + (c.trainerProfit ?? TRAINER_PROFIT_DEFAULT), 0);

  const revenueMonth = subsRevenue + singleRevenue + trainerRevenue;
  const expensesMonth = expenses._sum.amount ?? 0;

  // Все абонементы для метрик
  const allSubs = clients.flatMap((c) => c.subscriptions);
  const paidSubs = allSubs.filter((s) => s.pricePerLesson > 0);
  const avgCheck =
    paidSubs.length > 0
      ? paidSubs.reduce((s, x) => s + x.totalLessons * x.pricePerLesson, 0) /
        paidSubs.length
      : 0;

  const activeClients = clients.filter((c) =>
    c.subscriptions.some((s) => isUsable(s, now)),
  ).length;

  // Ожидаемые продления — абонементы, что скоро кончаются
  const endingSubs = allSubs.filter(
    (s) => derivedSubStatus(s, now) === "ending" && remaining(s) >= 0,
  );
  const expectedRenewals = new Set(
    clients
      .filter((c) => c.subscriptions.some((s) => derivedSubStatus(s, now) === "ending"))
      .map((c) => c.id),
  ).size;
  const potentialRevenue = Math.round(expectedRenewals * avgCheck);

  return {
    reminders,
    todayLessons,
    finance: {
      revenueMonth,
      expensesMonth,
      profitMonth: revenueMonth - expensesMonth,
      avgCheck: Math.round(avgCheck),
      activeClients,
      expectedRenewals,
      potentialRevenue,
    },
    endingCount: endingSubs.length,
  };
}
