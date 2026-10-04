import { getPool } from './_lib/db.js';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function requireAdmin(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const decoded = await verifyFirebaseIdToken(token);
  const email = String(decoded.email || '').trim().toLowerCase();
  const { rows } = await getPool().query('SELECT id,role,status FROM users WHERE id=$1 AND email=$2 LIMIT 1', [decoded.uid,email]);
  const user = rows[0];
  if (!user || user.role!=='admin' || user.status!=='active') throw new Error('ADMIN_REQUIRED');
}

async function financeReport(pool) {
  const [summaryQ, ledgerQ, purchasesQ, walletsQ] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(CASE WHEN type='crypto_deposit' AND flow='credit' AND status='completed' THEN amount ELSE 0 END),0) AS total_deposits, COALESCE(SUM(CASE WHEN type='package_purchase' AND flow='debit' AND status='completed' THEN amount ELSE 0 END),0) AS total_package_purchases, COUNT(*) FILTER (WHERE type='crypto_deposit' AND status='completed')::int AS deposit_count, COUNT(*) FILTER (WHERE type='package_purchase' AND status='completed')::int AS purchase_count FROM ledger_transactions`),
    pool.query(`SELECT l.id,l.user_id,u.name,u.email,u.referral_code,l.type,l.category,l.flow,l.amount,l.fee,l.net_amount,l.description,l.reference_id,l.status,l.metadata,l.created_at FROM ledger_transactions l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 1000`),
    pool.query(`SELECT p.id,p.user_id,u.name,u.email,u.referral_code,p.package_id,p.package_type,p.package_name,p.amount,p.roi_daily_rate,p.duration_days,p.total_earned,p.status,p.activated_at,p.expires_at FROM package_activations p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.activated_at DESC LIMIT 1000`),
    pool.query(`SELECT w.user_id,u.name,u.email,u.referral_code,w.fund_wallet,w.income_wallet,w.total_income,w.total_withdrawal,w.basic_package_active,w.fd_package_active,w.updated_at FROM wallets w LEFT JOIN users u ON u.id=w.user_id ORDER BY w.updated_at DESC LIMIT 2000`)
  ]);
  const s = summaryQ.rows[0] || {};
  const walletTotals = walletsQ.rows.reduce((a,r)=>{a.availableUsdt+=Number(r.fund_wallet||0);a.incomeWallet+=Number(r.income_wallet||0);a.activeBasic+=Number(r.basic_package_active||0);a.activeFd+=Number(r.fd_package_active||0);return a;},{availableUsdt:0,incomeWallet:0,activeBasic:0,activeFd:0});
  return { generatedAt:new Date().toISOString(), summary:{ totalDeposits:Number(s.total_deposits||0), totalPackagePurchases:Number(s.total_package_purchases||0), depositCount:Number(s.deposit_count||0), purchaseCount:Number(s.purchase_count||0), ...walletTotals }, ledger:ledgerQ.rows, purchases:purchasesQ.rows, wallets:walletsQ.rows };
}

async function dashboardMetrics(pool) {
  const [usersQ, kycQ, ticketsQ, packagesQ, ledgerQ] = await Promise.all([
    pool.query(`SELECT
      COUNT(*)::int AS total_users,
      COUNT(*) FILTER (WHERE status='active')::int AS active_users,
      COUNT(*) FILTER (WHERE status='suspended')::int AS suspended_users
      FROM users WHERE role='user'`),
    pool.query(`SELECT
      COUNT(*) FILTER (WHERE status IN ('pending','in_review'))::int AS pending_kyc,
      COUNT(*) FILTER (WHERE status='verified')::int AS verified_kyc,
      COUNT(*) FILTER (WHERE status='rejected')::int AS rejected_kyc
      FROM kyc_submissions`),
    pool.query(`SELECT
      COUNT(*) FILTER (WHERE status='open')::int AS open_tickets,
      COUNT(*) FILTER (WHERE status='in_progress')::int AS in_progress_tickets,
      COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::int AS closed_tickets
      FROM support_tickets`),
    pool.query(`SELECT
      COUNT(*) FILTER (WHERE package_type='basic')::int AS basic_activations,
      COUNT(*) FILTER (WHERE package_type='fd')::int AS fd_activations
      FROM package_activations`),
    pool.query(`SELECT COUNT(*)::int AS ledger_count FROM ledger_transactions`)
  ]);
  const u=usersQ.rows[0]||{}, k=kycQ.rows[0]||{}, t=ticketsQ.rows[0]||{}, p=packagesQ.rows[0]||{}, l=ledgerQ.rows[0]||{};
  return {
    generatedAt:new Date().toISOString(),
    totalUsers:Number(u.total_users||0),
    activeUsers:Number(u.active_users||0),
    suspendedUsers:Number(u.suspended_users||0),
    pendingKyc:Number(k.pending_kyc||0),
    verifiedKyc:Number(k.verified_kyc||0),
    rejectedKyc:Number(k.rejected_kyc||0),
    openTickets:Number(t.open_tickets||0),
    inProgressTickets:Number(t.in_progress_tickets||0),
    closedTickets:Number(t.closed_tickets||0),
    totalBasicActivations:Number(p.basic_activations||0),
    totalFdActivations:Number(p.fd_activations||0),
    ledgerTransactionCount:Number(l.ledger_count||0)
  };
}

async function networkReport(pool) {
  const { rows } = await pool.query(`
    WITH direct_counts AS (SELECT sponsor_id,COUNT(*)::int AS direct_count FROM users WHERE sponsor_id IS NOT NULL GROUP BY sponsor_id),
    pkg AS (SELECT user_id,COALESCE(SUM(amount) FILTER (WHERE status='active'),0)::numeric AS active_package_amount,COUNT(*) FILTER (WHERE status='active')::int AS active_package_count,COALESCE(MAX(package_name) FILTER (WHERE status='active'),'') AS latest_package_name FROM package_activations GROUP BY user_id),
    inc AS (SELECT user_id,COALESCE(SUM(net_amount) FILTER (WHERE flow='credit' AND status='completed' AND category<>'token' AND type IN ('referral_bonus','referral_income','direct_referral')),0)::numeric AS referral_income,COALESCE(SUM(net_amount) FILTER (WHERE flow='credit' AND status='completed' AND category<>'token' AND type IN ('level_bonus','level_income')),0)::numeric AS level_income,COALESCE(SUM(net_amount) FILTER (WHERE flow='credit' AND status='completed' AND category<>'token'),0)::numeric AS total_credited,COALESCE(SUM(CASE WHEN category='token' AND status='completed' AND type IN ('token_credit','token_debit') THEN CASE WHEN flow='credit' THEN amount ELSE -amount END ELSE 0 END),0)::numeric AS token_balance FROM ledger_transactions GROUP BY user_id)
    SELECT u.id,u.email,u.name,u.phone,u.referral_code,u.sponsor_id,u.role,u.status,u.kyc_status,u.created_at,COALESCE(w.fund_wallet,0) AS fund_wallet,COALESCE(w.income_wallet,0) AS income_wallet,COALESCE(dc.direct_count,0) AS direct_count,COALESCE(pkg.active_package_amount,0) AS active_package_amount,COALESCE(pkg.active_package_count,0) AS active_package_count,COALESCE(pkg.latest_package_name,'') AS latest_package_name,COALESCE(inc.referral_income,0) AS referral_income,COALESCE(inc.level_income,0) AS level_income,COALESCE(inc.total_credited,0) AS total_credited,COALESCE(inc.token_balance,0) AS token_balance
    FROM users u LEFT JOIN wallets w ON w.user_id=u.id LEFT JOIN direct_counts dc ON dc.sponsor_id=u.referral_code LEFT JOIN pkg ON pkg.user_id=u.id LEFT JOIN inc ON inc.user_id=u.id ORDER BY u.created_at DESC LIMIT 2000`);
  const bySponsor = new Map();
  for (const r of rows) { if (!r.sponsor_id) continue; if (!bySponsor.has(r.sponsor_id)) bySponsor.set(r.sponsor_id,[]); bySponsor.get(r.sponsor_id).push(r); }
  const descendants = ref => { const seen=new Set(); const q=[...(bySponsor.get(ref)||[])]; while(q.length){const x=q.shift();if(!x||seen.has(x.id))continue;seen.add(x.id);q.push(...(bySponsor.get(x.referral_code)||[]));} return seen.size; };
  const members = rows.map(r=>({id:r.id,name:r.name,email:r.email,phone:r.phone||'',referralCode:r.referral_code,sponsorId:r.sponsor_id||'',role:r.role,status:r.status,kycStatus:r.kyc_status,createdAt:r.created_at,directCount:Number(r.direct_count||0),totalDownline:descendants(r.referral_code),fundWallet:Number(r.fund_wallet||0),incomeWallet:Number(r.income_wallet||0),activePackageAmount:Number(r.active_package_amount||0),activePackageCount:Number(r.active_package_count||0),latestPackageName:r.latest_package_name||'',referralIncome:Number(r.referral_income||0),levelIncome:Number(r.level_income||0),totalCredited:Number(r.total_credited||0),tokenBalance:Number(r.token_balance||0)}));
  return { summary:{ totalMembers:members.filter(m=>m.role==='user').length,totalDirectLinks:members.filter(m=>!!m.sponsorId).length,totalActivePackageAmount:members.reduce((s,m)=>s+m.activePackageAmount,0),totalReferralIncome:members.reduce((s,m)=>s+m.referralIncome,0),totalLevelIncome:members.reduce((s,m)=>s+m.levelIncome,0),totalTokens:members.reduce((s,m)=>s+m.tokenBalance,0)}, members };
}

export default async function handler(req,res) {
  if (req.method!=='GET') return json(res,405,{error:'Method not allowed'});
  try {
    await requireAdmin(req);
    const pool=getPool();
    const mode=String(req.query?.mode||'network');
    return json(res,200,mode==='finance-report'?await financeReport(pool):mode==='dashboard-metrics'?await dashboardMetrics(pool):await networkReport(pool));
  } catch (error) {
    if (String(error?.message)==='ADMIN_REQUIRED') return json(res,403,{error:'Admin access required'});
    console.error('admin-network failed:', error instanceof Error?error.message:error);
    return json(res,500,{error:'Unable to load admin report'});
  }
}
