import crypto from 'node:crypto';

const MAX_LEVEL = 15;

// Authoritative 15-level referral/level commission schedule.
const LEVEL_COMMISSION_RATES = Object.freeze({1:5,2:1,3:1,4:1,5:1,6:1,7:1,8:1,9:1,10:1,11:1,12:1,13:0.5,14:0.5,15:0.5});
const levelRate = (level) => Number(LEVEL_COMMISSION_RATES[Number(level)] || 0);
const money = (v) => Number(Number(v || 0).toFixed(2));
const pct = (base, rate) => money((Number(base || 0) * Number(rate || 0)) / 100);

export async function ensureIncomeSchema(client) {
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS rank_code VARCHAR(32) NOT NULL DEFAULT 'MEMBER'`);
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
    SELECT s.id,s.referral_code,s.sponsor_id,s.status,1 AS level,ARRAY[m.id,s.id]::varchar[] AS path
      FROM users m
      JOIN users s
        ON LOWER(TRIM(COALESCE(s.referral_code,''))) = LOWER(TRIM(COALESCE(m.sponsor_id,'')))
        OR LOWER(TRIM(COALESCE(s.id::text,''))) = LOWER(TRIM(COALESCE(m.sponsor_id,'')))
      WHERE m.id=$1
    UNION ALL
    SELECT s.id,s.referral_code,s.sponsor_id,s.status,u.level+1,u.path||s.id
      FROM u
      JOIN users s
        ON LOWER(TRIM(COALESCE(s.referral_code,''))) = LOWER(TRIM(COALESCE(u.sponsor_id,'')))
        OR LOWER(TRIM(COALESCE(s.id::text,''))) = LOWER(TRIM(COALESCE(u.sponsor_id,'')))
      WHERE u.level<$2 AND NOT (s.id=ANY(u.path)))
    SELECT * FROM u ORDER BY level`, [userId, MAX_LEVEL]);
  return rows;
}

async function eventOnce(client, key, type, sourceUserId, activationId, baseAmount, businessDate, metadata={}) {
  const r = await client.query(`INSERT INTO income_events(event_key,event_type,source_user_id,source_activation_id,base_amount,business_date,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(event_key) DO NOTHING RETURNING event_key`,
    [key,type,sourceUserId,activationId||null,money(baseAmount),businessDate||null,JSON.stringify(metadata)]);
  return r.rowCount===1;
}

