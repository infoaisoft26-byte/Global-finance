import crypto from 'node:crypto';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { withTransaction } from './_lib/db.js';
import { applyActivationIncome, ensureIncomeSchema, runDailyIncome } from './_lib/incomeEngine.js';

const BASIC_AMOUNTS = [200, 500, 1000, 2000, 5000, 10000, 20000, 500000, 100000, 200000, 500000];
const FD_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];

function moneyCap(amount) { return Number((Number(amount || 0) * 5).toFixed(2)); }

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
function requireAdmin(member) {
  const allowed = String(process.env.ADMIN_EMAIL || 'admin@gf.app').trim().toLowerCase();
  if (!member?.email || member.email !== allowed) throw new Error('ADMIN_REQUIRED');
}

async function handleCron(req, res) {
  const configured = String(process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers.authorization || '');
  if (!configured) return json(res, 503, { error: 'CRON_SECRET is not configured' });
  if (auth !== `Bearer ${configured}`) return json(res, 401, { error: 'Unauthorized' });
  const requested = String(req.query?.date || '').trim();
  if (requested && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return json(res, 400, { error: 'Invalid date' });
  const result = await withTransaction(async (client) => {
    const daily = await runDailyIncome(client, requested || undefined);
    await client.query(`INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
      VALUES($1,'SYSTEM',NULL,'AUTOMATIC_DAILY_INCOME_RUN','ledger',$2,$3::jsonb)`, [
        crypto.randomUUID(),
        daily.businessDate,
        JSON.stringify({ packages: daily.packages, packagesProcessed: daily.packagesProcessed, roiCredits: daily.roiCredits, levelCredits: daily.levelCredits })
      ]);
    return daily;
  });
  return json(res, 200, { ok: true, ...result });
}

async function handlePackageHistory(member, res) {
  const rows = await withTransaction(async (client) => {
    await ensureIncomeSchema(client);
    const user = await client.query('SELECT id,status FROM users WHERE id=$1 AND email=$2 LIMIT 1', [member.uid, member.email]);
    if (!user.rowCount || user.rows[0].status !== 'active') throw new Error('ACTIVE_MEMBER_REQUIRED');
    const q = await client.query(`SELECT id,user_id,package_id,package_type,package_name,amount,roi_daily_rate,duration_days,total_earned,status,activated_at,expires_at,cap_multiple,cap_amount,credited_total,cap_reconciled,completed_at,principal_returned,principal_return_amount FROM package_activations WHERE user_id=$1 ORDER BY activated_at DESC LIMIT 100`, [member.uid]);
    return q.rows;
  });
  return json(res, 200, { items: rows });
}

async function handleAdminReconcileCap(member, body, res) {
  requireAdmin(member);
  const activationId = String(body.activationId || '').trim();
  const historicalCounted = Number(body.historicalCounted);
  if (!activationId || !Number.isFinite(historicalCounted) || historicalCounted < 0) {
    return json(res, 400, { error: 'Provide activationId and a verified non-negative historicalCounted USDT amount.' });
  }
  const result = await withTransaction(async (client) => {
    await ensureIncomeSchema(client);
    const locked = await client.query(`SELECT id,user_id,amount,cap_amount,credited_total,cap_reconciled,status
      FROM package_activations WHERE id=$1 FOR UPDATE`, [activationId]);
    const cycle = locked.rows[0];
    if (!cycle) throw new Error('ACTIVATION_NOT_FOUND');
    if (cycle.cap_reconciled === true) throw new Error('CAP_ALREADY_RECONCILED');
    const cap = Number(cycle.cap_amount ?? Number(cycle.amount) * 5);
    const counted = Number(historicalCounted.toFixed(2));
    if (counted > cap) throw new Error('HISTORICAL_TOTAL_EXCEEDS_CAP');
    const nextStatus = counted >= cap ? 'completed' : cycle.status;
    await client.query(`UPDATE package_activations
      SET cap_amount=$2,cap_multiple=5,credited_total=$3,cap_reconciled=TRUE,
          status=$4,completed_at=CASE WHEN $4='completed' THEN COALESCE(completed_at,NOW()) ELSE completed_at END
      WHERE id=$1`, [activationId, cap, counted, nextStatus]);
    await client.query(`INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
      VALUES($1,$2,$3,'INVESTMENT_CAP_RECONCILED','package_activation',$4,$5::jsonb)`, [
        crypto.randomUUID(), member.uid, member.email, activationId,
        JSON.stringify({ userId: cycle.user_id, historicalCounted: counted, capAmount: cap, capMultiple: 5, source: 'admin_verified_historical_ledger' })
      ]);
    return { activationId, capAmount: cap, creditedTotal: counted, capRemaining: Math.max(0, Number((cap-counted).toFixed(2))), status: nextStatus };
  });
  return json(res, 200, { success: true, ...result });
}

async function handleAdminReturnPrincipal(member, body, res) {
  requireAdmin(member);
  const activationId = String(body.activationId || '').trim();
  if (!activationId) return json(res, 400, { error: 'activationId is required' });
  const result = await withTransaction(async (client) => {
    await ensureIncomeSchema(client);
    const q = await client.query(`SELECT id,user_id,package_name,amount,status,cap_amount,credited_total,cap_reconciled,principal_returned
      FROM package_activations WHERE id=$1 FOR UPDATE`, [activationId]);
    const cycle = q.rows[0];
    if (!cycle) throw new Error('ACTIVATION_NOT_FOUND');
    if (cycle.status === 'active') throw new Error('PRINCIPAL_RETURN_NOT_MATURED');
    if (cycle.cap_reconciled !== true) throw new Error('CAP_RECONCILIATION_REQUIRED');
    if (cycle.principal_returned === true) throw new Error('PRINCIPAL_ALREADY_RETURNED');
    const cap = Number(cycle.cap_amount ?? Number(cycle.amount) * 5);
    const counted = Number(Number(cycle.credited_total || 0).toFixed(2));
    const headroom = Math.max(0, Number((cap-counted).toFixed(2)));
    const principalAmount = Number(Math.min(Number(cycle.amount),headroom).toFixed(2));
    if (principalAmount <= 0) throw new Error('CAP_REACHED_NO_PRINCIPAL_HEADROOM');
    await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[cycle.user_id]);
    await client.query('UPDATE wallets SET fund_wallet=fund_wallet+$2,updated_at=NOW() WHERE user_id=$1',[cycle.user_id,principalAmount]);
    const ledgerId = `PRINCIPAL-${crypto.randomUUID()}`;
    await client.query(`INSERT INTO ledger_transactions
      (id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
      VALUES($1,$2,'principal_return','fund_wallet','credit',$3,0,$3,$4,$5,'completed',$6::jsonb)`,[
        ledgerId,cycle.user_id,principalAmount,`Matured investment principal return (5X capped): ${cycle.package_name}`,activationId,
        JSON.stringify({activationId,capMultiple:5,capAmount:cap,priorCounted:counted,principalRequested:Number(cycle.amount),principalCredited:principalAmount,asset:'USDT'})
      ]);
    const nextCounted = Number((counted+principalAmount).toFixed(2));
    const nextStatus = nextCounted >= cap ? 'completed' : 'completed';
    await client.query(`UPDATE package_activations
      SET credited_total=$2,principal_returned=TRUE,principal_return_amount=$3,status=$4,
          completed_at=COALESCE(completed_at,NOW())
      WHERE id=$1`,[activationId,nextCounted,principalAmount,nextStatus]);
    await client.query(`INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
      VALUES($1,$2,$3,'PRINCIPAL_RETURN_CREDITED','package_activation',$4,$5::jsonb)`,[
        crypto.randomUUID(),member.uid,member.email,activationId,
        JSON.stringify({userId:cycle.user_id,ledgerId,principalRequested:Number(cycle.amount),principalCredited:principalAmount,capAmount:cap,creditedTotal:nextCounted,capRemaining:Number(Math.max(0,cap-nextCounted).toFixed(2))})
      ]);
    return {activationId,userId:cycle.user_id,ledgerId,principalRequested:Number(cycle.amount),principalCredited:principalAmount,capAmount:cap,creditedTotal:nextCounted,capRemaining:Number(Math.max(0,cap-nextCounted).toFixed(2)),status:'completed'};
  });
  return json(res,200,{success:true,...result});
}

