import "server-only";

interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export interface BookingMailData {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  service: string;
  startsAt: string;
  endsAt: string;
  note?: string | null;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char]!);
}

function dateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: process.env.APPOINTMENT_TIMEZONE || "America/Sao_Paulo",
  }).format(new Date(iso));
}

function time(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: process.env.APPOINTMENT_TIMEZONE || "America/Sao_Paulo",
  }).format(new Date(iso));
}

/**
 * Send through Resend's stable HTTP API. Email is best-effort: DB state is
 * authoritative and must never be rolled back because the provider is down.
 */
async function sendEmail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) {
    console.warn("[email] skipped: RESEND_API_KEY or RESEND_FROM_EMAIL is not configured");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(mail.to) ? mail.to : [mail.to],
        subject: mail.subject,
        html: mail.html,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error("[email] Resend rejected message", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] request failed", error);
    return false;
  }
}

export async function sendAdminBookingAlert(data: BookingMailData): Promise<boolean> {
  const recipients = (process.env.ADMIN_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    console.warn("[email] admin alert skipped: ADMIN_NOTIFICATION_EMAILS is not configured");
    return false;
  }

  return sendEmail({
    to: recipients,
    replyTo: data.guestEmail,
    subject: `Novo pedido de agendamento — ${data.guestName}`,
    html: `
      <h1>Novo pedido de agendamento</h1>
      <p><strong>Cliente:</strong> ${escapeHtml(data.guestName)}</p>
      <p><strong>Serviço:</strong> ${escapeHtml(data.service)}</p>
      <p><strong>Data:</strong> ${escapeHtml(dateTime(data.startsAt))}–${escapeHtml(time(data.endsAt))}</p>
      <p><strong>Telefone:</strong> ${escapeHtml(data.guestPhone)}</p>
      <p><strong>E-mail:</strong> ${escapeHtml(data.guestEmail)}</p>
      ${data.note ? `<p><strong>Observações:</strong> ${escapeHtml(data.note)}</p>` : ""}
      <p>Acesse o painel Owntime para aprovar ou recusar o pedido.</p>
    `,
  });
}

export async function sendBookingApproved(data: BookingMailData): Promise<boolean> {
  return sendEmail({
    to: data.guestEmail,
    subject: `Agendamento confirmado — ${data.service}`,
    html: `
      <h1>Agendamento confirmado</h1>
      <p>Olá, ${escapeHtml(data.guestName)}.</p>
      <p>Seu agendamento foi aprovado e está confirmado.</p>
      <p><strong>Serviço:</strong> ${escapeHtml(data.service)}</p>
      <p><strong>Data:</strong> ${escapeHtml(dateTime(data.startsAt))}–${escapeHtml(time(data.endsAt))}</p>
      <p>Se precisar alterar ou cancelar, entre em contato conosco.</p>
    `,
  });
}
