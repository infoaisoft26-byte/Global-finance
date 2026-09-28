# Welcome Registration Email Setup

The registration API now sends a branded welcome email after the first successful account creation.

Configure these server-side environment variables in Vercel:

- `RESEND_API_KEY` — API key from Resend.
- `EMAIL_FROM` — verified sender, for example `Global Finance <welcome@yourdomain.com>`.
- `EMAIL_BRAND_NAME` — optional, defaults to `Global Finance`.
- `SUPPORT_EMAIL` — support address displayed in the footer.
- `APP_URL` — production application URL used by the Login button.

Important:

- Verify the sending domain in Resend before using a custom From address.
- Never expose `RESEND_API_KEY` through a `VITE_` variable.
- The email does not include the user's password, OTP, private key, seed phrase, or transaction password.
- Email delivery failure does not roll back an otherwise successful account registration.
- The welcome email is only attempted for the first secure user sync; routine logins do not resend it.
