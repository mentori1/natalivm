"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, usesPostgres } from "@/lib/db";
import { findClientDuplicates } from "@/lib/queries";
import {
  currentMoscowWallClockDate,
  derivedSubStatus,
  formatDateTime,
  formatRussianPhone,
  isUsable,
  normalizeSourceDetail,
  remaining,
  TRAINER_PROFIT_DEFAULT,
  type PriceKind,
  type SubType,
  type ClientFormState,
  type ClientFormValues,
} from "@/lib/domain";

// ─────────── вспомогательные ───────────
function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function strOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}
function phoneOrNull(fd: FormData): string | null {
  const value = formatRussianPhone(str(fd, "phone"));
  return value || null;
}
function num(fd: FormData, key: string, fallback = 0): number {
  const v = Number(fd.get(key));
  return Number.isFinite(v) ? v : fallback;
}
function dateOrNull(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// datetime-local не содержит часовой пояс. Храним введённое время как UTC-значение,
// чтобы 19:30 оставалось 19:30 и на Vercel, и на локальном/собственном сервере.
function wallClockDateTimeOrNull(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  const d = new Date(`${v}Z`);
  return isNaN(d.getTime()) ? null : d;
}

function wallClockDateTimes(fd: FormData, key: string): Date[] {
  const unique = new Map<number, Date>();
  for (const value of fd.getAll(key)) {
    const raw = String(value).trim();
    if (!raw) continue;
    const date = new Date(`${raw}Z`);
    if (!isNaN(date.getTime())) unique.set(date.getTime(), date);
  }
  return [...unique.values()].sort((a, b) => a.getTime() - b.getTime());
}

function repeatedLessonStarts(
  fd: FormData,
  first: Date,
  format: "group" | "individual",
) {
  if (format !== "group") return [first];
  const weekdays = new Set(
    fd
      .getAll("repeatWeekdays")
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
  );
  const untilRaw = str(fd, "repeatUntil");
  const until = /^\d{4}-\d{2}-\d{2}$/.test(untilRaw)
    ? new Date(`${untilRaw}T23:59:59Z`)
    : null;
  if (!until || until < first || weekdays.size === 0) return [first];

  const result: Date[] = [];
  const cursor = new Date(first);
  cursor.setUTCHours(first.getUTCHours(), first.getUTCMinutes(), 0, 0);
  for (let day = 0; cursor <= until && day <= 370 && result.length < 180; day += 1) {
    const isoWeekday = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
    if (weekdays.has(isoWeekday)) result.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result.length ? result : [first];
}

function priceKind(fd: FormData): PriceKind {
  const v = str(fd, "kind");
  return v === "subscription" || v === "single" || v === "trial"
    ? v
    : "subscription";
}

function subType(fd: FormData): SubType {
  return str(fd, "type") === "online" ? "online" : "offline";
}

function lessonFormat(fd: FormData): "group" | "individual" {
  return str(fd, "format") === "individual" ? "individual" : "group";
}

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TERM_DAYS = 45; // абонемент живёт ~1.5 месяца

// ─────────── Клиенты ───────────

/** Собрать введённые значения формы — чтобы вернуть их при предупреждении о дубле. */
function clientValues(fd: FormData): ClientFormValues {
  return {
    fullName: str(fd, "fullName"),
    status: str(fd, "status") || "lead",
    source: str(fd, "source"),
    sourceDetail: normalizeSourceDetail(str(fd, "sourceDetail")),
    phone: formatRussianPhone(str(fd, "phone")),
    telegram: str(fd, "telegram"),
    instagram: str(fd, "instagram"),
    firstContact: str(fd, "firstContact"),
    birthDate: str(fd, "birthDate"),
    request: str(fd, "request"),
    recommendations: str(fd, "recommendations"),
  };
}

// Сигнатура под useActionState: (предыдущее_состояние, данные_формы).
export async function createClient(
  _prev: ClientFormState,
  fd: FormData,
): Promise<ClientFormState> {
  const fullName = str(fd, "fullName");
  if (!fullName) return null;

  const phone = phoneOrNull(fd);
  const telegram = strOrNull(fd, "telegram");
  const instagram = strOrNull(fd, "instagram");

  // Защита от дублей: если не нажали «всё равно создать» — сверяем по контактам.
  if (str(fd, "force") !== "1") {
    const duplicates = await findClientDuplicates({ phone, telegram, instagram });
    if (duplicates.length > 0) {
      return { duplicates, values: clientValues(fd) };
    }
  }

  const client = await prisma.client.create({
    data: {
      fullName,
      phone,
      telegram,
      instagram,
      source: strOrNull(fd, "source"),
      sourceDetail: normalizeSourceDetail(str(fd, "sourceDetail")) || null,
      status: str(fd, "status") || "lead",
      firstContact: dateOrNull(fd, "firstContact") ?? new Date(),
      request: strOrNull(fd, "request"),
      recommendations: strOrNull(fd, "recommendations"),
      birthDate: dateOrNull(fd, "birthDate"),
    },
  });
  revalidatePath("/clients");
  revalidatePath("/");
  redirect(`/clients/${client.id}`);
}

export async function updateClient(fd: FormData) {
  const id = num(fd, "id");
  if (!id) return;
  await prisma.client.update({
    where: { id },
    data: {
      fullName: str(fd, "fullName"),
      phone: phoneOrNull(fd),
      telegram: strOrNull(fd, "telegram"),
      instagram: strOrNull(fd, "instagram"),
      source: strOrNull(fd, "source"),
      sourceDetail: normalizeSourceDetail(str(fd, "sourceDetail")) || null,
      status: str(fd, "status") || "lead",
      firstContact: dateOrNull(fd, "firstContact") ?? new Date(),
      request: strOrNull(fd, "request"),
      recommendations: strOrNull(fd, "recommendations"),
      birthDate: dateOrNull(fd, "birthDate"),
    },
  });
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
  revalidatePath("/");
  redirect(`/clients/${id}`);
}

export async function deleteClient(fd: FormData) {
  const id = num(fd, "id");
  if (!id) return;
  // Каскадно удалит абонементы, посещения, заметки и цели (см. schema.prisma)
  await prisma.client.delete({ where: { id } }).catch(() => {});
  revalidatePath("/clients");
  revalidatePath("/");
  redirect("/clients");
}

export async function addNote(fd: FormData) {
  const clientId = num(fd, "clientId");
  const body = str(fd, "body");
  if (!clientId || !body) return;
  await prisma.note.create({ data: { clientId, body } });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteNote(fd: FormData) {
  const id = num(fd, "id");
  const clientId = num(fd, "clientId");
  if (!id) return;
  await prisma.note.delete({ where: { id } });
  revalidatePath(`/clients/${clientId}`);
}

export async function addGoal(fd: FormData) {
  const clientId = num(fd, "clientId");
  const text = str(fd, "text");
  if (!clientId || !text) return;
  await prisma.clientGoal.create({ data: { clientId, text } });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteGoal(fd: FormData) {
  const id = num(fd, "id");
  const clientId = num(fd, "clientId");
  if (!id) return;
  await prisma.clientGoal.delete({ where: { id } });
  revalidatePath(`/clients/${clientId}`);
}

// ─────────── Абонементы ───────────
export async function createSubscription(fd: FormData) {
  const clientId = num(fd, "clientId");
  if (!clientId) return;

  const priceItemId = num(fd, "priceItemId");
  const priceItem = priceItemId
    ? await prisma.priceItem.findUnique({ where: { id: priceItemId } })
    : null;
  const tariff =
    priceItem?.kind === "subscription" && priceItem.active ? priceItem : null;
  const minLessons = tariff?.minLessons ?? 4;
  const totalLessons = Math.max(minLessons, num(fd, "totalLessons", 4));
  const purchasedAt = dateOrNull(fd, "purchasedAt") ?? new Date();
  const termDays = num(fd, "termDays", DEFAULT_TERM_DAYS) || DEFAULT_TERM_DAYS;
  const expiresAt =
    dateOrNull(fd, "expiresAt") ??
    new Date(purchasedAt.getTime() + termDays * DAY);
  const type = tariff ? tariff.type : subType(fd);
  const format = tariff ? tariff.format : lessonFormat(fd);
  const pricePerLesson = num(fd, "pricePerLesson", tariff?.price ?? 0);

  const individualStartsAt =
    format === "individual"
      ? wallClockDateTimes(fd, "individualStartsAt").slice(0, totalLessons)
      : [];

  await prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: clientId },
      select: { fullName: true },
    });
    if (!client) return;

    const subscription = await tx.subscription.create({
      data: {
        clientId,
        type,
        format,
        tariffName: tariff ? tariff.name : strOrNull(fd, "tariffName"),
        totalLessons,
        usedLessons: 0,
        pricePerLesson,
        purchasedAt,
        expiresAt,
        status: "active",
      },
    });

    for (const startsAt of individualStartsAt) {
      await tx.lesson.create({
        data: {
          title: `Индивидуальное · ${client.fullName}`,
          type,
          format: "individual",
          startsAt,
          capacity: 1,
          attendances: {
            create: {
              clientId,
              status: "enrolled",
              enrollmentSource: "individual",
              plannedSubscriptionId: subscription.id,
            },
          },
        },
      });
    }

    // При покупке абонемента клиент становится активным.
    await tx.client.update({
      where: { id: clientId },
      data: { status: "active" },
    });

    return subscription;
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/lessons");
  revalidatePath("/");
}

export async function freezeSubscription(fd: FormData) {
  const id = num(fd, "id");
  if (!id) return;
  const sub = await prisma.subscription.findUnique({ where: { id } });
  if (!sub) return;
  await prisma.subscription.update({
    where: { id },
    data: {
      frozen: true,
      frozenUntil: dateOrNull(fd, "frozenUntil"),
      freezeReason: strOrNull(fd, "freezeReason"),
      status: "frozen",
    },
  });
  revalidatePath(`/subscriptions/${id}`);
  revalidatePath(`/clients/${sub.clientId}`);
  revalidatePath("/");
}

export async function unfreezeSubscription(fd: FormData) {
  const id = num(fd, "id");
  if (!id) return;
  const sub = await prisma.subscription.findUnique({ where: { id } });
  if (!sub) return;
  await prisma.subscription.update({
    where: { id },
    data: {
      frozen: false,
      frozenUntil: null,
      freezeReason: null,
      status: derivedSubStatus({ ...sub, frozen: false }),
    },
  });
  revalidatePath(`/subscriptions/${id}`);
  revalidatePath(`/clients/${sub.clientId}`);
  revalidatePath("/");
}

export async function deleteSubscription(fd: FormData) {
  const id = num(fd, "id");
  if (!id) return;
  const sub = await prisma.subscription.findUnique({
    where: { id },
    include: {
      plannedAttendances: {
        where: {
          status: "enrolled",
          lesson: {
            format: "individual",
            startsAt: { gte: currentMoscowWallClockDate() },
          },
        },
        select: { lessonId: true },
      },
    },
  });
  if (!sub) return;
  await prisma.$transaction(async (tx) => {
    if (sub.plannedAttendances.length > 0) {
      await tx.lesson.deleteMany({
        where: { id: { in: sub.plannedAttendances.map((item) => item.lessonId) } },
      });
    }
    await tx.subscription.delete({ where: { id } });
  });
  revalidatePath("/");
  revalidatePath("/lessons");
  revalidatePath(`/clients/${sub.clientId}`);
  redirect(`/clients/${sub.clientId}`);
}

/** Отметить/снять день посещения в календаре абонемента */
export async function toggleVisit(subId: number, dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(date.getTime()) || !subId) return;
  const sub = await prisma.subscription.findUnique({ where: { id: subId } });
  if (!sub) return;

  const existing = await prisma.subscriptionVisit.findUnique({
    where: { subscriptionId_date: { subscriptionId: subId, date } },
  });

  if (existing) {
    await prisma.subscriptionVisit.delete({ where: { id: existing.id } });
    const used = Math.max(0, sub.usedLessons - 1);
    await prisma.subscription.update({
      where: { id: subId },
      data: { usedLessons: used, status: derivedSubStatus({ ...sub, usedLessons: used }) },
    });
  } else {
    if (sub.usedLessons >= sub.totalLessons) return; // абонемент уже исчерпан
    await prisma.subscriptionVisit.create({ data: { subscriptionId: subId, date } });
    const used = sub.usedLessons + 1;
    await prisma.subscription.update({
      where: { id: subId },
      data: { usedLessons: used, status: derivedSubStatus({ ...sub, usedLessons: used }) },
    });
  }
  await recomputeLastVisit(sub.clientId);
  revalidatePath(`/subscriptions/${subId}`);
  revalidatePath(`/clients/${sub.clientId}`);
  revalidatePath("/");
}

