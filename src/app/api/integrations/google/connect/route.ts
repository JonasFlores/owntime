import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminGate } from "@/lib/admin";
import { googleAuthorizationUrl, googleConfigured } from "@/lib/google-calendar";

// The redirect URI is derived from the request origin, not from GOOGLE_OAUTH_REDIRECT_URI,
// so the state cookie and the Google callback always share the same browser origin
// (localhost for local dev, *.ngrok-free.dev for tunnel testing, prod domain in production).
// Every origin used this way must be listed under "Authorized redirect URIs" in Google Cloud.
export async function GET(req: NextRequest) {
  const gate = await adminGate();
  if (!gate.ok) return NextResponse.redirect(new URL("/gestao/login", req.nextUrl.origin));
  if (!googleConfigured) {
    return NextResponse.json({ error: "google_not_configured" }, { status: 503 });
  }
  const redirectUri = new URL("/api/integrations/google/callback", req.nextUrl.origin).toString();
  const state = crypto.randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(googleAuthorizationUrl(state, redirectUri));
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/integrations/google/callback",
    maxAge: 600,
  };
  response.cookies.set("google_oauth_state", state, cookieOptions);
  // Carry the authorize redirect_uri to the callback so the token exchange matches it exactly.
  response.cookies.set("google_oauth_redirect", redirectUri, cookieOptions);
  return response;
}
