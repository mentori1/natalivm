"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Tab = "home" | "schedule" | "subscriptions" | "trainer" | "profile" | "payments" | "admin";
type LessonType = "online" | "offline";
type MiniNavTab = Exclude<Tab, "payments" | "admin">;
type Payment = {
  kind: "booking" | "subscription" | "trainer";
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
    scheduledLessons: number;
  }>;
  bookingCredits: Array<{
    id: number;
    title: string;
    kind: string;
    type: LessonType;
    expiresAt: string;
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
  scheduledLessons: Array<{
    attendanceId: number;
    lessonId: number;
    startsAt: string;
    type: LessonType;
    format: "group" | "individual";
    title: string;
    plannedSubscriptionId: number | null;
  }>;
  prices: Array<{
    id: number;
    name: string;
    type: LessonType;
    kind: string;
    format: string;
    price: number;
    minLessons: number;
    requiresLesson: boolean;
  }>;
  trialCrossSell: { priceItemId: number; price: number } | null;
  preferences: { preferredType: string; preferredWeekdays: number[] };
  paymentReady: boolean;
  paymentDetails: string;
  payments: Payment[];
  isAdmin: boolean;
  adminPayments: Payment[];
  adminPendingCount: number;
  trainer: {
    text: string;
    imageUrl: string;
    hasTrainer: boolean;
    price: number;
    orderStatus: string | null;
  };
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

const MINIAPP_NAV: Array<[MiniNavTab, string, string]> = [
  ["subscriptions", "Абонемент", "◇"],
  ["schedule", "Запись", "◷"],
  ["home", "Главная", "⌂"],
  ["trainer", "Тренажёр", "∿"],
  ["profile", "Профиль", "○"],
];

type NavLens = {
  x: number;
  y: number;
  width: number;
  height: number;
  ready: boolean;
  dragging: boolean;
};

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
  credit: "В запасе",
};

const PRICE_KIND_ORDER: Record<string, number> = {
  trial: 0,
  single: 1,
  subscription: 2,
};

function formatDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function formatScheduleDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function dateTimeInput(value?: string) {
  if (value) return new Date(value).toISOString().slice(0, 16);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value || 0);
  const date = new Date(Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
  ));
  date.setUTCMinutes(Math.ceil(date.getUTCMinutes() / 30) * 30, 0, 0);
  return date.toISOString().slice(0, 16);
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
  const [priceType, setPriceType] = useState<LessonType>("online");
  const [priceFormat, setPriceFormat] = useState<"group" | "individual">("group");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [preferredType, setPreferredType] = useState("both");
  const [lessonCounts, setLessonCounts] = useState<Record<number, number>>({});
  const [uploadingPayment, setUploadingPayment] = useState("");
  const [adminFilter, setAdminFilter] = useState<"review" | "confirmed" | "rejected">("review");
  const [individualDates, setIndividualDates] = useState<Record<number, string>>({});
  const [editDates, setEditDates] = useState<Record<number, string>>({});
  const [editingLesson, setEditingLesson] = useState<number | null>(null);
  const [transferTargets, setTransferTargets] = useState<Record<number, number>>({});
  const [highlightedLessonId, setHighlightedLessonId] = useState<number | null>(null);
  const [selectedBookingPriceId, setSelectedBookingPriceId] = useState<number | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{
    url: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const miniNavRef = useRef<HTMLElement>(null);
  const miniNavButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const navDragRef = useRef<{
    pointerId: number;
    startX: number;
    moved: boolean;
  } | null>(null);
  const suppressNavClickRef = useRef(false);
  const [dragNavIndex, setDragNavIndex] = useState<number | null>(null);
  const [navLens, setNavLens] = useState<NavLens>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    ready: false,
    dragging: false,
  });

  const activeNavTab: MiniNavTab = tab === "payments" ? "profile" :
    tab === "admin" ? "home" : tab;
  const activeNavIndex = Math.max(
    0,
    MINIAPP_NAV.findIndex(([value]) => value === activeNavTab),
  );

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function measuredLens(index: number, pointerX?: number): NavLens | null {
    const nav = miniNavRef.current;
    const button = miniNavButtonRefs.current[index];
    if (!nav || !button) return null;
    const content = button.querySelector<HTMLElement>("[data-mini-nav-content]");
    const contentWidth = content?.getBoundingClientRect().width || button.offsetWidth;
    const width = Math.min(button.offsetWidth - 4, Math.max(48, contentWidth + 16));
    const navRect = nav.getBoundingClientRect();
    const x = pointerX === undefined
      ? button.offsetLeft + (button.offsetWidth - width) / 2
      : Math.min(
          nav.clientWidth - width - 4,
          Math.max(4, pointerX - navRect.left - width / 2),
        );
    return {
      x,
      y: button.offsetTop,
      width,
      height: button.offsetHeight,
      ready: true,
      dragging: pointerX !== undefined,
    };
  }

  function nearestNavIndex(pointerX: number) {
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    miniNavButtonRefs.current.forEach((button, index) => {
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const current = Math.abs(pointerX - (rect.left + rect.width / 2));
      if (current < distance) {
        distance = current;
        nearest = index;
      }
    });
    return nearest;
  }

  function moveNavLens(pointerX: number) {
    const index = nearestNavIndex(pointerX);
    const nextLens = measuredLens(index, pointerX);
    if (nextLens) setNavLens(nextLens);
    setDragNavIndex((current) => {
      if (current !== index) {
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
      }
      return index;
    });
    return index;
  }

  function handleNavPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    miniNavRef.current?.setPointerCapture(event.pointerId);
    navDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      moved: false,
    };
    moveNavLens(event.clientX);
  }

  function handleNavPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = navDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 5) drag.moved = true;
    moveNavLens(event.clientX);
  }

  function finishNavDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = navDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const index = moveNavLens(event.clientX);
    navDragRef.current = null;
    if (miniNavRef.current?.hasPointerCapture(event.pointerId)) {
      miniNavRef.current.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      suppressNavClickRef.current = true;
      window.setTimeout(() => {
        suppressNavClickRef.current = false;
      }, 0);
    }
    setDragNavIndex(null);
    setTab(MINIAPP_NAV[index][0]);
    const settledLens = measuredLens(index);
    if (settledLens) setNavLens(settledLens);
  }

  function cancelNavDrag() {
    navDragRef.current = null;
    setDragNavIndex(null);
    const settledLens = measuredLens(activeNavIndex);
    if (settledLens) setNavLens(settledLens);
  }

  useLayoutEffect(() => {
    if (data?.isAdmin) return;
    const nav = miniNavRef.current;
    const button = miniNavButtonRefs.current[activeNavIndex];
    if (!nav || !button || navDragRef.current) return;
    const update = () => {
      const nextLens = measuredLens(activeNavIndex);
      if (nextLens) setNavLens(nextLens);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    observer.observe(button);
    return () => observer.disconnect();
  }, [activeNavIndex, data?.isAdmin]);

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
      if (result.isAdmin) setTab("admin");
      setWeekdays(result.preferences.preferredWeekdays);
      setPreferredType(result.preferences.preferredType);
      setLessonCounts(
        Object.fromEntries(result.prices.map((price) => [price.id, price.minLessons])),
      );
      setIndividualDates((old) => ({
        ...Object.fromEntries(
          result.subscriptions
            .filter((subscription) => subscription.format === "individual")
            .map((subscription) => [subscription.id, dateTimeInput()]),
        ),
        ...old,
      }));
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
    const trainerImage = new Image();
    trainerImage.decoding = "async";
    trainerImage.src = "/miniapp-trainer-product-fast.jpg";
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

  function chooseDateForCredit(credit: PortalData["bookingCredits"][number]) {
    setType(credit.type);
    setSelectedBookingPriceId(null);
    setTab("schedule");
    window.setTimeout(() => {
      document.getElementById("miniapp-group-lessons")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  const filteredLessons = useMemo(
    () => data?.lessons.filter((lesson) => lesson.type === type) || [],
    [data, type],
  );
  const filteredPrices = (data?.prices.filter(
    (price) => price.type === priceType && price.format === priceFormat,
  ) || []).sort(
    (a, b) =>
      (PRICE_KIND_ORDER[a.kind] ?? 99) - (PRICE_KIND_ORDER[b.kind] ?? 99),
  );
  const selectedBookingPrice = data?.prices.find(
    (price) => price.id === selectedBookingPriceId,
  );
  const nextBooking = data?.scheduledLessons[0] ||
    data?.bookings.find((booking) => booking.status === "confirmed");
  const bookedLessonIds = new Set([
    ...(data?.bookings.map((booking) => booking.lessonId) || []),
    ...(data?.scheduledLessons.map((lesson) => lesson.lessonId) || []),
  ]);
  const individualSubscriptions = data?.subscriptions.filter(
    (subscription) =>
      subscription.format === "individual" &&
      ["active", "ending"].includes(subscription.status) &&
      !subscription.frozen &&
      subscription.remaining > 0,
  ) || [];
  const payablePayments = data?.payments.filter((payment) =>
    ["awaiting_receipt", "rejected"].includes(payment.status),
  ) || [];
  const filteredAdminPayments = data?.adminPayments.filter(
    (payment) => payment.status === adminFilter,
  ) || [];
  const trainerSummary = data?.trainer.text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part && !/^🌊?\s*Тренаж[её]р/i.test(part))
    .slice(0, 2)
    .join("\n\n");

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
    <main className={`miniapp-shell min-h-[100dvh] ${data.isAdmin ? "pb-8" : "pb-28"}`}>
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
              <span className="miniapp-admin-shortcut">
                Администратор
                {data.adminPendingCount > 0 && <strong>{data.adminPendingCount}</strong>}
              </span>
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

      {error && (
        <div className="miniapp-alert is-error mx-5 mb-4">{error}</div>
      )}
      {notice && (
        <button
          type="button"
          className="miniapp-alert is-notice mx-5 mb-4 text-left"
          onClick={() => setNotice("")}
          aria-label="Закрыть уведомление"
        >
          <span>{notice}</span>
          <b aria-hidden="true">×</b>
        </button>
      )}

      <div className="px-5">
        {tab === "home" && (
          <div className="space-y-6">
            <section
              className={`miniapp-hero ${nextBooking ? "is-clickable" : ""}`}
              role={nextBooking ? "button" : undefined}
              tabIndex={nextBooking ? 0 : undefined}
              aria-label={nextBooking ? "Открыть ближайшее занятие" : undefined}
              onClick={nextBooking ? () => {
                setHighlightedLessonId(nextBooking.lessonId);
                setTab("schedule");
              } : undefined}
              onKeyDown={nextBooking ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setHighlightedLessonId(nextBooking.lessonId);
                  setTab("schedule");
                }
              } : undefined}
            >
              <div className="miniapp-hero-glass">
                <p className="text-xs font-semibold uppercase opacity-60">Ближайшее занятие</p>
                {nextBooking ? (
                  <>
                    <p className="mt-3 text-3xl font-bold">{formatScheduleDate(nextBooking.startsAt)}</p>
                    <p className="mt-1 opacity-75">
                      {nextBooking.type === "online" ? "Онлайн" : "Офлайн"} · {nextBooking.title}
                    </p>
                  </>
                ) : data.bookingCredits.length ? (
                  <>
                    <p className="mt-3 text-2xl font-bold">Занятие ждёт новой даты</p>
                    <p className="mt-2 text-sm leading-relaxed opacity-75">
                      Оплаченное занятие сохранено в запасе до {formatDate(data.bookingCredits[0].expiresAt)}.
                    </p>
                    <button
                      className="miniapp-hero-button mt-5"
                      onClick={() => chooseDateForCredit(data.bookingCredits[0])}
                    >
                      Выбрать новую дату
                    </button>
                  </>
                ) : (
                  data.trialCrossSell ? (
                    <>
                      <p className="mt-3 text-2xl font-bold">Офлайн уже попробовали. Как насчёт онлайн?</p>
                      <p className="mt-2 text-sm leading-relaxed opacity-75">
                        Запишитесь на пробное онлайн-занятие и сравните оба формата,
                        чтобы понять, какой подходит вам больше.
                      </p>
                      <button
                        className="miniapp-hero-button mt-5"
                        onClick={() => {
                          setType("online");
                          setSelectedBookingPriceId(data.trialCrossSell?.priceItemId || null);
                          setNotice("Выберите дату пробного онлайн-занятия");
                          setTab("schedule");
                        }}
                      >
                        Записаться онлайн · {money(data.trialCrossSell.price)}
                      </button>
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
                  )
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
              {data.subscriptions.length || data.bookingCredits.length ? (
                <div className="space-y-3">
                  {data.subscriptions.slice(0, 2).map((subscription) => (
                    <SubscriptionCard key={subscription.id} subscription={subscription} />
                  ))}
                  {data.bookingCredits.map((credit) => (
                    <article key={`balance-credit-${credit.id}`} className="miniapp-credit-card">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="miniapp-type">В запасе</span>
                          <span className="miniapp-type is-muted">
                            {credit.type === "online" ? "Онлайн" : "Офлайн"}
                          </span>
                        </div>
                        <p className="mt-2 font-bold">{credit.title}</p>
                        <p className="mt-1 text-sm opacity-60">
                          1 занятие · использовать до {formatDate(credit.expiresAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="miniapp-small-button"
                        onClick={() => chooseDateForCredit(credit)}
                      >
                        Выбрать дату
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="miniapp-empty">Абонемента пока нет. Начните с пробного занятия.</div>
              )}
            </section>

            <button
              className="miniapp-primary w-full"
              onClick={() => data.bookingCredits[0]
                ? chooseDateForCredit(data.bookingCredits[0])
                : setTab("schedule")}
            >
              {data.bookingCredits.length ? "Выбрать дату для занятия" : "Записаться на занятие"}
            </button>
          </div>
        )}

        {tab === "schedule" && (
          <section>
            <p className="miniapp-kicker">Расписание</p>
            <h2 className="miniapp-title">Мои занятия</h2>

            <div className="mt-4 space-y-3">
              {data.scheduledLessons.length ? data.scheduledLessons.map((lesson) => {
                const targets = data.lessons.filter(
                  (candidate) =>
                    lesson.format === "group" &&
                    candidate.type === lesson.type &&
                    candidate.id !== lesson.lessonId,
                );
                const selectedTarget = transferTargets[lesson.attendanceId] || 0;
                return (
                  <article
                    key={lesson.attendanceId}
                    className={`miniapp-planned-card ${highlightedLessonId === lesson.lessonId ? "is-highlighted" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="miniapp-type">
                            {lesson.type === "online" ? "Онлайн" : "Офлайн"}
                          </span>
                          <span className="miniapp-type is-muted">
                            {lesson.format === "individual" ? "Индивидуально" : "Группа"}
                          </span>
                        </div>
                        <p className="mt-2 text-lg font-bold">{formatScheduleDate(lesson.startsAt)}</p>
                        <p className="mt-1 text-sm opacity-55">{lesson.title}</p>
                      </div>
                    </div>

                    {lesson.format === "individual" && lesson.plannedSubscriptionId && (
                      <div className="mt-4">
                        {editingLesson === lesson.attendanceId ? (
                          <div className="miniapp-reschedule-box">
                            <input
                              type="datetime-local"
                              value={editDates[lesson.attendanceId] || dateTimeInput(lesson.startsAt)}
                              onChange={(event) => setEditDates((old) => ({
                                ...old,
                                [lesson.attendanceId]: event.target.value,
                              }))}
                            />
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <button
                                className="miniapp-decline-button"
                                onClick={() => setEditingLesson(null)}
                              >
                                Закрыть
                              </button>
                              <button
                                disabled={busy}
                                className="miniapp-approve-button"
                                onClick={() => void action({
                                  action: "rescheduleIndividual",
                                  attendanceId: lesson.attendanceId,
                                  startsAt: editDates[lesson.attendanceId] || dateTimeInput(lesson.startsAt),
                                }).then((result) => {
                                  if (result) setEditingLesson(null);
                                })}
                              >
                                Сохранить
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              disabled={busy}
                              className="miniapp-decline-button"
                              onClick={() => {
                                if (window.confirm("Отменить занятие? Если до начала меньше 30 минут, оно спишется с абонемента.")) {
                                  void action({
                                    action: "cancelIndividual",
                                    attendanceId: lesson.attendanceId,
                                  });
                                }
                              }}
                            >
                              Отменить
                            </button>
                            <button
                              className="miniapp-receipt-button"
                              onClick={() => {
                                setEditDates((old) => ({
                                  ...old,
                                  [lesson.attendanceId]: dateTimeInput(lesson.startsAt),
                                }));
                                setEditingLesson(lesson.attendanceId);
                              }}
                            >
                              Перенести
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {lesson.format === "group" && (
                      <div className="mt-4">
                        {targets.length ? (
                          editingLesson === lesson.attendanceId ? (
                            <div className="miniapp-reschedule-box">
                              <p className="font-bold">Куда перенести</p>
                              <p className="mt-1 text-xs leading-relaxed opacity-55">
                                Выберите новую дату и время. Списания не будет.
                              </p>
                              <select
                                className="mt-3"
                                value={selectedTarget || ""}
                                onChange={(event) => setTransferTargets((old) => ({
                                  ...old,
                                  [lesson.attendanceId]: Number(event.target.value),
                                }))}
                              >
                                <option value="">Выберите новую дату и время</option>
                                {targets.map((target) => (
                                  <option key={target.id} value={target.id}>
                                    {formatScheduleDate(target.startsAt)}
                                  </option>
                                ))}
                              </select>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  className="miniapp-decline-button"
                                  onClick={() => setEditingLesson(null)}
                                >
                                  Закрыть
                                </button>
                                <button
                                  disabled={busy || !selectedTarget}
                                  className="miniapp-approve-button"
                                  onClick={() => {
                                    if (window.confirm("Перенести запись на выбранное занятие?")) {
                                      void action({
                                        action: "transferGroup",
                                        attendanceId: lesson.attendanceId,
                                        targetLessonId: selectedTarget,
                                      }).then((result) => {
                                        if (result) {
                                          setEditingLesson(null);
                                          setTransferTargets((old) => ({
                                            ...old,
                                            [lesson.attendanceId]: 0,
                                          }));
                                        }
                                      });
                                    }
                                  }}
                                >
                                  Перенести
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="miniapp-planned-actions">
                              <button
                                type="button"
                                disabled={busy}
                                className="miniapp-glass-pill is-danger"
                                onClick={() => {
                                  if (window.confirm("Отменить запись? Оплаченное пробное или разовое занятие останется в запасе на 30 дней. По абонементу списания не будет.")) {
                                    void action({
                                      action: "cancelGroup",
                                      attendanceId: lesson.attendanceId,
                                    });
                                  }
                                }}
                              >
                                Отменить запись
                              </button>
                              <button
                                type="button"
                                className="miniapp-glass-pill"
                                onClick={() => setEditingLesson(lesson.attendanceId)}
                              >
                                Перенести запись
                              </button>
                            </div>
                          )
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            className="miniapp-glass-pill is-danger"
                            onClick={() => {
                              if (window.confirm("Отменить запись? Оплаченное пробное или разовое занятие останется в запасе на 30 дней. По абонементу списания не будет.")) {
                                void action({
                                  action: "cancelGroup",
                                  attendanceId: lesson.attendanceId,
                                });
                              }
                            }}
                          >
                            Отменить запись
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              }) : <div className="miniapp-empty">Подтверждённых записей пока нет.</div>}
            </div>

            {data.bookingCredits.length > 0 && (
              <div className="mt-6">
                <p className="miniapp-kicker">В запасе</p>
                <h3 className="text-xl font-bold">Неиспользованные занятия</h3>
                <div className="mt-3 space-y-3">
                  {data.bookingCredits.map((credit) => (
                    <article key={credit.id} className="miniapp-credit-card">
                      <div className="min-w-0 flex-1">
                        <span className="miniapp-type">
                          {credit.type === "online" ? "Онлайн" : "Офлайн"}
                        </span>
                        <p className="mt-2 font-bold">{credit.title}</p>
                        <p className="mt-1 text-sm opacity-60">
                          Использовать до {formatDate(credit.expiresAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="miniapp-small-button"
                        onClick={() => chooseDateForCredit(credit)}
                      >
                        Выбрать дату
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {individualSubscriptions.length > 0 && (
              <div className="mt-7">
                <p className="miniapp-kicker">Индивидуально</p>
                <h3 className="text-xl font-bold">Поставить занятия</h3>
                <div className="mt-3 space-y-3">
                  {individualSubscriptions.map((subscription) => {
                    const available = Math.max(0, subscription.remaining - subscription.scheduledLessons);
                    return (
                      <article key={subscription.id} className="miniapp-individual-plan">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="miniapp-type">
                              {subscription.type === "online" ? "Онлайн" : "Офлайн"}
                            </span>
                            <h4 className="mt-2 font-bold">{subscription.name}</h4>
                          </div>
                          <span className="text-sm font-semibold opacity-65">
                            можно поставить {available}
                          </span>
                        </div>
                        {available > 0 && (
                          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                            <input
                              type="datetime-local"
                              value={individualDates[subscription.id] || dateTimeInput()}
                              onChange={(event) => setIndividualDates((old) => ({
                                ...old,
                                [subscription.id]: event.target.value,
                              }))}
                            />
                            <button
                              disabled={busy}
                              className="miniapp-small-button"
                              onClick={() => void action({
                                action: "scheduleIndividual",
                                subscriptionId: subscription.id,
                                startsAt: individualDates[subscription.id] || dateTimeInput(),
                              })}
                            >
                              Добавить
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            <div id="miniapp-group-lessons" className="mt-8 scroll-mt-4">
              <p className="miniapp-kicker">Групповые занятия</p>
              <h3 className="text-xl font-bold">Выберите занятие</h3>
            </div>
            {selectedBookingPrice && (
              <div className="miniapp-payment-callout mt-4">
                <span>
                  <small>Выбран тариф</small>
                  <strong>{selectedBookingPrice.name} · {money(selectedBookingPrice.price)}</strong>
                </span>
                <button onClick={() => setSelectedBookingPriceId(null)}>Сбросить</button>
              </div>
            )}
            <div className="miniapp-segment mt-4">
              <button className={type === "online" ? "active" : ""} onClick={() => { setType("online"); setSelectedBookingPriceId(null); }}>Онлайн</button>
              <button className={type === "offline" ? "active" : ""} onClick={() => { setType("offline"); setSelectedBookingPriceId(null); }}>Офлайн</button>
            </div>
            <div className="mt-4 space-y-3">
              {filteredLessons.length ? filteredLessons.map((lesson) => {
                const booked = bookedLessonIds.has(lesson.id);
                return (
                  <article key={lesson.id} className="miniapp-row">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{formatScheduleDate(lesson.startsAt)}</p>
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
                      onClick={() => void (async () => {
                        const result = await action(
                          {
                            action: "book",
                            lessonId: lesson.id,
                            priceItemId: selectedBookingPriceId || undefined,
                          },
                          { openPaymentsWhenRequired: true },
                        );
                        if (result) setSelectedBookingPriceId(null);
                      })()}
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
            <div className="mt-6">
              <p className="text-xs font-bold uppercase opacity-50">Где заниматься</p>
              <div className="miniapp-segment mt-2">
                <button
                  className={priceType === "online" ? "active" : ""}
                  onClick={() => setPriceType("online")}
                >
                  Онлайн
                </button>
                <button
                  className={priceType === "offline" ? "active" : ""}
                  onClick={() => setPriceType("offline")}
                >
                  Офлайн
                </button>
              </div>
              <p className="mt-4 text-xs font-bold uppercase opacity-50">Формат</p>
              <div className="miniapp-segment mt-2">
                <button
                  className={priceFormat === "group" ? "active" : ""}
                  onClick={() => setPriceFormat("group")}
                >
                  Групповые
                </button>
                <button
                  className={priceFormat === "individual" ? "active" : ""}
                  onClick={() => setPriceFormat("individual")}
                >
                  Индивидуальные
                </button>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {filteredPrices.map((price) => {
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
                    <div className="mt-5 flex items-center justify-between gap-3">
                      {price.kind === "subscription" && (
                        <div className="miniapp-stepper">
                          <button onClick={() => setLessonCounts((old) => ({ ...old, [price.id]: Math.max(price.minLessons, count - 1) }))}>−</button>
                          <span>{count}</span>
                          <button onClick={() => setLessonCounts((old) => ({ ...old, [price.id]: count + 1 }))}>+</button>
                        </div>
                      )}
                      <button
                        disabled={busy}
                        className="miniapp-small-button ml-auto"
                        onClick={() => {
                          if (price.requiresLesson) {
                            setType(price.type);
                            setSelectedBookingPriceId(price.id);
                            setTab("schedule");
                            setNotice("Выберите дату занятия");
                            return;
                          }
                          void action(
                            { action: "purchaseTariff", priceItemId: price.id, totalLessons: count },
                            { openPaymentsWhenRequired: true },
                          );
                        }}
                      >
                        {price.requiresLesson
                          ? `Выбрать дату · ${money(price.price)}`
                          : `Купить · ${money(price.price * count)}`}
                      </button>
                    </div>
                  </article>
                );
              })}
              {filteredPrices.length === 0 && (
                <div className="miniapp-empty">Тарифов этого формата пока нет.</div>
              )}
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
                      <button
                        type="button"
                        disabled={busy || Boolean(uploadingPayment)}
                        className="miniapp-cancel-purchase mt-2 w-full"
                        onClick={() => {
                          if (window.confirm("Отменить эту покупку? Неоплаченная заявка и бронь места будут отменены.")) {
                            void action({
                              action: "cancelPayment",
                              paymentKind: payment.kind,
                              paymentId: payment.id,
                            });
                          }
                        }}
                      >
                        Отменить покупку
                      </button>
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
              {trainerSummary || data.trainer.text}
            </div>
            {data.trainer.hasTrainer ? (
              <div className="miniapp-trainer-offer mt-4">
                <div className="miniapp-trainer-owned">
                  <span aria-hidden="true">✓</span>
                  <div>
                    <p className="font-bold">Тренажёр уже куплен</p>
                    <p className="mt-1 text-sm opacity-60">Покупка отмечена в вашей карточке CRM.</p>
                  </div>
                </div>
              </div>
            ) : (
              <button
                disabled={busy}
                className="miniapp-primary mt-3 w-full"
                onClick={() => {
                  if (data.trainer.orderStatus) {
                    setTab("payments");
                    return;
                  }
                  void action(
                    { action: "buyTrainer" },
                    { openPaymentsWhenRequired: true },
                  );
                }}
              >
                {data.trainer.orderStatus === "review"
                  ? "Посмотреть статус оплаты"
                  : data.trainer.orderStatus === "rejected"
                    ? "Загрузить новый чек"
                    : data.trainer.orderStatus === "awaiting_receipt"
                      ? "Перейти к оплате"
                      : `Купить · ${money(data.trainer.price)}`}
              </button>
            )}
          </section>
        )}
      </div>

      {!data.isAdmin && (
        <nav
          ref={miniNavRef}
          className="miniapp-nav"
          aria-label="Разделы личного кабинета"
          onPointerDown={handleNavPointerDown}
          onPointerMove={handleNavPointerMove}
          onPointerUp={finishNavDrag}
          onPointerCancel={cancelNavDrag}
        >
          <span
            aria-hidden="true"
            className={`miniapp-nav-lens ${navLens.dragging ? "is-dragging" : ""}`}
            style={
              {
                "--mini-lens-x": `${navLens.x}px`,
                "--mini-lens-y": `${navLens.y}px`,
                "--mini-lens-width": `${navLens.width}px`,
                "--mini-lens-height": `${navLens.height}px`,
                opacity: navLens.ready ? 1 : 0,
              } as CSSProperties
            }
          />
          {MINIAPP_NAV.map(([value, label, icon], index) => (
            <button
              key={value}
              ref={(node) => {
                miniNavButtonRefs.current[index] = node;
              }}
              className={`${(dragNavIndex ?? activeNavIndex) === index ? "active" : ""} ${value === "home" ? "is-home" : ""}`}
              aria-current={activeNavIndex === index ? "page" : undefined}
              onClick={(event) => {
                if (suppressNavClickRef.current) {
                  event.preventDefault();
                  return;
                }
                setTab(value);
              }}
            >
              <span data-mini-nav-content>
                <b aria-hidden="true">{icon}</b>
                <small>{label}</small>
              </span>
            </button>
          ))}
        </nav>
      )}

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
