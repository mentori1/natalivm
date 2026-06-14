// Тонкие линейные иконки (stroke 1.5) — в духе premium-дизайна, без «толстых» наборов.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconHome = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </svg>
);

export const IconUsers = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6" />
    <path d="M17.5 15c2 .6 3.5 2.4 3.5 5" />
  </svg>
);

export const IconCalendar = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);

export const IconWallet = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M3 10h18" />
    <circle cx="16.5" cy="14" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const IconArrowLeft = (p: P) => (
  <svg {...base} {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 12.5l4.5 4.5L19 6.5" />
  </svg>
);

export const IconX = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconClock = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconAlert = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 4.5 21 19H3L12 4.5Z" />
    <path d="M12 10v4M12 16.5v.01" />
  </svg>
);

export const IconPhone = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V19a2 2 0 0 1-2 2A15 15 0 0 1 4 6a2 2 0 0 1 2-2Z" />
  </svg>
);

export const IconSend = (p: P) => (
  <svg {...base} {...p}>
    <path d="M21 4 3 11l6 2.5L11.5 20 21 4Z" />
    <path d="M9 13.5 21 4" />
  </svg>
);

export const IconSparkle = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3c.6 4.2 1.8 5.4 6 6-4.2.6-5.4 1.8-6 6-.6-4.2-1.8-5.4-6-6 4.2-.6 5.4-1.8 6-6Z" />
  </svg>
);

export const IconHeart = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 20s-7-4.3-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.7 12 20 12 20Z" />
  </svg>
);

export const IconShield = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
  </svg>
);

export const IconSnow = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
  </svg>
);
