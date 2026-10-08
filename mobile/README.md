# Eventra Mobile (User App)

Flutter companion app for Eventra attendees.

## Google Sign-In — how it actually works (audit result)

- The app uses **google_sign_in 7.2.0** (Credential Manager on Android, Google Sign-In SDK on iOS). On **Android the token audience is always the `GOOGLE_SERVER_CLIENT_ID`** (web client); the Android client ID is informational. On iOS the audience is the iOS client ID (`GIDClientID` in Info.plist).
- `POST /api/auth/google` validates the ID token via Google tokeninfo and accepts `aud` ∈ {web, android, ios} client IDs, so both platform audiences are already whitelisted server-side.
- The backend returns an **opaque 64-hex session token** (2h TTL, `auth_tokens` table) + user object. It is stored in `flutter_secure_storage` and sent as `Authorization: Bearer …` (`.htaccess` passes the header through).
- There is **no refresh-token endpoint**. When a token expires, the API client silently re-authenticates with Google (Credential Manager / cached session) and retries the failed call once; if that fails the dead token is cleared and the app lands on login with a "session expired" notice.

### Manual steps required outside the code (Android)

1. In **Google Cloud Console → APIs & Services → Credentials**, the **Web application client** `76953809917-o7bf7c7qbvpu7qglejqe77as5gb609fb.apps.googleusercontent.com` must exist and its **Authorized JavaScript origins** must include your API host (`https://eventra-website.liveblog365.com`, plus `http://localhost:8080` for local dev).
2. Register the app's **SHA-1 and SHA-256 fingerprints** on the **Android** OAuth client:
   - debug keystore: `cd android && ./gradlew signingReport` (or `keytool -list -v -alias androiddebugkey -keystore %USERPROFILE%\.android\debug.keystore -storepass android`)
   - release keystore: run the same `keytool` command against your release keystore.
   - Current debug/release signing SHA-1: `DF:57:2A:32:82:5E:6D:8D:0F:39:80:53:31:08:D6:F7:2A:2F:56:9C`; SHA-256: `B8:44:D3:A9:E5:81:53:7A:C6:69:15:9D:95:3C:8A:16:AA:99:AA:2B:4A:DF:F7:5A:3C:68:26:4D:7F:45:56:A1`.
   - The current device test fails after account selection with Google's `UNREGISTERED_ON_API_CONSOLE`; register this package and signing certificate on an Android OAuth client in the same Cloud project as the web client.
   - The fingerprint must be on the client whose **package name is `com.example.eventra_mobile`** (rename the app id and re-register if you change it).
3. **OAuth consent screen** must be published (or the testers list must include the Google account used on device) and the `.../auth/...` scope must be non-sensitive / approved.
4. If the API is hosted behind a challenge/WAF (e.g. InfinityFree-style), requests from the app must be allowlisted — see the splash-screen cookie bypass for that host.

### Manual steps (iOS)

- `Info.plist` already contains `GIDClientID` and the reversed client ID URL scheme `com.googleusercontent.apps.76953809917-eguefgb6sgetu8a7g5grjh966il7slq6`. If you change the iOS client ID, update **both** keys together.
- The iOS OAuth client in Google Cloud Console must have bundle id `com.example.eventraMobile` registered (see `PRODUCT_BUNDLE_IDENTIFIER` in `project.pbxproj`). Note the lowercase `m` — it is not `com.example.eventra_mobile`.
- No Firebase project is required for sign-in itself; `google-services.json` / `GoogleService-Info.plist` are not used by google_sign_in v7.

## Setup

**You do not need to run a local server for Google sign-in (or anything else).**
By default the app targets the production API
(`https://eventra-website.liveblog365.com/api`); `EndpointResolver` only falls
back to local dev origins when the live host does not answer, never probes a
stale local origin ahead of production, pins production when nothing answers,
and the `/auth/google` exchange re-probes and retries once if the picked origin
stops accepting connections mid-session.

1. Copy `.env.example` to `.env` in project root and configure DB, Google, Paystack, mail keys.
2. *(Local backend development only)* Start PHP backend from repo root:
   ```bash
   php -S localhost:8000 -t . server/index.php
   ```
3. *(Local backend development only)* Configure API URL when running the app:
   - Android emulator: `--dart-define=API_BASE_URL=http://10.0.2.2:8000/api`
   - iOS simulator: `--dart-define=API_BASE_URL=http://127.0.0.1:8000/api`
   - Physical device: use your machine LAN IP, e.g. `http://192.168.1.5:8000/api`
   - Production: `https://eventra-website.liveblog365.com/api` (default)
   - Add `GOOGLE_ANDROID_CLIENT_ID` and `GOOGLE_IOS_CLIENT_ID` for the native
     OAuth clients, plus `GOOGLE_SERVER_CLIENT_ID` for the backend web client
     (the audience the Android token is minted for).

