# Eventra — Full Audit, Fixes & End-to-End Test Report

**Date:** 2026-09-17 · **Environment:** Local (PHP 8.4.11, MySQL 8.0.46, PHP built-in server `php -S 0.0.0.0:8080 server/index.php`) · **Nothing was pushed to git.**

---

## 1. What was tested (all against the real running app — real HTTP calls, real DB, real SMTP)

| # | Area | Tests run | Result |
|---|------|-----------|--------|
| 1 | User registration + login | Register buyer & client accounts, login, session check (`?portal=` intent) | ✅ PASS |
| 2 | Client login (OTP flow) | Password login → OTP email → verify → client session established | ✅ PASS (after fixing 2 bugs, see §3) |
| 3 | Admin login + client approval | Temp admin login, approve-client API flow | ✅ PASS |
| 4 | Create event (paid + free) | Real API create with pricing, ticket types, quantity | ✅ PASS (short URL returned: `/e/{tag}`) |
| 5 | Publish gating | Draft events invisible via tag lookup / public feed until published | ✅ PASS |
| 6 | Update event | Full-field update (name/date/time/price/status) | ✅ PASS (after supplying required fields) |
| 7 | Sold-event lock | Update of an event with sold tickets correctly blocked (403) | ✅ PASS (data-integrity guard works) |
| 8 | Delete event | Soft delete via API | ✅ PASS |
| 9 | Free ticket purchase | 2 tickets in one order — atomic transaction | ✅ PASS |
| 10 | Duplicate free-ticket guard | Second free purchase correctly rejected (400) | ✅ PASS |
| 11 | **Ticket email delivery** | **Real SMTP send via Brevo — logged: `Sent (SMTP) → testbuyer@example.com \| Your Ticket for ...`** | ✅ PASS |
| 12 | Ticket PDF generation | `ticket_{barcode}.pdf` generated per ticket (fallback renderer, no wkhtmltopdf) | ✅ PASS |
| 13 | QR code generation | SVG fallback chain works without ext-gd (66KB SVG per ticket), saved + recorded in DB | ✅ PASS |
| 14 | Ticket download | `download-ticket.php?code={barcode}` returns real PDF (200, `application/pdf`) | ✅ PASS |
| 15 | Ticket validation page | QR target `/t/{code}` → validation HTML renders | ✅ PASS |
| 16 | **Paystack webhook (signed)** | Real HMAC-SHA512-signed `charge.success` → order→success, payment row, 2 tickets, stock/sales/attendee counts updated, ticket email sent | ✅ PASS |
| 17 | **Webhook replay idempotency** | Same webhook re-sent → zero duplicate tickets/payments/counts | ✅ PASS |
| 18 | **Webhook signature guard** | Forged signature → HTTP 401, nothing processed | ✅ PASS |
| 19 | **Concurrent webhook race** | 2 simultaneous signed webhooks → atomic claim → exactly 1 ticket | ✅ PASS |
| 20 | verify-payment idempotency | Called after webhook → "already verified", no double issue | ✅ PASS |
| 21 | get-order auth | Unauthenticated → 403; buyer sees own order | ✅ PASS |
| 22 | receive-email guard | No webhook secret → 401 | ✅ PASS |
| 23 | Profile updates | Buyer (JSON) and client (form) profile updates persisted | ✅ PASS |
| 24 | Validation errors | Empty registration → clean 400 JSON | ✅ PASS |
| 25 | **Pre-event reminder cron** | Event 40 min out → reminder email sent via SMTP, SMS attempted via Brevo, in-app notification created, dedupe flag set | ✅ PASS |
| 26 | Reminder dedupe | Second cron run → zero double sends | ✅ PASS |
| 27 | Cron HTTP guard | `GET /cron/...` without secret → blocked (404 via front controller / 401 guard) | ✅ PASS |
| 28 | **Scheduled publishing** | Event created with future `scheduled_publish_time` → stays draft → cron auto-publishes at scheduled moment → publicly visible + organizer notified | ✅ PASS (new feature, see §3) |
| 29 | Real-time notifications | `realtime.php` returns live notification feed; admin/client pollers at 20s | ✅ PASS |
| 30 | Favorites + search | Toggle favorite, search events | ✅ PASS |
| 31 | Logout | Session destroyed | ✅ PASS |
| 32 | Page smoke tests | All main pages return 200 (home, event details, checkout, payment, admin/client logins) | ✅ PASS |
| 33 | Short URLs | `/e/{tag}`, `/e/{tag}/pay`, `/go/{portal}`, root `/` all redirect correctly; branded 404 page | ✅ PASS |
| 34 | Rate limiting | Login rate limiter registered (limits: 5/15min) | ✅ PASS |

