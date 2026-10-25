import crypto from 'node:crypto';
import { getFirestoreAdmin } from './firebaseAdmin.js';

const MAX_LEVEL = 15;

// Separate schedules prevent joining, retopup and ROI-level income from sharing rates.
const DEFAULT_COMMISSION_RATES = Object.freeze({
  joining: Object.freeze({1:5,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0,10:0,11:0,12:0,13:0,14:0,15:0}),
  retopup: Object.freeze({1:1,2:0.25,3:0.25,4:0.25,5:0.25,6:0.25,7:0.25,8:0.25,9:0.25,10:0.25,11:0.25,12:0.25,13:0.25,14:0.25,15:0.25}),
  roi: Object.freeze({1:5,2:1,3:1,4:1,5:1,6:1,7:1,8:1,9:1,10:1,11:1,12:1,13:1,14:1,15:1}),
});
const levelRate = (level, rates) => Number(rates?.[Number(level)] ?? 0);

async function getCommissionRates(kind) {
  const defaults = DEFAULT_COMMISSION_RATES[kind] || DEFAULT_COMMISSION_RATES.roi;
  const settingKey = kind === 'roi' ? 'roiLevelCommissionRates' : `${kind}CommissionRates`;
  try {
    const db = getFirestoreAdmin();
    const snap = await db.collection('system').doc('settings').get();
    const stored = snap.exists ? snap.data()?.[settingKey] : null;
    const rates = {};
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const value = Number(stored?.[level] ?? defaults[level]);
      rates[level] = Number.isFinite(value) && value >= 0 && value <= 100
        ? value
        : defaults[level];
    }
    return rates;
  } catch (error) {
    console.error(`Unable to load ${kind} commission rates; using defaults:`, error instanceof Error ? error.message : error);
    return { ...defaults };
  }
}
const money = (v) => Number(Number(v || 0).toFixed(2));
const pct = (base, rate) => money((Number(base || 0) * Number(rate || 0)) / 100);