/** Ручная правка числа использованных занятий */
export async function setUsedLessons(fd: FormData) {
  const id = num(fd, "id");
  const n = num(fd, "used");
  if (!id) return;
  const sub = await prisma.subscription.findUnique({
    where: { id },
    include: {
      visits: true,
      attendances: { where: { status: "present" } },
    },
  });
  if (!sub) return;
  // не меньше уже записанных дат и не больше купленного
  const datedCount = sub.visits.length + sub.attendances.length;
  const used = Math.min(sub.totalLessons, Math.max(datedCount, n));
  await prisma.subscription.update({
    where: { id },
    data: { usedLessons: used, status: derivedSubStatus({ ...sub, usedLessons: used }) },
  });
  revalidatePath(`/subscriptions/${id}`);
  revalidatePath(`/clients/${sub.clientId}`);
  revalidatePath("/");
}

// ─────────── Разовые / пробные посещения ───────────
export async function addSingleVisit(fd: FormData) {
  const clientId = num(fd, "clientId");
  if (!clientId) return;
  const date = dateOrNull(fd, "date") ?? new Date();
  const priceItemId = num(fd, "priceItemId");
  const priceItem = priceItemId
    ? await prisma.priceItem.findUnique({ where: { id: priceItemId } })
    : null;
  const tariff =
    priceItem &&
    priceItem.active &&
    (priceItem.kind === "trial" || priceItem.kind === "single")
      ? priceItem
      : null;
  const type = tariff ? tariff.type : subType(fd);
  const kind = tariff
    ? tariff.kind
    : str(fd, "kind") === "trial"
      ? "trial"
      : "single";
  const amount = num(fd, "amount", tariff?.price ?? 0);

  await prisma.singleVisit.create({
    data: {
      clientId,
      date,
      type,
      kind,
      tariffName: tariff ? tariff.name : strOrNull(fd, "tariffName"),
      amount,
    },
  });

  // обновим дату последнего визита и статус «пробный», если это пробное без абонементов
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { subscriptions: { select: { id: true } } },
  });
  if (client) {
    const data: { lastVisitAt?: Date; status?: string } = {};
    if (!client.lastVisitAt || client.lastVisitAt < date) data.lastVisitAt = date;
    if (
      kind === "trial" &&
      client.subscriptions.length === 0 &&
      client.status === "lead"
    ) {
      data.status = "trial";
    }
    if (Object.keys(data).length) {
      await prisma.client.update({ where: { id: clientId }, data });
    }
  }
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
}

