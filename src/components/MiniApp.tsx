"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = "home" | "schedule" | "subscriptions" | "trainer" | "profile";
type LessonType = "online" | "offline";
type PortalData = {
  user: { firstName: string; photoUrl: string | null; username: string | null };
  client: { id: number; fullName: string; telegram: string | null };
  subscriptions: Array<{
    id: number;
    type: string;
    format: string;
    name: string;
    totalLessons: number;
    usedLessons: number;
    remaining: number;
    expiresAt: string;
    status: string;
    frozen: boolean;
  }>;
  lessons: Array<{
    id: number;
    title: string;
    type: LessonType;
    startsAt: string;
    free: number | null;
  }>;
  bookings: Array<{
    id: number;
    lessonId: number;
    status: string;
    kind: string;
    amount: number;
    startsAt: string;
    type: LessonType;
    title: string;
  }>;
  prices: Array<{
    id: number;
    name: string;
    type: LessonType;
    kind: string;
    format: string;
    price: number;
    minLessons: number;
    purchasable: boolean;
  }>;
  preferences: { preferredType: string; preferredWeekdays: number[] };
  paymentReady: boolean;
  trainer: { text: string; imageUrl: string };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        colorScheme: "light" | "dark";
        ready(): void;
        expand(): void;
        setHeaderColor(color: string): void;
        setBackgroundColor(color: string): void;
        setBottomBarColor?(color: string): void;
        HapticFeedback?: { impactOccurred(style: string): void };
      };
    };
  }
}

const WEEKDAYS = [
  { id: 1, short: "Пн" },
  { id: 2, short: "Вт" },
  { id: 3, short: "Ср" },
  { id: 4, short: "Чт" },
  { id: 5, short: "Пт" },
  { id: 6, short: "Сб" },
  { id: 7, short: "Вс" },
];

const STATUS: Record<string, string> = {
  active: "Активен",
  ending: "Скоро закончится",
  frozen: "Заморожен",
  finished_lessons: "Занятия закончились",
  finished_term: "Срок закончился",
};

function formatDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function telegramInitData() {
  return window.Telegram?.WebApp?.initData || "";
}

