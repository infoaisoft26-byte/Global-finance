const DEFAULT_BRAND = 'Global Finance';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'https://globalfin-beta.vercel.app';
  return raw.replace(/\/+$/, '');
}

function welcomeHtml({ name, memberId, email, transactionPassword }) {
  const brand = escapeHtml(process.env.EMAIL_BRAND_NAME || DEFAULT_BRAND);
  const safeName = escapeHtml(name || 'Member');
  const safeMemberId = escapeHtml(memberId || '—');
  const safeEmail = escapeHtml(email || '—');
  const safeTransactionPassword = escapeHtml(transactionPassword || '—');
  const appUrl = normalizeBaseUrl(process.env.APP_URL || process.env.PUBLIC_APP_URL);
  const loginUrl = `${appUrl}/login`;
  const supportEmail = escapeHtml(process.env.SUPPORT_EMAIL || 'support@globalfinance.app');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Welcome to ${brand}</title>
</head>
<body style="margin:0;padding:0;background:#0b1428;font-family:Arial,Helvetica,sans-serif;color:#e7edf7;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0b1428;padding:30px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#1b2940;border:1px solid #314158;border-radius:10px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.25);">
          <tr>
            <td align="center" style="padding:34px 24px;background:linear-gradient(135deg,#12b886,#139bc2);">
              <div style="width:48px;height:48px;line-height:48px;border-radius:50%;background:rgba(255,255,255,.16);font-size:24px;margin-bottom:12px;">🎉</div>
              <div style="font-size:25px;line-height:32px;font-weight:800;color:#fff;">Welcome to ${brand}!</div>
              <div style="font-size:13px;color:#e9ffff;margin-top:6px;">Your Account Has Been Created Successfully</div>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 28px;">
              <p style="margin:0 0 18px;font-size:16px;font-weight:700;color:#fff;">Dear ${safeName},</p>
              <p style="margin:0 0 22px;font-size:13px;line-height:21px;color:#b9c6d8;">Thank you for registering with ${brand}. Your account is ready. Your login password is never sent by email. The T-Password below is for withdrawal security; keep it private and change it from your security settings if that option is available.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#101a2d;border-left:3px solid #16c784;border-radius:7px;">
                <tr><td style="padding:18px 18px 8px;color:#93a4ba;font-size:12px;width:110px;">User ID</td><td style="padding:18px 18px 8px;color:#19d38d;font-size:13px;font-weight:700;">${safeMemberId}</td></tr>
                <tr><td style="padding:8px 18px;color:#93a4ba;font-size:12px;">Email</td><td style="padding:8px 18px;color:#fff;font-size:13px;">${safeEmail}</td></tr>
                <tr><td style="padding:8px 18px;color:#93a4ba;font-size:12px;">T-Password</td><td style="padding:8px 18px;color:#19d38d;font-size:13px;font-weight:700;letter-spacing:1px;">${safeTransactionPassword}</td></tr>
                <tr><td style="padding:8px 18px 18px;color:#93a4ba;font-size:12px;">Portal URL</td><td style="padding:8px 18px 18px;font-size:13px;"><a href="${loginUrl}" style="color:#46b6ff;text-decoration:underline;">${loginUrl}</a></td></tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
                <tr><td align="center"><a href="${loginUrl}" style="display:inline-block;background:#12b886;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:14px 25px;border-radius:6px;">Login to Your Account →</a></td></tr>
              </table>

              <div style="background:#101a2d;border:1px solid #394a61;border-radius:7px;padding:17px 18px;">
                <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:9px;">💡 Next Steps:</div>
                <ul style="margin:0;padding-left:20px;color:#b9c6d8;font-size:12px;line-height:20px;">
                  <li>Log in to your Member Dashboard to review your account.</li>
                  <li>Complete your profile and security settings.</li>
                  <li>Never share your password, OTP, or private wallet credentials.</li>
                </ul>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 18px;border-top:1px solid #314158;color:#8ea0b7;font-size:11px;line-height:18px;">Need help? Contact our support team at <a href="mailto:${supportEmail}" style="color:#46b6ff;">${supportEmail}</a><br/>© ${new Date().getFullYear()} ${brand}. All rights reserved.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendWelcomeEmail({ to, name, memberId, transactionPassword }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.EMAIL_FROM || '').trim();
  if (!apiKey || !from) {
    console.warn('Welcome email skipped: RESEND_API_KEY or EMAIL_FROM is not configured.');
    return { sent: false, skipped: true };
  }

  const brand = process.env.EMAIL_BRAND_NAME || DEFAULT_BRAND;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Welcome to ${brand} - Account Registration Successful`,
      html: welcomeHtml({ name, memberId, email: to, transactionPassword }),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Welcome email provider rejected request: ${detail}`);
  }

  return { sent: true, id: payload?.id || null };
}