export async function deleteSingleVisit(fd: FormData) {
  const id = num(fd, "id");
  const clientId = num(fd, "clientId");
  if (!id) return;
  await prisma.singleVisit.delete({ where: { id } });
  await recomputeLastVisit(clientId);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
}

// ─────────── Тренажёр ───────────
export async function toggleTrainer(fd: FormData) {
  const clientId = num(fd, "clientId");
  if (!clientId) return;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return;
  const buying = !client.hasTrainer;
  // прибыль фиксируется в момент продажи, чтобы старые продажи не пересчитывались
  const rawProfit = num(fd, "trainerProfit", TRAINER_PROFIT_DEFAULT);
  const profit = rawProfit > 0 ? rawProfit : TRAINER_PROFIT_DEFAULT;
  await prisma.client.update({
    where: { id: clientId },
    data: {
      hasTrainer: buying,
      trainerPurchasedAt: buying ? new Date() : null,
      trainerProfit: buying ? profit : null,
    },
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
}

// ─────────── Финансы (расходы) ───────────
export async function addExpense(fd: FormData) {
  const title = str(fd, "title");
  const amount = num(fd, "amount");
  if (!title || amount <= 0) return;
  await prisma.expense.create({
    data: {
      title,
      amount,
      category: strOrNull(fd, "category"),
      date: dateOrNull(fd, "date") ?? new Date(),
    },
  });
  revalidatePath("/finance");
  revalidatePath("/");
}

export async function deleteExpense(fd: FormData) {
  const id = num(fd, "id");
  if (!id) return;
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/finance");
  revalidatePath("/");
}

// ─────────── Прайс ───────────
export async function createPriceItem(fd: FormData) {
  const kind = priceKind(fd);
  const minLessons =
    kind === "subscription" ? Math.max(1, num(fd, "minLessons", 4)) : null;

  await prisma.priceItem.create({
    data: {
      name: str(fd, "name") || "Новый тариф",
      kind,
      type: subType(fd),
      format: lessonFormat(fd),
      price: Math.max(0, num(fd, "price", 0)),
      minLessons,
      active: fd.get("active") === "on",
      sortOrder: num(fd, "sortOrder", 100),
    },
  });
  revalidatePath("/prices");
}

export async function updatePriceItem(fd: FormData) {
  const id = num(fd, "id");
  if (!id) return;
  const kind = priceKind(fd);
  const minLessons =
    kind === "subscription" ? Math.max(1, num(fd, "minLessons", 4)) : null;

  await prisma.priceItem.update({
    where: { id },
    data: {
      name: str(fd, "name") || "Тариф",
      kind,
      type: subType(fd),
      format: lessonFormat(fd),
      price: Math.max(0, num(fd, "price", 0)),
      minLessons,
      active: fd.get("active") === "on",
      sortOrder: num(fd, "sortOrder", 100),
    },
  });
  revalidatePath("/prices");
}

export async function deletePriceItem(fd: FormData) {
  const id = num(fd, "id");
  if (!id) return;
  await prisma.priceItem.delete({ where: { id } });
  revalidatePath("/prices");
}

// ─────────── Клиентский Telegram-бот ───────────
export async function updateBotSettings(fd: FormData) {
  const holdMinutes = Math.max(5, Math.min(180, num(fd, "bookingHoldMinutes", 30)));
  await prisma.botSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      enabled: fd.get("enabled") === "on",
      welcomeText: strOrNull(fd, "welcomeText"),
      classesText: strOrNull(fd, "classesText"),
      teacherText: strOrNull(fd, "teacherText"),
      requiredChannelChatId: strOrNull(fd, "requiredChannelChatId"),
      requiredChannelUrl: strOrNull(fd, "requiredChannelUrl"),
      paymentDetails: strOrNull(fd, "paymentDetails"),
      offlineAddress: strOrNull(fd, "offlineAddress"),
      onlineMeetingUrl: strOrNull(fd, "onlineMeetingUrl"),
      trainerText: strOrNull(fd, "trainerText"),
      bookingHoldMinutes: holdMinutes,
    },
    update: {
      enabled: fd.get("enabled") === "on",
      welcomeText: strOrNull(fd, "welcomeText"),
      classesText: strOrNull(fd, "classesText"),
      teacherText: strOrNull(fd, "teacherText"),
      requiredChannelChatId: strOrNull(fd, "requiredChannelChatId"),
      requiredChannelUrl: strOrNull(fd, "requiredChannelUrl"),
      paymentDetails: strOrNull(fd, "paymentDetails"),
      offlineAddress: strOrNull(fd, "offlineAddress"),
      onlineMeetingUrl: strOrNull(fd, "onlineMeetingUrl"),
      trainerText: strOrNull(fd, "trainerText"),
      bookingHoldMinutes: holdMinutes,
    },
  });
  revalidatePath("/bot");
}