export function MiniApp() {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [type, setType] = useState<LessonType>("online");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [preferredType, setPreferredType] = useState("both");
  const [lessonCounts, setLessonCounts] = useState<Record<number, number>>({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/miniapp", {
        headers: { "x-telegram-init-data": telegramInitData() },
        cache: "no-store",
      });
      const result = (await response.json()) as PortalData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось открыть кабинет");
      setData(result);
      setWeekdays(result.preferences.preferredWeekdays);
      setPreferredType(result.preferences.preferredType);
      setLessonCounts(
        Object.fromEntries(result.prices.map((price) => [price.id, price.minLessons])),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось открыть кабинет");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready();
    webApp?.expand();
    webApp?.setHeaderColor("#f6e6ea");
    webApp?.setBackgroundColor("#f6e6ea");
    webApp?.setBottomBarColor?.("#f6e6ea");
    void load();
  }, []);

  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/miniapp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-init-data": telegramInitData(),
        },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось выполнить действие");
      setNotice(result.message || "Готово");
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось выполнить действие");
    } finally {
      setBusy(false);
    }
  }

  const filteredLessons = useMemo(
    () => data?.lessons.filter((lesson) => lesson.type === type) || [],
    [data, type],
  );
  const nextBooking = data?.bookings.find((booking) => booking.status === "confirmed");
  const bookedLessonIds = new Set(data?.bookings.map((booking) => booking.lessonId) || []);

  if (loading) {
    return (
      <main className="miniapp-shell grid min-h-[100dvh] place-items-center px-6">
        <div className="miniapp-loader" aria-label="Загрузка" />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="miniapp-shell grid min-h-[100dvh] place-items-center px-6 text-center">
        <div>
          <p className="text-xl font-bold">Не удалось открыть кабинет</p>
          <p className="mt-2 text-sm opacity-70">{error}</p>
          <button className="miniapp-primary mt-5" onClick={() => void load()}>
            Попробовать снова
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="miniapp-shell min-h-[100dvh] pb-28">
      <header className="px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-55">
              VUMEXCLUSIVE
            </p>
            <h1 className="mt-1 text-2xl font-bold">{data.user.firstName}, добрый день</h1>
          </div>
          <div className="miniapp-avatar">
            {data.user.photoUrl ? (
              // Telegram выдаёт эту фотографию только при разрешённых настройках приватности.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.user.photoUrl} alt="Фото профиля" />
            ) : (
              data.client.fullName.slice(0, 1).toUpperCase()
            )}
          </div>
        </div>
      </header>

      {(error || notice) && (
        <div className={`miniapp-alert mx-5 mb-4 ${error ? "is-error" : ""}`}>
          {error || notice}
        </div>
      )}

      <div className="px-5">
        {tab === "home" && (
          <div className="space-y-6">
            <section className="miniapp-hero">
              <div className="miniapp-hero-glass">
                <p className="text-xs font-semibold uppercase opacity-60">Ближайшее занятие</p>
                {nextBooking ? (
                  <>
                    <p className="mt-3 text-3xl font-bold">{formatDate(nextBooking.startsAt, true)}</p>
                    <p className="mt-1 opacity-75">
                      {nextBooking.type === "online" ? "Онлайн" : "Офлайн"} · {nextBooking.title}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-2xl font-bold">Пока ничего не запланировано</p>
                    <button
                      className="miniapp-hero-button mt-5"
                      onClick={() => setTab("schedule")}
                    >
                      Выбрать занятие
                    </button>
                  </>
                )}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <p className="miniapp-kicker">Абонементы</p>
                  <h2 className="miniapp-title">Ваш баланс</h2>
                </div>
                <button className="miniapp-link" onClick={() => setTab("subscriptions")}>
                  Все тарифы
                </button>
              </div>
              {data.subscriptions.length ? (
                <div className="space-y-3">
                  {data.subscriptions.slice(0, 2).map((subscription) => (
                    <SubscriptionCard key={subscription.id} subscription={subscription} />
                  ))}
                </div>
              ) : (
                <div className="miniapp-empty">Абонемента пока нет. Начните с пробного занятия.</div>
              )}
            </section>

            <button className="miniapp-primary w-full" onClick={() => setTab("schedule")}>
              Записаться на занятие
            </button>
          </div>
        )}

        {tab === "schedule" && (
          <section>
            <p className="miniapp-kicker">Расписание</p>
            <h2 className="miniapp-title">Выберите занятие</h2>
            <div className="miniapp-segment mt-4">
              <button className={type === "online" ? "active" : ""} onClick={() => setType("online")}>Онлайн</button>
              <button className={type === "offline" ? "active" : ""} onClick={() => setType("offline")}>Офлайн</button>
            </div>
            <div className="mt-4 space-y-3">
              {filteredLessons.length ? filteredLessons.map((lesson) => {
                const booked = bookedLessonIds.has(lesson.id);
                return (
                  <article key={lesson.id} className="miniapp-row">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{formatDate(lesson.startsAt, true)}</p>
                      <p className="mt-1 truncate text-sm opacity-60">{lesson.title}</p>
                      {lesson.free !== null && lesson.free <= 3 && (
                        <p className="mt-1 text-xs font-semibold text-[var(--mini-accent)]">
                          Осталось {lesson.free} {lesson.free === 1 ? "место" : "места"}
                        </p>
                      )}
                    </div>
                    <button
                      disabled={busy || booked}
                      className="miniapp-small-button"
                      onClick={() => void action({ action: "book", lessonId: lesson.id })}
                    >
                      {booked ? "Записаны" : "Выбрать"}
                    </button>
                  </article>
                );
              }) : <div className="miniapp-empty">Ближайших занятий этого формата пока нет.</div>}
            </div>
          </section>
        )}

        {tab === "subscriptions" && (
          <section>
            <p className="miniapp-kicker">Абонементы</p>
            <h2 className="miniapp-title">Купить или продлить</h2>
            {data.subscriptions.length > 0 && (
              <div className="mt-4 space-y-3">
                {data.subscriptions.map((subscription) => (
                  <SubscriptionCard key={subscription.id} subscription={subscription} />
                ))}
              </div>
            )}
            <div className="mt-6 space-y-3">
              {data.prices.map((price) => {
                const count = lessonCounts[price.id] || price.minLessons;
                return (
                  <article key={price.id} className="miniapp-price">
                    <div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="miniapp-type">{price.type === "online" ? "Онлайн" : "Офлайн"}</span>
                        <span className="miniapp-type is-muted">
                          {price.format === "individual" ? "Индивидуально" : "Группа"}
                        </span>
                      </div>
                      <h3 className="mt-2 font-bold">{price.name}</h3>
                      <p className="mt-1 text-sm opacity-60">
                        {money(price.price)}
                        {price.kind === "subscription" ? " за занятие" : ""}
                      </p>
                    </div>
                    {price.purchasable && (
                      <div className="mt-5 flex items-center justify-between gap-3">
                        <div className="miniapp-stepper">
                          <button onClick={() => setLessonCounts((old) => ({ ...old, [price.id]: Math.max(price.minLessons, count - 1) }))}>−</button>
                          <span>{count}</span>
                          <button onClick={() => setLessonCounts((old) => ({ ...old, [price.id]: count + 1 }))}>+</button>
                        </div>
                        <button
                          disabled={busy}
                          className="miniapp-small-button"
                          onClick={() => void action({ action: "subscription", priceItemId: price.id, totalLessons: count })}
                        >
                          Купить · {money(price.price * count)}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {tab === "profile" && (
          <section>
            <p className="miniapp-kicker">Личный кабинет</p>
            <h2 className="miniapp-title">Удобные дни</h2>
            <p className="mt-2 text-sm opacity-65">
              Отметьте формат и дни, когда вам обычно удобно заниматься.
            </p>
            <div className="miniapp-segment mt-5">
              {[["both", "Любой"], ["online", "Онлайн"], ["offline", "Офлайн"]].map(([value, label]) => (
                <button key={value} className={preferredType === value ? "active" : ""} onClick={() => setPreferredType(value)}>{label}</button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((day) => (
                <button
                  key={day.id}
                  className={`miniapp-day ${weekdays.includes(day.id) ? "active" : ""}`}
                  onClick={() => setWeekdays((old) => old.includes(day.id) ? old.filter((id) => id !== day.id) : [...old, day.id])}
                >
                  {day.short}
                </button>
              ))}
            </div>
            <button
              disabled={busy}
              className="miniapp-primary mt-6 w-full"
              onClick={() => void action({ action: "preferences", preferredType, preferredWeekdays: weekdays })}
            >
              Сохранить
            </button>
            <div className="miniapp-profile mt-6">
              <div>
                <p className="text-xs opacity-55">Карточка CRM</p>
                <p className="mt-1 font-bold">{data.client.fullName}</p>
              </div>
              <span className="text-sm opacity-60">{data.client.telegram}</span>
            </div>
          </section>
        )}

        {tab === "trainer" && (
          <section>
            <p className="miniapp-kicker">Практика</p>
            <h2 className="miniapp-title">Тренажёр «Волна»</h2>
            <div className="miniapp-trainer-photo mt-4">
              {/* Изображение хранится в проекте и не зависит от Telegram CDN. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.trainer.imageUrl} alt="Тренажёр Волна" />
            </div>
            <div className="miniapp-trainer-copy mt-4 whitespace-pre-line">
              {data.trainer.text}
            </div>
          </section>
        )}
      </div>

      <nav className="miniapp-nav" aria-label="Разделы личного кабинета">
        {([
          ["home", "Главная", "⌂"],
          ["schedule", "Запись", "◷"],
          ["subscriptions", "Абонемент", "◇"],
          ["trainer", "Тренажёр", "∿"],
          ["profile", "Профиль", "○"],
        ] as Array<[Tab, string, string]>).map(([value, label, icon]) => (
          <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
            <span aria-hidden="true">{icon}</span>
            <small>{label}</small>
          </button>
        ))}
      </nav>
    </main>
  );
}

function SubscriptionCard({ subscription }: { subscription: PortalData["subscriptions"][number] }) {
  const progress = subscription.totalLessons
    ? Math.min(100, Math.round((subscription.usedLessons / subscription.totalLessons) * 100))
    : 0;
  return (
    <article className="miniapp-subscription">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="miniapp-type">{subscription.type === "online" ? "Онлайн" : "Офлайн"}</span>
          <h3 className="mt-2 font-bold">{subscription.name}</h3>
        </div>
        <strong className="text-xl">{subscription.remaining}</strong>
      </div>
      <div className="miniapp-progress mt-4"><span style={{ width: `${progress}%` }} /></div>
      <div className="mt-2 flex justify-between text-xs opacity-60">
        <span>{STATUS[subscription.status] || subscription.status}</span>
        <span>до {formatDate(subscription.expiresAt)}</span>
      </div>
    </article>
  );
}