## Run

```bash
cd mobile
flutter pub get
flutter run \
   --dart-define=API_BASE_URL=http://10.0.2.2:8000/api \
   --dart-define=GOOGLE_ANDROID_CLIENT_ID=your-android-client-id \
   --dart-define=GOOGLE_IOS_CLIENT_ID=your-ios-client-id \
   --dart-define=GOOGLE_SERVER_CLIENT_ID=your-web-server-client-id
```

Entry point: `lib/main.dart` (user app only).

## REST API (via `server/index.php`)

| Method  | Path                       | Purpose                                              |
| ------- | -------------------------- | ---------------------------------------------------- |
| POST    | `/api/auth/google`         | Google sign-in → Bearer token                        |
| GET     | `/api/events`              | Paginated events (`search`, `sort`, `page`, `limit`) |
| GET     | `/api/events/{id}`         | Event details                                        |
| POST    | `/api/favorites/toggle`    | Toggle favorite                                      |
| GET     | `/api/favorites`           | User favorites                                       |
| GET/PUT | `/api/profile`             | Get/update profile                                   |
| POST    | `/api/payments/initialize` | Paystack init (paid + free + bank transfer)          |
| POST    | `/api/payments/verify`     | Verify payment (idempotent, webhook-aware)           |
| POST    | `/api/tickets/send`        | Resend ticket email                                  |
| GET     | `/api/tickets`             | User tickets                                         |
| GET     | `/api/config/app`          | Google client ID, Maps key, Paystack public key      |

Legacy `.php` endpoints remain for the web app.

## Sync architecture (summary)

- **Auth**: opaque Bearer token in `flutter_secure_storage`; no refresh endpoint, so expiry is recovered via silent Google re-auth inside the Dio interceptor (single retry per request, never for `/auth/google` itself).
- **Events**: first page of each feed variant (`sort` + `search`) cached in **sqflite** (`eventra_cache.db`, 30-minute TTL) and rendered instantly on launch, with a `LinearProgressIndicator` while the network refresh replaces it. Server is always the source of truth — the cache is only a preview, so it cannot drift from the web app's data. `sqflite` was already a transitive dependency (via shared_preferences), so this adds no new package downloads.
- **Profile**: same `PUT /api/profile` validation as web (11-digit numeric phone cap, email uniqueness on auth_accounts, etc.); failures now surface instead of being silently swallowed.
- **Payments**: WebView checkout (Paystack hosted page) because the backend builds the Paystack transaction server-side (organizer subaccounts, splits, channels) and has no mobile-SDK integration. Fulfillment is **webhook-driven**; the app polls `POST /payments/verify` (up to ~15s) which reports `success` / `processing` / `failed` and is idempotent against the webhook.

## API endpoint discovery (live + local, no rebuild)

`EndpointResolver` (`lib/core/network/endpoint_resolver.dart`) picks the API
origin at runtime by probing `GET {origin}/config/app` until one answers with
real JSON. Probe order:

1. `--dart-define=API_BASE_URL` (hard pin for a specific environment)
2. Last known-good origin (persisted in SharedPreferences — fast path)
3. Extra origins from `--dart-define=API_BASE_URLS=https://a.com/api,https://b.com/api`
4. The production default in `_production`
5. Local dev candidates (`10.0.2.2:8000`, `127.0.0.1:8000`, `localhost:8000`) —
   only probed when no remote origin answered, so production users never wait on them

**Re-hosting the backend?** Either add the new URL to `_production`
(one constant) or ship it via `--dart-define=API_BASE_URLS=…`. The winning
origin is remembered, so the app goes straight to it on later launches and
falls back to re-probing when it stops answering.

## Hosting anti-bot challenge

Some hosts (openresty/AES JS challenge) answer API requests with an HTML
puzzle page instead of JSON — this is what produced *"Eventra API is blocked
by the hosting security challenge"*. `HostChallenge`
(`lib/core/network/host_challenge.dart`) solves it natively: extract the three
`toNumbers(...)` values, AES-128-CBC decrypt with the page key, replay the
request with the resulting `__test` cookie. The Dio interceptor does this
transparently on both error and success paths, so Android and iOS behave the
same — no WebView, no user action. Regression-tested against a challenge page
captured verbatim from production (`test/host_challenge_test.dart`).

## Verify

```bash
flutter analyze --no-fatal-infos --no-fatal-warnings
flutter test
flutter build apk --debug \
   --dart-define=API_BASE_URL=http://10.0.2.2:8000/api \
   --dart-define=GOOGLE_ANDROID_CLIENT_ID=your-android-client-id \
   --dart-define=GOOGLE_IOS_CLIENT_ID=your-ios-client-id \
   --dart-define=GOOGLE_SERVER_CLIENT_ID=your-web-server-client-id
```
