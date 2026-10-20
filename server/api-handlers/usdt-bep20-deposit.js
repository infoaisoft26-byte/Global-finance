import crypto from 'node:crypto';
import { verifyFirebaseIdToken } from '../../api/_lib/firebaseAdmin.js';
import { withTransaction } from '../../api/_lib/db.js';
import { applyActivationIncome, ensureIncomeSchema, runDailyIncome } from '../../api/_lib/incomeEngine.js';

const BASIC_AMOUNTS = [2, 5, 10, 20, 25, 10000, 20000, 50000, 100000, 200000, 500000];
const BASIC_ROI_RATES = [5, 5, 1, 5, 5, 1, 1, 1, 1, 1, 1];
const BASIC_DURATIONS = [25, 25, 25, 24, 25, 25, 25, 25, 25, 25, 25];
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
    return { id, name: `Base Plan ${i + 1}`, code: `GF_BASE_${String(i + 1).padStart(2,'0')}`, type: 'basic', min_amount: amount, max_amount: amount, roi_rate: BASIC_ROI_RATES[i], duration_days: BASIC_DURATIONS[i], active: true };
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

async function handlePackageList(member, res) {
  const rows = await withTransaction(async (client) => {
    const user = await client.query('SELECT id,status FROM users WHERE id=$1 LIMIT 1', [member.uid]);
    if (!user.rowCount || user.rows[0].status !== 'active') throw new Error('ACTIVE_MEMBER_REQUIRED');
    const result = await client.query(`SELECT id,name,code,type,min_amount,max_amount,roi_rate,duration_days,description,terms,active,created_at,updated_at
      FROM packages WHERE active=TRUE ORDER BY type,min_amount,name`);
    return result.rows;
  });
  return json(res, 200, { items: rows });
}

function normalizePackageInput(input) {
  const pkg = input && typeof input === 'object' ? input : {};
  const id = String(pkg.id || '').trim();
  const name = String(pkg.name || '').trim();
  const code = String(pkg.code || '').trim().toUpperCase();
  const type = String(pkg.type || '').trim().toLowerCase();
  const minAmount = Number(pkg.minAmount ?? pkg.min_amount);
  const maxAmount = Number(pkg.maxAmount ?? pkg.max_amount ?? minAmount);
  const roiRate = Number(pkg.roiRate ?? pkg.roi_rate);
  const durationDays = Number(pkg.durationDays ?? pkg.duration_days);
  if (!id || !name || !code || !['basic','fd'].includes(type) ||
      !Number.isFinite(minAmount) || minAmount <= 0 ||
      !Number.isFinite(maxAmount) || maxAmount < minAmount ||
      !Number.isFinite(roiRate) || roiRate < 0 ||
      !Number.isInteger(durationDays) || durationDays < 1) {
    throw new Error('INVALID_PACKAGE');
  }
  return { id, name, code, type, minAmount, maxAmount, roiRate, durationDays,
    description: String(pkg.description || ''), terms: String(pkg.terms || ''),
    active: pkg.active !== false };
}