export async function ensureIncomeSchema(client) {
  await client.query(`ALTER TABLE package_activations
    ADD COLUMN IF NOT EXISTS cap_multiple INT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS cap_amount NUMERIC(16,2),
    ADD COLUMN IF NOT EXISTS credited_total NUMERIC(16,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cap_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS principal_returned BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS principal_return_amount NUMERIC(16,2) NOT NULL DEFAULT 0`);
  await client.query(`UPDATE package_activations SET cap_amount=ROUND(amount*COALESCE(cap_multiple,5),2) WHERE cap_amount IS NULL`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_status VARCHAR(16) NOT NULL DEFAULT 'active'`);
  await client.query(`CREATE TABLE IF NOT EXISTS income_cap_migrations(
    migration_key VARCHAR(120) PRIMARY KEY, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const capMigration = await client.query(`INSERT INTO income_cap_migrations(migration_key)
    VALUES('initial-ledger-reconciliation-v1') ON CONFLICT(migration_key) DO NOTHING RETURNING migration_key`);
  if (capMigration.rowCount === 1) {
    // Reconcile old counters from completed ledger credits; ledger and wallet balances are immutable.
    await client.query(`WITH users_to_reconcile AS (
        SELECT DISTINCT user_id FROM package_activations WHERE cap_reconciled=FALSE
      ),
      cycles AS (
        SELECT pa.id,pa.user_id,pa.status AS status_before,
          COALESCE(pa.cap_amount,ROUND(pa.amount*COALESCE(pa.cap_multiple,5),2)) AS cap,
          COALESCE(SUM(COALESCE(pa.cap_amount,ROUND(pa.amount*COALESCE(pa.cap_multiple,5),2)))
            OVER(PARTITION BY pa.user_id ORDER BY pa.activated_at,pa.id
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS prior_cap
        FROM package_activations pa JOIN users_to_reconcile r ON r.user_id=pa.user_id
      ),
      eligible AS (
        SELECT l.user_id,SUM(COALESCE(l.net_amount,l.amount,0)) AS total
        FROM ledger_transactions l JOIN users_to_reconcile r ON r.user_id=l.user_id
        WHERE l.status='completed' AND l.flow='credit'
          AND (l.category='income_wallet' OR l.type IN
            ('principal_return','principal_return_credit','joining_bonus','signup_bonus','bonus','referral_bonus','level_bonus','salary'))
        GROUP BY l.user_id
      ),
      allocation AS (
        SELECT c.id,c.cap,c.status_before,LEAST(c.cap,GREATEST(0,COALESCE(e.total,0)-c.prior_cap)) AS tracked
        FROM cycles c LEFT JOIN eligible e ON e.user_id=c.user_id
      ),
      updated AS (
        UPDATE package_activations pa
        SET cap_amount=a.cap,cap_multiple=5,credited_total=a.tracked,cap_reconciled=TRUE,
            status=CASE WHEN a.tracked>=a.cap AND pa.status='active' THEN 'completed' ELSE pa.status END,
            completed_at=CASE WHEN a.tracked>=a.cap THEN COALESCE(pa.completed_at,NOW()) ELSE pa.completed_at END
        FROM allocation a WHERE pa.id=a.id AND pa.cap_reconciled=FALSE
        RETURNING pa.id,pa.user_id,pa.package_type,pa.amount
      ),
      wallet_deductions AS (
        SELECT u.user_id,
          COALESCE(SUM(u.amount) FILTER (WHERE u.package_type='basic' AND a.status_before='active' AND a.tracked>=a.cap),0) AS basic_amount,
          COALESCE(SUM(u.amount) FILTER (WHERE u.package_type='fd' AND a.status_before='active' AND a.tracked>=a.cap),0) AS fd_amount
        FROM updated u JOIN allocation a ON a.id=u.id GROUP BY u.user_id
      )
      UPDATE wallets w SET
        basic_package_active=GREATEST(0,w.basic_package_active-d.basic_amount),
        fd_package_active=GREATEST(0,w.fd_package_active-d.fd_amount),
        updated_at=NOW()
      FROM wallet_deductions d WHERE w.user_id=d.user_id`);
    await client.query(`UPDATE users u SET referral_status=CASE
      WHEN EXISTS(SELECT 1 FROM package_activations p WHERE p.user_id=u.id)
       AND NOT EXISTS(SELECT 1 FROM package_activations p WHERE p.user_id=u.id
         AND COALESCE(p.credited_total,0)<COALESCE(p.cap_amount,ROUND(p.amount*5,2)))
      THEN 'inactive' ELSE 'active' END
      WHERE EXISTS(SELECT 1 FROM package_activations p WHERE p.user_id=u.id)`);
  }
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS rank_code VARCHAR(32) NOT NULL DEFAULT 'MEMBER'`);
  await client.query(`ALTER TABLE users
    ADD COLUMN IF NOT EXISTS transaction_password_hash TEXT,
    ADD COLUMN IF NOT EXISTS transaction_password_failed_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS transaction_password_locked_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transaction_password_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS country VARCHAR(2)`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS second_phone VARCHAR(32)`);
  await client.query(`ALTER TABLE wallets
    ADD COLUMN IF NOT EXISTS referral_income NUMERIC(16,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS today_roi_income NUMERIC(16,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS today_level_income NUMERIC(16,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_roi_income NUMERIC(16,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_level_income NUMERIC(16,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fd_referral_income NUMERIC(16,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fd_today_roi_income NUMERIC(16,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fd_today_level_income NUMERIC(16,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fd_total_roi_income NUMERIC(16,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fd_total_level_income NUMERIC(16,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_salary NUMERIC(16,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS income_stat_date DATE`);
  await client.query(`CREATE TABLE IF NOT EXISTS income_events(
    event_key VARCHAR(180) PRIMARY KEY,
    event_type VARCHAR(40) NOT NULL,
    source_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    source_activation_id VARCHAR(64),
    base_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    business_date DATE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await client.query(`CREATE TABLE IF NOT EXISTS income_distributions(
    id VARCHAR(64) PRIMARY KEY,
    event_key VARCHAR(180) NOT NULL REFERENCES income_events(event_key),
    recipient_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    source_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    income_type VARCHAR(40) NOT NULL,
    level INT NOT NULL DEFAULT 0,
    percentage NUMERIC(8,4) NOT NULL DEFAULT 0,
    base_amount NUMERIC(16,2) NOT NULL,
    amount NUMERIC(16,2) NOT NULL CHECK(amount > 0),
    ledger_id VARCHAR(64) NOT NULL UNIQUE REFERENCES ledger_transactions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_key,recipient_user_id,income_type,level))`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_income_distributions_recipient ON income_distributions(recipient_user_id,created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_income_events_type_date ON income_events(event_type,business_date)`);
}

function currentIndiaBusinessDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function previousIndiaBusinessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const y = Number(parts.find(p => p.type === 'year')?.value || 1970);
  const m = Number(parts.find(p => p.type === 'month')?.value || 1);
  const d = Number(parts.find(p => p.type === 'day')?.value || 1);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

async function uplines(client, userId) {
  const { rows } = await client.query(`WITH RECURSIVE u AS (
    SELECT s.id,s.referral_code,s.sponsor_id,s.status,s.referral_status,1 AS level,ARRAY[m.id,s.id]::varchar[] AS path
      FROM users m
      JOIN users s
        ON LOWER(TRIM(COALESCE(s.referral_code,''))) = LOWER(TRIM(COALESCE(m.sponsor_id,'')))
        OR LOWER(TRIM(COALESCE(s.id::text,''))) = LOWER(TRIM(COALESCE(m.sponsor_id,'')))
      WHERE m.id=$1
    UNION ALL
    SELECT s.id,s.referral_code,s.sponsor_id,s.status,s.referral_status,u.level+1,u.path||s.id
      FROM u
      JOIN users s
        ON LOWER(TRIM(COALESCE(s.referral_code,''))) = LOWER(TRIM(COALESCE(u.sponsor_id,'')))
        OR LOWER(TRIM(COALESCE(s.id::text,''))) = LOWER(TRIM(COALESCE(u.sponsor_id,'')))
      WHERE u.level<$2 AND NOT (s.id=ANY(u.path)))
    SELECT * FROM u ORDER BY level`, [userId, MAX_LEVEL]);
  return rows;
}


async function hasActiveReferralAtLevel(client, recipientId, targetLevel) {
  const { rows } = await client.query(
    `WITH RECURSIVE d AS (
       SELECT s.id, s.referral_code, s.sponsor_id, s.status, s.referral_status, 1 AS level, ARRAY[s.id]::varchar[] AS path
       FROM users root
       JOIN users s
         ON LOWER(TRIM(COALESCE(s.sponsor_id,''))) = LOWER(TRIM(COALESCE(root.referral_code,'')))
         OR LOWER(TRIM(COALESCE(s.sponsor_id,''))) = LOWER(TRIM(COALESCE(root.id::text,'')))
       WHERE root.id=$1

       UNION ALL

       SELECT s.id, s.referral_code, s.sponsor_id, s.status, s.referral_status, d.level+1, d.path || s.id
       FROM d
       JOIN users s
         ON LOWER(TRIM(COALESCE(s.sponsor_id,''))) = LOWER(TRIM(COALESCE(d.referral_code,'')))
         OR LOWER(TRIM(COALESCE(s.sponsor_id,''))) = LOWER(TRIM(COALESCE(d.id::text,'')))
       WHERE d.level < $2
         AND NOT (s.id=ANY(d.path))
     )
     SELECT 1
     FROM d
     WHERE d.level=$2
       AND d.status='active'
       AND COALESCE(d.referral_status,'active')='active'
     LIMIT 1`,
    [recipientId, targetLevel]
  );
  return rows.length > 0;
}

async function eventOnce(client, key, type, sourceUserId, activationId, baseAmount, businessDate, metadata={}) {
  const r = await client.query(`INSERT INTO income_events(event_key,event_type,source_user_id,source_activation_id,base_amount,business_date,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(event_key) DO NOTHING RETURNING event_key`,
    [key,type,sourceUserId,activationId||null,money(baseAmount),businessDate||null,JSON.stringify(metadata)]);
  return r.rowCount===1;
}

