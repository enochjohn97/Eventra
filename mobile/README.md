# Eventra Mobile (User App)

Flutter companion app for Eventra attendees.

## Setup

1. Copy `.env.example` to `.env` in project root and configure DB, Google, Paystack, mail keys.
2. Start PHP backend from repo root:
   ```bash
   php -S localhost:8000 -t . server/index.php
   ```
3. Configure API URL when running the app:
   - Android emulator: `--dart-define=API_BASE_URL=http://10.0.2.2:8000/api`
   - iOS simulator: `--dart-define=API_BASE_URL=http://127.0.0.1:8000/api`
   - Physical device: use your machine LAN IP, e.g. `http://192.168.1.5:8000/api`

## Run

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000/api
```

Entry point: `lib/main.dart` (user app only).

## REST API (via `server/index.php`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/google` | Google sign-in → Bearer token |
| GET | `/api/events` | Paginated events (`search`, `sort`, `page`, `limit`) |
| GET | `/api/events/{id}` | Event details |
| POST | `/api/favorites/toggle` | Toggle favorite |
| GET | `/api/favorites` | User favorites |
| GET/PUT | `/api/profile` | Get/update profile |
| POST | `/api/payments/initialize` | Paystack init |
| POST | `/api/payments/verify` | Verify payment |
| POST | `/api/tickets/send` | Resend ticket email |
| GET | `/api/tickets` | User tickets |
| GET | `/api/config/app` | Google client ID, Maps key, Paystack public key |

Legacy `.php` endpoints remain for the web app.

## Verify

```bash
flutter analyze --no-fatal-infos --no-fatal-warnings
flutter build apk --debug --dart-define=API_BASE_URL=http://10.0.2.2:8000/api
```
