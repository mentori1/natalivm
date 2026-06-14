import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);
const daysAhead = (n: number) => new Date(now.getTime() + n * DAY);
/** Занятие сегодня в указанный час по местному времени */
const todayAt = (hour: number, minute = 0) => {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  return d;
};

async function main() {
  // Полная очистка ради идемпотентности сидера
  await prisma.attendance.deleteMany();
  await prisma.note.deleteMany();
  await prisma.clientGoal.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.client.deleteMany();
  await prisma.expense.deleteMany();

  // 1. Наталья — активна, в абонементе осталось 1 занятие → «пора продлевать»
  const natalia = await prisma.client.create({
    data: {
      fullName: "Наталья Соколова",
      phone: "+7 916 111-22-33",
      telegram: "@natalia_s",
      source: "Instagram",
      status: "active",
      request: "Хочет увереннее двигаться в паре, готовится к свадьбе",
      recommendations: "Беречь поясницу — не давать сильную нагрузку на прогибы",
      firstContact: daysAgo(95),
      lastVisitAt: daysAgo(3),
      subscriptions: {
        create: {
          type: "offline",
          totalLessons: 10,
          usedLessons: 9,
          pricePerLesson: 1500,
          purchasedAt: daysAgo(38),
          expiresAt: daysAhead(7),
          status: "active",
        },
      },
      goals: { create: [{ text: "Уверенность в паре" }, { text: "Работа с телом" }] },
      notes: {
        create: [
          { body: "После последнего занятия стала свободнее в бёдрах, меньше зажима в плечах." },
        ],
      },
    },
  });

  // 2. Анна — активна, абонемент кончается по сроку через 5 дней
  const anna = await prisma.client.create({
    data: {
      fullName: "Анна Кузнецова",
      phone: "+7 925 444-55-66",
      telegram: "@anna_k",
      source: "Сарафан",
      status: "active",
      request: "Раскрытие женственности, снять зажатость",
      firstContact: daysAgo(60),
      lastVisitAt: daysAgo(4),
      subscriptions: {
        create: {
          type: "offline",
          totalLessons: 8,
          usedLessons: 3,
          pricePerLesson: 1500,
          purchasedAt: daysAgo(40),
          expiresAt: daysAhead(5),
          status: "active",
        },
      },
      goals: { create: [{ text: "Раскрытие сексуальности" }] },
    },
  });

  // 3. Мария — была на пробном 14 дней назад, ничего не купила
  const maria = await prisma.client.create({
    data: {
      fullName: "Мария Иванова",
      phone: "+7 903 777-88-99",
      instagram: "maria.dance",
      source: "Реклама",
      status: "trial",
      request: "Попробовать, давно хотела начать танцевать",
      firstContact: daysAgo(14),
      lastVisitAt: daysAgo(14),
      goals: { create: [{ text: "Физическая активность" }] },
    },
  });

  // 4. Ольга — активна по абонементу, но не приходила 35 дней → «пропала»
  const olga = await prisma.client.create({
    data: {
      fullName: "Ольга Петрова",
      phone: "+7 915 222-33-44",
      telegram: "@olga_p",
      source: "Instagram",
      status: "active",
      request: "Восстановиться после расставания, вернуть себе тело",
      firstContact: daysAgo(120),
      lastVisitAt: daysAgo(35),
      subscriptions: {
        create: {
          type: "offline",
          totalLessons: 12,
          usedLessons: 6,
          pricePerLesson: 1500,
          purchasedAt: daysAgo(50),
          expiresAt: daysAhead(20),
          status: "active",
        },
      },
      notes: { create: [{ body: "Пропала после интенсива. Написать, узнать как дела." }] },
    },
  });

  // 5. Ирина — образцовый активный клиент, два абонемента: онлайн + офлайн
  const irina = await prisma.client.create({
    data: {
      fullName: "Ирина Волкова",
      phone: "+7 909 555-66-77",
      telegram: "@irina_v",
      source: "Сарафан",
      status: "active",
      request: "Регулярная практика, уверенность в себе",
      firstContact: daysAgo(200),
      lastVisitAt: daysAgo(2),
      subscriptions: {
        create: [
          {
            type: "offline",
            totalLessons: 10,
            usedLessons: 4,
            pricePerLesson: 1500,
            purchasedAt: daysAgo(15),
            expiresAt: daysAhead(30),
            status: "active",
          },
          {
            type: "online",
            totalLessons: 8,
            usedLessons: 2,
            pricePerLesson: 1200,
            purchasedAt: daysAgo(10),
            expiresAt: daysAhead(35),
            status: "active",
          },
        ],
      },
      goals: { create: [{ text: "Уверенность в себе" }, { text: "Отношения" }] },
    },
  });

  // 6. Светлана — бартер
  const svetlana = await prisma.client.create({
    data: {
      fullName: "Светлана Морозова",
      telegram: "@sveta_m",
      source: "Бартер (фотограф)",
      status: "barter",
      request: "Съёмка в обмен на занятия",
      firstContact: daysAgo(25),
      lastVisitAt: daysAgo(6),
      subscriptions: {
        create: {
          type: "offline",
          totalLessons: 8,
          usedLessons: 1,
          pricePerLesson: 0,
          purchasedAt: daysAgo(20),
          expiresAt: daysAhead(25),
          status: "active",
        },
      },
    },
  });

  // 7. Екатерина — абонемент закончился (по занятиям и по сроку)
  await prisma.client.create({
    data: {
      fullName: "Екатерина Новикова",
      phone: "+7 917 888-11-22",
      telegram: "@kate_n",
      source: "Instagram",
      status: "expired",
      request: "Хотела похудеть и подтянуть тело",
      firstContact: daysAgo(150),
      lastVisitAt: daysAgo(12),
      subscriptions: {
        create: {
          type: "offline",
          totalLessons: 8,
          usedLessons: 8,
          pricePerLesson: 1500,
          purchasedAt: daysAgo(60),
          expiresAt: daysAgo(10),
          status: "finished_lessons",
        },
      },
      notes: { create: [{ body: "Допродать новый абонемент — была довольна результатом." }] },
    },
  });

  // Занятие сегодня 19:00 — записаны 5 человек
  const todayLesson = await prisma.lesson.create({
    data: {
      title: "Оффлайн группа",
      type: "offline",
      startsAt: todayAt(19),
      capacity: 8,
    },
  });
  for (const c of [natalia, anna, olga, irina, svetlana]) {
    await prisma.attendance.create({
      data: { lessonId: todayLesson.id, clientId: c.id, status: "enrolled" },
    });
  }

  // Онлайн-занятие завтра 11:00
  const tomorrow11 = todayAt(11);
  tomorrow11.setDate(tomorrow11.getDate() + 1);
  await prisma.lesson.create({
    data: {
      title: "Онлайн группа",
      type: "online",
      startsAt: tomorrow11,
      capacity: 12,
      attendances: { create: [{ clientId: irina.id, status: "enrolled" }] },
    },
  });

  // Расход — аренда зала за месяц
  await prisma.expense.create({
    data: { title: "Аренда зала", amount: 25000, category: "аренда", date: daysAgo(5) },
  });

  await prisma.expense.create({
    data: { title: "Таргет Instagram", amount: 8000, category: "реклама", date: daysAgo(8) },
  });

  const clients = await prisma.client.count();
  const subs = await prisma.subscription.count();
  console.log(`✅ Засеяно: ${clients} клиентов, ${subs} абонементов, 2 занятия, 2 расхода`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
