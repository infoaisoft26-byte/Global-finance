import crypto from 'node:crypto';

const MAX_LEVEL = 12;
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
  await client.query(`CREATE TABLE IF NOT EXISTS salary_rules(
    code VARCHAR(32) PRIMARY KEY,
    title VARCHAR(80) NOT NULL,
    team_business NUMERIC(16,2) NOT NULL,
    salary_percent NUMERIC(8,4) NOT NULL,
    recurring_percent NUMERIC(8,4) NOT NULL,
    direct_ids INT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL)`);
  const rows = [
    ['ASST_LEADER','Asst. Leader',5000,3,0.25,1,1],
    ['LEADER','Leader',10000,4,0.25,2,2],
    ['ASST_MANAGER','Asst. Manager',25000,5,0.25,3,3],
    ['MANAGER','Manager',50000,6,0.25,4,4],
    ['SENIOR_MANAGER','Senior Manager',100000,7,0.25,5,5],
    ['DIRECTOR','Director',250000,8,0.25,6,6]
  ];
  for (const r of rows) await client.query(`INSERT INTO salary_rules(code,title,team_business,salary_percent,recurring_percent,direct_ids,sort_order)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(code) DO UPDATE SET title=EXCLUDED.title,team_business=EXCLUDED.team_business,salary_percent=EXCLUDED.salary_percent,recurring_percent=EXCLUDED.recurring_percent,direct_ids=EXCLUDED.direct_ids,sort_order=EXCLUDED.sort_order`, r);
}

