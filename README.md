# Owntime — appointment scheduler

Online appointment booking: guests request a slot, admin team approves/rejects, approved slots become unavailable.

**Stack**: Next.js (App Router) · Node.js LTS · Supabase (Postgres + Auth + RLS) · Tailwind · zod · dayjs · Resend

See [`PLAN.md`](./PLAN.md) for the full plan, data model, security checklist and build phases.

## Status
- [x] Plan agreed
- [x] Phase 0 — repo setup (Next.js 15 + Tailwind v4 + Supabase SDK + zod + dayjs)
- [x] Phase 1 — Supabase backend (`supabase/schema.sql` — run it in the Supabase SQL editor)
- [x] Phase 2 — public booking site (calendar → free days → times → request form, PT/EN)
- [x] Phase 3 — admin dashboard (bookings, services, weekly hours, day/period blocks)
- [x] Phase 4 — notifications, transactional rate limits, RLS hardening and Google sync leases
- [ ] Phase 5 — Hostinger deploy (see `DEPLOY.md`)

## Getting started (local)

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

Use Node.js 22.12 or newer. Then run `supabase/schema.sql` in the Supabase SQL editor, create the admin in Supabase Auth,
and add your `user_id` to `admin_users` (final step documented in the schema file).

For email notifications, verify a sending domain in Resend and configure
`RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `ADMIN_NOTIFICATION_EMAILS`.

## Google Calendar integration

The admin page `/gestao/integrations` connects one shared Google Calendar. Approved
appointments are exported to Google; opaque Google events are imported as busy
blocks and are included in public availability calculations.

1. For a new database, run `supabase/schema.sql`. For an existing database,
   apply the files in `supabase/migrations/` in order instead of re-running the bootstrap.
2. In Google Cloud, enable **Google Calendar API**, configure the OAuth consent
   screen, and create a **Web application** OAuth client.
3. Add the exact callback URL as an authorized redirect URI, for example:
   `https://your-domain.com/api/integrations/google/callback`.
4. Configure the `GOOGLE_*`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`
   variables documented in `.env.example`.
5. Open `/gestao/integrations`, connect Google, and select the calendar.

For near-real-time inbound updates, set `GOOGLE_CALENDAR_WEBHOOK_URL` to:

```text
https://your-domain.com/api/integrations/google/webhook
```

It must be public HTTPS. Also schedule a fallback request every 5–15 minutes:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.com/api/integrations/google/cron
```

The cron renews expiring notification channels, performs incremental sync, and
retries failed event exports. Never expose `SUPABASE_SERVICE_ROLE_KEY`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, or `CRON_SECRET` to the
browser.

## Quality gate

```bash
npm run check
npm audit
```

The CI workflow runs audit, lint, typecheck, 42 unit/contract tests and a production build on Node 22.
See [`PRODUCTION_AUDIT.md`](./PRODUCTION_AUDIT.md) before promoting a staging deployment.
