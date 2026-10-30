"use server";

import { cookies } from "next/headers";
import type { Lang } from "@/lib/i18n";

export async function setLanguage(lang: Lang) {
  if (lang !== "pt" && lang !== "en") return;
  const store = await cookies();
  store.set("lang", lang, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
