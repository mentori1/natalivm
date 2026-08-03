import { prisma } from "@/lib/db";

export const BOT_CONTENT_GROUPS = [
  { key: "profile", label: "Профиль и пост в канале" },
  { key: "menu", label: "Главное меню" },
  { key: "booking", label: "Запись на занятие" },
  { key: "subscription", label: "Подписка на канал" },
  { key: "lessons", label: "Мои занятия" },
  { key: "prices", label: "Прайс" },
  { key: "payment", label: "Оплата" },
  { key: "reminders", label: "Напоминания" },
] as const;

type ContentDefinition = {
  key: string;
  group: (typeof BOT_CONTENT_GROUPS)[number]["key"];
  label: string;
  defaultValue: string;
  kind?: "button" | "text";
  hint?: string;
};

export const BOT_CONTENT_DEFINITIONS = [
  {
    key: "botProfileDescription",
    group: "profile",
    label: "Описание до нажатия «Старт»",
    defaultValue:
      "Официальный бот VUMEXCLUSIVE. Здесь можно посмотреть расписание, записаться на онлайн- и офлайн-занятия, проверить свои записи и узнать стоимость.",
    hint: "Показывается в пустом чате с ботом. До 512 символов.",
  },
  {
    key: "botShortDescription",
    group: "profile",
    label: "Короткое описание профиля",
    defaultValue: "Расписание и запись на занятия VUMEXCLUSIVE",
    hint: "Показывается в профиле и при отправке ссылки. До 120 символов.",
  },
  {
    key: "channelPostText",
    group: "profile",
    label: "Текст закреплённого поста",
    defaultValue:
      "VUMEXCLUSIVE\n\nЗапись на групповые онлайн- и офлайн-занятия, актуальное расписание и подтверждение оплаты — в официальном боте.\n\nНажмите кнопку ниже, чтобы выбрать занятие.",
  },
  {
    key: "channelPostButton",
    group: "profile",
    label: "Кнопка под постом",
    defaultValue: "Записаться",
    kind: "button",
  },
  {
    key: "buttonBook",
    group: "menu",
    label: "Кнопка записи",
    defaultValue: "Записаться",
    kind: "button",
  },
  {
    key: "buttonMyLessons",
    group: "menu",
    label: "Кнопка моих занятий",
    defaultValue: "Мои занятия",
    kind: "button",
  },
  {
    key: "buttonPrices",
    group: "menu",
    label: "Кнопка прайса",
    defaultValue: "Цены",
    kind: "button",
  },
  {
    key: "buttonTrainer",
    group: "menu",
    label: "Кнопка тренажёра",
    defaultValue: "Тренажёр",
    kind: "button",
  },
  {
    key: "inputPlaceholder",
    group: "menu",
    label: "Подсказка в строке ввода",
    defaultValue: "Выберите раздел",
    kind: "button",
  },
  {
    key: "unknownMessage",
    group: "menu",
    label: "Ответ на неизвестное сообщение",
    defaultValue: "Выберите нужный раздел кнопкой ниже.",
  },
  {
    key: "chooseFormat",
    group: "booking",
    label: "Выбор формата",
    defaultValue:
      "🌸 Выберите удобный формат занятий:\n\n💻 Онлайн — тренируйтесь из любой точки\n✨ Офлайн — персональная работа в студии\n\nКакой формат вам подходит?",
  },
  {
    key: "buttonOnline",
    group: "booking",
    label: "Кнопка онлайн",
    defaultValue: "Онлайн",
    kind: "button",
  },
  {
    key: "buttonOffline",
    group: "booking",
    label: "Кнопка офлайн",
    defaultValue: "Офлайн",
    kind: "button",
  },
  {
    key: "buttonBack",
    group: "booking",
    label: "Кнопка назад",
    defaultValue: "Назад",
    kind: "button",
  },
  {
    key: "buttonMenu",
    group: "booking",
    label: "Кнопка возврата в меню",
    defaultValue: "В меню",
    kind: "button",
  },
  {
    key: "scheduleTitle",
    group: "booking",
    label: "Заголовок расписания",
    defaultValue: "Выберите групповое {{format}}-занятие:",
    hint: "{{format}} — онлайн или офлайн",
  },
  {
    key: "noAvailableLessons",
    group: "booking",
    label: "Нет доступных занятий",
    defaultValue:
      "Сейчас нет доступных групповых {{format}}-занятий. Загляните позже или напишите Наталье.",
    hint: "{{format}} — онлайн или офлайн",
  },
  {
    key: "scarcity",
    group: "booking",
    label: "Осталось мало мест",
    defaultValue: "осталось {{count}} {{places}}",
    hint: "{{count}} — число, {{places}} — место/места",
  },
  {
    key: "holdExpired",
    group: "booking",
    label: "Бронь истекла",
    defaultValue:
      "Время брони истекло, поэтому место освобождено. Выберите занятие заново, если запись ещё актуальна.",
  },
  {
    key: "lessonUnavailable",
    group: "booking",
    label: "Занятие недоступно",
    defaultValue: "Это занятие уже недоступно.",
  },
  {
    key: "barterBooking",
    group: "booking",
    label: "Ответ бартерному клиенту",
    defaultValue:
      "Ваши занятия Наталья добавляет вручную. Напишите ей, пожалуйста, чтобы выбрать дату.",
  },
  {
    key: "priceMissing",
    group: "booking",
    label: "Для формата нет цены",
    defaultValue:
      "Для этого формата пока не задана цена. Наталья свяжется с вами и уточнит запись.",
  },
  {
    key: "lastPlaceTaken",
    group: "booking",
    label: "Последнее место заняли",
    defaultValue:
      "На это занятие только что заняли последнее место. Выберите другой вариант.",
  },
  {
    key: "subscriptionBooked",
    group: "booking",
    label: "Запись по абонементу",
    defaultValue:
      "Вы записаны по действующему абонементу: {{date}}, {{format}}.",
    hint: "{{date}}, {{format}}",
  },
  {
    key: "alreadyBooked",
    group: "booking",
    label: "Клиент уже записан",
    defaultValue: "Вы уже записаны: {{date}}, {{format}}.",
    hint: "{{date}}, {{format}}",
  },
  {
    key: "bookingCancelled",
    group: "booking",
    label: "Бронь отменена",
    defaultValue: "Бронь отменена.",
  },
  {
    key: "buttonCancelBooking",
    group: "booking",
    label: "Кнопка отмены брони",
    defaultValue: "Отменить бронь",
    kind: "button",
  },
  {
    key: "subscriptionPrompt",
    group: "subscription",
    label: "Просьба подписаться",
    defaultValue:
      "Перед записью подпишитесь на канал VUMEXCLUSIVE, затем нажмите «Проверить подписку».",
  },
  {
    key: "buttonSubscribe",
    group: "subscription",
    label: "Кнопка подписки",
    defaultValue: "Подписаться на канал",
    kind: "button",
  },
  {
    key: "buttonCheckSubscription",
    group: "subscription",
    label: "Кнопка проверки",
    defaultValue: "Проверить подписку",
    kind: "button",
  },
  {
    key: "subscriptionConfirmed",
    group: "subscription",
    label: "Подписка подтверждена",
    defaultValue:
      "Подписка подтверждена. Теперь можно выбрать формат занятия.",
  },
  {
    key: "myLessonsFirst",
    group: "lessons",
    label: "Клиент ещё не записывался",
    defaultValue:
      "У вас пока нет записей. Нажмите «{{bookButton}}», чтобы выбрать первое занятие.",
    hint: "{{bookButton}} — название кнопки записи",
  },
  {
    key: "myLessonsTitle",
    group: "lessons",
    label: "Заголовок списка",
    defaultValue:
      "🗓 Здесь собраны ваши записи и ближайшие тренировки.\n\nВаши ближайшие занятия:",
  },
  {
    key: "myLessonsEmpty",
    group: "lessons",
    label: "Нет будущих занятий",
    defaultValue: "У вас нет предстоящих занятий.",
  },
  {
    key: "receiptReviewStatus",
    group: "lessons",
    label: "Статус проверки чека",
    defaultValue: "Чек проверяется",
  },
  {
    key: "receiptAwaitingStatus",
    group: "lessons",
    label: "Статус ожидания чека",
    defaultValue: "Ожидается чек",
  },
  {
    key: "pricesCaption",
    group: "prices",
    label: "Подпись под картинкой",
    defaultValue: "Выберите подходящий вариант, и я помогу записаться 💗",
  },
  {
    key: "paymentMissing",
    group: "payment",
    label: "Реквизиты не настроены",
    defaultValue:
      "Реквизиты ещё не настроены. Наталья свяжется с вами для завершения записи.",
  },
  {
    key: "paymentInstructions",
    group: "payment",
    label: "Инструкция по оплате",
    defaultValue:
      "Вы выбрали: {{date}}, {{format}}.\n\nТариф: {{tariff}}\nК оплате: {{amount}} ₽\n\nРеквизиты:\n{{paymentDetails}}\n\nМесто удерживается {{holdMinutes}} минут. После оплаты отправьте сюда чек в PDF или фотографией.",
    hint:
      "{{date}}, {{format}}, {{tariff}}, {{amount}}, {{paymentDetails}}, {{holdMinutes}}",
  },
  {
    key: "receiptWithoutBooking",
    group: "payment",
    label: "Чек без активной брони",
    defaultValue:
      "Активной брони не найдено. Сначала выберите занятие в меню.",
  },
  {
    key: "receiptReceived",
    group: "payment",
    label: "Чек получен",
    defaultValue:
      "Чек получен и отправлен на проверку. После подтверждения вам придёт сообщение о записи.",
  },
  {
    key: "buttonApprove",
    group: "payment",
    label: "Кнопка подтверждения оплаты",
    defaultValue: "Подтвердить",
    kind: "button",
  },
  {
    key: "buttonReject",
    group: "payment",
    label: "Кнопка отклонения оплаты",
    defaultValue: "Отклонить",
    kind: "button",
  },
  {
    key: "paymentConfirmed",
    group: "payment",
    label: "Оплата подтверждена",
    defaultValue:
      "Оплата подтверждена. Вы записаны: {{date}}, {{format}}.\n\nНапоминания придут за 3 часа и за 1 час до начала.",
    hint: "{{date}}, {{format}}",
  },
  {
    key: "paymentUnavailable",
    group: "payment",
    label: "Не удалось подтвердить запись",
    defaultValue:
      "Не удалось подтвердить запись: занятие уже недоступно. Оплата не засчитана, Наталья свяжется с вами.",
  },
  {
    key: "paymentRejected",
    group: "payment",
    label: "Чек отклонён",
    defaultValue:
      "Платёж пока не подтверждён. Проверьте чек и отправьте корректный PDF или фотографию ещё раз.",
  },
  {
    key: "reminder3h",
    group: "reminders",
    label: "Напоминание за 3 часа",
    defaultValue:
      "Напоминаю: через 3 часа занятие — {{date}}, {{format}}.",
    hint: "{{date}}, {{format}}",
  },
  {
    key: "reminder1h",
    group: "reminders",
    label: "Напоминание за 1 час",
    defaultValue:
      "До занятия остался 1 час. Начало: {{date}}.{{place}}",
    hint: "{{date}}, {{place}} — ссылка или адрес",
  },
  {
    key: "meetingLink",
    group: "reminders",
    label: "Блок ссылки",
    defaultValue: "\n\nСсылка на занятие:\n{{value}}",
    hint: "{{value}} — ссылка",
  },
  {
    key: "meetingAddress",
    group: "reminders",
    label: "Блок адреса",
    defaultValue: "\n\nАдрес:\n{{value}}",
    hint: "{{value}} — адрес",
  },
] satisfies ContentDefinition[];

export type BotCopy = {
  text: (key: string, variables?: Record<string, string | number>) => string;
};

const defaults = new Map(
  BOT_CONTENT_DEFINITIONS.map((definition) => [
    definition.key,
    definition.defaultValue,
  ]),
);

function render(template: string, variables: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    variables[key] === undefined ? match : String(variables[key]),
  );
}

export function defaultBotContent(key: string) {
  return defaults.get(key) ?? key;
}

export async function getBotContentValues() {
  const rows = await prisma.botContent.findMany();
  return new Map(rows.map((row) => [row.key, row.value]));
}

export async function getBotCopy(): Promise<BotCopy> {
  const values = await getBotContentValues();
  return {
    text(key, variables = {}) {
      return render(values.get(key) || defaultBotContent(key), variables);
    },
  };
}
