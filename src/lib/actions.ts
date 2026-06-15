"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { derivedSubStatus, isUsable, remaining } from "@/lib/domain";

// ─────────── вспомогательные ───────────
function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function strOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
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

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TERM_DAYS = 45; // абонемент живёт ~1.5 месяца

// ─────────── Клиенты ───────────
export async function createClient(fd: FormData) {
  const fullName = str(fd, "fullName");
  if (!fullName) return;

  const client = await prisma.client.create({
    data: {
      fullName,
      phone: strOrNull(fd, "phone"),
      telegram: strOrNull(fd, "telegram"),
      instagram: strOrNull(fd, "instagram"),
      source: strOrNull(fd, "source"),
      sourceDetail: strOrNull(fd, "sourceDetail"),
      status: str(fd, "status") || "lead",
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
      phone: strOrNull(fd, "phone"),
      telegram: strOrNull(fd, "telegram"),
      instagram: strOrNull(fd, "instagram"),
      source: strOrNull(fd, "source"),
      sourceDetail: strOrNull(fd, "sourceDetail"),
      status: str(fd, "status") || "lead",
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
  const totalLessons = Math.max(1, num(fd, "totalLessons", 4));
  if (!clientId) return;

  const purchasedAt = dateOrNull(fd, "purchasedAt") ?? new Date();
  const termDays = num(fd, "termDays", DEFAULT_TERM_DAYS) || DEFAULT_TERM_DAYS;
  const expiresAt =
    dateOrNull(fd, "expiresAt") ??
    new Date(purchasedAt.getTime() + termDays * DAY);

  await prisma.subscription.create({
    data: {
      clientId,
      type: str(fd, "type") === "online" ? "online" : "offline",
      totalLessons,
      usedLessons: 0,
      pricePerLesson: num(fd, "pricePerLesson", 0),
      purchasedAt,
      expiresAt,
      status: "active",
    },
  });
  // при покупке абонемента клиент становится активным
  await prisma.client.update({
    where: { id: clientId },
    data: { status: "active" },
  });
  revalidatePath(`/clients/${clientId}`);
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
  const sub = await prisma.subscription.findUnique({ where: { id } });
  await prisma.subscription.delete({ where: { id } });
  revalidatePath("/");
  if (sub) {
    revalidatePath(`/clients/${sub.clientId}`);
    redirect(`/clients/${sub.clientId}`);
  }
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

// ─────────── Занятия ───────────
export async function createLesson(fd: FormData) {
  const startsAt = dateOrNull(fd, "startsAt");
  if (!startsAt) return;
  const lesson = await prisma.lesson.create({
    data: {
      title: strOrNull(fd, "title"),
      type: str(fd, "type") === "online" ? "online" : "offline",
      startsAt,
      capacity: num(fd, "capacity", 0) || null,
    },
  });
  revalidatePath("/lessons");
  revalidatePath("/");
  redirect(`/lessons/${lesson.id}`);
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
  // upsert защищает от дублей (уникальный индекс lessonId+clientId)
  await prisma.attendance.upsert({
    where: { lessonId_clientId: { lessonId, clientId } },
    create: { lessonId, clientId, status: "enrolled" },
    update: {},
  });
  revalidatePath(`/lessons/${lessonId}`);
}

export async function unenrollClient(fd: FormData) {
  const id = num(fd, "id");
  const lessonId = num(fd, "lessonId");
  if (!id) return;
  // если запись потребляла занятие — сначала вернём его
  await refundIfConsumed(id);
  await prisma.attendance.delete({ where: { id } });
  revalidatePath(`/lessons/${lessonId}`);
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
    include: { lesson: true },
  });
  if (!att) return;

  // 1. Откатываем прошлое списание, если было
  await refundIfConsumed(id);

  // 2. Если отмечаем «была» — списываем занятие с подходящего абонемента
  let subscriptionId: number | null = null;
  if (next === "present") {
    const now = new Date();
    const subs = await prisma.subscription.findMany({
      where: { clientId: att.clientId, type: att.lesson.type },
    });
    const usable = subs
      .filter((s) => isUsable(s, now) && remaining(s) > 0)
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
    const chosen = usable[0];
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

/** lastVisitAt = дата самого позднего занятия со статусом «была». */
async function recomputeLastVisit(clientId: number) {
  const last = await prisma.attendance.findFirst({
    where: { clientId, status: "present" },
    include: { lesson: true },
    orderBy: { lesson: { startsAt: "desc" } },
  });
  await prisma.client.update({
    where: { id: clientId },
    data: { lastVisitAt: last?.lesson.startsAt ?? null },
  });
}