async function credit(client,{eventKey,recipient,source,incomeType,level=0,rate=0,base,amount,description,businessDate}) {
  amount=money(amount); if(amount<=0) return false;
  const id='INC-'+crypto.createHash('sha256').update(`${eventKey}:${recipient}:${incomeType}:${level}`).digest('hex').slice(0,28);
  const exists=await client.query('SELECT 1 FROM income_distributions WHERE id=$1',[id]); if(exists.rowCount) return false;
  await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[recipient]);
  const sourceUser=(await client.query('SELECT id,name,email,referral_code FROM users WHERE id=$1 LIMIT 1',[source])).rows[0];
  const recipientUser=(await client.query('SELECT id,name,email,referral_code FROM users WHERE id=$1 LIMIT 1',[recipient])).rows[0];
  const ledgerId='LED-'+id;
  const metadata={
    sourceUserId:source,
    referredUserId:source,
    referredUserName:sourceUser?.name||null,
    referredUserEmail:sourceUser?.email||null,
    referrerUserId:recipient,
    referrerReferralCode:recipientUser?.referral_code||null,
    referralLevel:level,
    level,
    percentage:rate,
    commissionPercentage:rate,
    referralAmount:amount,
    baseAmount:money(base),
    businessDate:businessDate||null,
  };
  await client.query(`INSERT INTO ledger_transactions(id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
    VALUES($1,$2,$3,'income_wallet','credit',$4,0,$4,$5,$6,'completed',$7::jsonb)`,[ledgerId,recipient,incomeType,amount,description,eventKey,JSON.stringify(metadata)]);

  const basicReferral=incomeType==='basic_referral'?amount:0;
  const fdReferral=incomeType==='fd_referral'?amount:0;
  const basicRoi=incomeType==='basic_roi'?amount:0;
  const basicLevel=incomeType==='basic_level'?amount:0;
  const fdRoi=incomeType==='fd_roi'?amount:0;
  const fdLevel=incomeType==='fd_level'?amount:0;

  await client.query(`UPDATE wallets SET
    income_wallet=income_wallet+$2,
    total_income=total_income+$2,
    referral_income=referral_income+$3,
    fd_referral_income=fd_referral_income+$4,
    today_roi_income=CASE WHEN $5::date IS NULL THEN today_roi_income WHEN income_stat_date=$5::date THEN today_roi_income+$6 ELSE $6 END,
    today_level_income=CASE WHEN $5::date IS NULL THEN today_level_income WHEN income_stat_date=$5::date THEN today_level_income+$7 ELSE $7 END,
    fd_today_roi_income=CASE WHEN $5::date IS NULL THEN fd_today_roi_income WHEN income_stat_date=$5::date THEN fd_today_roi_income+$8 ELSE $8 END,
    fd_today_level_income=CASE WHEN $5::date IS NULL THEN fd_today_level_income WHEN income_stat_date=$5::date THEN fd_today_level_income+$9 ELSE $9 END,
    total_roi_income=total_roi_income+$6,
    total_level_income=total_level_income+$7,
    fd_total_roi_income=fd_total_roi_income+$8,
    fd_total_level_income=fd_total_level_income+$9,
    income_stat_date=CASE WHEN $5::date IS NULL THEN income_stat_date ELSE $5::date END,
    updated_at=NOW() WHERE user_id=$1`,[recipient,amount,basicReferral,fdReferral,businessDate||null,basicRoi,basicLevel,fdRoi,fdLevel]);

  await client.query(`INSERT INTO income_distributions(id,event_key,recipient_user_id,source_user_id,income_type,level,percentage,base_amount,amount,ledger_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,eventKey,recipient,source,incomeType,level,rate,money(base),amount,ledgerId]);
  return true;
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
  const key=`ACT:${activationId}:${type}`;
  const businessDate=currentIndiaBusinessDate();
  const eventCreated=await eventOnce(client,key,type,userId,activationId,amount,businessDate,{packageName,packageType});
  const ups=await uplines(client,userId); let credited=0; let creditedAmount=0;
  const recipients=[];
  for(const u of ups){
    if(u.status!=='active') continue;
    const level=Number(u.level); let rate=0;
    rate=levelRate(level);
    if(rate<=0) continue;
    const incomeType=packageType==='fd'
      ? (level===1 ? 'fd_referral' : 'fd_level')
      : (level===1 ? 'basic_referral' : 'basic_level');
    const distributionAmount=pct(amount,rate);
    if(await credit(client,{eventKey:key,recipient:u.id,source:userId,incomeType,level,rate,base:amount,amount:distributionAmount,description:`${first?'Joining':'Re-topup'} referral income L${level} (${rate}%) from ${userId}`,businessDate})){
      credited++;
      creditedAmount=money(creditedAmount+distributionAmount);
      recipients.push({userId:u.id,level,rate,amount:distributionAmount});
    }
  }
  return {skipped:!eventCreated && credited===0,credited,creditedAmount,recipients};
}

export async function runDailyIncome(client,businessDate) {
  await ensureIncomeSchema(client);
  const date=businessDate || previousIndiaBusinessDate();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_BUSINESS_DATE');
  const {rows}=await client.query(`SELECT pa.* FROM package_activations pa JOIN users u ON u.id=pa.user_id
    WHERE pa.status='active' AND u.status='active'
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
    if(!await eventOnce(client,key,'daily_roi',a.user_id,a.id,roi,date,{principal:Number(a.amount),rate:Number(a.roi_daily_rate),packageType:a.package_type})) continue;
    const roiType=a.package_type==='fd'?'fd_roi':'basic_roi';
    const levelType=a.package_type==='fd'?'fd_level':'basic_level';
    if(await credit(client,{eventKey:key,recipient:a.user_id,source:a.user_id,incomeType:roiType,rate:Number(a.roi_daily_rate),base:a.amount,amount:roi,description:`Daily ROI ${a.package_name} ${date}`,businessDate:date})) roiCredits++;
    await client.query('UPDATE package_activations SET total_earned=total_earned+$2 WHERE id=$1',[a.id,roi]);
    for(const u of await uplines(client,a.user_id)){
      if(u.status!=='active') continue;
      const level=Number(u.level), rate=levelRate(level);
      if(rate<=0) continue;
      if(await credit(client,{eventKey:key,recipient:u.id,source:a.user_id,incomeType:levelType,level,rate,base:roi,amount:pct(roi,rate),description:`Daily level L${level} (${rate}%) on ROI from ${a.user_id}`,businessDate:date})) levelCredits++;
    }
    packagesProcessed++;
    if(money(already+roi)>=max) await client.query(`UPDATE package_activations SET status='matured' WHERE id=$1`,[a.id]);
  }
  return {businessDate:date,packages:rows.length,packagesProcessed,roiCredits,levelCredits};
}