export async function updateBotContent(fd: FormData) {
  const { BOT_CONTENT_DEFINITIONS } = await import("@/lib/bot-content");
  for (const definition of BOT_CONTENT_DEFINITIONS) {
    const value = String(fd.get(definition.key) ?? "").trim();
    if (!value || value === definition.defaultValue) {
      await prisma.botContent.deleteMany({ where: { key: definition.key } });
      continue;
    }
    await prisma.botContent.upsert({
      where: { key: definition.key },
      create: { key: definition.key, value },
      update: { value },
    });
  }
  const { syncTelegramBotProfile } = await import("@/lib/telegram-channel");
  await syncTelegramBotProfile().catch(() => undefined);
  revalidatePath("/bot");
}

// ─────────── Занятия ───────────
function lessonCapacity(
  format: "group" | "individual",
  type: "online" | "offline",
  requested: number,
) {
  if (requested > 0) return requested;
  if (format === "individual") return 1;
  return type === "online" ? 20 : 8;
}

export async function createLesson(fd: FormData) {
  const firstStartsAt = wallClockDateTimeOrNull(fd, "startsAt");
  if (!firstStartsAt) return;
  const format = lessonFormat(fd);
  const type = str(fd, "type") === "online" ? "online" : "offline";
  const starts = repeatedLessonStarts(fd, firstStartsAt, format);
  const baseTitle = strOrNull(fd, "title");
  const capacity = lessonCapacity(format, type, num(fd, "capacity", 0));
  const meetingUrl = strOrNull(fd, "meetingUrl");
  const location = strOrNull(fd, "location");
  const lessonIds = await prisma.$transaction(async (tx) => {
    const created: number[] = [];
    for (const startsAt of starts) {
      const duplicate = await tx.lesson.findFirst({
        where: { startsAt, type, format },
        select: { id: true },
      });
      if (duplicate) continue;
      const generatedTitle = `${format === "group" ? "Групповое" : "Индивидуальное"} ${type === "online" ? "онлайн" : "офлайн"} · ${formatDateTime(startsAt)}`;
      const lesson = await tx.lesson.create({
        data: {
          title:
            starts.length > 1 && baseTitle
              ? `${baseTitle} · ${formatDateTime(startsAt)}`
              : baseTitle || generatedTitle,
          type,
          format,
          startsAt,
          capacity,
          meetingUrl,
          location,
        },
      });
      created.push(lesson.id);
    }
    return created;
  });
  for (const lessonId of lessonIds) await autoEnrollGroupSubscribers(lessonId);
  revalidatePath("/lessons");
  revalidatePath("/");
  if (lessonIds.length === 1 && starts.length === 1) {
    redirect(`/lessons/${lessonIds[0]}`);
  }
  redirect(`/lessons?created=${lessonIds.length}&skipped=${starts.length - lessonIds.length}`);
}

