import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "VUMEXCLUSIVE · Личный кабинет",
  description: "Расписание, запись и абонементы VUMEXCLUSIVE",
};

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js?63"
        strategy="beforeInteractive"
      />
      {children}
    </>
  );
}