async function upsertPackageDefinition(client, pkg, onlyExisting = false) {
  const existing = await client.query('SELECT id FROM packages WHERE id=$1 OR code=$2 LIMIT 1', [pkg.id, pkg.code]);
  if (existing.rowCount) {
    const stableId = existing.rows[0].id;
    await client.query(`UPDATE packages SET name=$2,code=$3,type=$4,min_amount=$5,max_amount=$6,
      roi_rate=$7,duration_days=$8,description=$9,terms=$10,active=$11,updated_at=NOW() WHERE id=$1`,
      [stableId,pkg.name,pkg.code,pkg.type,pkg.minAmount,pkg.maxAmount,pkg.roiRate,pkg.durationDays,pkg.description,pkg.terms,pkg.active]);
    return { updated: true, inserted: false };
  }
  if (onlyExisting) return { updated: false, inserted: false };
  await client.query(`INSERT INTO packages(id,name,code,type,min_amount,max_amount,roi_rate,duration_days,description,terms,active,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
    [pkg.id,pkg.name,pkg.code,pkg.type,pkg.minAmount,pkg.maxAmount,pkg.roiRate,pkg.durationDays,pkg.description,pkg.terms,pkg.active]);
  return { updated: false, inserted: true };
}

async function handleAdminSavePackage(member, body, res) {
  requireAdmin(member);
  const pkg = normalizePackageInput(body.package);
  const result = await withTransaction(async (client) => {
    const saved = await upsertPackageDefinition(client, pkg, false);
    await client.query(`INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
      VALUES($1,$2,$3,'PACKAGE_DEFINITION_SYNCED','package',$4,$5::jsonb)`,
      [crypto.randomUUID(),member.uid,member.email,pkg.id,JSON.stringify({code:pkg.code,name:pkg.name,type:pkg.type,minAmount:pkg.minAmount,roiRate:pkg.roiRate,durationDays:pkg.durationDays,active:pkg.active,...saved})]);
    return saved;
  });
  return json(res, 200, { success:true, ...result, message:'Package saved to the live package database.' });
}

async function handleAdminSyncPackages(member, body, res) {
  requireAdmin(member);
  if (!Array.isArray(body.packages)) return json(res, 400, { error:'Packages list is required' });
  const result = await withTransaction(async (client) => {
    let updated = 0;
    for (const item of body.packages.slice(0, 100)) {
      const pkg = normalizePackageInput(item);
      const saved = await upsertPackageDefinition(client, pkg, true);
      if (saved.updated) updated += 1;
    }
    if (updated > 0) {
      await client.query(`INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
        VALUES($1,$2,$3,'EXISTING_PACKAGE_DEFINITIONS_SYNCED','package','EXISTING_PACKAGES',$4::jsonb)`,
        [crypto.randomUUID(),member.uid,member.email,JSON.stringify({updated,requested:Math.min(body.packages.length,100),mode:'update-existing-only'})]);
    }
    return { updated, requested:Math.min(body.packages.length,100) };
  });
  return json(res, 200, { success:true, ...result, message:`Synchronized ${result.updated} existing live package definitions. Existing activations and financial records were not changed.` });
}

async function handlePackageHistory(member, res) {
  const result = await withTransaction(async (client) => {
    await ensureIncomeSchema(client);
    const user = await client.query('SELECT id,status,referral_status FROM users WHERE id=$1 AND email=$2 LIMIT 1', [member.uid, member.email]);
    if (!user.rowCount || user.rows[0].status !== 'active') throw new Error('ACTIVE_MEMBER_REQUIRED');
    const q = await client.query(`SELECT id,user_id,package_id,package_type,package_name,amount,roi_daily_rate,duration_days,total_earned,status,activated_at,expires_at,cap_multiple,cap_amount,credited_total,cap_reconciled,completed_at,principal_returned,principal_return_amount FROM package_activations WHERE user_id=$1 ORDER BY activated_at DESC LIMIT 100`, [member.uid]);
    return { items:q.rows, referralStatus:user.rows[0].referral_status || 'active' };
  });
  return json(res, 200, result);
}

async function handleAdminPackageHistory(member, res) {
  requireAdmin(member);
  const rows = await withTransaction(async (client) => {
    await ensureIncomeSchema(client);
    const q = await client.query(`
      SELECT pa.id, pa.user_id, pa.package_id, pa.package_type, pa.package_name, pa.amount,
             pa.roi_daily_rate, pa.duration_days, pa.total_earned, pa.status, pa.activated_at, pa.expires_at,
             pa.cap_multiple,pa.cap_amount,pa.credited_total,pa.cap_reconciled,pa.completed_at,
             u.name AS user_name,u.email AS user_email,u.referral_status
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
    if (!Number.isFinite(amount) || amount < 2) throw new Error('MINIMUM_PLAN_PURCHASE');
    await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [member.uid]);
    const walletResult = await client.query('SELECT * FROM wallets WHERE user_id=$1 LIMIT 1 FOR UPDATE', [member.uid]);
    const available = Number(walletResult.rows[0]?.fund_wallet || 0);
    if (available < amount) { const e = new Error('INSUFFICIENT_USDT'); e.available = available; e.required = amount; throw e; }
    const purchaseId = `PKG-${crypto.randomUUID()}`;
    const now = new Date();
    const expires = new Date(now.getTime() + Number(pkg.duration_days) * 86400000);
    await client.query(`UPDATE wallets SET fund_wallet=fund_wallet-$2,basic_package_active=basic_package_active+CASE WHEN $3='basic' THEN $2 ELSE 0 END,fd_package_active=fd_package_active+CASE WHEN $3='fd' THEN $2 ELSE 0 END,updated_at=NOW() WHERE user_id=$1`, [member.uid, amount, pkg.type]);
    await client.query(`INSERT INTO package_activations
      (id,user_id,package_id,package_type,package_name,amount,roi_daily_rate,duration_days,total_earned,status,activated_at,expires_at,cap_multiple,cap_amount,credited_total,cap_reconciled,principal_returned,principal_return_amount)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'active',$9,$10,5,$11,0,TRUE,FALSE,0)`,
      [purchaseId, member.uid, pkg.id, pkg.type, pkg.name, amount, Number(pkg.roi_rate), Number(pkg.duration_days), now, expires, Number((amount*5).toFixed(2))]);
    // A new verified package investment reactivates this member's earning/referral ID.
    await client.query(`UPDATE users SET referral_status='active' WHERE id=$1 AND status='active'`,[member.uid]);
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
    if (action==='package_list') return await handlePackageList(member,res);
    if (action==='admin_save_package') return await handleAdminSavePackage(member,body,res);
    if (action==='admin_sync_packages') return await handleAdminSyncPackages(member,body,res);
    if (action==='package_history') return await handlePackageHistory(member,res);
    if (action==='admin_package_history') return await handleAdminPackageHistory(member,res);
    if (action==='admin_reconcile_referral_income') return await handleAdminReconcileReferralIncome(member,res);
    if (action==='package_purchase') return await handlePackagePurchase(member,body,res);
    if (action==='verify_deposit') return json(res,410,{error:'Direct deposit credit is retired. Submit a recharge request for admin review.'});
    return json(res,400,{error:'Invalid action'});
  } catch (error) {
    const message = String(error?.message||'');
    if (message==='INVALID_PACKAGE') return json(res,400,{error:'Package fields are invalid'});
    if (message==='AUTH_REQUIRED') return json(res,401,{error:'Authentication required'});
    if (message==='ADMIN_REQUIRED') return json(res,403,{error:'Admin access required'});
    if (message==='ACTIVE_MEMBER_REQUIRED') return json(res,403,{error:'Active member account required'});
    if (message==='PACKAGE_NOT_AVAILABLE') return json(res,404,{error:'Package is not available'});
    if (message==='MINIMUM_PLAN_PURCHASE') return json(res,400,{error:'Minimum plan purchase is 2.00 USDT.'});
    if (message==='INSUFFICIENT_USDT') return json(res,409,{error:'Insufficient Available USDT',available:Number(error.available||0),required:Number(error.required||0)});
    console.error('usdt-bep20-deposit failed:', error instanceof Error?error.message:error);
    return json(res,500,{error:'Unable to complete this USDT operation right now'});
  }
}
