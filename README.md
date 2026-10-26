Eventra — Event Management Platform

PHP 8.2+ · MySQL · Vanilla JS. No build step, no Node server, no external
services required to run locally.

 Run on any laptop (5 minutes)

1. Install the stack — any one of:
   - [XAMPP](https://www.apachefriends.org/) (Windows/Mac/Linux — includes PHP, MySQL, Apache)
   - WAMP / MAMP / Laragon
   - Plain PHP 8.2+ CLI + MySQL 8

2. Get the code into your web root (e.g. `C:\xampp\htdocs\eventra` or any folder).

3. Start MySQL and create nothing by hand — the setup wizard does the rest:
   bash
    Option A: PHP built-in server (no Apache needed)
   php -S 127.0.0.1:8080 server/index.php

    Option B: XAMPP — just start Apache + MySQL and open the project URL
   

4. Run the setup wizard once: open <http://127.0.0.1:8080/setup/index.php>
   (or `http://localhost/<folder>/setup/index.php` under Apache). It:
   - verifies PHP version + extensions,
   - creates `.env` from `.env.example` if missing,
   - ensures `logs/` and `media/` are writable,
   - imports `database/eventra.sql` on a fresh database,
   - deletes itself when everything is green.

5. Fill in `.env` (only what you need):
   - Local DB defaults work out of the box on XAMPP (root, empty password).
   - Email/SMS/Paystack/Google keys are optional — the app runs without them
     and logs a clear warning instead of crashing.

 Daily dev server (used by this project)
bash
php -S 0.0.0.0:8000 server/index.php

Freebuff/restart note: background servers die on restart — just rerun the line above.

 Configuration

All secrets live in `.env` (gitignored). `.env.example` is a placeholder
template — never put real keys in it. Key groups: `DB_`, `MAIL_`, `PAYSTACK_`,
`BREVO_`, `GOOGLE_`, `QR_SECRET`, `CRON_SECRET`, `APP_URL`.

- Local vs live: on `localhost`/`127.0.0.1` the app auto-uses the request
  host; other hosts use `APP_URL` and (if set) the `LIVE_DB_` credentials.
- Email: `config/email.php` maps `MAIL_` → SMTP constants.
- Paid client events use the client's live Paystack account and a 10% Attoneex
  subaccount split. Configure the platform's own `PAYSTACK_PLATFORM_SUBACCOUNT_BANK_CODE`
  and `PAYSTACK_PLATFORM_SETTLEMENT_ACCOUNT_NUMBER`; payment setup fails closed
  if these are missing.
- URL shortener: DB-backed (`short_urls` table, auto-created). Codes resolve
  at `/s/{code}` and hide real file paths in emails, share links and payment
  callbacks. Short links preserve the configured `APP_URL` path for
  subdirectory deployments. Create links with `POST /api/s` (auth required).

 Portability rules baked into the code

- No absolute Windows paths or drive letters anywhere in the repo.
- Base URLs are always resolved at runtime (`APP_URL` → request host).
- `vendor/` ships with the repo — no `composer install` needed on a new machine.
- The `short_urls` table auto-creates on first use; other schema lives in
  `database/eventra.sql` (+ per-change files in `database/migrations/`).
- Uploads write to `media/`/`public/assets/` via relative paths; PHP `ini`
  settings come from `.htaccess` (Apache) or the built-in server — no global
  `php.ini` edits required.

 Cron / scheduled tasks

No OS scheduler is needed for reminders: pages opportunistically ping
`/api/cron/run-reminders.php` (auth: `CRON_SECRET`, any logged-in session, or
CLI), which throttles itself to one run per 2 minutes and fans out to
`cron/notify-pre-event.php`:

- 30 min before start → admin + client in-app notifications, attendee email/SMS
- 5 min before start → admin + client "starting in 5 minutes" notifications
- Auto-publishes scheduled drafts
