import { HDNodeWallet } from 'ethers';
import { getFirestoreAdmin } from './firebaseAdmin.js';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const CONFIRMATIONS = 12;
const SCAN_CHUNK = 800;
const ADDRESS_TOPIC_CHUNK = 100;
const DEFAULT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';

function boolEnv(name) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

function contractAddress() {
  return String(process.env.USDT_BEP20_CONTRACT_ADDRESS || '').trim().toLowerCase();
}

function xpubConfigured() {
  return /^xpub[1-9A-HJ-NP-Za-km-z]{40,120}$/.test(String(process.env.BSC_DEPOSIT_XPUB || '').trim());
}

export function addressGenerationConfigured() {
  return Boolean(
    boolEnv('PAYMENTS_ENABLED') &&
    boolEnv('USDT_RECHARGE_ENABLED') &&
    boolEnv('PAYMENT_AUTO_CREDIT_ENABLED') &&
    /^https?:\/\//i.test(String(process.env.BSC_RPC_URL || '').trim()) &&
    /^0x[0-9a-f]{40}$/.test(contractAddress()) &&
    xpubConfigured()
  );
}

export function uniqueDepositConfigured() {
  return addressGenerationConfigured();
}

async function rpcCall(method, params) {
  const rpc = String(process.env.BSC_RPC_URL || '').trim();
  if (!/^https?:\/\//i.test(rpc)) throw new Error('BSC_RPC_NOT_CONFIGURED');
  let response;
  try {
    response = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('BSC_RPC_FAILED');
  }
  if (!response.ok) throw new Error('BSC_RPC_FAILED');
  const body = await response.json().catch(() => null);
  if (!body || body.error || body.result === undefined) throw new Error('BSC_RPC_FAILED');
  return body.result;
}

function deriveDepositAddress(index) {
  if (!xpubConfigured()) throw new Error('DEPOSIT_XPUB_NOT_CONFIGURED');
  const node = HDNodeWallet.fromExtendedKey(String(process.env.BSC_DEPOSIT_XPUB).trim());
  // BSC/EVM addresses derived below an account-level extended public key:
  // external branch 0, followed by a non-hardened per-member index.
  return node.deriveChild(0).deriveChild(index).address.toLowerCase();
}

function decimal8(raw, decimals) {
  const amount = BigInt(raw);
  if (amount <= 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  let units8;
  if (decimals > 8) {
    const divisor = 10n ** BigInt(decimals - 8);
    if (amount % divisor !== 0n) return null; // never silently round a deposit
    units8 = amount / divisor;
  } else {
    units8 = amount * (10n ** BigInt(8 - decimals));
  }
  if (units8 <= 0n) return null;
  const whole = units8 / 100000000n;
  const fraction = (units8 % 100000000n).toString().padStart(8, '0').replace(/0+$/, '');
  const text = fraction ? `${whole}.${fraction}` : String(whole);
  return { units8: units8.toString(), text, number: Number(units8) / 100000000 };
}

function topicForAddress(address) {
  return '0x' + String(address).slice(2).toLowerCase().padStart(64, '0');
}

async function getTokenDecimals() {
  const token = contractAddress();
  if (!/^0x[0-9a-f]{40}$/.test(token)) throw new Error('INVALID_TOKEN');
  const result = await rpcCall('eth_call', [{ to: token, data: '0x313ce567' }, 'latest']);
  if (typeof result !== 'string' || !/^0x[0-9a-f]+$/i.test(result)) throw new Error('INVALID_TOKEN');
  const decimals = Number(BigInt(result));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('INVALID_TOKEN');
  return decimals;
}

function safeStartBlock(head) {
  // The scanner only consumes blocks with the configured confirmation depth.
  // Initialize at (or behind) that safe head; setting this to head - 2 would
  // leave the cursor permanently ahead of the confirmed scan head.
  const safeHead = head >= BigInt(CONFIRMATIONS)
    ? head - BigInt(CONFIRMATIONS) + 1n
    : 0n;
  const configured = String(process.env.BSC_DEPOSIT_START_BLOCK || '').trim();
  if (/^\d+$/.test(configured)) {
    const desired = BigInt(configured);
    return desired <= safeHead ? desired : safeHead;
  }
  return safeHead;
}

export async function getOrCreateDepositAddress(userId) {
  if (!addressGenerationConfigured()) throw new Error('DEPOSIT_NOT_CONFIGURED');
  if (!String(userId || '').trim()) throw new Error('ACTIVE_MEMBER_REQUIRED');

  const db = getFirestoreAdmin();
  const addressRef = db.collection('usdtDepositAddresses').doc(userId);
  const existing = await addressRef.get();
  if (existing.exists && existing.data()?.address) {
    const record = existing.data();
    return { address: String(record.address), derivationIndex: Number(record.derivationIndex) };
  }

  const userRef = db.collection('users').doc(userId);
  const [headHex, _chainId] = await Promise.all([
    rpcCall('eth_blockNumber', []),
    rpcCall('eth_chainId', []),
  ]);
  if (_chainId !== '0x38') throw new Error('WRONG_NETWORK');
  if (typeof headHex !== 'string' || !/^0x[0-9a-f]+$/i.test(headHex)) throw new Error('BSC_RPC_FAILED');
  const initialCursor = safeStartBlock(BigInt(headHex));

  return db.runTransaction(async (transaction) => {
    const sequenceRef = db.collection('systemMetadata').doc('usdtDepositAddressSequence');
    const scanStateRef = db.collection('systemMetadata').doc('usdtDepositScanState');
    const [userSnap, addressSnap, sequenceSnap, scanStateSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(addressRef),
      transaction.get(sequenceRef),
      transaction.get(scanStateRef),
    ]);

    if (addressSnap.exists && addressSnap.data()?.address) {
      const record = addressSnap.data();
      return { address: String(record.address), derivationIndex: Number(record.derivationIndex) };
    }
    const user = userSnap.data() || {};
    if (!userSnap.exists || user.status !== 'active' || (user.role && user.role !== 'user')) {
      throw new Error('ACTIVE_MEMBER_REQUIRED');
    }

    const index = Math.max(0, Number(sequenceSnap.data()?.nextIndex || 0));
    if (!Number.isSafeInteger(index)) throw new Error('DEPOSIT_INDEX_INVALID');
    const address = deriveDepositAddress(index);
    const now = new Date().toISOString();

    transaction.set(sequenceRef, { nextIndex: index + 1, updatedAt: now }, { merge: true });
    transaction.set(addressRef, {
      userId,
      address,
      derivationIndex: index,
      network: 'BSC',
      tokenSymbol: 'USDT',
      active: true,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    // Initialize the scanner before showing the first address to a member. A
    // small overlap prevents a transfer in a nearby block from being skipped.
    if (!scanStateSnap.exists) {
      transaction.set(scanStateRef, { lastScannedBlock: initialCursor.toString(), updatedAt: now }, { merge: true });
    }
    return { address, derivationIndex: index };
  });
}

export async function getMemberDepositDetails(userId) {
  const db = getFirestoreAdmin();
  const deposit = await getOrCreateDepositAddress(userId);
  const snap = await db.collection('usdtDepositEvents').where('userId', '==', userId).get();
  const deposits = snap.docs
    .map((doc) => {
      const value = doc.data() || {};
      return {
        id: doc.id,
        txHash: String(value.txHash || ''),
        amountUsdt: String(value.amountUsdt || '0'),
        status: String(value.status || 'pending'),
        confirmations: Number(value.confirmations || 0),
        blockNumber: String(value.blockNumber || ''),
        createdAt: String(value.createdAt || ''),
        creditedAt: value.creditedAt ? String(value.creditedAt) : null,
        note: value.note ? String(value.note) : null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);

  return {
    configured: true,
    network: 'BNB Smart Chain (BEP20)',
    token: 'USDT',
    contractAddress: contractAddress(),
    depositAddress: deposit.address,
    derivationIndex: deposit.derivationIndex,
    confirmationsRequired: CONFIRMATIONS,
    deposits,
  };
}

async function creditDepositEvent(db, log, addressToUser, decimals, safeHead) {
  const txHash = String(log.transactionHash || '').toLowerCase();
  const logIndex = BigInt(log.logIndex).toString();
  const blockNumber = BigInt(log.blockNumber);
  const rawAmount = BigInt(log.data);
  const recipient = '0x' + String(log.topics?.[2] || '').slice(-40).toLowerCase();
  const userId = addressToUser.get(recipient);
  if (!userId || rawAmount <= 0n) return 'ignored';

  const exact = decimal8(rawAmount, decimals);
  const eventId = `${txHash.slice(2)}_${logIndex}`;
  const ledgerId = `USDTDEP_${txHash.slice(2)}_${logIndex}`;
  const eventRef = db.collection('usdtDepositEvents').doc(eventId);
  const ledgerRef = db.collection('transactions').doc(ledgerId);
  const userRef = db.collection('users').doc(userId);
  const walletRef = db.collection('wallets').doc(userId);
  const auditRef = db.collection('auditLogs').doc(ledgerId);
  const now = new Date().toISOString();
  const confirmations = Number(safeHead - blockNumber + 1n);

  return db.runTransaction(async (transaction) => {
    const [eventSnap, ledgerSnap, userSnap, walletSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(ledgerRef),
      transaction.get(userRef),
      transaction.get(walletRef),
    ]);
    if (eventSnap.exists || ledgerSnap.exists) return 'duplicate';

    const member = userSnap.data() || {};
    const baseEvent = {
      txHash,
      logIndex,
      userId,
      depositAddress: recipient,
      tokenAddress: contractAddress(),
      rawAmount: rawAmount.toString(),
      blockNumber: blockNumber.toString(),
      confirmations,
      createdAt: now,
    };

    if (!exact) {
      transaction.set(eventRef, {
        ...baseEvent,
        amountUsdt: '0',
        status: 'pending',
        note: 'Token precision exceeds the supported 8 decimal places. Contact support; do not resubmit the transaction.',
      });
      return 'pending';
    }
    if (!userSnap.exists || member.status !== 'active' || (member.role && member.role !== 'user')) {
      transaction.set(eventRef, {
        ...baseEvent,
        amountUsdt: exact.text,
        status: 'ignored',
        note: 'Account is not active; support review is required.',
      });
      return 'ignored';
    }

    const wallet = walletSnap.exists ? walletSnap.data() || {} : {};
    const currentFund = Number(wallet.fundWallet || 0);
    if (!Number.isFinite(currentFund) || !Number.isFinite(exact.number)) throw new Error('WALLET_AMOUNT_INVALID');
    const newFund = Number((currentFund + exact.number).toFixed(8));
    transaction.set(walletRef, {
      ...wallet,
      userId,
      fundWallet: newFund,
      updatedAt: now,
    }, { merge: true });
    transaction.set(ledgerRef, {
      id: ledgerId,
      userId,
      type: 'recharge',
      category: 'fund_wallet',
      flow: 'credit',
      amount: exact.number,
      fee: 0,
      netAmount: exact.number,
      description: `Automatic USDT deposit via BNB Smart Chain (BEP20)`,
      referenceId: txHash,
      status: 'completed',
      metadata: {
        asset: 'USDT',
        network: 'BSC',
        txHash,
        logIndex,
        blockNumber: blockNumber.toString(),
        depositAddress: recipient,
        tokenAddress: contractAddress(),
        amountUsdt: exact.text,
        confirmations,
        automatic: true,
      },
      createdAt: now,
    });
    transaction.set(eventRef, {
      ...baseEvent,
      amountUsdt: exact.text,
      status: 'credited',
      creditedAt: now,
      ledgerId,
    });
    transaction.set(auditRef, {
      actorUserId: 'SYSTEM',
      actorEmail: null,
      action: 'USDT_DEPOSIT_AUTO_CREDITED',
      entityType: 'ledger',
      entityId: ledgerId,
      metadata: { userId, txHash, logIndex, amountUsdt: exact.text, depositAddress: recipient },
      timestamp: now,
    });
    return 'credited';
  });
}

export async function scanAndCreditDeposits() {
  if (!uniqueDepositConfigured()) {
    return { configured: false, scannedTo: null, found: 0, credited: 0, reason: 'DEPOSIT_NOT_CONFIGURED' };
  }

  const db = getFirestoreAdmin();
  const [chainId, headHex, decimals] = await Promise.all([
    rpcCall('eth_chainId', []),
    rpcCall('eth_blockNumber', []),
    getTokenDecimals(),
  ]);
  if (chainId !== '0x38') throw new Error('WRONG_NETWORK');
  if (typeof headHex !== 'string' || !/^0x[0-9a-f]+$/i.test(headHex)) throw new Error('BSC_RPC_FAILED');

  const head = BigInt(headHex);
  if (head < BigInt(CONFIRMATIONS)) return { configured: true, scannedTo: null, found: 0, credited: 0 };
  const safeHead = head - BigInt(CONFIRMATIONS) + 1n;

  const addressSnap = await db.collection('usdtDepositAddresses').where('active', '==', true).get();
  const addressToUser = new Map();
  for (const doc of addressSnap.docs) {
    const record = doc.data() || {};
    const address = String(record.address || '').toLowerCase();
    const userId = String(record.userId || doc.id);
    if (/^0x[0-9a-f]{40}$/.test(address) && userId) addressToUser.set(address, userId);
  }
  if (!addressToUser.size) return { configured: true, scannedTo: null, found: 0, credited: 0, addresses: 0 };

  const stateRef = db.collection('systemMetadata').doc('usdtDepositScanState');
  const stateSnap = await stateRef.get();
  let last = BigInt(stateSnap.data()?.lastScannedBlock || '0');
  if (!stateSnap.exists) {
    // Address allocation initializes this cursor before displaying an address.
    last = safeStartBlock(safeHead);
    await stateRef.set({ lastScannedBlock: last.toString(), updatedAt: new Date().toISOString() }, { merge: true });
  }

  let scannedTo = last;
  let found = 0;
  let credited = 0;
  const addresses = [...addressToUser.keys()];

  for (let from = last + 1n; from <= safeHead; from += BigInt(SCAN_CHUNK)) {
    const to = from + BigInt(SCAN_CHUNK) - 1n > safeHead ? safeHead : from + BigInt(SCAN_CHUNK) - 1n;
    for (let offset = 0; offset < addresses.length; offset += ADDRESS_TOPIC_CHUNK) {
      const batch = addresses.slice(offset, offset + ADDRESS_TOPIC_CHUNK);
      const logs = await rpcCall('eth_getLogs', [{
        address: contractAddress(),
        fromBlock: '0x' + from.toString(16),
        toBlock: '0x' + to.toString(16),
        topics: [TRANSFER_TOPIC, null, batch.map(topicForAddress)],
      }]);
      for (const log of Array.isArray(logs) ? logs : []) {
        if (
          String(log.address || '').toLowerCase() !== contractAddress() ||
          !Array.isArray(log.topics) || log.topics.length !== 3 ||
          String(log.topics[0] || '').toLowerCase() !== TRANSFER_TOPIC ||
          !/^0x[0-9a-f]{64}$/i.test(String(log.topics[2] || '')) ||
          !/^0x[0-9a-f]+$/i.test(String(log.data || '')) ||
          !/^0x[0-9a-f]{64}$/i.test(String(log.transactionHash || '')) ||
          !/^0x[0-9a-f]+$/i.test(String(log.blockNumber || '')) ||
          !/^0x[0-9a-f]+$/i.test(String(log.logIndex || ''))
        ) continue;
        found += 1;
        const outcome = await creditDepositEvent(db, log, addressToUser, decimals, safeHead);
        if (outcome === 'credited') credited += 1;
      }
    }
    scannedTo = to;
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(stateRef);
      const current = BigInt(snap.data()?.lastScannedBlock || '0');
      if (scannedTo > current) transaction.set(stateRef, { lastScannedBlock: scannedTo.toString(), updatedAt: new Date().toISOString() }, { merge: true });
    });
  }

  return { configured: true, scannedTo: scannedTo.toString(), found, credited, addresses: addressToUser.size };
}
