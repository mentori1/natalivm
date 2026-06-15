"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/auth-actions";
import { Card } from "@/components/ui";
import { Input, SubmitButton } from "@/components/form";

export default function LoginPage() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    login,
    undefined,
  );

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">
            Н
          </span>
          <h1 className="mt-3 text-xl font-bold text-ink">Кабинет преподавателя</h1>
          <p className="text-sm text-muted">Студия танца Наташи</p>
        </div>

        <Card className="p-6">
          <form action={formAction} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Пароль
              </span>
              <Input
                name="password"
                type="password"
                autoFocus
                required
                placeholder="Введите пароль"
              />
            </label>

            {state?.error && (
              <p className="text-sm font-medium text-red-600">{state.error}</p>
            )}

            <SubmitButton pendingText="Вхожу…" className="w-full">
              Войти
            </SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
