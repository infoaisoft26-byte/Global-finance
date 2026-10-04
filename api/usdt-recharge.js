import { randomUUID } from 'node:crypto';
import { getPool, withTransaction } from './_lib/db.js';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { BEP20_WALLET, rechargeConfigured, autoCreditConfigured, verifyBep20 } from './_lib/bep20.js';
import { applyActivationIncome, ensureIncomeSchema } from './_lib/incomeEngine.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

const hashPattern = /^0x[0-9a-fA-F]{64}$/;
const amountPattern = /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,8})?$/;

function parseBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}

function map(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.name,
    userEmail: row.email,
    referralCode: row.referral_code,
    txHash: row.tx_hash,
    amountUsdt: String(row.amount_usdt),
    status: row.status,
    creditInr: row.credit_inr == null ? null : String(row.credit_inr),
    reviewNote: row.review_note,
    proofUrl: row.proof_url,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

async function autoCreditRecharge({ id, actor, txHash, amount }) {
  if (!autoCreditConfigured()) return { attempted: false, status: 'pending' };

  let proof;
  try {
    proof = await verifyBep20(txHash, amount);
  } catch (error) {
    const message = String(error?.message || '');
    if (['TRANSACTION_NOT_CONFIRMED', 'TRANSFER_MISMATCH', 'WRONG_NETWORK', 'INVALID_TOKEN', 'BSC_RPC_FAILED'].includes(message)) {
      await getPool().query(
        `UPDATE usdt_bep20_recharges SET review_note=$2 WHERE id=$1 AND status='pending'`,
        [id, `Auto-credit deferred: ${message}`]
      ).catch(() => {});
      return { attempted: true, status: 'pending', deferred: message };
    }
    throw error;
  }

  return withTransaction(async (client) => {
    const locked = await client.query('SELECT * FROM usdt_bep20_recharges WHERE id=$1 FOR UPDATE', [id]);
    const row = locked.rows[0];
    if (!row) throw new Error('RECHARGE_NOT_FOUND');
    if (row.status !== 'pending') {
      return {
        attempted: true,
        status: row.status,
        alreadyProcessed: true,
        creditInr: row.credit_inr == null ? null : String(row.credit_inr),
      };
    }
    if (row.tx_hash !== txHash || String(row.amount_usdt) !== String(amount)) throw new Error('REVIEW_CHANGED');

    const already = await client.query(
      `SELECT id FROM ledger_transactions WHERE lower(reference_id)=$1
       AND type IN ('crypto_deposit','usdt_bep20_recharge') LIMIT 1`,
      [txHash]
    );
    if (already.rowCount) throw new Error('ALREADY_CREDITED');

    const member = await client.query("SELECT id,status FROM users WHERE id=$1 AND role='user'", [actor.id]);
    await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [actor.id]);
    const wallet = await client.query('SELECT user_id FROM wallets WHERE user_id=$1 FOR UPDATE', [actor.id]);
    if (!wallet.rowCount || member.rows[0]?.status !== 'active') throw new Error('MEMBER_UNAVAILABLE');

    // Fund Wallet is USDT-denominated: 1 verified USDT = 1 wallet unit.
    // Wallet schema stores 2 decimals, so auto-credit rounds to 2 decimals.
    const creditResult = await client.query(`SELECT ROUND($1::numeric,2)::text AS credit`, [amount]);
    const walletCredit = String(creditResult.rows[0]?.credit || '0.00');
    if (!/^(?:0|[1-9][0-9]{0,12})\.[0-9]{2}$/.test(walletCredit) || Number(walletCredit) <= 0) {
      throw new Error('INVALID_AUTO_CREDIT_AMOUNT');
    }

    const ledgerId = `DEP_${randomUUID().replaceAll('-', '').slice(0, 26)}`;
    await client.query(
      `INSERT INTO ledger_transactions(id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
       VALUES($1,$2,'usdt_bep20_recharge','fund_wallet','credit',$3,0,$3,$4,$5,'completed',$6::jsonb)`,
      [
        ledgerId,
        actor.id,
        walletCredit,
        `Auto-verified USDT BEP20 recharge ${id}`,
        txHash,
        JSON.stringify({ rechargeId: id, amountUsdt: amount, walletCreditUsdt: walletCredit, chainProof: proof, autoCredit: true }),
      ]
    );

    await client.query('UPDATE wallets SET fund_wallet=fund_wallet+$1,updated_at=NOW() WHERE user_id=$2', [walletCredit, actor.id]);
    await client.query(
      `UPDATE usdt_bep20_recharges
       SET status='approved',credit_inr=$2,ledger_id=$3,review_note='Auto-approved after on-chain verification',
           reviewed_by=$4,reviewed_at=NOW()
       WHERE id=$1`,
      [id, walletCredit, ledgerId, actor.id]
    );
    await client.query(
      `INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
       VALUES($1,$2,$3,'USDT_RECHARGE_AUTO_CREDITED','usdt_recharge',$4,$5::jsonb)`,
      [
        randomUUID(),
        actor.id,
        actor.email,
        id,
        JSON.stringify({ txHash, amountUsdt: amount, walletCreditUsdt: walletCredit, ledgerId, chainProof: proof, autoCredit: true }),
      ]
    );

    return { attempted: true, status: 'approved', autoCredited: true, creditInr: walletCredit, ledgerId };
  });
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });

  try {
    const auth = String(req.headers.authorization || '');
    if (!auth.startsWith('Bearer ')) return json(res, 401, { error: 'Authentication required' });

    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(auth.slice(7));
    } catch {
      return json(res, 401, { error: 'Invalid or expired authentication' });
    }

    const userResult = await getPool().query(
      'SELECT id,email,role,status FROM users WHERE id=$1 AND email=$2 LIMIT 1',
      [decoded.uid, String(decoded.email || '').trim().toLowerCase()]
    );
    const actor = userResult.rows[0];
    if (!actor || actor.status !== 'active') return json(res, 403, { error: 'Active account required' });
    const admin = actor.role === 'admin';

    if (req.method === 'GET') {
      const scope = new URL(req.url, 'http://localhost').searchParams.get('scope');

      if (scope === 'ledger') {
        const { rows } = await getPool().query(
          admin
            ? `SELECT l.id,l.user_id,l.type,l.category,l.flow,l.amount,l.fee,l.net_amount,l.description,l.reference_id,l.status,l.metadata,l.created_at,
                      u.name AS user_name,u.email AS user_email,u.referral_code AS user_referral_code
                 FROM ledger_transactions l
                 LEFT JOIN users u ON u.id=l.user_id
                ORDER BY l.created_at DESC
                LIMIT 1000`
            : `SELECT id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata,created_at
                 FROM ledger_transactions
                WHERE user_id=$1
                ORDER BY created_at DESC
                LIMIT 200`,
          admin ? [] : [actor.id]
        );
        return json(res, 200, {
          transactions: rows.map((row) => ({
            id: row.id,
            userId: row.user_id,
            type: row.type === 'usdt_bep20_recharge' ? 'recharge' : row.type,
            category: row.category,
            flow: row.flow,
            amount: Number(row.amount || 0),
            fee: Number(row.fee || 0),
            netAmount: Number(row.net_amount || 0),
            description: row.description || '',
            referenceId: row.reference_id || row.id,
            status: row.status || 'completed',
            metadata: {
              ...(row.metadata || {}),
              ...(row.user_name ? { userName: row.user_name } : {}),
              ...(row.user_email ? { userEmail: row.user_email } : {}),
              ...(row.user_referral_code ? { userReferralCode: row.user_referral_code } : {}),
            },
            createdAt: row.created_at?.toISOString?.() || String(row.created_at),
          }))
        });
      }

      if (scope === 'admin' && !admin) return json(res, 403, { error: 'Admin access required' });
      const query = scope === 'admin'
        ? `SELECT r.*,u.name,u.email,u.referral_code FROM usdt_bep20_recharges r JOIN users u ON u.id=r.user_id ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 150`
        : `SELECT r.* FROM usdt_bep20_recharges r WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 30`;
      const { rows } = await getPool().query(query, scope === 'admin' ? [] : [actor.id]);

      // When automatic verification is enabled, retry pending requests whenever
      // the member opens/refreshes Recharge. This makes a previously submitted
      // confirmed transaction settle without requiring a second manual submit.
      if (scope !== 'admin' && autoCreditConfigured()) {
        for (const pending of rows.filter((row) => row.status === 'pending')) {
          try {
            await autoCreditRecharge({
              id: pending.id,
              actor,
              txHash: pending.tx_hash,
              amount: String(pending.amount_usdt),
            });
          } catch (error) {
            console.error('Pending recharge auto-credit retry failed:', error instanceof Error ? error.message : error);
          }
        }
      }

      const { rows: refreshedRows } = await getPool().query(query, scope === 'admin' ? [] : [actor.id]);
      return json(res, 200, {
        requests: refreshedRows.map(map),
        enabled: rechargeConfigured(),
        autoCreditEnabled: autoCreditConfigured(),
        depositAddress: BEP20_WALLET,
      });
    }

    let body;
    try {
      body = parseBody(req);
    } catch {
      return json(res, 400, { error: 'Invalid JSON request' });
    }

    if (body.action === 'activate_package') {
      if (admin) return json(res, 403, { error: 'Member account required' });

      const packageType = body.packageType === 'fd' ? 'fd' : 'basic';
      const packageName = String(body.packageName || '').trim().slice(0, 120);
      const amount = Number(Number(body.amount || 0).toFixed(2));
      const roiRate = Number(body.roiRate);
      const durationDays = Math.floor(Number(body.durationDays));

      if (!packageName || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(roiRate) || roiRate <= 0 || !Number.isInteger(durationDays) || durationDays <= 0) {
        return json(res, 400, { error: 'Valid package details are required' });
      }

      const result = await withTransaction(async (client) => {
        await ensureIncomeSchema(client);
        await client.query(`CREATE TABLE IF NOT EXISTS package_activations(
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL REFERENCES users(id),
          package_type VARCHAR(16) NOT NULL,
          package_name VARCHAR(120) NOT NULL,
          amount NUMERIC(16,2) NOT NULL CHECK(amount>0),
          roi_daily_rate NUMERIC(10,4) NOT NULL,
          duration_days INT NOT NULL,
          total_earned NUMERIC(16,2) NOT NULL DEFAULT 0,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        )`);
        await client.query('ALTER TABLE wallets ADD COLUMN IF NOT EXISTS basic_package_active NUMERIC(16,2) NOT NULL DEFAULT 0');
        await client.query('ALTER TABLE wallets ADD COLUMN IF NOT EXISTS fd_package_active NUMERIC(16,2) NOT NULL DEFAULT 0');

        const member = (await client.query('SELECT id,status,role FROM users WHERE id=$1 AND email=$2 LIMIT 1', [decoded.uid, String(decoded.email || '').trim().toLowerCase()])).rows[0];
        if (!member || member.status !== 'active' || member.role !== 'user') throw new Error('ACTIVE_MEMBER_REQUIRED');

        const walletQ = await client.query('SELECT * FROM wallets WHERE user_id=$1 FOR UPDATE', [actor.id]);
        if (!walletQ.rowCount) throw new Error('WALLET_NOT_FOUND');
        const available = Number(walletQ.rows[0].fund_wallet || 0);
        if (available < amount) throw new Error('INSUFFICIENT_FUNDS');

        const id = `PKG_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
        const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();
        await client.query(`INSERT INTO package_activations(id,user_id,package_type,package_name,amount,roi_daily_rate,duration_days,total_earned,status,activated_at,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,0,'active',NOW(),$8)`, [id, actor.id, packageType, packageName, amount, roiRate, durationDays, expiresAt]);

        const ledgerId = `LED_${randomUUID().replaceAll('-', '').slice(0, 26)}`;
        await client.query(`INSERT INTO ledger_transactions(id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
          VALUES($1,$2,'package_activation','fund_wallet','debit',$3,0,$3,$4,$5,'completed',$6::jsonb)`,
          [ledgerId, actor.id, amount, `Activated ${packageName} (${packageType.toUpperCase()})`, id, JSON.stringify({ packageId:id, packageType, packageName, amount, roiRate, durationDays })]);

        const walletField = packageType === 'fd' ? 'fd_package_active' : 'basic_package_active';
        await client.query(`UPDATE wallets SET fund_wallet=fund_wallet-$1,${walletField}=${walletField}+$1,updated_at=NOW() WHERE user_id=$2`, [amount, actor.id]);

        const income = await applyActivationIncome(client, { activationId:id, userId:actor.id, amount, packageName, packageType });
        return { packageId:id, ledgerId, income };
      });

      return json(res, 200, { success:true, ...result });
    }

    if (body.action === 'submit') {
      if (admin) return json(res, 403, { error: 'Member account required' });
      if (!rechargeConfigured()) return json(res, 503, { error: 'Recharge is not available yet' });

      const amount = String(body.amountUsdt || '').trim();
      const txHash = String(body.txHash || '').trim().toLowerCase();
      if (!amountPattern.test(amount) || Number(amount) <= 0 || !hashPattern.test(txHash)) {
        return json(res, 400, { error: 'Enter a valid USDT amount and BSC TXID' });
      }

      const proofUrl = String(body.paymentProofUrl || '').trim();
      if (proofUrl) {
        let url;
        try {
          url = new URL(proofUrl);
        } catch {
          return json(res, 400, { error: 'Invalid payment screenshot URL' });
        }
        if (
          url.protocol !== 'https:' ||
          url.hostname !== 'firebasestorage.googleapis.com' ||
          !decodeURIComponent(url.pathname).includes(`/payment_proofs/${actor.id}/${txHash}/`)
        ) {
          return json(res, 400, { error: 'Payment screenshot must belong to this account and TXID' });
        }
      }

      const id = `RCH_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
      await withTransaction(async (client) => {
        const credited = await client.query(
          `SELECT id FROM ledger_transactions WHERE lower(reference_id)=$1
           AND type IN ('crypto_deposit','usdt_bep20_recharge') LIMIT 1`,
          [txHash]
        );
        if (credited.rowCount) throw new Error('ALREADY_CREDITED');

        const existing = await client.query('SELECT id FROM usdt_bep20_recharges WHERE lower(tx_hash)=$1 LIMIT 1', [txHash]);
        if (existing.rowCount) throw new Error('TXID_ALREADY_SUBMITTED');

        await client.query(
          `INSERT INTO usdt_bep20_recharges(id,user_id,tx_hash,deposit_address,amount_usdt,proof_url)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [id, actor.id, txHash, BEP20_WALLET.toLowerCase(), amount, proofUrl || null]
        );
        await client.query(
          `INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
           VALUES($1,$2,$3,'USDT_RECHARGE_SUBMITTED','usdt_recharge',$4,$5::jsonb)`,
          [randomUUID(), actor.id, actor.email, id, JSON.stringify({ txHash, amountUsdt: amount, network: 'BSC', autoCreditEnabled: autoCreditConfigured() })]
        );
      });

      // AUTO-CREDIT FLOW: store first, then verify on-chain and credit atomically.
      // The recharge request is already safely stored as pending.
      // Automatic on-chain verification must never turn a successful submission
      // into a generic 500 response. If verification fails, keep it pending
      // and let admin review/retry it.
      let autoResult = { attempted: false, status: 'pending' };

      if (autoCreditConfigured()) {
        try {
          autoResult = await autoCreditRecharge({ id, actor, txHash, amount });
        } catch (error) {
          console.error('Recharge auto-credit failed:', {
            rechargeId: id,
            userId: actor.id,
            txHash,
            amount,
            error: error instanceof Error ? error.stack || error.message : error,
          });

          await getPool().query(
            `UPDATE usdt_bep20_recharges
             SET review_note=$2
             WHERE id=$1 AND status='pending'`,
            [
              id,
              'Automatic verification failed. Recharge remains pending admin review.',
            ]
          ).catch((dbError) => {
            console.error('Failed to save auto-credit failure note:', dbError);
          });

          autoResult = {
            attempted: true,
            status: 'pending',
            deferred: true,
          };
        }
      }

      return json(res, 201, {
        success: true,
        id,
        status: autoResult.status || 'pending',
        autoCredit: autoResult,
      });
    }

    if (body.action !== 'approve' && body.action !== 'reject') return json(res, 400, { error: 'Invalid action' });
    if (!admin) return json(res, 403, { error: 'Admin access required' });
    if (!rechargeConfigured()) return json(res, 503, { error: 'Recharge approval is disabled' });

    const id = String(body.id || '');
    const note = String(body.note || '').trim() || (body.action === 'approve' ? 'Approved by admin after manual payment verification.' : 'Rejected by admin after manual payment review.');
    if (!/^RCH_[0-9a-f]{24}$/.test(id) || note.length > 1000) {
      return json(res, 400, { error: 'A valid recharge request is required' });
    }

    const isApproval = body.action === 'approve';
    const credit = String(body.creditInr || '').trim();
    if (isApproval && (!/^(?:0|[1-9][0-9]{0,12})\.[0-9]{2}$/.test(credit) || Number(credit) <= 0)) {
      return json(res, 400, { error: 'Enter the reviewed wallet credit with two decimals' });
    }

    const requested = await getPool().query('SELECT tx_hash,amount_usdt FROM usdt_bep20_recharges WHERE id=$1', [id]);
    if (!requested.rows[0]) return json(res, 404, { error: 'Recharge not found' });
    // Phase 1: admin approval is manual. Admin verifies the TX on-chain
    // before approving, so approval does not depend on RPC/token-contract
    // auto-verification. Phase 2/3 can re-enable verifyBep20 for automation.
    const proof = null;

    const result = await withTransaction(async (client) => {
      const locked = await client.query('SELECT * FROM usdt_bep20_recharges WHERE id=$1 FOR UPDATE', [id]);
      const row = locked.rows[0];
      if (!row || row.status !== 'pending') throw new Error('ALREADY_REVIEWED');
      if (isApproval && (row.tx_hash !== requested.rows[0].tx_hash || String(row.amount_usdt) !== String(requested.rows[0].amount_usdt))) {
        throw new Error('REVIEW_CHANGED');
      }

      let ledgerId = null;
      if (isApproval) {
        await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [row.user_id]);
        const wallet = await client.query('SELECT user_id FROM wallets WHERE user_id=$1 FOR UPDATE', [row.user_id]);
        const member = await client.query("SELECT id,status FROM users WHERE id=$1 AND role='user'", [row.user_id]);
        if (!wallet.rowCount || member.rows[0]?.status !== 'active') throw new Error('MEMBER_UNAVAILABLE');

        const already = await client.query(
          `SELECT id FROM ledger_transactions WHERE lower(reference_id)=$1
           AND type IN ('crypto_deposit','usdt_bep20_recharge') LIMIT 1`,
          [row.tx_hash]
        );
        if (already.rowCount) throw new Error('ALREADY_CREDITED');

        ledgerId = `DEP_${randomUUID().replaceAll('-', '').slice(0, 26)}`;
        await client.query(
          `INSERT INTO ledger_transactions(id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
           VALUES($1,$2,'usdt_bep20_recharge','fund_wallet','credit',$3,0,$3,$4,$5,'completed',$6::jsonb)`,
          [
            ledgerId,
            row.user_id,
            credit,
            `Verified USDT BEP20 recharge ${id}`,
            row.tx_hash,
            JSON.stringify({ rechargeId: id, amountUsdt: String(row.amount_usdt), walletCreditUsdt: credit, chainProof: proof, reviewNote: note, adminId: actor.id }),
          ]
        );
        await client.query('UPDATE wallets SET fund_wallet=fund_wallet+$1,updated_at=NOW() WHERE user_id=$2', [credit, row.user_id]);
      }

      await client.query(
        `UPDATE usdt_bep20_recharges SET status=$2,credit_inr=$3,ledger_id=$4,review_note=$5,reviewed_by=$6,reviewed_at=NOW() WHERE id=$1`,
        [id, isApproval ? 'approved' : 'rejected', isApproval ? credit : null, ledgerId, note, actor.id]
      );
      await client.query(
        `INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
         VALUES($1,$2,$3,$4,'usdt_recharge',$5,$6::jsonb)`,
        [
          randomUUID(),
          actor.id,
          actor.email,
          isApproval ? 'USDT_RECHARGE_APPROVED' : 'USDT_RECHARGE_REJECTED',
          id,
          JSON.stringify({ txHash: row.tx_hash, amountUsdt: String(row.amount_usdt), walletCreditUsdt: isApproval ? credit : null, ledgerId, chainProof: proof, note }),
        ]
      );
      return { status: isApproval ? 'approved' : 'rejected', ledgerId };
    });

    return json(res, 200, { success: true, ...result });
  } catch (error) {
    const message = String(error?.message || '');
    if (error?.code === '23505') return json(res, 409, { error: 'This TXID has already been submitted or credited' });
    if (message === 'TXID_ALREADY_SUBMITTED') return json(res, 409, { error: 'This TXID has already been submitted' });
    if (message === 'ALREADY_CREDITED') return json(res, 409, { error: 'This TXID was already credited' });
    if (message === 'ALREADY_REVIEWED') return json(res, 409, { error: 'Recharge has already been reviewed' });
    if (message === 'REVIEW_CHANGED') return json(res, 409, { error: 'Recharge changed during review' });
    if (message === 'MEMBER_UNAVAILABLE') return json(res, 409, { error: 'Member wallet or account is unavailable' });
    if (message === 'INVALID_AUTO_CREDIT_AMOUNT') return json(res, 422, { error: 'Automatic credit amount is invalid; request remains for admin review' });
    if (['TRANSACTION_NOT_CONFIRMED', 'TRANSFER_MISMATCH', 'WRONG_NETWORK', 'INVALID_TOKEN', 'BSC_RPC_FAILED'].includes(message)) {
      return json(res, 422, { error: `On-chain verification failed: ${message}` });
    }
    if (message === 'RECHARGE_DISABLED') return json(res, 503, { error: 'Recharge approval is disabled' });
    console.error('usdt-recharge failed:', message);
    return json(res, 500, { error: 'Recharge request could not be processed' });
  }
}
