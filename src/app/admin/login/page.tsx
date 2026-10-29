import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";
import { isConfigured } from "@/lib/supabase";
import { signIn } from "@/app/admin/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const lang = await getLang();
  const t = dict[lang];

  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-20 pb-8">
      <p className="label">{t.adminEyebrow}</p>
      <h1 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">{t.loginTitle}</h1>

      {sp.error && (
        <p className="mt-8 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          {sp.error === "denied" ? t.noAccess : t.loginErr}
        </p>
      )}
      {!isConfigured && (
        <p className="mt-8 rounded-lg border border-line bg-panel px-4 py-3 text-sm text-soft">
          {t.setupHint}
        </p>
      )}

      <form action={signIn} className="mt-10 flex max-w-sm flex-col gap-5">
        <label className="block">
          <span className="label">Email</span>
          <input name="email" type="email" required className="input mt-2" autoComplete="email" />
        </label>
        <label className="block">
          <span className="label">********</span>
          <input name="password" type="password" required className="input mt-2" autoComplete="current-password" />
        </label>
        <button type="submit" className="btn btn-primary mt-1 w-full">
          {t.loginBtn}
        </button>
      </form>
    </main>
  );
}
