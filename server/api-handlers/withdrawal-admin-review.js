import { getPool, withTransaction } from '../../api/_lib/db.js';
import { getFirestoreAdmin, verifyFirebaseIdToken } from '../../api/_lib/firebaseAdmin.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

function isTrustedAdmin(decoded, profile) {
  const email = String(decoded.email || '').trim().toLowerCase();
  return decoded.admin === true
    || String(profile?.role || '').toLowerCase() === 'admin'
    || ['admin@gf.app', 'info@gf.app', 'infoaisoft26@gmail.com'].includes(email);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  try {
    const authorization = String(req.headers.authorization || '');
    if (!authorization.startsWith('Bearer ')) return json(res, 401, { error: 'Authentication required.' });

    const decoded = await verifyFirebaseIdToken(authorization.slice(7));
    const firestore = getFirestoreAdmin();
    const adminSnap = await firestore.collection('users').doc(decoded.uid).get();
    const adminProfile = adminSnap.exists ? adminSnap.data() : null;
    if (!isTrustedAdmin(decoded, adminProfile)) return json(res, 403, { error: 'Admin authorization required.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const requestId = String(body.requestId || '').trim();
    const adminNote = String(body.adminNote || '').trim().slice(0, 1000);
    if (!requestId) return json(res, 400, { error: 'Transaction request ID is required.' });

    const requestRef = firestore.collection('transaction_requests').doc(requestId);
    const initialSnap = await requestRef.get();
    if (!initialSnap.exists) return json(res, 404, { error: 'Transaction request not found.' });
    const initial = initialSnap.data() || {};
    if (initial.requestType !== 'withdrawal') return json(res, 400, { error: 'This endpoint only handles withdrawal rejection.' });
    if (!['pending', 'under_review', 'approved'].includes(String(initial.status || ''))) {
      if (initial.status === 'rejected' && initial.metadata?.refundIssued === true) {
        return json(res, 200, { success: true, alreadyProcessed: true, status: 'rejected' });
      }
      return json(res, 409, { error: 'Withdrawal status changed or is not rejectable. Refresh before retrying.' });
    }
    if (initial.metadata?.walletDebited !== true) {
      return json(res, 409, { error: 'This withdrawal is not marked as wallet-debited. Manual reconciliation is required; no refund was issued.' });
    }

    const reference = String(initial.reference || '').trim();
    const userId = String(initial.userId || '').trim();
    const amount = Number(initial.amountRupees ?? initial.amountUsdt ?? initial.metadata?.amountUsdt ?? (Number(initial.amountPaise ?? initial.metadata?.amountPaise ?? 0) / 100) ?? 0);
    if (!reference || !userId || !Number.isFinite(amount) || amount <= 0) {
      return json(res, 409, { error: 'Withdrawal record is missing a valid reference, user, or amount.' });
    }

    const refundId = reference + '-WITHDRAWAL-REFUND';
    const liabilityId = refundId + '-LIABILITY';

    // Neon is the canonical wallet/ledger source. This transaction is idempotent:
    // a retry after a Firestore failure sees the existing refund ledger and will not credit twice.
    const neonBalance = await withTransaction(async client => {
      const existing = await client.query(
        'SELECT id FROM ledger_transactions WHERE id = $1 FOR UPDATE',
        [refundId]
      );
      if (existing.rows.length) {
        const currentWallet = await client.query('SELECT income_wallet FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        if (!currentWallet.rows.length) throw new Error('NEON_WALLET_NOT_FOUND');
        return Number(currentWallet.rows[0].income_wallet || 0);
      }

      const debit = await client.query(
        "SELECT id, amount FROM ledger_transactions WHERE id = $1 AND type = 'withdrawal' AND flow = 'debit' FOR UPDATE",
        [reference + '-WITHDRAWAL-DEBIT']
      );
      if (!debit.rows.length || Math.abs(Number(debit.rows[0].amount) - amount) > 0.00000001) {
        throw new Error('NEON_WITHDRAWAL_DEBIT_NOT_FOUND');
      }

      const wallet = await client.query('SELECT income_wallet FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
      if (!wallet.rows.length) throw new Error('NEON_WALLET_NOT_FOUND');

      await client.query(
        'UPDATE wallets SET income_wallet = income_wallet + $2, updated_at = NOW() WHERE user_id = $1',
        [userId, amount]
      );

      const now = new Date().toISOString();
      await client.query(
        'INSERT INTO ledger_transactions (id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)',
        [refundId, userId, 'withdrawal_refund', 'income_wallet', 'credit', amount, 0, amount,
          'Refund for rejected withdrawal (' + reference + ')', refundId, 'completed',
          JSON.stringify({ requestId, refund: true, asset: 'USDT', idempotencyKey: refundId }), now]
      );
      await client.query(
        'INSERT INTO ledger_transactions (id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)',
        [liabilityId, userId, 'withdrawal_reserve_release', 'income_wallet', 'debit', amount, 0, amount,
          'Release withdrawal reserve for rejected request (' + reference + ')', refundId, 'completed',
          JSON.stringify({ requestId, refund: true, asset: 'USDT', idempotencyKey: liabilityId }), now]
      );
      const updatedWallet = await client.query('SELECT income_wallet FROM wallets WHERE user_id = $1', [userId]);
      return Number(updatedWallet.rows[0]?.income_wallet || 0);
    });

    const refundRef = firestore.collection('transactions').doc(refundId);
    const liabilityRef = firestore.collection('transactions').doc(liabilityId);
    const walletRef = firestore.collection('wallets').doc(userId);
    await firestore.runTransaction(async txn => {
      const requestSnap = await txn.get(requestRef);
      const walletSnap = await txn.get(walletRef);
      const refundSnap = await txn.get(refundRef);
      const liabilitySnap = await txn.get(liabilityRef);
      if (!requestSnap.exists) throw new Error('Transaction request not found.');
      const fresh = requestSnap.data() || {};
      if (fresh.requestType !== 'withdrawal' || String(fresh.userId || '') !== userId) {
        throw new Error('Withdrawal request changed; refresh and reconcile.');
      }
      if (fresh.status === 'rejected' && fresh.metadata?.refundIssued === true) return;
      if (!['pending', 'under_review', 'approved', 'rejected'].includes(String(fresh.status || ''))) {
        throw new Error('Withdrawal status changed; refresh and reconcile.');
      }
      if (!walletSnap.exists()) throw new Error('Firestore wallet mirror is missing; Neon refund is recorded and requires reconciliation.');
      const now = new Date().toISOString();
      txn.update(walletRef, { incomeWallet: Number(neonBalance.toFixed(8)), updatedAt: now });
      if (!refundSnap.exists()) {
        txn.set(refundRef, {
          id: refundId, userId, type: 'withdrawal', category: 'income_wallet', flow: 'credit',
          amount, fee: 0, netAmount: amount, description: 'Refund for rejected withdrawal (' + reference + ')',
          referenceId: refundId, status: 'completed',
          metadata: { amountUsdt: amount, amountPaise: Math.round(amount * 100), requestId, refund: true },
          createdAt: now
        });
      }
      if (!liabilitySnap.exists()) {
        txn.set(liabilityRef, {
          id: liabilityId, userId: 'GLOBAL_FINANCE_LIABILITIES', type: 'withdrawal', category: 'income_wallet',
          flow: 'debit', amount, fee: 0, netAmount: amount,
          description: 'Release withdrawal reserve for rejected request (' + reference + ')',
          referenceId: refundId, status: 'completed',
          metadata: { amountUsdt: amount, amountPaise: Math.round(amount * 100), requestId, refund: true },
          createdAt: now
        });
      }
      txn.update(requestRef, {
        status: 'rejected',
        rejectedBy: decoded.uid,
        rejectedAt: now,
        failureReason: adminNote || 'Rejected by compliance administrator.',
        adminNote: adminNote || fresh.adminNote || '',
        updatedAt: now,
        metadata: { ...(fresh.metadata || {}), refundIssued: true, refundedAt: now }
      });
    });

    return json(res, 200, { success: true, status: 'rejected', refundReference: refundId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Withdrawal rejection failed.';
    if (message === 'NEON_WITHDRAWAL_DEBIT_NOT_FOUND') {
      return json(res, 409, { error: 'Matching Neon withdrawal debit was not found. No refund was issued; manual reconciliation is required.' });
    }
    if (message === 'NEON_WALLET_NOT_FOUND') {
      return json(res, 409, { error: 'Neon wallet was not found. No refund was issued; manual reconciliation is required.' });
    }
    console.error('[withdrawal-admin-review] failed:', message);
    return json(res, 500, { error: 'Withdrawal rejection could not be completed safely. Check Neon and Firestore records before retrying.' });
  }
}
