import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Server-side Supabase client wired to SSR auth cookies. Throws if env is missing. */
export async function getSupabase() {
  if (!isConfigured) throw new Error("supabase-not-configured");
  const store = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach((c) => store.set(c.name, c.value, c.options));
        } catch {
          // set() is only possible in server actions / route handlers — reads still work
        }
      },
    },
  });
}
