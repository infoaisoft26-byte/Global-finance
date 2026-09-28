import crypto from 'node:crypto';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { withTransaction } from './_lib/db.js';
import { applyActivationIncome, ensureIncomeSchema } from './_lib/incomeEngine.js';

const BASIC_AMOUNTS = [200, 500, 1000, 2000, 5000, 10000, 20000, 500000, 100000, 200000, 500000];
const FD_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function fallbackPackage(id) {
  const b = /^gf-basic-(\d+)$/.exec(id);
  if (b) {
    const i = Number(b[1]) - 1;
    const amount = BASIC_AMOUNTS[i];
    if (!amount) return null;
    return { id, name: `Base Plan ${i + 1}`, code: `GF_BASE_${String(i + 1).padStart(2,'0')}`, type: 'basic', min_amount: amount, max_amount: amount, roi_rate: 1, duration_days: 25, active: true };
  }
  const f = /^gf-fd-(base|prime)-(\d+)$/.exec(id);
  if (f) {
    const prime = f[1] === 'prime';
    const i = Number(f[2]) - 1;
    const amount = FD_AMOUNTS[i];
    if (!amount) return null;
    return { id, name: `${prime ? 'Prime' : 'Base'} FD Plan ${i + 1}`, code: `GF_FD_${prime ? 'PRIME' : 'BASE'}_${String(i + 1).padStart(2,'0')}`, type: 'fd', min_amount: amount, max_amount: amount, roi_rate: prime ? 1.5 : 1, duration_days: prime ? 515 : 365, active: true };
  }
  return null;
}
async function resolvePackage(client, packageId) {
  const dbPkg = await client.query(`SELECT id,name,code,type,min_amount,max_amount,roi_rate,duration_days,active FROM packages WHERE id=$1 OR code=$1 LIMIT 1`, [packageId]);
  return dbPkg.rows[0] || fallbackPackage(packageId);
}
async function requireMember(req) {
  const auth = String(req.headers.authorization || '');
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const decoded = await verifyFirebaseIdToken(idToken);
  const uid = String(decoded.uid || '');
  const email = String(decoded.email || '').trim().toLowerCase();
  if (!uid || !email) throw new Error('AUTH_REQUIRED');
  return { uid, email };
}

async function handlePackageHistory(member, res) {
  const rows = await withTransaction(async (client) => {
    const user = await client.query('SELECT id,status FROM users WHERE id=$1 AND email=$2 LIMIT 1', [member.uid, member.email]);
    if (!user.rowCount || user.rows[0].status !== 'active') throw new Error('ACTIVE_MEMBER_REQUIRED');
    const q = await client.query(`SELECT id,user_id,package_id,package_type,package_name,amount,roi_daily_rate,duration_days,total_earned,status,activated_at,expires_at FROM package_activations WHERE user_id=$1 ORDER BY activated_at DESC LIMIT 100`, [member.uid]);
    return q.rows;
  });
  return json(res, 200, { items: rows });
}

