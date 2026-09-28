import crypto from 'node:crypto';

const MAX_LEVEL = 12;
const MONEY_SCALE = 2;

function money(value) {
  return Number(Number(value || 0).toFixed(MONEY_SCALE));
}

function pct(base, rate) {
  return money((Number(base || 0) * Number(rate || 0)) / 100);
}

function stableId(prefix, key) {
  return `${prefix}_${crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 26)}`;
}

export function indiaDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function previousIndiaDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')?.value || 0);
  const m = Number(parts.find((p) => p.type === 'month')?.value || 1);
  const d = Number(parts.find((p) => p.type === 'day')?.value || 1);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Keeps the production schema self-healing on deploy. The canonical copy also
 * lives in src/db_schema.sql so `npm run db:migrate` remains authoritative.
 */
export async function ensureCommissionSchema(client) {
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS rank_code VARCHAR(32) NOT NULL DEFAULT 'MEMBER'`);
  await client.query(`
    ALTER TABLE wallets
      ADD COLUMN IF NOT EXISTS referral_income NUMERIC(16,2) NOT NULL DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS today_roi_income NUMERIC(16,2) NOT NULL DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS today_level_income NUMERIC(16,2) NOT NULL DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS total_roi_income NUMERIC(16,2) NOT NULL DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS total_level_income NUMERIC(16,2) NOT NULL DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS income_stat_date DATE
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS commission_rules (
      id VARCHAR(96) PRIMARY KEY,
      event_type VARCHAR(32) NOT NULL,
      rank_code VARCHAR(32) NOT NULL DEFAULT 'MEMBER',
      level INT NOT NULL CHECK (level BETWEEN 1 AND 12),
      percentage NUMERIC(8,4) NOT NULL CHECK (percentage >= 0),
      min_directs INT NOT NULL DEFAULT 0 CHECK (min_directs >= 0),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(event_type, rank_code, level)
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS commission_events (
      event_key VARCHAR(160) PRIMARY KEY,
      event_type VARCHAR(32) NOT NULL,
      source_activation_id VARCHAR(64),
      source_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      base_amount NUMERIC(16,2) NOT NULL CHECK (base_amount >= 0),
      business_date DATE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS income_distributions (
      id VARCHAR(64) PRIMARY KEY,
      event_key VARCHAR(160) NOT NULL REFERENCES commission_events(event_key) ON DELETE RESTRICT,
      recipient_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      source_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      event_type VARCHAR(32) NOT NULL,
      level INT NOT NULL CHECK (level BETWEEN 0 AND 12),
      percentage NUMERIC(8,4) NOT NULL,
      base_amount NUMERIC(16,2) NOT NULL,
      amount NUMERIC(16,2) NOT NULL CHECK (amount > 0),
      ledger_id VARCHAR(64) NOT NULL UNIQUE REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(event_key, recipient_user_id, event_type, level)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_income_dist_recipient ON income_distributions(recipient_user_id, created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_commission_events_date ON commission_events(event_type, business_date)`);

  const seed = [];
  seed.push(['JOIN_MEMBER_L1', 'joining_referral', 'MEMBER', 1, 5, 0]);
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    seed.push([`RETOPUP_MEMBER_L${level}`, 'retopup', 'MEMBER', level, level === 1 ? 1 : 0.25, level]);
    seed.push([`DAILY_MEMBER_L${level}`, 'daily_level', 'MEMBER', level, level === 1 ? 5 : 1, level]);
  }
  for (const row of seed) {
    await client.query(`
      INSERT INTO commission_rules(id,event_type,rank_code,level,percentage,min_directs)
      VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(event_type,rank_code,level) DO NOTHING
    `, row);
  }

  // Approved Basic plan terms: 1% daily for 25 days. Do not mix principal
  // into ROI; 200 => 2/day => 50 ROI over 25 days.
  await client.query(`
    UPDATE packages
       SET roi_rate=1, duration_days=25, updated_at=NOW()
     WHERE type='basic'
       AND (id LIKE 'gf-basic-%' OR code LIKE 'GF_BASE_%')
       AND (roi_rate<>1 OR duration_days<>25)
  `);
}

async function getUplines(client, sourceUserId) {
  const { rows } = await client.query(`
    WITH RECURSIVE uplines AS (
      SELECT s.id,s.referral_code,s.sponsor_id,s.rank_code,s.status,1 AS level,ARRAY[u.id,s.id]::varchar[] AS path
        FROM users u
        JOIN users s ON s.referral_code=u.sponsor_id
       WHERE u.id=$1
      UNION ALL
      SELECT s.id,s.referral_code,s.sponsor_id,s.rank_code,s.status,u.level+1,u.path||s.id
        FROM uplines u
        JOIN users s ON s.referral_code=u.sponsor_id
       WHERE u.level<$2 AND NOT (s.id=ANY(u.path))
    )
    SELECT u.*,
           (SELECT COUNT(*)::int FROM users d WHERE d.sponsor_id=u.referral_code AND d.status='active') AS direct_count
      FROM uplines u
     ORDER BY u.level ASC
  `, [sourceUserId, MAX_LEVEL]);
  return rows;
}

async function getRule(client, eventType, rankCode, level) {
  const { rows } = await client.query(`
    SELECT event_type,rank_code,level,percentage,min_directs
      FROM commission_rules
     WHERE event_type=$1 AND level=$2 AND active=TRUE AND rank_code IN ($3,'MEMBER')
     ORDER BY CASE WHEN rank_code=$3 THEN 0 ELSE 1 END
     LIMIT 1
  `, [eventType, level, String(rankCode || 'MEMBER').toUpperCase()]);
  return rows[0] || null;
}

async function insertEvent(client, event) {
  const result = await client.query(`
    INSERT INTO commission_events(event_key,event_type,source_activation_id,source_user_id,base_amount,business_date,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
    ON CONFLICT(event_key) DO NOTHING
    RETURNING event_key
  `, [event.eventKey, event.eventType, event.activationId || null, event.sourceUserId, money(event.baseAmount), event.businessDate || null, JSON.stringify(event.metadata || {})]);
  return result.rowCount === 1;
}

async function creditIncome(client, params) {
  const amount = money(params.amount);
  if (amount <= 0) return false;
  const ledgerId = stableId('INC', `${params.eventKey}:${params.recipientUserId}:${params.eventType}:${params.level}`);
  const distributionId = stableId('DST', `${params.eventKey}:${params.recipientUserId}:${params.eventType}:${params.level}`);

  const existing = await client.query(`SELECT 1 FROM income_distributions WHERE id=$1 LIMIT 1`, [distributionId]);
  if (existing.rowCount) return false;

  await client.query(`INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING`, [params.recipientUserId]);
  await client.query(`
    INSERT INTO ledger_transactions(id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
    VALUES($1,$2,$3,'income_wallet','credit',$4,0,$4,$5,$6,'completed',$7::jsonb)
  `, [
    ledgerId,
    params.recipientUserId,
    params.ledgerType,
    amount,
    params.description,
    params.eventKey,
    JSON.stringify({
      sourceUserId: params.sourceUserId,
      sourceActivationId: params.activationId || null,
      eventType: params.eventType,
      level: params.level,
      percentage: Number(params.percentage || 0),
      baseAmount: money(params.baseAmount),
      businessDate: params.businessDate || null,
    }),
  ]);

  const roiPart = params.eventType === 'daily_roi' ? amount : 0;
  const levelPart = params.eventType === 'daily_level' ? amount : 0;
  const referralPart = ['joining_referral', 'retopup'].includes(params.eventType) ? amount : 0;
  await client.query(`
    UPDATE wallets
       SET income_wallet=income_wallet+$2,
           total_income=total_income+$2,
           referral_income=referral_income+$3,
           today_roi_income=CASE WHEN $4::date IS NULL THEN today_roi_income WHEN income_stat_date=$4::date THEN today_roi_income+$5 ELSE $5 END,
           today_level_income=CASE WHEN $4::date IS NULL THEN today_level_income WHEN income_stat_date=$4::date THEN today_level_income+$6 ELSE $6 END,
           total_roi_income=total_roi_income+$5,
           total_level_income=total_level_income+$6,
           income_stat_date=CASE WHEN $4::date IS NULL THEN income_stat_date ELSE $4::date END,
           updated_at=NOW()
     WHERE user_id=$1
  `, [params.recipientUserId, amount, referralPart, params.businessDate || null, roiPart, levelPart]);

  await client.query(`
    INSERT INTO income_distributions(id,event_key,recipient_user_id,source_user_id,event_type,level,percentage,base_amount,amount,ledger_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `, [distributionId, params.eventKey, params.recipientUserId, params.sourceUserId, params.eventType, params.level, Number(params.percentage || 0), money(params.baseAmount), amount, ledgerId]);
  return true;
}

export async function applyActivationCommissions(client, activation) {
  await ensureCommissionSchema(client);
  const countResult = await client.query(`SELECT COUNT(*)::int AS n FROM package_activations WHERE user_id=$1`, [activation.userId]);
  const activationCount = Number(countResult.rows[0]?.n || 0);
  const eventType = activationCount <= 1 ? 'joining_referral' : 'retopup';
  const eventKey = `ACT:${activation.activationId}:${eventType}`;
  const inserted = await insertEvent(client, {
    eventKey,
    eventType,
    activationId: activation.activationId,
    sourceUserId: activation.userId,
    baseAmount: activation.amount,
    metadata: { packageId: activation.packageId || null, packageName: activation.packageName || null },
  });
  if (!inserted) return { eventKey, eventType, credited: 0, skipped: true };

  const uplines = await getUplines(client, activation.userId);
  let credited = 0;
  for (const upline of uplines) {
    if (eventType === 'joining_referral' && Number(upline.level) !== 1) continue;
    if (upline.status !== 'active') continue;
    const rule = await getRule(client, eventType, upline.rank_code, Number(upline.level));
    if (!rule || Number(upline.direct_count || 0) < Number(rule.min_directs || 0)) continue;
    const amount = pct(activation.amount, rule.percentage);
    if (amount <= 0) continue;
    const didCredit = await creditIncome(client, {
      eventKey,
      eventType,
      recipientUserId: upline.id,
      sourceUserId: activation.userId,
      activationId: activation.activationId,
      level: Number(upline.level),
      percentage: Number(rule.percentage),
      baseAmount: activation.amount,
      amount,
      ledgerType: eventType === 'joining_referral' ? 'joining_referral_income' : 'retopup_income',
      description: `${eventType === 'joining_referral' ? 'Joining referral' : 'Re-topup'} income L${upline.level} from ${activation.userId}`,
    });
    if (didCredit) credited += 1;
  }
  return { eventKey, eventType, credited, skipped: false };
}

export async function processDailyIncome(client, businessDate) {
  await ensureCommissionSchema(client);
  const targetDate = businessDate || previousIndiaDateString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error('INVALID_BUSINESS_DATE');

  const { rows: activations } = await client.query(`
    SELECT pa.id,pa.user_id,pa.package_id,pa.package_name,pa.amount,pa.roi_daily_rate,pa.duration_days,pa.total_earned,pa.expires_at
      FROM package_activations pa
      JOIN users u ON u.id=pa.user_id
     WHERE pa.status='active'
       AND u.status='active'
       AND (pa.activated_at AT TIME ZONE 'Asia/Kolkata')::date <= $1::date
       AND (pa.expires_at AT TIME ZONE 'Asia/Kolkata')::date >= $1::date
     ORDER BY pa.activated_at ASC
     FOR UPDATE OF pa
  `, [targetDate]);

  let roiCredits = 0;
  let levelCredits = 0;
  let packagesProcessed = 0;

  for (const activation of activations) {
    const maxRoi = money(Number(activation.amount) * Number(activation.roi_daily_rate) * Number(activation.duration_days) / 100);
    const earned = money(activation.total_earned);
    if (earned >= maxRoi) {
      await client.query(`UPDATE package_activations SET status='matured' WHERE id=$1 AND status='active'`, [activation.id]);
      continue;
    }
    const scheduled = pct(activation.amount, activation.roi_daily_rate);
    const roiAmount = money(Math.min(scheduled, maxRoi - earned));
    if (roiAmount <= 0) continue;

    const roiEventKey = `ROI:${activation.id}:${targetDate}`;
    const inserted = await insertEvent(client, {
      eventKey: roiEventKey,
      eventType: 'daily_roi',
      activationId: activation.id,
      sourceUserId: activation.user_id,
      baseAmount: roiAmount,
      businessDate: targetDate,
      metadata: { principal: money(activation.amount), roiRate: Number(activation.roi_daily_rate), packageName: activation.package_name },
    });
    if (!inserted) continue;

    const didRoiCredit = await creditIncome(client, {
      eventKey: roiEventKey,
      eventType: 'daily_roi',
      recipientUserId: activation.user_id,
      sourceUserId: activation.user_id,
      activationId: activation.id,
      level: 0,
      percentage: Number(activation.roi_daily_rate),
      baseAmount: activation.amount,
      amount: roiAmount,
      businessDate: targetDate,
      ledgerType: 'daily_roi_income',
      description: `Daily ROI for ${activation.package_name} on ${targetDate}`,
    });
    if (didRoiCredit) roiCredits += 1;

    const nextEarned = money(earned + roiAmount);
    await client.query(`UPDATE package_activations SET total_earned=$2,status=CASE WHEN $2 >= $3 THEN 'matured' ELSE status END WHERE id=$1`, [activation.id, nextEarned, maxRoi]);

    const levelEventKey = `LVL:${activation.id}:${targetDate}`;
    await insertEvent(client, {
      eventKey: levelEventKey,
      eventType: 'daily_level',
      activationId: activation.id,
      sourceUserId: activation.user_id,
      baseAmount: roiAmount,
      businessDate: targetDate,
      metadata: { roiEventKey, actualRoiIncome: roiAmount },
    });
    const uplines = await getUplines(client, activation.user_id);
    for (const upline of uplines) {
      if (upline.status !== 'active') continue;
      const rule = await getRule(client, 'daily_level', upline.rank_code, Number(upline.level));
      if (!rule || Number(upline.direct_count || 0) < Number(rule.min_directs || 0)) continue;
      const levelAmount = pct(roiAmount, rule.percentage);
      if (levelAmount <= 0) continue;
      const didLevelCredit = await creditIncome(client, {
        eventKey: levelEventKey,
        eventType: 'daily_level',
        recipientUserId: upline.id,
        sourceUserId: activation.user_id,
        activationId: activation.id,
        level: Number(upline.level),
        percentage: Number(rule.percentage),
        baseAmount: roiAmount,
        amount: levelAmount,
        businessDate: targetDate,
        ledgerType: 'daily_level_income',
        description: `Daily level income L${upline.level} from actual ROI of ${activation.user_id} on ${targetDate}`,
      });
      if (didLevelCredit) levelCredits += 1;
    }
    packagesProcessed += 1;
  }

  return { businessDate: targetDate, packagesProcessed, roiCredits, levelCredits };
}