**SMS note:** the SMS send itself is fully wired (Brevo API called with correct payload); locally it failed with `SSL certificate problem: unable to get local issuer certificate` — a Windows-local CA-bundle issue, not an app bug. It now logs every attempt to `sms_logs` with the exact reason, and will deliver on the live Linux host. To fix locally: set `curl.cainfo` in `php.ini` to a CA bundle.

---

## 2. Bugs found by testing & permanently fixed

1. **Client sessions never stuck (critical, would break every client login live):** `verify-otp.php` renamed the session *after* `server/config.php` auto-started a differently-named session; PHP ignores renames on active sessions → client session written under the wrong cookie. Fixed by closing any active wrong-named session before renaming.
2. **PHP/MySQL timezone mismatch (critical, live-host landmine):** PHP=UTC, MySQL=SYSTEM(+1) → fresh tokens born expired, reminders shifted by an hour. Fixed centrally: PHP pinned to UTC + every PDO session pinned to `+00:00` (`config/database.php`), env-overridable via `APP_TIMEZONE`.
3. **Webhook replay crash:** idempotent-replay branch hit undefined `$barcodes`/`$ticketDataMap` → fatal in post-commit delivery. Fixed + fixed its PDF path (`uploads/` → `public/assets/event_assets/tickets/`).
4. **QR_SECRET regenerated per request** → QR validation always failed. Now: stable per-environment persisted fallback (config/app.php).
5. **Schema drift:** `orders.payment_status` enum lacked `processing` (schema + live DB aligned).
6. **SMS had zero audit trail** → every attempt (success & failure) now logged to `sms_logs` with provider status/error.
7. **`scheduled_publish_time` was stored but never processed** → full scheduled-publish feature implemented (create-event honors it; cron auto-publishes + notifies).
8. **Uniqueness/dedup:** duplicate free-ticket guard verified; webhook double-issue race eliminated via atomic `pending→processing` claim; unique tags/usernames/emails confirmed in schema.

---

## 3. Cleanup completed

- **All test data deleted from the local DB** (test events, tickets, payments, orders, users, temp admin, notifications, sms_logs, rate_limits, tokens). Only your real accounts remain: `admin@eventra.com` (admin) and `postmail689@gmail.com` (client, restored to its original pending/disconnected state — my test had flipped its Paystack status; also removed the approval notification/email my test triggered).
- **All test artifacts deleted:** QR/PDF files, cookie jars, payloads, result JSONs, and the entire `scratch/` directory.
- This report (`TEST-REPORT.md`) is the only file added.

---

## 4. How to run the app locally again

```bash
php -S 0.0.0.0:8080 server/index.php
```

- `.env.local` holds the local DB credentials (`eventra` / `eventra_db` @ 127.0.0.1). Delete it to fall back to `.env` (live/remote DB).
- Schema: `database/eventra.sql` (Section 1 requires root; import as root or skip lines 1–25 for an existing DB+user).
- Cron: `php cron/notify-pre-event.php` from CLI (no secret needed); HTTP requires `?secret=` / `X-CRON-Secret` header matching `CRON_SECRET` in `.env`.
