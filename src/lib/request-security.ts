import "server-only";

import crypto from "node:crypto";

const forwardedIp = (request: Request) =>
  request.headers.get("cf-connecting-ip") ||
  request.headers.get("x-real-ip") ||
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

/** Stable, non-reversible identifier used only by the database rate limiter. */
export function clientFingerprint(request: Request): string {
  const secret = process.env.BOOKING_RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("booking-rate-limit-secret-not-configured");
  return crypto.createHmac("sha256", secret).update(forwardedIp(request)).digest("hex");
}

export function bodyTooLarge(request: Request, maximumBytes = 16_384): boolean {
  const length = Number(request.headers.get("content-length"));
  return Number.isFinite(length) && length > maximumBytes;
}
