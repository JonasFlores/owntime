# Owntime — Online Appointment Scheduler

Public booking site + small admin team, running on Hostinger Cloud Startup, backed by Supabase.

## 1. Stack (chosen deliberately: stable, minimal, battle-tested)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router)** — latest stable | One app for public site + admin; server components + server actions remove the need for a separate API layer |
| Runtime | **Node.js 22.12+ (LTS)** on Hostinger | Required by the production and quality toolchain |
| Styling | **Tailwind CSS** | Small output, widely tested; no component framework beyond what's needed |
| Database / Auth / Email-hooks | **Supabase** (free tier is enough to start) | Postgres + Auth + Row Level Security out of the box |
| DB client | `@supabase/supabase-js` + `@supabase/ssr` | Official, SSR-ready cookies-based auth |
| Validation | **zod** | De-facto standard, tiny |
| Dates | **dayjs** (≈7 kB) | Tiny; all timezone math stays in Postgres (UTC) |
| Email | **Resend** (free tier) via a single server-side helper | Trusted, simple REST API |
| i18n | Hand-rolled dictionary (no i18n framework) | Only 2 languages; keeps the bundle light |
| State mgmt | None (URL params + server state) | Server components render; forms use server actions |

Not used on purpose: Redux, form libraries, i18next, Prisma (Supabase SDK covers it), Vercel.

## 2. Core flow

1. Visitor opens site → sees **services** (each with its own duration).
2. Visitor picks a service → sees a **calendar of dates** → picks a date → sees **available time slots** (working hours minus slots already taken by `pending` or `approved` requests).
3. Visitor submits request: name, phone (required), email (optional), service, slot, optional note. No account needed.
4. Request is stored with status **`pending`**. The slot is now blocked (not bookable by others) until decided.
5. Admin logs in → dashboard lists pending requests → **approve** or **reject** (+ optional rejection reason).
   - **Approved** → slot stays unavailable; requester gets confirmation email (if email provided; only stored/administrators notified otherwise via phone).
   - **Rejected / cancelled** → slot becomes available again.
6. Admins can also manage services (name PT/EN, duration, active), working hours, and block dates ("time off"/holidays).

Double-booking is prevented **at the database level** with a Postgres exclusion constraint (see §4) — not just app logic.

## 3. Roles & auth

- **Public**: no login. The browser can read availability RPCs, but creation is accepted only by the Next.js server and a service-role-only hardened RPC.
- **Admins (2–5)**: Supabase Auth (email + password). Membership in the `admin_users` table is what grants access — RLS checks `admin_users (user_id = auth.uid())`. A person who signs up but is not in the table sees nothing (RLS denies by default).

## 4. Data model (Supabase / Postgres)

```
services            id, name_pt, name_en, duration_minutes, active, sort_order
working_hours       day_of_week (0–6), start_time, end_time      -- weekly template
time_off            starts_at, ends_at, reason                    -- holidays/closures
admin_users         user_id → auth.users, email                   -- RLS role gate
appointments        id, service_id → services,
                    starts_at, ends_at (timestamptz, UTC),
                    status ('pending' | 'approved' | 'rejected' | 'cancelled'),
                    guest_name, guest_phone, guest_email?, note?,
                    created_at, decided_at?, decided_by?, decision_note?
```

Key constraint (prevents double-booking even if two requests race):

```sql
-- no pending/approved appointment may overlap another
ALTER TABLE appointments ADD CONSTRAINT no_overlap
EXCLUDE USING gist (tstzrange(starts_at, ends_at) WITH &&)
WHERE (status IN ('pending','approved'));
```

Everything else is enforced with **Row Level Security**:

- Anyone (anon): may read active services and aggregated availability RPCs. Appointment and time-off rows are never exposed directly.
- Admins: full read; may `update` only the decision fields; service/time management restricted to admins.
- Slot computation happens in a Postgres function `get_available_slots(service_id, date, tz)` so the public site never sees guests' personal data.

## 5. Pages

```
/ (lang from cookie or ?lang=)
  └─ services list → /book?service=…&date=…&slot=…   (calendar + slot picker + request form)
/thanks (after submit)
/gestao/login          Supabase Auth (hidden admin path — folder name doubles as the secret)
/gestao                pending requests (approve / reject with reason)
/gestao/schedule       working hours + time off + service management
```

## 6. Security checklist

- [x] RLS enabled on every table, deny-by-default; policies reviewed
- [x] `SUPABASE_SERVICE_ROLE_KEY` used **only** in server-side code (never in client bundle), env vars only, `.env*` git-ignored
- [x] All booking inputs validated server-side and inside the database; phone number normalized
- [x] Anonymous requests rate-limited transactionally by phone + HMAC network identifier, with honeypot and minimum fill time
- [x] No personal data of guests exposed to public queries
- [ ] HTTPS and production environment verified on Hostinger; admin cookies are refreshed by the Next.js proxy
- [ ] GitHub: main protected (`master`/`main` requires PR + passing checks), secrets never committed
- [x] `npm audit`, lint, typecheck, unit tests and production build run in CI on Node 22

## 7. Building phases (each ends with a working, deployable state)

**Phase 0 — Project setup**
- `git init`, GitHub repo, `.gitignore` (node_modules, .next, .env*), README, Tailwind, zod, dayjs installed

**Phase 1 — Supabase backend**
- Create project, run schema/migrations (SQL file committed in repo), RLS policies, `get_available_slots` RPC, seed services + 1 test admin

**Phase 2 — Public site**
- Services page → date picker (PT/EN) → slot picker (RPC) → request form (server action with zod) → thanks page

**Phase 3 — Admin**
- Login page, dashboard: list pending, approve/reject, service + working-hours/time-off management

**Phase 4 — Notifications & hardening**
- Resend integration (approval/rejection emails when email provided), rate limiting, audit of RLS, security checklist above

**Phase 5 — Deploy to Hostinger**
- Hostinger Node.js app: SSH into host → `git pull` → `npm ci && npm run build` → Passenger startup file (`server.js`) booting Next on the assigned port; set env vars in hPanel; test, then iterate

## 8. Next step

Start Phase 0 — say the word and I'll scaffold the repo in this folder.
