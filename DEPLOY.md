# Deploying to Hostinger Cloud (Startup plan)

Current flow (2025/2026): hPanel no longer uses the old Passenger "Advanced → Node.js" setup for new apps — use the **Node.js web app** feature, which is Git-connected and rebuilds on push.

## Steps

1. **hPanel → Websites → Add Website → Node.js web app**
   - Source: **Connect with GitHub** (auto-deploys every push to your branch)
   - Hostinger auto-detects Next.js; confirm:
      - Node.js version: **22.12 or newer**
     - Build command: `build` · Output directory: `.next` (do not change)
2. **Environment variables** (hPanel, Node app → Environment variables) — set before first build since `NEXT_PUBLIC_*` get baked in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `APPOINTMENT_TIMEZONE`, `BOOKING_RATE_LIMIT_SECRET`, `NODE_ENV=production`
   - Email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFICATION_EMAILS`
   - Google: all `GOOGLE_*` variables and `CRON_SECRET` documented in `.env.example`
3. Deploy and watch the **Deployments** build log.

## Good to know

- **No startup file needed** for the `next` app type — Hostinger applies `output: "standalone"` and starts the server itself.
- The generated `.htaccess` in `public_html` routes your domain to the app — never hand-edit it (a redeploy regenerates it; stale manual edits cause 403s).
- Builds have a **15-minute cap**; one deploy at a time. Keep the app lean (we did).
- Restart: click the **Running** badge → Restart (legacy Passenger: `touch tmp/restart.txt`).
- Runtime logs: **Runtime Logs** in the dashboard; failed builds get an AI analysis in Deployments.
- SSH **is** available on Cloud Startup (website dashboard → SSH Access) as a fallback for debugging; the normal flow is Git deploy.
- `next.config` must export an object (ours does); `.cjs` configs are silently ignored; `output: 'export'` is overridden — server mode only.

## First deploy checklist

- [ ] GitHub repo connected in hPanel
- [ ] Env vars saved (project redeploys on save)
- [ ] New Supabase project: `supabase/schema.sql` executed; existing project: every `supabase/migrations/*.sql` applied in order
- [ ] Admin user created in Supabase Auth and inserted into `admin_users`
- [ ] `npm run check` and `npm audit` pass on Node 22.12+
- [ ] Test booking → approve → verify slot becomes unavailable
- [ ] Test booking → admin alert email → approve → customer confirmation email
