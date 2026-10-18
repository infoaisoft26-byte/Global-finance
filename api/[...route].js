import adminNetwork from './_handlers/admin-network.js';
import adminToken from './_handlers/admin-token.js';
import adminUserDetail from './_handlers/admin-user-detail.js';
import authSync from './_handlers/auth-sync.js';
import health from './_handlers/health.js';
import logout from './_handlers/logout.js';
import memberProfile from './_handlers/member-profile.js';
import memberToken from './_handlers/member-token.js';
import p2pTransfer from './_handlers/p2p-transfer.js';
import referralLookup from './_handlers/referral-lookup.js';
import session from './_handlers/session.js';
import systemSettings from './_handlers/system-settings.js';
import usdtAutoCreditCron from './_handlers/usdt-auto-credit-cron.js';
import usdtBep20Deposit from './_handlers/usdt-bep20-deposit.js';
import usdtDepositAddress from './_handlers/usdt-deposit-address.js';
import usdtDepositAutoCreditCron from './_handlers/usdt-deposit-auto-credit-cron.js';
import usdtRecharge from './_handlers/usdt-recharge.js';

const routes = new Map([
  ['admin-network', adminNetwork],
  ['admin-token', adminToken],
  ['admin-user-detail', adminUserDetail],
  ['auth-sync', authSync],
  ['health', health],
  ['logout', logout],
  ['member-profile', memberProfile],
  ['member-token', memberToken],
  ['p2p-transfer', p2pTransfer],
  ['referral-lookup', referralLookup],
  ['session', session],
  ['system-settings', systemSettings],
  ['usdt-auto-credit-cron', usdtAutoCreditCron],
  ['usdt-bep20-deposit', usdtBep20Deposit],
  ['usdt-deposit-address', usdtDepositAddress],
  ['usdt-deposit-auto-credit-cron', usdtDepositAutoCreditCron],
  ['usdt-recharge', usdtRecharge],
]);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const pathname = String(req.url || '/').split('?')[0];
  const routeName = pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const routeHandler = routes.get(routeName);
  if (!routeHandler) return json(res, 404, { error: 'API route not found' });
  return await routeHandler(req, res);
}
