"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = "home" | "schedule" | "subscriptions" | "trainer" | "profile" | "payments" | "admin";
type LessonType = "online" | "offline";
type Payment = {
  kind: "booking" | "subscription";
  id: number;
  title: string;
  detail: string;
  amount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  hasReceipt: boolean;
  receiptName: string | null;
  receiptMimeType: string | null;
  clientName?: string;
};
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
  paymentDetails: string;
  payments: Payment[];
  isAdmin: boolean;
  adminPayments: Payment[];
  adminPendingCount: number;
  trainer: { text: string; imageUrl: string };
  generatedAt: string;
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

const PAYMENT_STATUS: Record<string, string> = {
  awaiting_receipt: "Ожидает чек",
  review: "На проверке",
  confirmed: "Подтверждён",
  rejected: "Отклонён",
  expired: "Истёк",
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

function paymentAge(value: string, reference: string) {
  const hours = Math.floor(
    (new Date(reference).getTime() - new Date(value).getTime()) / (60 * 60 * 1000),
  );
  if (hours < 1) return "меньше часа";
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
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
  const [uploadingPayment, setUploadingPayment] = useState("");
  const [adminFilter, setAdminFilter] = useState<"review" | "confirmed" | "rejected">("review");
  const [receiptPreview, setReceiptPreview] = useState<{
    url: string;
    mimeType: string;
    name: string;
  } | null>(null);

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
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function action(
    body: Record<string, unknown>,
    options?: { openPaymentsWhenRequired?: boolean },
  ) {
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
      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        paymentRequired?: boolean;
      };
      if (!response.ok) throw new Error(result.error || "Не удалось выполнить действие");
      setNotice(result.message || "Готово");
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
      await load();
      if (options?.openPaymentsWhenRequired && result.paymentRequired) {
        setTab("payments");
      }
      return result;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось выполнить действие");
    } finally {
      setBusy(false);
    }
    return null;
  }

  async function uploadReceipt(payment: Payment, file: File) {
    const key = `${payment.kind}:${payment.id}`;
    setUploadingPayment(key);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("kind", payment.kind);
      form.set("id", String(payment.id));
      form.set("receipt", file);
      const response = await fetch("/api/miniapp/receipt", {
        method: "POST",
        headers: { "x-telegram-init-data": telegramInitData() },
        body: form,
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось отправить чек");
      setNotice(result.message || "Чек отправлен на проверку");
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось отправить чек");
    } finally {
      setUploadingPayment("");
    }
  }

  async function openReceipt(payment: Payment) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/miniapp/receipt?kind=${payment.kind}&id=${payment.id}`,
        { headers: { "x-telegram-init-data": telegramInitData() }, cache: "no-store" },
      );
      if (!response.ok) throw new Error("Не удалось открыть чек");
      const blob = await response.blob();
      if (receiptPreview) URL.revokeObjectURL(receiptPreview.url);
      setReceiptPreview({
        url: URL.createObjectURL(blob),
        mimeType: payment.receiptMimeType || blob.type,
        name: payment.receiptName || "Чек",
      });
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Не удалось открыть чек");
    } finally {
      setBusy(false);
    }
  }

  function closeReceipt() {
    if (receiptPreview) URL.revokeObjectURL(receiptPreview.url);
    setReceiptPreview(null);
  }

  const filteredLessons = useMemo(
    () => data?.lessons.filter((lesson) => lesson.type === type) || [],
    [data, type],
  );
  const nextBooking = data?.bookings.find((booking) => booking.status === "confirmed");
  const bookedLessonIds = new Set(data?.bookings.map((booking) => booking.lessonId) || []);
  const payablePayments = data?.payments.filter((payment) =>
    ["awaiting_receipt", "rejected"].includes(payment.status),
  ) || [];
  const filteredAdminPayments = data?.adminPayments.filter(
    (payment) => payment.status === adminFilter,
  ) || [];

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
          <div className="flex items-center gap-2">
            {data.isAdmin && (
              <button className="miniapp-admin-shortcut" onClick={() => setTab("admin")}>
                Платежи
                {data.adminPendingCount > 0 && <strong>{data.adminPendingCount}</strong>}
              </button>
            )}
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

            {data.payments.some((payment) =>
              ["awaiting_receipt", "rejected", "review"].includes(payment.status),
            ) && (
              <button className="miniapp-payment-callout" onClick={() => setTab("payments")}>
                <span>
                  <small>Оплата</small>
                  <strong>
                    {payablePayments.length
                      ? "Нужно прикрепить чек"
                      : "Чек находится на проверке"}
                  </strong>
                </span>
                <b>Открыть</b>
              </button>
            )}

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
                      onClick={() => void action(
                        { action: "book", lessonId: lesson.id },
                        { openPaymentsWhenRequired: true },
                      )}
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
                          onClick={() => void action(
                            { action: "subscription", priceItemId: price.id, totalLessons: count },
                            { openPaymentsWhenRequired: true },
                          )}
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

        {tab === "payments" && (
          <section>
            <p className="miniapp-kicker">Оплата</p>
            <h2 className="miniapp-title">Чеки и история</h2>

            {payablePayments.length > 0 && (
              <div className="miniapp-payment-details mt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase opacity-55">Реквизиты</p>
                    <p className="mt-2 whitespace-pre-line font-semibold">{data.paymentDetails}</p>
                  </div>
                  <button
                    className="miniapp-copy-button"
                    onClick={() => {
                      void navigator.clipboard.writeText(data.paymentDetails);
                      setNotice("Реквизиты скопированы");
                    }}
                  >
                    Копировать
                  </button>
                </div>
              </div>
            )}

            {payablePayments.length > 0 && (
              <div className="mt-5 space-y-3">
                {payablePayments.map((payment) => {
                  const key = `${payment.kind}:${payment.id}`;
                  return (
                    <article key={key} className="miniapp-payment-card is-payable">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <span className={`miniapp-payment-status is-${payment.status}`}>
                            {PAYMENT_STATUS[payment.status] || payment.status}
                          </span>
                          <h3 className="mt-2 font-bold">{payment.title}</h3>
                          <p className="mt-1 text-sm opacity-60">{payment.detail}</p>
                        </div>
                        <strong className="shrink-0">{money(payment.amount)}</strong>
                      </div>
                      <label className="miniapp-upload mt-4">
                        {uploadingPayment === key ? "Отправляю..." : payment.status === "rejected" ? "Загрузить новый чек" : "Прикрепить чек"}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          disabled={Boolean(uploadingPayment)}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadReceipt(payment, file);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="mt-7 flex items-end justify-between gap-3">
              <div>
                <p className="miniapp-kicker">Архив</p>
                <h3 className="text-xl font-bold">История платежей</h3>
              </div>
              <span className="text-xs opacity-55">{data.payments.length}</span>
            </div>
            <div className="mt-3 space-y-3">
              {data.payments.length ? data.payments.map((payment) => (
                <article key={`${payment.kind}:${payment.id}`} className="miniapp-payment-card">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className={`miniapp-payment-status is-${payment.status}`}>
                        {PAYMENT_STATUS[payment.status] || payment.status}
                      </span>
                      <h3 className="mt-2 font-bold">{payment.title}</h3>
                      <p className="mt-1 text-sm opacity-60">{payment.detail}</p>
                      <p className="mt-2 text-xs opacity-45">{formatDate(payment.createdAt, true)}</p>
                    </div>
                    <strong className="shrink-0">{money(payment.amount)}</strong>
                  </div>
                  {payment.hasReceipt && (
                    <button
                      disabled={busy}
                      className="miniapp-receipt-button mt-3"
                      onClick={() => void openReceipt(payment)}
                    >
                      Открыть чек
                    </button>
                  )}
                </article>
              )) : <div className="miniapp-empty">Платежей пока не было.</div>}
            </div>
          </section>
        )}

        {tab === "admin" && data.isAdmin && (
          <section>
            <p className="miniapp-kicker">Для преподавателя</p>
            <div className="flex items-end justify-between gap-3">
              <h2 className="miniapp-title">Проверка платежей</h2>
              {data.adminPendingCount > 0 && (
                <span className="miniapp-admin-count">{data.adminPendingCount}</span>
              )}
            </div>
            <div className="miniapp-segment mt-4">
              {([
                ["review", "Ждут"],
                ["confirmed", "Приняты"],
                ["rejected", "Отклонены"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  className={adminFilter === value ? "active" : ""}
                  onClick={() => setAdminFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {filteredAdminPayments.length ? filteredAdminPayments.map((payment) => {
                const overdue = payment.status === "review" &&
                  new Date(data.generatedAt).getTime() - new Date(payment.updatedAt).getTime() >=
                    24 * 60 * 60 * 1000;
                return (
                  <article
                    key={`${payment.kind}:${payment.id}`}
                    className={`miniapp-payment-card ${overdue ? "is-overdue" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`miniapp-payment-status is-${payment.status}`}>
                            {PAYMENT_STATUS[payment.status] || payment.status}
                          </span>
                          {overdue && <span className="miniapp-overdue">Больше суток</span>}
                        </div>
                        <h3 className="mt-2 font-bold">{payment.clientName}</h3>
                        <p className="mt-1 text-sm font-semibold">{payment.title}</p>
                        <p className="mt-1 text-xs opacity-55">{payment.detail}</p>
                        <p className="mt-2 text-xs opacity-45">
                          Получен {paymentAge(payment.updatedAt, data.generatedAt)} назад
                        </p>
                      </div>
                      <strong className="shrink-0">{money(payment.amount)}</strong>
                    </div>
                    <button
                      disabled={busy}
                      className="miniapp-receipt-button mt-4 w-full"
                      onClick={() => void openReceipt(payment)}
                    >
                      Посмотреть чек
                    </button>
                    {payment.status === "review" && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          disabled={busy}
                          className="miniapp-decline-button"
                          onClick={() => void action({
                            action: "reviewPayment",
                            paymentKind: payment.kind,
                            paymentId: payment.id,
                            decision: "reject",
                          })}
                        >
                          Отклонить
                        </button>
                        <button
                          disabled={busy}
                          className="miniapp-approve-button"
                          onClick={() => void action({
                            action: "reviewPayment",
                            paymentKind: payment.kind,
                            paymentId: payment.id,
                            decision: "approve",
                          })}
                        >
                          Подтвердить
                        </button>
                      </div>
                    )}
                  </article>
                );
              }) : <div className="miniapp-empty">В этом разделе платежей нет.</div>}
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
            <button
              className="miniapp-profile-link mt-3 w-full"
              onClick={() => setTab("payments")}
            >
              <span>История платежей</span>
              <strong>{data.payments.length}</strong>
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

      {receiptPreview && (
        <div className="miniapp-receipt-modal" role="dialog" aria-modal="true">
          <div className="miniapp-receipt-sheet">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <strong className="truncate">{receiptPreview.name}</strong>
              <button onClick={closeReceipt} aria-label="Закрыть чек">Закрыть</button>
            </div>
            {receiptPreview.mimeType === "application/pdf" ? (
              <iframe src={receiptPreview.url} title={receiptPreview.name} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receiptPreview.url} alt={receiptPreview.name} />
            )}
          </div>
        </div>
      )}
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