async function uplines(client, userId) {
  const { rows } = await client.query(`WITH RECURSIVE u AS (
    SELECT s.id,s.referral_code,s.sponsor_id,1 level FROM users m JOIN users s ON s.referral_code=m.sponsor_id WHERE m.id=$1
    UNION ALL SELECT s.id,s.referral_code,s.sponsor_id,u.level+1 FROM u JOIN users s ON s.referral_code=u.sponsor_id WHERE u.level<$2)
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
  const ledgerId='LED-'+id;
  await client.query(`INSERT INTO ledger_transactions(id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
    VALUES($1,$2,$3,'income_wallet','credit',$4,0,$4,$5,$6,'completed',$7::jsonb)`,[ledgerId,recipient,incomeType,amount,description,eventKey,JSON.stringify({sourceUserId:source,level,percentage:rate,baseAmount:money(base),businessDate:businessDate||null})]);
  const referral=['basic_referral','retopup_income'].includes(incomeType)?amount:0;
  const roi=incomeType==='basic_roi'?amount:0; const levelIncome=incomeType==='basic_level'?amount:0; const salary=incomeType==='salary'?amount:0;
  await client.query(`UPDATE wallets SET income_wallet=income_wallet+$2,total_income=total_income+$2,referral_income=referral_income+$3,
    today_roi_income=CASE WHEN $4::date IS NULL THEN today_roi_income WHEN income_stat_date=$4::date THEN today_roi_income+$5 ELSE $5 END,
    today_level_income=CASE WHEN $4::date IS NULL THEN today_level_income WHEN income_stat_date=$4::date THEN today_level_income+$6 ELSE $6 END,
    total_roi_income=total_roi_income+$5,total_level_income=total_level_income+$6,total_salary=total_salary+$7,
    income_stat_date=CASE WHEN $4::date IS NULL THEN income_stat_date ELSE $4::date END,updated_at=NOW() WHERE user_id=$1`,[recipient,amount,referral,businessDate||null,roi,levelIncome,salary]);
  await client.query(`INSERT INTO income_distributions(id,event_key,recipient_user_id,source_user_id,income_type,level,percentage,base_amount,amount,ledger_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,eventKey,recipient,source,incomeType,level,rate,money(base),amount,ledgerId]);
  return true;
}

export async function applyActivationIncome(client,{activationId,userId,amount,packageName}) {
  await ensureIncomeSchema(client);
  const count=await client.query('SELECT COUNT(*)::int n FROM package_activations WHERE user_id=$1',[userId]);
  const first=Number(count.rows[0]?.n||0)<=1;
  const type=first?'joining':'retopup'; const key=`ACT:${activationId}:${type}`;
  if(!await eventOnce(client,key,type,userId,activationId,amount,null,{packageName})) return {skipped:true,credited:0};
  const ups=await uplines(client,userId); let credited=0;
  for(const u of ups){
    const level=Number(u.level); let rate=0;
    if(first){ if(level!==1) continue; rate=5; }
    else rate=level===1?1:0.25;
    if(await credit(client,{eventKey:key,recipient:u.id,source:userId,incomeType:first?'basic_referral':'retopup_income',level,rate,base:amount,amount:pct(amount,rate),description:`${first?'Joining referral':'Re-topup'} income L${level} from ${userId}`})) credited++;
  }
  return {skipped:false,credited};
}

export async function runDailyIncome(client,businessDate) {
  await ensureIncomeSchema(client);
  const date=businessDate || new Date(Date.now()-86400000).toISOString().slice(0,10);
  const {rows}=await client.query(`SELECT * FROM package_activations WHERE status='active' AND activated_at::date<=$1::date AND expires_at::date>=$1::date FOR UPDATE`,[date]);
  let roiCredits=0,levelCredits=0;
  for(const a of rows){
    const max=money(Number(a.amount)*Number(a.roi_daily_rate)*Number(a.duration_days)/100); if(Number(a.total_earned)>=max) continue;
    const roi=money(Math.min(pct(a.amount,a.roi_daily_rate),max-Number(a.total_earned||0))); if(roi<=0) continue;
    const key=`ROI:${a.id}:${date}`; if(!await eventOnce(client,key,'daily_roi',a.user_id,a.id,roi,date,{principal:Number(a.amount),rate:Number(a.roi_daily_rate)})) continue;
    if(await credit(client,{eventKey:key,recipient:a.user_id,source:a.user_id,incomeType:'basic_roi',rate:Number(a.roi_daily_rate),base:a.amount,amount:roi,description:`Daily ROI ${a.package_name} ${date}`,businessDate:date})) roiCredits++;
    await client.query('UPDATE package_activations SET total_earned=total_earned+$2 WHERE id=$1',[a.id,roi]);
    for(const u of await uplines(client,a.user_id)){
      const level=Number(u.level), rate=level===1?5:1;
      if(await credit(client,{eventKey:key,recipient:u.id,source:a.user_id,incomeType:'basic_level',level,rate,base:roi,amount:pct(roi,rate),description:`Daily level L${level} on ROI from ${a.user_id}`,businessDate:date})) levelCredits++;
    }
  }
  return {businessDate:date,packages:rows.length,roiCredits,levelCredits};
}

export async function evaluateSalaryRanks(client) {
  await ensureIncomeSchema(client);
  const {rows:members}=await client.query(`SELECT id,referral_code FROM users WHERE role='user' AND status='active'`);
  const {rows:rules}=await client.query('SELECT * FROM salary_rules WHERE active=TRUE ORDER BY sort_order');
  const out=[];
  for(const m of members){
    const team=await client.query(`WITH RECURSIVE d AS (SELECT id,referral_code FROM users WHERE sponsor_id=$1 UNION ALL SELECT u.id,u.referral_code FROM users u JOIN d ON u.sponsor_id=d.referral_code)
      SELECT COALESCE(SUM(w.basic_package_active+w.fd_package_active),0)::numeric business FROM d JOIN wallets w ON w.user_id=d.id`,[m.referral_code]);
    const direct=await client.query(`SELECT COUNT(*)::int n FROM users WHERE sponsor_id=$1 AND status='active'`,[m.referral_code]);
    const business=Number(team.rows[0]?.business||0),directs=Number(direct.rows[0]?.n||0);
    const eligible=[...rules].reverse().find(r=>business>=Number(r.team_business)&&directs>=Number(r.direct_ids));
    const rank=eligible?.code||'MEMBER'; await client.query('UPDATE users SET rank_code=$2,updated_at=NOW() WHERE id=$1',[m.id,rank]);
    out.push({userId:m.id,rank,business,directs,salaryPercent:Number(eligible?.salary_percent||0),recurringPercent:Number(eligible?.recurring_percent||0)});
  }
  return out;
}