async function refreshReferralStatus(client,userId) {
  const q=await client.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE COALESCE(credited_total,0)<COALESCE(cap_amount,ROUND(amount*5,2)))::int AS remaining,
      COUNT(*) FILTER (WHERE cap_reconciled=FALSE)::int AS pending
    FROM package_activations WHERE user_id=$1`,[userId]);
  const total=Number(q.rows[0]?.total||0), remaining=Number(q.rows[0]?.remaining||0), pending=Number(q.rows[0]?.pending||0);
  if(total>0 && remaining===0 && pending===0) {
    await client.query(`UPDATE users SET referral_status='inactive' WHERE id=$1`,[userId]);
    return 'inactive';
  }
  if(remaining>0 || pending>0) await client.query(`UPDATE users SET referral_status='active' WHERE id=$1`,[userId]);
  return 'active';
}

async function completeActivation(client,activationId) {
  const result=await client.query(`UPDATE package_activations
    SET status='completed',completed_at=COALESCE(completed_at,NOW())
    WHERE id=$1 AND status='active'
    RETURNING user_id,amount,package_type`,[activationId]);
  if(!result.rowCount) return false;
  const a=result.rows[0];
  await client.query(`UPDATE wallets SET
    basic_package_active=GREATEST(0,basic_package_active-CASE WHEN $2='basic' THEN $3 ELSE 0 END),
    fd_package_active=GREATEST(0,fd_package_active-CASE WHEN $2='fd' THEN $3 ELSE 0 END),
    updated_at=NOW() WHERE user_id=$1`,[a.user_id,a.package_type,Number(a.amount||0)]);
  return true;
}

async function credit(client,{eventKey,recipient,source,incomeType,level=0,rate=0,base,amount,description,businessDate,countInDailyTotals=false}) {
  const requested=money(amount);
  if(requested<=0) return 0;
  const id='INC-'+crypto.createHash('sha256').update(`${eventKey}:${recipient}:${incomeType}:${level}`).digest('hex').slice(0,28);
  const exists=await client.query('SELECT 1 FROM income_distributions WHERE id=$1',[id]);
  if(exists.rowCount) return 0;
  const cycleResult=await client.query(`SELECT id,amount,cap_amount,credited_total,cap_reconciled
    FROM package_activations WHERE user_id=$1 AND status='active'
    ORDER BY activated_at ASC,id ASC FOR UPDATE`,[recipient]);
  const cycles=cycleResult.rows;
  if(!cycles.length || cycles.some(cycle=>cycle.cap_reconciled!==true)) {
    await refreshReferralStatus(client,recipient);
    return 0;
  }
  let left=requested, allowed=0;
  const allocations=[];
  for(const cycle of cycles) {
    if(left<=0) break;
    const cap=money(cycle.cap_amount ?? Number(cycle.amount)*5);
    const already=money(cycle.credited_total||0);
    const headroom=money(Math.max(0,cap-already));
    if(headroom<=0) {
      // Income-cap exhaustion stops further capped income allocation, but does not
      // complete the package early. Package lifecycle is governed by its duration
      // and scheduled ROI, not by credited_total.
      continue;
    }
    const part=money(Math.min(left,headroom));
    if(part<=0) continue;
    allocations.push({id:cycle.id,nextTotal:money(already+part),cap});
    allowed=money(allowed+part); left=money(left-part);
  }
  if(allowed<=0) {
    await refreshReferralStatus(client,recipient);
    return 0;
  }
  await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[recipient]);
  const sourceUser=(await client.query('SELECT id,name,email,referral_code FROM users WHERE id=$1 LIMIT 1',[source])).rows[0];
  const recipientUser=(await client.query('SELECT id,name,email,referral_code FROM users WHERE id=$1 LIMIT 1',[recipient])).rows[0];
  const ledgerId='LED-'+id;
  const metadata={
    sourceUserId:source,referredUserId:source,referredUserName:sourceUser?.name||null,
    referredUserEmail:sourceUser?.email||null,referrerUserId:recipient,
    referrerReferralCode:recipientUser?.referral_code||null,referralLevel:level,level,
    percentage:rate,commissionPercentage:rate,referralAmount:allowed,requestedAmount:requested,
    baseAmount:money(base),businessDate:businessDate||null,capMultiple:5,
  };
  await client.query(`INSERT INTO ledger_transactions(id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
    VALUES($1,$2,$3,'income_wallet','credit',$4,0,$4,$5,$6,'completed',$7::jsonb)`,
    [ledgerId,recipient,incomeType,allowed,description,eventKey,JSON.stringify(metadata)]);
  const basicReferral=['basic_referral','basic_joining_referral','basic_retopup_referral'].includes(incomeType)?allowed:0;
  const fdReferral=['fd_referral','fd_joining_referral','fd_retopup_referral'].includes(incomeType)?allowed:0;
  const basicRoi=incomeType==='basic_roi'?allowed:0, basicLevel=incomeType==='basic_level'?allowed:0;
  const fdRoi=incomeType==='fd_roi'?allowed:0, fdLevel=incomeType==='fd_level'?allowed:0;
  const dailyDate=countInDailyTotals ? (businessDate||null) : null;
  await client.query(`UPDATE wallets SET
    income_wallet=income_wallet+$2,total_income=total_income+$2,
    referral_income=referral_income+$3,fd_referral_income=fd_referral_income+$4,
    today_roi_income=CASE WHEN $5::date IS NULL THEN today_roi_income WHEN income_stat_date=$5::date THEN today_roi_income+$6 ELSE $6 END,
    today_level_income=CASE WHEN $5::date IS NULL THEN today_level_income WHEN income_stat_date=$5::date THEN today_level_income+$7 ELSE $7 END,
    fd_today_roi_income=CASE WHEN $5::date IS NULL THEN fd_today_roi_income WHEN income_stat_date=$5::date THEN fd_today_roi_income+$8 ELSE $8 END,
    fd_today_level_income=CASE WHEN $5::date IS NULL THEN fd_today_level_income WHEN income_stat_date=$5::date THEN fd_today_level_income+$9 ELSE $9 END,
    total_roi_income=total_roi_income+$6,total_level_income=total_level_income+$7,
    fd_total_roi_income=fd_total_roi_income+$8,fd_total_level_income=fd_total_level_income+$9,
    income_stat_date=CASE WHEN $5::date IS NULL THEN income_stat_date ELSE $5::date END,
    updated_at=NOW() WHERE user_id=$1`,
    [recipient,allowed,basicReferral,fdReferral,dailyDate,basicRoi,basicLevel,fdRoi,fdLevel]);
  for(const allocation of allocations) {
    const updated=await client.query(`UPDATE package_activations SET credited_total=$2
      WHERE id=$1 AND status='active' RETURNING user_id,amount,package_type,status`,[allocation.id,allocation.nextTotal]);
    if(updated.rowCount && allocation.nextTotal>=allocation.cap) {
      const a=updated.rows[0];
      await client.query(`UPDATE wallets SET
        basic_package_active=GREATEST(0,basic_package_active-CASE WHEN $2='basic' THEN $3 ELSE 0 END),
        fd_package_active=GREATEST(0,fd_package_active-CASE WHEN $2='fd' THEN $3 ELSE 0 END),
        updated_at=NOW() WHERE user_id=$1`,[a.user_id,a.package_type,Number(a.amount||0)]);
    }
  }
  await client.query(`INSERT INTO income_distributions(id,event_key,recipient_user_id,source_user_id,income_type,level,percentage,base_amount,amount,ledger_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id,eventKey,recipient,source,incomeType,level,rate,money(base),allowed,ledgerId]);
  await refreshReferralStatus(client,recipient);
  return allowed;
}

