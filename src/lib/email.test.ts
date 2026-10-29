import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { escapeHtml, sendAdminBookingAlert, sendBookingApproved } from "@/lib/email";

const booking = {
  guestName: "Ana <Silva>",
  guestEmail: "ana@example.com",
  guestPhone: "+55 11 99999-9999",
  service: "Ensaio & Retrato",
  startsAt: "2026-11-10T12:00:00.000Z",
  endsAt: "2026-11-10T13:00:00.000Z",
  note: "Levar roupa 'azul'",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("email notifications", () => {
  it("escapes user-controlled HTML", () => {
    expect(escapeHtml(`<b>Tom & "Ana"</b>`)).toBe("&lt;b&gt;Tom &amp; &quot;Ana&quot;&lt;/b&gt;");
  });

  it("skips safely when Resend is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(sendBookingApproved(booking)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends admin alerts to every configured recipient with reply-to", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "Owntime <agenda@example.com>");
    vi.stubEnv("ADMIN_NOTIFICATION_EMAILS", "one@example.com, two@example.com");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(sendAdminBookingAlert(booking)).resolves.toBe(true);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body.to).toEqual(["one@example.com", "two@example.com"]);
    expect(body.reply_to).toBe("ana@example.com");
    expect(body.html).toContain("Ana &lt;Silva&gt;");
    expect(body.html).not.toContain("Ana <Silva>");
  });
});