async function handleAdminPackageHistory(member, res) {
  requireAdmin(member);
  const rows = await withTransaction(async (client) => {
    await ensureIncomeSchema(client);
    const q = await client.query(`
      SELECT pa.id, pa.user_id, pa.package_id, pa.package_type, pa.package_name, pa.amount,
             pa.roi_daily_rate, pa.duration_days, pa.total_earned, pa.status, pa.activated_at, pa.expires_at,
             pa.cap_multiple, pa.cap_amount, pa.credited_total, pa.cap_reconciled, pa.completed_at, pa.principal_returned, pa.principal_return_amount,
             u.name AS user_name, u.email AS user_email
      FROM package_activations pa
      LEFT JOIN users u ON u.id = pa.user_id
      ORDER BY pa.activated_at DESC
      LIMIT 500
    `);
    return q.rows;
  });
  return json(res, 200, { items: rows });
}

async function handleAdminReconcileReferralIncome(member, res) {
  requireAdmin(member);
  const result = await withTransaction(async (client) => {
    await ensureIncomeSchema(client);
    const { rows } = await client.query(`
      SELECT id,user_id,package_name,package_type,amount
      FROM package_activations
      ORDER BY activated_at ASC
    `);

    let activationsProcessed = 0;
    let distributionsCreated = 0;
    let amountCredited = 0;

    for (const activation of rows) {
      const result = await applyActivationIncome(client, {
        activationId: activation.id,
        userId: activation.user_id,
        amount: Number(activation.amount || 0),
        packageName: activation.package_name,
        packageType: activation.package_type === 'fd' ? 'fd' : 'basic',
      });
      activationsProcessed += 1;
      distributionsCreated += Number(result.credited || 0);
      amountCredited += Number(result.creditedAmount || 0);
    }

    await client.query(
      `INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
       VALUES($1,$2,$3,'REFERRAL_INCOME_RECONCILED','ledger','REFERRAL_RECONCILIATION',$4::jsonb)`,
      [
        crypto.randomUUID(),
        member.uid,
        member.email,
        JSON.stringify({
          activationsProcessed,
          distributionsCreated,
          amountCredited: Number(amountCredited.toFixed(2)),
          commissionSchedule: 'L1=7%, L2-L12=1%, L13-L15=0.5%',
          asset: 'USDT',
        }),
      ]
    );

    return {
      activationsProcessed,
      distributionsCreated,
      amountCredited: Number(amountCredited.toFixed(2)),
    };
  });

  return json(res, 200, {
    success: true,
    ...result,
    message: 'Referral income reconciliation completed from real package activations.',
  });
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
    await client.query(`INSERT INTO package_activations (id,user_id,package_id,package_type,package_name,amount,roi_daily_rate,duration_days,total_earned,status,activated_at,expires_at,cap_multiple,cap_amount,credited_total,cap_reconciled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'active',$9,$10,5,$11,0,TRUE)`, [purchaseId, member.uid, pkg.id, pkg.type, pkg.name, amount, Number(pkg.roi_rate), Number(pkg.duration_days), now, expires, moneyCap(amount)]);
    await client.query(`INSERT INTO ledger_transactions (id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata) VALUES ($1,$2,'package_purchase','fund_wallet','debit',$3,0,$3,$4,$5,'completed',$6::jsonb)`, [`LED-${purchaseId}`, member.uid, amount, `USDT package purchase: ${pkg.name}`, purchaseId, JSON.stringify({ packageId: pkg.id, packageName: pkg.name, packageType: pkg.type, asset: 'USDT' })]);
    const commissions = await applyActivationIncome(client, { activationId: purchaseId, userId: member.uid, amount, packageName: pkg.name, packageType: pkg.type });
    await client.query(`INSERT INTO audit_logs (id,actor_user_id,actor_email,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,'PACKAGE_PURCHASE_COMPLETED','package_activation',$4,$5::jsonb)`, [crypto.randomUUID(), member.uid, member.email, purchaseId, JSON.stringify({ packageId: pkg.id, packageName: pkg.name, packageType: pkg.type, amount, asset: 'USDT', automaticIncomeCredits: commissions.credited })]);
    const updated = await client.query('SELECT * FROM wallets WHERE user_id=$1 LIMIT 1', [member.uid]);
    return { purchaseId, pkg, amount, wallet: updated.rows[0], commissions };
  });
  return json(res, 200, {
    success: true,
    purchaseId: result.purchaseId,
    packageName: result.pkg.name,
    packageType: result.pkg.type,
    amount: result.amount,
    asset: 'USDT',
    fundWallet: Number(result.wallet?.fund_wallet || 0),
    automaticIncomeCredits: result.commissions.credited,
    referralIncomeCredited: Number(result.commissions.creditedAmount || 0),
    referralRecipients: result.commissions.recipients || [],
    message: `${result.pkg.name} purchased successfully. USDT ${result.amount.toFixed(2)} deducted automatically from Available USDT.`,
  });
}

