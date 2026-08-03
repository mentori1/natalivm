"use client";

import { useState } from "react";
import { Input } from "@/components/form";
import { formatRussianPhone } from "@/lib/domain";

export function PhoneInput({ defaultValue = "" }: { defaultValue?: string }) {
  const [value, setValue] = useState(() => formatRussianPhone(defaultValue));

  return (
    <Input
      name="phone"
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value}
      maxLength={18}
      placeholder="+7 (___) ___-__-__"
      onBlur={() => {
        if (value.replace(/\D/g, "") === "7") setValue("");
      }}
      onChange={(event) => setValue(formatRussianPhone(event.target.value))}
    />
  );
}