export async function updateLessonSettings(fd: FormData) {
  const id = num(fd, "id");
  if (!id) return;
  const format = lessonFormat(fd);
  const type = str(fd, "type") === "online" ? "online" : "offline";
  const startsAt = wallClockDateTimeOrNull(fd, "startsAt");
  await prisma.lesson.update({
    where: { id },
    data: {
      title: strOrNull(fd, "title"),
      format,
      type,
      ...(startsAt ? { startsAt } : {}),
      capacity: lessonCapacity(format, type, num(fd, "capacity", 0)),
      meetingUrl: strOrNull(fd, "meetingUrl"),
      location: strOrNull(fd, "location"),
    },
  });
  await autoEnrollGroupSubscribers(id);
  revalidatePath(`/lessons/${id}`);
  revalidatePath("/lessons");
  revalidatePath("/");
}

async function autoEnrollGroupSubscribers(lessonId: number) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      type: true,
      format: true,
      startsAt: true,
      capacity: true,
      attendances: { select: { clientId: true, status: true } },
    },
  });
  if (
    !lesson ||
    lesson.format !== "group" ||
    lesson.startsAt < currentMoscowWallClockDate()
  ) {
    return;
  }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      type: lesson.type,
      format: "group",
      frozen: false,
      expiresAt: { gte: lesson.startsAt },
      client: { status: { notIn: ["barter", "inactive"] } },
    },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
  });
  const existing = new Set(lesson.attendances.map((item) => item.clientId));
  const enrolled = lesson.attendances.filter((item) => item.status !== "absent").length;
  const slots = lesson.capacity ? Math.max(0, lesson.capacity - enrolled) : Infinity;
  const clientIds = [
    ...new Set(
      subscriptions
        .filter((sub) => isUsable(sub, lesson.startsAt) && remaining(sub) > 0)
        .map((sub) => sub.clientId)
        .filter((clientId) => !existing.has(clientId)),
    ),
  ].slice(0, slots);

  if (clientIds.length === 0) return;
  await prisma.attendance.createMany({
    data: clientIds.map((clientId) => ({
      lessonId,
      clientId,
      status: "enrolled",
      enrollmentSource: "auto",
    })),
  });
}

