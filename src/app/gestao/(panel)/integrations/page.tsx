import { requireAdmin } from "@/lib/admin";
import { getLang } from "@/lib/lang";
import { googleConfigured, listGoogleCalendars, type GoogleConnection } from "@/lib/google-calendar";
import { disconnectGoogle, selectGoogleCalendar, syncGoogleNow } from "./actions";
import SubmitButton from "@/components/submit-button";
import SetupNotice from "@/components/setup-notice";
import { isConfigured } from "@/lib/supabase";

const notices: Record<string, { pt: string; en: string }> = {
  connected: { pt: "Google Agenda conectado e sincronizado.", en: "Google Calendar connected and synchronized." },
  synced: { pt: "Sincronização concluída.", en: "Synchronization completed." },
  calendar_changed: { pt: "Agenda alterada e sincronizada.", en: "Calendar changed and synchronized." },
  disconnected: { pt: "Google Agenda desconectado.", en: "Google Calendar disconnected." },
  error: { pt: "Não foi possível conectar ao Google.", en: "Could not connect to Google." },
  sync_error: { pt: "A sincronização falhou. Verifique a configuração e tente novamente.", en: "Synchronization failed. Check the configuration and try again." },
  invalid_state: { pt: "A autorização expirou. Tente conectar novamente.", en: "Authorization expired. Try connecting again." },
};

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const lang = await getLang();
  if (!isConfigured) {
    return (
      <section className="mt-12">
        <h1 className="font-serif text-3xl">Google Agenda</h1>
        <SetupNotice />
      </section>
    );
  }
  const { sb } = await requireAdmin();
  const params = await searchParams;
  const connectionResult = await sb
    .from("google_calendar_connections")
    .select("id,calendar_id,calendar_name,calendar_timezone,google_account_email,sync_token,channel_id,channel_resource_id,channel_expires_at,status,last_synced_at,last_error")
    .limit(1)
    .maybeSingle();
  const connection = connectionResult.data as GoogleConnection | null;
  const calendars = connection ? await listGoogleCalendars(connection.id).catch(() => []) : [];
  const notice = params.google ? notices[params.google]?.[lang] : null;

  return (
    <>
      <section className="mt-12">
        <p className="label">{lang === "pt" ? "Integrações" : "Integrations"}</p>
        <h1 className="mt-2 font-serif text-3xl">Google Agenda</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-soft">
          {lang === "pt"
            ? "Agendamentos aprovados são enviados ao Google. Eventos ocupados criados no Google bloqueiam automaticamente a disponibilidade no Owntime."
            : "Approved appointments are sent to Google. Busy events created in Google automatically block Owntime availability."}
        </p>
        {notice && <div className="mt-6 rounded-xl border border-line bg-panel px-4 py-3 text-sm">{notice}</div>}
        {!googleConfigured && (
          <div className="mt-6 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm">
            {lang === "pt"
              ? "Configure as variáveis GOOGLE_*, SUPABASE_SERVICE_ROLE_KEY e CRON_SECRET antes de conectar."
              : "Configure GOOGLE_*, SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET before connecting."}
          </div>
        )}

        {!connection ? (
          <div className="mt-8 rounded-2xl border border-line bg-panel p-6">
            <h2 className="font-medium">{lang === "pt" ? "Nenhuma agenda conectada" : "No calendar connected"}</h2>
            <p className="mt-2 text-sm text-soft">
              {lang === "pt" ? "A conta Google solicitará permissão para ler e editar eventos." : "The Google account will request permission to read and edit events."}
            </p>
            <a
              href="/api/integrations/google/connect"
              aria-disabled={!googleConfigured}
              className={`btn btn-primary mt-5 inline-flex ${!googleConfigured ? "pointer-events-none opacity-50" : ""}`}
            >
              {lang === "pt" ? "Conectar Google Agenda" : "Connect Google Calendar"}
            </a>
          </div>
        ) : (
          <div className="mt-8 space-y-5 rounded-2xl border border-line bg-panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{connection.calendar_name ?? connection.calendar_id}</p>
                <p className="mt-1 text-xs text-soft">{connection.google_account_email ?? connection.calendar_id}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs ${connection.status === "connected" ? "bg-green-100 text-green-800" : "bg-warn/10 text-warn"}`}>
                {connection.status}
              </span>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-soft">{lang === "pt" ? "Última sincronização" : "Last sync"}</dt><dd className="mt-1">{connection.last_synced_at ? new Date(connection.last_synced_at).toLocaleString(lang === "pt" ? "pt-BR" : "en-US") : "—"}</dd></div>
              <div><dt className="text-soft">{lang === "pt" ? "Fuso da agenda" : "Calendar timezone"}</dt><dd className="mt-1">{connection.calendar_timezone ?? "—"}</dd></div>
            </dl>
            {connection.last_error && <p className="rounded-xl bg-warn/5 p-3 text-xs text-warn">{connection.last_error}</p>}
            {calendars.length > 0 && (
              <form action={selectGoogleCalendar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="connection_id" value={connection.id} />
                <label className="block flex-1">
                  <span className="label">{lang === "pt" ? "Agenda sincronizada" : "Synchronized calendar"}</span>
                  <select name="calendar_id" defaultValue={connection.calendar_id} className="input mt-1.5">
                    {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary ?? calendar.id}</option>)}
                  </select>
                </label>
                <SubmitButton className="btn btn-sm">{lang === "pt" ? "Alterar" : "Change"}</SubmitButton>
              </form>
            )}
            <div className="flex flex-wrap gap-3 border-t border-line pt-5">
              <form action={syncGoogleNow}>
                <input type="hidden" name="connection_id" value={connection.id} />
                <SubmitButton className="btn btn-sm btn-primary">{lang === "pt" ? "Sincronizar agora" : "Sync now"}</SubmitButton>
              </form>
              <form action={disconnectGoogle}>
                <input type="hidden" name="connection_id" value={connection.id} />
                <SubmitButton className="btn btn-sm">{lang === "pt" ? "Desconectar" : "Disconnect"}</SubmitButton>
              </form>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
