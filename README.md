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
- [~] Phase 4 — notifications implemented (Resend); rate-limit tuning and RLS review pending
- [ ] Phase 5 — Hostinger deploy (see `DEPLOY.md`)

## Getting started (local)

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

Then: run `supabase/schema.sql` in the Supabase SQL editor, sign up on `/gestao/login`,
and add your `user_id` to `admin_users` (final step documented in the schema file).

For email notifications, verify a sending domain in Resend and configure
`RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `ADMIN_NOTIFICATION_EMAILS`.
