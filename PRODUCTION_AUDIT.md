# OWNTIME — production readiness audit

Audit date: 2026-10-30

## Status

**Code status: production candidate.** Promotion still depends on applying the database migration and completing the staging checks below. Those external checks cannot be proven from the repository alone.

## Implemented in this refinement

- Branding icon added through the App Router icon and manifest conventions.
- Public booking title is exactly `OWNTIME`; all admin routes use `owntime - admin` and `noindex`.
- Language changes use a Server Action plus an RSC refresh; pathname and query parameters are preserved and the browser document is not reloaded.
- Admin pages share a persistent route-group layout with server-side authorization and one pending-count query.
- Supabase SSR sessions are refreshed in `src/proxy.ts`.
- Anonymous direct inserts and public time-off reads are removed.
- Booking creation is service-role-only and revalidates real date/time, active service, business hours, 30-minute grid, horizon, manual locks, Google locks and conflicts inside one transaction.
- Transactional limits apply per normalized phone and per HMAC network identifier. Raw IP addresses are not stored.
- Google full sync preserves the previous busy snapshot until success. Sync jobs use an atomic lease with `FOR UPDATE SKIP LOCKED`.
- Service removal preserves booking history by archiving services already in use.
- Lock queries are bounded to the visible calendar window and service usage is aggregated in Postgres.
- External Google and Resend requests have timeouts.
- Security headers, reduced-motion handling, visible focus and improved text contrast were added.
- Dependencies were upgraded; `npm audit` reports zero known vulnerabilities.
- CI now runs audit, lint, typecheck, tests and production build on Node 22.

## Navigation/refresh audit

- Internal navigation uses `next/link`, `router.push`, Server Actions or in-place fetches.
- `router.refresh()` refreshes the React Server Component payload without reloading the browser document.
- The Google OAuth link intentionally performs a document navigation because it leaves the application for Google authorization.
- `tel:`, `mailto:` and the external footer link are intentional external/protocol navigations.
- No `window.location`, `location.reload`, internal raw anchor navigation or accidental native form reload remains.

## Required staging gate

1. Use Node.js 22.12 or newer.
2. Back up the Supabase database and apply `supabase/migrations/202610300001_production_hardening.sql`.
3. Set every required variable from `.env.example`; generate independent high-entropy values for booking, OAuth encryption, webhook and cron secrets.
4. Confirm Hostinger forwards a trustworthy client IP header (`CF-Connecting-IP`, `X-Real-IP` or sanitized `X-Forwarded-For`) so the network rate limit is meaningful.
5. Verify RLS and grants in the deployed database: anonymous direct appointment insert and direct `time_off` select must fail.
6. Test booking at opening/closing boundaries, a taken slot, rate limiting and two simultaneous requests for the same slot.
7. Test login/session renewal, approval/rejection email, Google connect/full sync/webhook/cron and retry after a simulated provider failure.
8. Verify HTTPS, HSTS, backups, Supabase point-in-time recovery policy, log retention and alerting in the hosting dashboards.

## Residual operational considerations

- Provider calls are best-effort and logged, but production alerting must be configured in Hostinger/Supabase; the repository cannot provision it.
- Database contract tests protect the committed SQL, but concurrency and RLS should also be exercised against a staging Supabase project.
- The pending inbox returns the newest 100 requests. Operational review should keep this queue low; add pagination if that limit becomes realistic.
