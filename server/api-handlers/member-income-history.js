import { verifyFirebaseIdToken, getFirestoreAdmin } from '../../api/_lib/firebaseAdmin.js';
import { getPool } from '../../api/_lib/db.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

function iso(value) {
  if (!value) return new Date(0).toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const authorization = String(req.headers.authorization || '');
    if (!authorization.startsWith('Bearer ')) return json(res, 401, { error: 'Authentication required' });
    const decoded = await verifyFirebaseIdToken(authorization.slice(7));
    const uid = String(decoded.uid || '');
    if (!uid) return json(res, 401, { error: 'Authentication required' });

    // Neon is the current financial ledger. Restrict every query to the authenticated member.
    const neonResult = await getPool().query(
      `SELECT id, user_id, type, category, flow, amount, fee, net_amount,
              description, reference_id, status, metadata, created_at
         FROM ledger_transactions
        WHERE user_id = $1 AND category = 'income_wallet'
        ORDER BY created_at DESC`,
      [uid],
    );
    const records = new Map();
    for (const row of neonResult.rows) {
      const item = {
        id: String(row.id),
        userId: String(row.user_id),
        type: String(row.type || 'other_income'),
        category: String(row.category),
        flow: String(row.flow),
        amount: Number(row.amount || 0),
        fee: Number(row.fee || 0),
        netAmount: Number(row.net_amount || 0),
        description: String(row.description || ''),
        referenceId: String(row.reference_id || row.id),
        status: String(row.status || 'completed'),
        metadata: row.metadata || {},
        createdAt: iso(row.created_at),
      };
      records.set(item.id, item);
    }

    // Include legacy Firebase ledger rows too, without duplicating IDs already mirrored to Neon.
    try {
      const snap = await getFirestoreAdmin().collection('transactions')
        .where('userId', '==', uid).get();
      for (const doc of snap.docs) {
        const raw = doc.data() || {};
        if (String(raw.category || '') !== 'income_wallet') continue;
        const id = String(raw.id || doc.id);
        if (records.has(id)) continue;
        records.set(id, {
          id,
          userId: uid,
          type: String(raw.type || 'other_income'),
          category: 'income_wallet',
          flow: String(raw.flow || 'credit'),
          amount: Number(raw.amount || 0),
          fee: Number(raw.fee || 0),
          netAmount: Number(raw.netAmount ?? raw.net_amount ?? raw.amount ?? 0),
          description: String(raw.description || ''),
          referenceId: String(raw.referenceId || raw.reference_id || id),
          status: String(raw.status || 'completed'),
          metadata: raw.metadata || {},
          createdAt: iso(raw.createdAt || raw.created_at),
        });
      }
    } catch (legacyError) {
      // Neon history remains available if legacy Firestore is unavailable.
      console.warn('Legacy member income history unavailable:', legacyError instanceof Error ? legacyError.message : legacyError);
    }

    // Resolve the source/downline member's public GF referral code for the history display.
    // Keep the financial ledger untouched; this only enriches response metadata.
    try {
      const sourceIds = [...new Set([...records.values()]
        .map((item) => String(item.metadata?.sourceUserId || item.metadata?.referredUserId || item.metadata?.downlineUserId || ''))
        .filter(Boolean))];
      if (sourceIds.length) {
        const sourceUsers = await getPool().query(
          `SELECT id::text AS id, referral_code FROM users WHERE id::text = ANY($1::text[])`,
          [sourceIds],
        );
        const sourceCodes = new Map(sourceUsers.rows.map((row) => [String(row.id), String(row.referral_code || '')]));
        for (const item of records.values()) {
          const sourceId = String(item.metadata?.sourceUserId || item.metadata?.referredUserId || item.metadata?.downlineUserId || '');
          const sourceReferralCode = sourceCodes.get(sourceId);
          if (sourceReferralCode) item.metadata = { ...(item.metadata || {}), sourceReferralCode };
        }
      }
    } catch (lookupError) {
      // History remains available when a legacy source ID cannot be resolved.
      console.warn('Income history source GF ID lookup unavailable:', lookupError instanceof Error ? lookupError.message : lookupError);
    }

    const transactions = [...records.values()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return json(res, 200, { transactions, source: 'recorded_ledgers', count: transactions.length });
  } catch (error) {
    console.error('member-income-history failed:', error instanceof Error ? error.message : error);
    const message = String(error?.message || '');
    if (message.toLowerCase().includes('firebase') || message.toLowerCase().includes('token')) {
      return json(res, 401, { error: 'Authentication required' });
    }
    return json(res, 503, { error: 'Income history is temporarily unavailable' });
  }
}
