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

## USDT BEP20 recharge rollout

The recharge API uses the existing Neon `wallets.fund_wallet` as Available Fund and writes an immutable `ledger_transactions` credit. Apply the updated `src/db_schema.sql` to the linked production database before deploying the API. It creates `usdt_bep20_recharges` with a globally unique normalized TXID. Existing Firebase recharge requests are not migrated automatically; review any outstanding requests before enabling the new flow.

The previous `/api/usdt-bep20-deposit` auto-credit route is retired with HTTP 410. It treated token units as INR wallet units without an approved conversion and bypassed the admin Pending/Approve/Reject queue. The member UI now submits to `/api/usdt-recharge`.

Server-only Vercel variables for the BNB Smart Chain mainnet:

- `BSC_RPC_URL` — trusted BSC mainnet JSON-RPC endpoint.
- `USDT_BEP20_CONTRACT_ADDRESS` — independently verified USDT BEP20 contract address; never set this from an unverified token page.
- `PAYMENTS_ENABLED=true` and `USDT_RECHARGE_ENABLED=true` — set only after the migration, token/RPC verification, wallet rule audit, and production review are complete.

The receiving address is `0x062D87BE020291b34D08fdCfa7E432248680910E`. The QR asset is generated from that exact address. The approval endpoint checks chain ID 56, a successful receipt, at least 12 confirmations, the configured contract's transfer logs, recipient address and claimed amount. An admin supplies the INR credit and records the conversion basis in a review note; the API atomically records the ledger and wallet credit. No automatic exchange rate is assumed.

Before enabling live deposits, close the legacy Firebase financial write paths. The current `firestore.rules` still permit an account owner to write their Firebase wallet and create transaction records, and other existing workflows depend on those writes. Migrating those workflows to trusted server endpoints and tightening the deployed Firestore rules is a separate required security step. A UI-only recharge restriction does not secure those legacy collections.

After deploying to a preview environment with a migrated test database, verify member submission, duplicate TXID rejection, non-admin approval rejection, invalid-chain proof rejection, one successful admin approval, idempotent second approval rejection, a single ledger credit, and the updated member Available Fund. Do not run a live-funds approval as a test.
