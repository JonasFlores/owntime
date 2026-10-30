import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeGoogleCode, googleRedirectUris, resolveGoogleRedirectUri } from "@/lib/google-calendar";

const originalRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
const originalRedirectUris = process.env.GOOGLE_OAUTH_REDIRECT_URIS;
const originalClientId = process.env.GOOGLE_CLIENT_ID;
const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

afterEach(() => {
  if (originalRedirectUri === undefined) delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
  else process.env.GOOGLE_OAUTH_REDIRECT_URI = originalRedirectUri;
  if (originalRedirectUris === undefined) delete process.env.GOOGLE_OAUTH_REDIRECT_URIS;
  else process.env.GOOGLE_OAUTH_REDIRECT_URIS = originalRedirectUris;
  if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = originalClientId;
  if (originalClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
  else process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  vi.restoreAllMocks();
});

describe("Google OAuth redirect URI", () => {
  it("accepts, normalizes and deduplicates configured callback URLs", () => {
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/google/callback";
    process.env.GOOGLE_OAUTH_REDIRECT_URIS = [
      "https://app.example.com/api/integrations/google/callback",
      "http://localhost:3000/api/integrations/google/callback",
      "https://app.example.com/not-the-callback",
      "invalid",
    ].join(",");

    expect(googleRedirectUris()).toEqual([
      "https://app.example.com/api/integrations/google/callback",
      "http://localhost:3000/api/integrations/google/callback",
    ]);
  });

  it("uses the exact configured URI for the current origin", () => {
    process.env.GOOGLE_OAUTH_REDIRECT_URIS = [
      "http://localhost:3000/api/integrations/google/callback",
      "https://app.example.com/api/integrations/google/callback",
    ].join(",");
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;

    expect(resolveGoogleRedirectUri("https://app.example.com")).toBe(
      "https://app.example.com/api/integrations/google/callback",
    );
  });

  it("reuses a configured URI for the same host instead of inventing one", () => {
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/google/callback";
    delete process.env.GOOGLE_OAUTH_REDIRECT_URIS;

    expect(resolveGoogleRedirectUri("https://localhost:3000")).toBe(
      "http://localhost:3000/api/integrations/google/callback",
    );
  });

  it("exchanges the code when only the redirect URI list is configured", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URIS = "https://app.example.com/api/integrations/google/callback";
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(exchangeGoogleCode("oauth-code")).resolves.toEqual({
      accessToken: "access",
      refreshToken: "refresh",
    });
    const request = fetchMock.mock.calls[0]?.[1];
    expect(String(request?.body)).toContain(
      "redirect_uri=https%3A%2F%2Fapp.example.com%2Fapi%2Fintegrations%2Fgoogle%2Fcallback",
    );
  });
});
