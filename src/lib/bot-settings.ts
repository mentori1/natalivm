import { prisma } from "@/lib/db";

export const DEFAULT_BOT_TEXT = {
  welcome:
    "Начните с пробного занятия VUMEXCLUSIVE.\n\nВыберите онлайн или офлайн, посмотрите ближайшие даты и запишитесь в личном кабинете.",
  classes:
    "Вумбилдинг в танцах — это тренировка интимных мышц и мышц тазового дна, которая органично вплетается в танец живота и помогает улучшить контроль над телом.",
  teacher:
    "Наталья — преподаватель VUMEXCLUSIVE. Здесь будет информация о преподавателе, опыте и подходе к занятиям.",
  trainer:
    "🌊 Тренажёр Никитиной «Волна»\n\nПомогает развивать чувствительность, силу и осознанный контроль интимных мышц. Используется в динамическом и статическом темпах на первой ступени ВУМБИЛДИНГА.\n\nБлагодаря мягкому материалу и рельефной форме тренировки проходят комфортно в разных положениях тела.\n\nVUM EXCLUSIVE проводится с тренажёром «Волна» 💗",
};

const LEGACY_TRAINER_TEXT =
  "Тренажёр помогает дополнять практику между занятиями. Подробности о комплектации и покупке можно уточнить у Натальи.";

export async function getBotSettings() {
  const settings = await prisma.botSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      welcomeText: DEFAULT_BOT_TEXT.welcome,
      classesText: DEFAULT_BOT_TEXT.classes,
      teacherText: DEFAULT_BOT_TEXT.teacher,
      trainerText: DEFAULT_BOT_TEXT.trainer,
    },
    update: {},
  });
  if (settings.trainerText === LEGACY_TRAINER_TEXT) {
    return prisma.botSettings.update({
      where: { id: 1 },
      data: { trainerText: DEFAULT_BOT_TEXT.trainer },
    });
  }
  return settings;
}
