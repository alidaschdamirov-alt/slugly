# Slugly — Clerk + Render edition

This project was migrated from the Manus runtime to a standard React, Express,
Clerk, and MySQL stack. `render.yaml` provisions the application, a private
MySQL service, persistent file storage, and a daily maintenance job.

## Deploy to Render

1. Create a Clerk application and enable the sign-in methods you need (for
   example, email/password and Google).
2. Copy this project to a GitHub repository.
3. In Render, select **New -> Blueprint** and connect the repository.
4. Render will read `render.yaml`. During creation, enter:
   - `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key;
   - `CLERK_PUBLISHABLE_KEY` — the same Clerk publishable key;
   - `CLERK_SECRET_KEY` — Clerk secret key;
   - `BOOTSTRAP_ADMIN_EMAIL` — email of the first Slugly administrator.
5. Deploy the Blueprint. Database migrations run automatically before the web
   service starts.
6. Add the Render URL and your future custom domain to the allowed origins in
   the Clerk Dashboard. After connecting a custom domain, also complete Clerk's
   production-domain setup.

The Blueprint uses paid Render services because private MySQL and persistent
disks are required for production data. The selected region is Frankfurt.

## Local development

Requirements: Node.js 22, pnpm 10.18, Docker.

```bash
cp .env.example .env
docker compose up -d mysql
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000` and add that origin to the Clerk development
instance if needed.

## Storage and scheduled jobs

Uploaded branding, generated reports, and backups are written to `STORAGE_DIR`.
On Render this directory is backed by the `slugly-files` persistent disk.
Backups are exposed only through expiring signed URLs.

The `slugly-maintenance` cron job runs daily and performs backup, anonymous-link
expiry notifications, and rate-limit cleanup. Requests are authenticated with
`CRON_SECRET`.

## Optional environment variables

- `RESEND_API_KEY` for email delivery;
- `VITE_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` for CAPTCHA;
- `SAFE_BROWSING_API_KEY` for Google Safe Browsing;
- Sentry, Google Analytics, and Amplitude keys for monitoring and analytics.
