# GLOBAL FINANCE — Vercel + Neon + Firebase Auth Setup

The production login flow is:

1. Firebase handles Email/Password and Google identity authentication in the browser.
2. The browser sends the verified Firebase ID token to `/api/auth-sync`.
3. The server verifies the Firebase token with Firebase Admin.
4. The server creates/updates the real user and wallet in Neon PostgreSQL.
5. The server creates an HTTP-only `gf_session` cookie.
6. User role, account status, referral code, KYC status and wallet data are returned from Neon.

## Required Vercel environment variables

Set these for Production and Preview:

- `DATABASE_URL` — Neon pooled PostgreSQL connection string.
- `AUTH_SECRET` — at least 32 random characters.
- `FIREBASE_PROJECT_ID` — Firebase project ID.
- `FIREBASE_CLIENT_EMAIL` — Firebase service-account client email.
- `FIREBASE_PRIVATE_KEY` — Firebase service-account private key. Preserve line breaks using `\n` when entered as one line.
- `ADMIN_EMAIL` — Firebase login email that should receive the Neon `admin` role.
- `APP_URL` — current Vercel project URL.
- `PAYMENTS_ENABLED=false`
- `PAYOUTS_ENABLED=false`

Never prefix server secrets with `VITE_`.

## Database migration

Run once after setting `DATABASE_URL`:

```bash
npm run db:migrate
```

The migration is idempotent and reads `src/db_schema.sql`.

## Admin login

1. Set `ADMIN_EMAIL` in Vercel to the intended administrator email.
2. Ensure that email is a valid Firebase Authentication account.
3. Sign in normally using the GLOBAL FINANCE login screen.
4. On the first secure sync, the Neon user is created/promoted with `role='admin'`.
5. Admin access in the frontend is based on the Neon role returned by the server, not a hardcoded email.

## Health check

After deployment open:

`/api/health`

Expected successful response:

```json
{"status":"ok","database":"connected"}
```

## Security notes

- Firebase Admin credentials, `DATABASE_URL` and `AUTH_SECRET` are server-only.
- Login creates an HTTP-only, Secure production cookie.
- Suspended users are refused a server session.
- Referral codes are generated server-side and checked for uniqueness.
- Real-money payment/payout execution remains disabled by default.
