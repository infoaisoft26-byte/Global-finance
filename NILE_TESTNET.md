# Nile test wallet and buy/sell workflow

This feature uses only TRON Nile and its test USDT contract `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf`. Test tokens and test credits have no cash value.

## Setup

Set server-only variables in Vercel Preview first:

- `TRON_TESTNET_ENABLED=true`
- `TRON_TESTNET_DEPOSIT_ADDRESS=<Nile treasury public address>`
- `TRON_TESTNET_TOKEN_DECIMALS=6`
- `TRON_TESTNET_INR_PER_USDT=100` (fixed test-credit quote, not a real exchange rate)
- `TRONGRID_API_KEY=<optional Nile TronGrid key>`

The public Nile treasury address `TXxyz7QYryFMKqTCyt5KpLijx9M6kxuVbt` and non-secret test settings are included in `vercel.json` for deployments from this branch. The holder of that account must obtain Nile test TRX and USDT-TEST separately before buy requests can be fulfilled. Vercel project settings can override these values when needed. Never use the member wallet `TGvi8RYS4JDWFn3TPrcK6fE3wXtJncvbkF` as the treasury for its own sell requests.

Keep `PAYMENTS_ENABLED=false` and `PAYOUTS_ENABLED=false`. Never put a seed phrase or private key in the app or server configuration. The administrator controls the treasury in TronLink.

## Member workflow

1. Sign in and open **Nile Test Wallet & Trading**. Connect TronLink with Nile selected. The API reads the public address and displays its on-chain balances.
2. **Sell test USDT:** Create a sell request. Send the exact unique amount to the treasury, optionally through the TronLink signing prompt. The server verifies the confirmed Nile transfer before crediting the separate test balance.
3. **Buy test USDT:** Reserve test credits for a buy request. The request stays pending until an administrator transfers the exact amount from the Nile treasury to the user's address and verifies the TXID in **Admin → Nile Test Buys**. Cancellation refunds test credits.

Test credits cannot fund real packages, real transfers or withdrawals. A buy request is not a completed token transfer.

## Existing data and deployment gate

The earlier `crypto-deposit-sync` credited `wallets.fund_wallet`. This branch changes **new** test deposits to `test_wallets`. Before production rollout, inspect any older credited intents and ledger records, reconcile real Fund Wallet balances or packages affected, and document corrections. Do not blindly subtract historical funds: they may have been spent.

Verify Preview using distinct admin and member accounts, a small Nile test USDT sell, server confirmation, a buy request, an actual treasury transfer, and rejection of a wrong-token or wrong-amount TXID. Keep mainnet payments disabled.