export async function deleteLesson(fd: FormData) {
  const id = num(fd, "id");
  if (!id) return;
  await prisma.lesson.delete({ where: { id } });
  revalidatePath("/lessons");
  revalidatePath("/");
  redirect("/lessons");
}

export async function enrollClient(fd: FormData) {
  const lessonId = num(fd, "lessonId");
  const clientId = num(fd, "clientId");
  if (!lessonId || !clientId) return;
  const result = await prisma.$transaction(async (tx) => {
    if (usesPostgres) {
      await tx.$executeRaw`select pg_advisory_xact_lock(${lessonId})`;
    }
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      include: { attendances: true },
    });
    if (!lesson) return "missing" as const;
    const existing = lesson.attendances.find((item) => item.clientId === clientId);
    if (existing) return "already" as const;
    const enrolled = lesson.attendances.filter((item) => item.status !== "absent").length;
    if (lesson.capacity && enrolled >= lesson.capacity) return "full" as const;
    await tx.attendance.create({
      data: { lessonId, clientId, status: "enrolled", enrollmentSource: "crm" },
    });
    return "created" as const;
  });
  if (result === "full") redirect(`/lessons/${lessonId}?error=full`);
  revalidatePath(`/lessons/${lessonId}`);
}

export async function unenrollClient(fd: FormData) {
  const id = num(fd, "id");
  const lessonId = num(fd, "lessonId");
  if (!id) return;
  const att = await prisma.attendance.findUnique({
    where: { id },
    select: { clientId: true },
  });
  // если запись потребляла занятие — сначала вернём его
  await refundIfConsumed(id);
  await prisma.attendance.delete({ where: { id } });
  if (att) await recomputeLastVisit(att.clientId);
  revalidatePath(`/lessons/${lessonId}`);
  if (att) revalidatePath(`/clients/${att.clientId}`);
  revalidatePath("/");
}