async function handlePackagePurchase(member, body, res) {
  const packageId = String(body.packageId || '').trim();
  if (!packageId) return json(res, 400, { error: 'Package is required' });
  const result = await withTransaction(async (client) => {
    await ensureIncomeSchema(client);
    const userResult = await client.query('SELECT id,email,name,status FROM users WHERE id=$1 AND email=$2 LIMIT 1 FOR UPDATE', [member.uid, member.email]);
    const user = userResult.rows[0];
    if (!user || user.status !== 'active') throw new Error('ACTIVE_MEMBER_REQUIRED');
    const pkg = await resolvePackage(client, packageId);
    if (!pkg || !pkg.active) throw new Error('PACKAGE_NOT_AVAILABLE');
    const amount = Number(pkg.min_amount);
    await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [member.uid]);
    const walletResult = await client.query('SELECT * FROM wallets WHERE user_id=$1 LIMIT 1 FOR UPDATE', [member.uid]);
    const available = Number(walletResult.rows[0]?.fund_wallet || 0);
    if (available < amount) { const e = new Error('INSUFFICIENT_USDT'); e.available = available; e.required = amount; throw e; }
    const purchaseId = `PKG-${crypto.randomUUID()}`;
    const now = new Date();
    const expires = new Date(now.getTime() + Number(pkg.duration_days) * 86400000);
    await client.query(`UPDATE wallets SET fund_wallet=fund_wallet-$2,basic_package_active=basic_package_active+CASE WHEN $3='basic' THEN $2 ELSE 0 END,fd_package_active=fd_package_active+CASE WHEN $3='fd' THEN $2 ELSE 0 END,updated_at=NOW() WHERE user_id=$1`, [member.uid, amount, pkg.type]);
    await client.query(`INSERT INTO package_activations (id,user_id,package_id,package_type,package_name,amount,roi_daily_rate,duration_days,total_earned,status,activated_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'active',$9,$10)`, [purchaseId, member.uid, pkg.id, pkg.type, pkg.name, amount, Number(pkg.roi_rate), Number(pkg.duration_days), now, expires]);
    await client.query(`INSERT INTO ledger_transactions (id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata) VALUES ($1,$2,'package_purchase','fund_wallet','debit',$3,0,$3,$4,$5,'completed',$6::jsonb)`, [`LED-${purchaseId}`, member.uid, amount, `USDT package purchase: ${pkg.name}`, purchaseId, JSON.stringify({ packageId: pkg.id, packageName: pkg.name, packageType: pkg.type, asset: 'USDT' })]);
    const commissions = await applyActivationIncome(client, { activationId: purchaseId, userId: member.uid, amount, packageName: pkg.name, packageType: pkg.type });
    await client.query(`INSERT INTO audit_logs (id,actor_user_id,actor_email,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,'PACKAGE_PURCHASE_COMPLETED','package_activation',$4,$5::jsonb)`, [crypto.randomUUID(), member.uid, member.email, purchaseId, JSON.stringify({ packageId: pkg.id, packageName: pkg.name, packageType: pkg.type, amount, asset: 'USDT', automaticIncomeCredits: commissions.credited })]);
    const updated = await client.query('SELECT * FROM wallets WHERE user_id=$1 LIMIT 1', [member.uid]);
    return { purchaseId, pkg, amount, wallet: updated.rows[0], commissions };
  });
  return json(res, 200, { success: true, purchaseId: result.purchaseId, packageName: result.pkg.name, packageType: result.pkg.type, amount: result.amount, asset: 'USDT', fundWallet: Number(result.wallet?.fund_wallet || 0), automaticIncomeCredits: result.commissions.credited, message: `${result.pkg.name} purchased successfully. USDT ${result.amount.toFixed(2)} deducted automatically from Available USDT.` });
}

export default async function handler(req,res) {
  if (req.method!=='POST') return json(res,405,{error:'Method not allowed'});
  try {
    const member = await requireMember(req);
    const body = typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action = String(body.action||'verify_deposit');
    if (action==='package_history') return await handlePackageHistory(member,res);
    if (action==='package_purchase') return await handlePackagePurchase(member,body,res);
    if (action==='verify_deposit') return json(res,410,{error:'Direct deposit credit is retired. Submit a recharge request for admin review.'});
    return json(res,400,{error:'Invalid action'});
  } catch (error) {
    const message = String(error?.message||'');
    if (message==='AUTH_REQUIRED') return json(res,401,{error:'Authentication required'});
    if (message==='ACTIVE_MEMBER_REQUIRED') return json(res,403,{error:'Active member account required'});
    if (message==='PACKAGE_NOT_AVAILABLE') return json(res,404,{error:'Package is not available'});
    if (message==='INSUFFICIENT_USDT') return json(res,409,{error:'Insufficient Available USDT',available:Number(error.available||0),required:Number(error.required||0)});
    console.error('usdt-bep20-deposit failed:', error instanceof Error?error.message:error);
    return json(res,500,{error:'Unable to complete this USDT operation right now'});
  }
}
