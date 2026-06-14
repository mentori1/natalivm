import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { IconHeart } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <IconHeart className="size-10 text-brand/40" />
      <h1 className="mt-4 text-2xl font-bold text-ink">Страница не найдена</h1>
      <p className="mt-1 text-muted">
        Возможно, клиента или занятие удалили.
      </p>
      <Link href="/" className={`${buttonClass("primary")} mt-6`}>
        На главную
      </Link>
    </div>
  );
}