/** Отметка посещения: была / не была / записан. Держит счётчики абонементов в согласии. */
export async function setAttendance(fd: FormData) {
  const id = num(fd, "id");
  const next = str(fd, "status"); // present | absent | enrolled
  const lessonId = num(fd, "lessonId");
  if (!id || !next) return;

  const att = await prisma.attendance.findUnique({
    where: { id },
    include: { lesson: true, plannedSubscription: true },
  });
  if (!att) return;

  // 1. Откатываем прошлое списание, если было
  await refundIfConsumed(id);

  // 2. Если отмечаем «была» — списываем занятие с подходящего абонемента
  let subscriptionId: number | null = null;
  if (next === "present") {
    const now = new Date();
    const planned = att.plannedSubscription;
    const subs = planned
      ? []
      : await prisma.subscription.findMany({
          where: {
            clientId: att.clientId,
            type: att.lesson.type,
            format: att.lesson.format,
          },
        });
    const chosen =
      planned && isUsable(planned, att.lesson.startsAt) && remaining(planned) > 0
        ? planned
        : subs
            .filter((s) => isUsable(s, now) && remaining(s) > 0)
            .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())[0];
    if (chosen) {
      const used = chosen.usedLessons + 1;
      subscriptionId = chosen.id;
      await prisma.subscription.update({
        where: { id: chosen.id },
        data: {
          usedLessons: used,
          status: derivedSubStatus(
            { ...chosen, usedLessons: used },
            now,
          ),
        },
      });
    }
  }

  await prisma.attendance.update({
    where: { id },
    data: { status: next, subscriptionId },
  });

  // 3. Пересчитываем дату последнего занятия клиента
  await recomputeLastVisit(att.clientId);

  revalidatePath(`/lessons/${lessonId}`);
  revalidatePath(`/clients/${att.clientId}`);
  revalidatePath("/");
}

/** Если запись потребляла занятие из абонемента — вернуть его обратно. */
async function refundIfConsumed(attendanceId: number) {
  const att = await prisma.attendance.findUnique({
    where: { id: attendanceId },
  });
  if (!att?.subscriptionId) return;
  const sub = await prisma.subscription.findUnique({
    where: { id: att.subscriptionId },
  });
  if (sub) {
    const used = Math.max(0, sub.usedLessons - 1);
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        usedLessons: used,
        status: derivedSubStatus({ ...sub, usedLessons: used }),
      },
    });
  }
  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { subscriptionId: null },
  });
}

/** lastVisitAt = самая поздняя дата фактического визита из всех источников. */
async function recomputeLastVisit(clientId: number) {
  const lastAttendance = await prisma.attendance.findFirst({
    where: { clientId, status: "present" },
    include: { lesson: true },
    orderBy: { lesson: { startsAt: "desc" } },
  });
  const lastManualVisit = await prisma.subscriptionVisit.findFirst({
    where: { subscription: { clientId } },
    orderBy: { date: "desc" },
  });
  const lastSingleVisit = await prisma.singleVisit.findFirst({
    where: { clientId },
    orderBy: { date: "desc" },
  });
  const dates = [
    lastAttendance?.lesson.startsAt,
    lastManualVisit?.date,
    lastSingleVisit?.date,
  ].filter((d): d is Date => Boolean(d));
  const last = dates.length > 0
    ? dates.sort((a, b) => b.getTime() - a.getTime())[0]
    : null;
  await prisma.client.update({
    where: { id: clientId },
    data: { lastVisitAt: last },
  });
}
