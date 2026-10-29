import { cookies } from "next/headers";
import type { Lang } from "./i18n";

/** Server-side language resolution: cookie "lang" (set via ?lang=), default pt. */
export async function getLang(): Promise<Lang> {
  const c = await cookies();
  return c.get("lang")?.value === "en" ? "en" : "pt";
}
