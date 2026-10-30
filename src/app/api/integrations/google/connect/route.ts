import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminGate } from "@/lib/admin";
import { googleAuthorizationUrl, googleConfigured, resolveGoogleRedirectUri } from "@/lib/google-calendar";

// Select the callback registered for this request's origin. The authorize request
// and token exchange must use this exact same value or Google rejects the flow.
export async function GET(req: NextRequest) {
  const gate = await adminGate();
  if (!gate.ok) return NextResponse.redirect(new URL("/gestao/login", req.nextUrl.origin));
  if (!googleConfigured) {
    return NextResponse.json({ error: "google_not_configured" }, { status: 503 });
  }
  const redirectUri = resolveGoogleRedirectUri(req.nextUrl.origin);
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