export default async function handler(req,res) {
  try {
    if (req.method === 'GET') return await handleCron(req, res);
    if (req.method !== 'POST') return json(res,405,{error:'Method not allowed'});
    const member = await requireMember(req);
    const body = typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action = String(body.action||'verify_deposit');
    if (action==='package_history') return await handlePackageHistory(member,res);
    if (action==='admin_package_history') return await handleAdminPackageHistory(member,res);
    if (action==='admin_reconcile_cap') return await handleAdminReconcileCap(member,body,res);
    if (action==='admin_return_principal') return await handleAdminReturnPrincipal(member,body,res);
    if (action==='admin_reconcile_referral_income') return await handleAdminReconcileReferralIncome(member,res);
    if (action==='package_purchase') return await handlePackagePurchase(member,body,res);
    if (action==='verify_deposit') return json(res,410,{error:'Direct deposit credit is retired. Submit a recharge request for admin review.'});
    return json(res,400,{error:'Invalid action'});
  } catch (error) {
    const message = String(error?.message||'');
    if (message==='AUTH_REQUIRED') return json(res,401,{error:'Authentication required'});
    if (message==='ADMIN_REQUIRED') return json(res,403,{error:'Admin access required'});
    if (message==='ACTIVE_MEMBER_REQUIRED') return json(res,403,{error:'Active member account required'});
    if (message==='PACKAGE_NOT_AVAILABLE') return json(res,404,{error:'Package is not available'});
    if (message==='INSUFFICIENT_USDT') return json(res,409,{error:'Insufficient Available USDT',available:Number(error.available||0),required:Number(error.required||0)});
    console.error('usdt-bep20-deposit failed:', error instanceof Error?error.message:error);
    return json(res,500,{error:'Unable to complete this USDT operation right now'});
  }
}