export async function applyActivationIncome(client,{activationId,userId,amount,packageName,packageType='basic'}) {
  await ensureIncomeSchema(client);
  const activationOrder = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM package_activations a
      WHERE a.user_id=$1
        AND (a.activated_at, a.id) <= (
          SELECT activated_at, id
          FROM package_activations
          WHERE id=$2
        )`,
    [userId, activationId]
  );
  const first=Number(activationOrder.rows[0]?.n||0)===1;
  const type=first?'joining':'retopup';
  const rates = await getCommissionRates(type);
  const key=`ACT:${activationId}:${type}`;
  const businessDate=currentIndiaBusinessDate();
  const eventCreated=await eventOnce(client,key,type,userId,activationId,amount,businessDate,{packageName,packageType});
  const ups=await uplines(client,userId); let credited=0; let creditedAmount=0;
  const recipients=[];
  for(const u of ups){
    if(u.status!=='active' || u.referral_status==='inactive') continue;
    const level=Number(u.level); let rate=0;
    rate=levelRate(level, rates);
    if(rate<=0) continue;

    // Joining and retopup payouts use their own schedules and retain level eligibility checks.
    if(level > 0 && !(await hasActiveReferralAtLevel(client, u.id, level))) continue;

    const incomeType=packageType==='fd'
      ? (first ? (level===1 ? 'fd_joining_referral' : 'fd_joining_level') : (level===1 ? 'fd_retopup_referral' : 'fd_retopup_level'))
      : (first ? (level===1 ? 'basic_joining_referral' : 'basic_joining_level') : (level===1 ? 'basic_retopup_referral' : 'basic_retopup_level'));
    const distributionAmount=pct(amount,rate);
    const actualCredit=Number(await credit(client,{eventKey:key,recipient:u.id,source:userId,incomeType,level,rate,base:amount,amount:distributionAmount,description:`${first?'Joining':'Re-topup'} referral income L${level} (${rate}%) from ${userId}`,businessDate})||0);
    if(actualCredit>0){
      credited++;
      creditedAmount=money(creditedAmount+actualCredit);
      recipients.push({userId:u.id,level,rate,amount:actualCredit});
    }
  }
  return {skipped:!eventCreated && credited===0,credited,creditedAmount,recipients};
}

// Daily level income is calculated only on recorded ROI income, never on invested principal.
export async function runDailyIncome(client,businessDate) {
  await ensureIncomeSchema(client);
  const rates = await getCommissionRates('roi');
  const date=businessDate || previousIndiaBusinessDate();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_BUSINESS_DATE');
  // Expired activations must transition out of active status even if a prior daily run was missed.
  await client.query(`UPDATE package_activations SET status='matured' WHERE status='active' AND (expires_at AT TIME ZONE 'Asia/Kolkata')::date < $1::date`,[date]);
  const {rows}=await client.query(`SELECT pa.* FROM package_activations pa JOIN users u ON u.id=pa.user_id
    WHERE pa.status='active' AND u.status='active'
      AND COALESCE(u.referral_status,'active')='active'
      AND (pa.activated_at AT TIME ZONE 'Asia/Kolkata')::date<=$1::date
      AND (pa.expires_at AT TIME ZONE 'Asia/Kolkata')::date>=$1::date
    FOR UPDATE OF pa`,[date]);
  let roiCredits=0,levelCredits=0,packagesProcessed=0;
  for(const a of rows){
    const max=money(Number(a.amount)*Number(a.roi_daily_rate)*Number(a.duration_days)/100);
    const already=money(a.total_earned||0);
    if(already>=max){await client.query(`UPDATE package_activations SET status='matured' WHERE id=$1 AND status='active'`,[a.id]);continue;}
    const roi=money(Math.min(pct(a.amount,a.roi_daily_rate),max-already)); if(roi<=0) continue;
    const key=`ROI:${a.id}:${date}`;
    const roiEventCreated=await eventOnce(client,key,'daily_roi',a.user_id,a.id,roi,date,{principal:Number(a.amount),rate:Number(a.roi_daily_rate),packageType:a.package_type});
    const roiType=a.package_type==='fd'?'fd_roi':'basic_roi';
    const levelType=a.package_type==='fd'?'fd_level':'basic_level';

    const priorRoiCredit=await client.query(`SELECT amount FROM income_distributions
      WHERE event_key=$1 AND recipient_user_id=$2 AND income_type=$3 AND level=0 LIMIT 1`,[key,a.user_id,roiType]);
    let creditedRoi=Number(priorRoiCredit.rows[0]?.amount||0);
    if(!priorRoiCredit.rowCount){
      creditedRoi=Number(await credit(client,{eventKey:key,recipient:a.user_id,source:a.user_id,incomeType:roiType,rate:Number(a.roi_daily_rate),base:a.amount,amount:roi,description:`Daily ROI ${a.package_name} ${date}`,businessDate:date,countInDailyTotals:true})||0);
      if(creditedRoi>0){
        roiCredits++;
        await client.query('UPDATE package_activations SET total_earned=total_earned+$2 WHERE id=$1',[a.id,creditedRoi]);
      }
    }
    if(creditedRoi<=0) continue;
    const creditedRoiBase=creditedRoi;
    for(const u of await uplines(client,a.user_id)){
      if(u.status!=='active' || u.referral_status==='inactive') continue;
      const level=Number(u.level), rate=levelRate(level, rates);
      if(rate<=0) continue;

      // 1:1 level qualification: at least one active member must exist
      // in the recipient's exact downline generation for this level.
      if(!(await hasActiveReferralAtLevel(client, u.id, level))) continue;

      if(await credit(client,{
        eventKey:key,
        recipient:u.id,
        source:a.user_id,
        incomeType:levelType,
        level,
        rate,
        base:creditedRoiBase,
        amount:pct(creditedRoiBase,rate),
        description:`Daily level L${level} (${rate}%) calculated on ROI ${creditedRoiBase.toFixed(2)} USDT from ${a.user_id}`,
        businessDate:date,
        countInDailyTotals:true
      })) levelCredits++;
    }
    packagesProcessed++;
    if(money(already+creditedRoi)>=max) await client.query(`UPDATE package_activations SET status='matured' WHERE id=$1 AND status='active'`,[a.id]);
  }
  // Release signup maturity points only after the member has had at least one
  // real package and every package activation is no longer active. Points stay
  // separate from money wallets; a Firestore transaction makes release idempotent.
  let maturityPointsReleased=0;
  const fsdb=getFirestoreAdmin();
  const lockedWallets=await fsdb.collection('wallets').where('maturityPointsStatus','==','locked').get();
  for (const walletDoc of lockedWallets.docs) {
    const userId=walletDoc.id;
    const packageState=await client.query(
      `SELECT COUNT(*) FILTER (WHERE status='active')::int AS active_count,
              COUNT(*) FILTER (WHERE status='matured')::int AS matured_count,
              COUNT(*)::int AS total_count
         FROM package_activations WHERE user_id=$1`,
      [userId]
    );
    const state=packageState.rows[0]||{};
    if (Number(state.total_count||0)<1 || Number(state.active_count||0)>0 || Number(state.matured_count||0)<1) continue;
    const pointsLedgerRef=fsdb.collection('maturityPointsLedger').doc(`MATURITY_POINTS_RELEASE_${userId}`);
    const walletRef=fsdb.collection('wallets').doc(userId);
    const auditRef=fsdb.collection('auditLogs').doc(`MATURITY_POINTS_RELEASE_${userId}`);
    const released=await fsdb.runTransaction(async tx=>{
      const [currentSnap,ledgerSnap]=await Promise.all([tx.get(walletRef),tx.get(pointsLedgerRef)]);
      const current=currentSnap.data()||{};
      if (!currentSnap.exists || current.maturityPointsStatus!=='locked' || ledgerSnap.exists) return false;
      const now=new Date();
      tx.set(walletRef,{
        lockedMaturityPoints:0,
        releasedMaturityPoints:Number(current.lockedMaturityPoints||150),
        maturityPointsStatus:'released',
        maturityPointsReleasedAt:now,
        updatedAt:now
      },{merge:true});
      tx.set(pointsLedgerRef,{
        id:pointsLedgerRef.id,userId,points:Number(current.lockedMaturityPoints||150),
        type:'maturity_points_release',status:'completed',
        description:'Signup maturity points released after all package activations matured',
        packageCount:Number(state.total_count||0),maturedPackageCount:Number(state.matured_count||0),
        createdAt:now
      });
      tx.set(auditRef,{
        actorUserId:'SYSTEM',actorEmail:null,action:'MATURITY_POINTS_RELEASED',
        entityType:'ledger',entityId:pointsLedgerRef.id,
        metadata:{userId,points:Number(current.lockedMaturityPoints||150),packageCount:Number(state.total_count||0),maturedPackageCount:Number(state.matured_count||0)},
        timestamp:now
      });
      return true;
    });
    if (released) maturityPointsReleased++;
  }
  // Rebuild per-day summary counters from the authoritative ledger for this business date.
  // This makes retries idempotent and clears stale "today" values for members with no credit today.
  await client.query(`UPDATE wallets SET
    today_roi_income=0,
    today_level_income=0,
    fd_today_roi_income=0,
    fd_today_level_income=0,
    income_stat_date=$1::date,
    updated_at=NOW()`,[date]);
  await client.query(`WITH daily_totals AS (
      SELECT d.recipient_user_id,
        COALESCE(SUM(d.amount) FILTER (WHERE d.income_type='basic_roi'),0) AS basic_roi,
        COALESCE(SUM(d.amount) FILTER (WHERE d.income_type='basic_level'),0) AS basic_level,
        COALESCE(SUM(d.amount) FILTER (WHERE d.income_type='fd_roi'),0) AS fd_roi,
        COALESCE(SUM(d.amount) FILTER (WHERE d.income_type='fd_level'),0) AS fd_level
      FROM income_distributions d
      JOIN income_events e ON e.event_key=d.event_key
      WHERE e.business_date=$1::date AND e.event_type='daily_roi'
      GROUP BY d.recipient_user_id
    )
    UPDATE wallets w SET
      today_roi_income=COALESCE(t.basic_roi,0),
      today_level_income=COALESCE(t.basic_level,0),
      fd_today_roi_income=COALESCE(t.fd_roi,0),
      fd_today_level_income=COALESCE(t.fd_level,0),
      income_stat_date=$1::date,
      updated_at=NOW()
    FROM daily_totals t
    WHERE w.user_id=t.recipient_user_id`,[date]);
  return {businessDate:date,packages:rows.length,packagesProcessed,roiCredits,levelCredits,maturityPointsReleased};
}
