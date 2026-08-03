"use client";

import Image from "next/image";
import { useState } from "react";
import { initials } from "@/lib/domain";

export function Avatar({
  name,
  size = 44,
  src,
}: {
  name: string;
  size?: number;
  src?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(src) && !failed;

  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft font-semibold text-brand-dark uppercase"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {showPhoto ? (
        <Image
          src={src!}
          alt={name}
          width={size}
          height={size}
          unoptimized
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
