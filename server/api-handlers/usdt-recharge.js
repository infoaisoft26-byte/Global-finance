import crypto from 'node:crypto';
import { getFirestoreAdmin, verifyFirebaseIdToken } from '../../api/_lib/firebaseAdmin.js';
import { DEFAULT_USDT_BEP20_CONTRACT, rechargeConfigured, autoCreditConfigured, verifyBep20, verifyDepositClaim } from '../../api/_lib/bep20.js';
import { addressGenerationConfigured, getMemberDepositDetails } from '../../api/_lib/usdtDeposit.js';
import { getPool } from '../../api/_lib/db.js';

// Keep the configured receiving wallet local to this route. This avoids a
// cold-start failure if the deployed helper export differs during rollout.
const BEP20_WALLET = String(process.env.USDT_DEPOSIT_WALLET_ADDRESS || '').trim();

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  return res.end(JSON.stringify(body));
}
const hashPattern=/^0x[0-9a-fA-F]{64}$/;
const amountPattern=/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,8})?$/;

function bodyOf(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});}
function iso(v){return dateValue(v)?.toISOString?.() || new Date().toISOString();}
function dateValue(v){
  if(!v) return null;
  if(v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if(typeof v?.toDate === 'function'){
    const d=v.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if(typeof v === 'object'){
    const seconds=Number(v._seconds ?? v.seconds);
    const nanos=Number(v._nanoseconds ?? v.nanoseconds ?? 0);
    if(Number.isFinite(seconds)) {
      const d=new Date(seconds*1000+(Number.isFinite(nanos)?nanos/1e6:0));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  const d=new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function num(v){return Number(v||0);}
function adminEmailAllowed(email){
  const configured=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
  return new Set([configured,'admin@gf.online','admin@gf.app'].filter(Boolean)).has(String(email||'').toLowerCase());
}
function mapRecharge(d,id){
  return {
    id,
    userId:d.userId,
    userName:d.userName||'',
    userEmail:d.userEmail||'',
    referralCode:d.referralCode||'',
    txHash:d.txHash,
    amountUsdt:String(d.amountUsdt),
    status:d.status,
    creditUsdt:d.creditUsdt==null?null:String(d.creditUsdt),
    reviewNote:d.reviewNote||null,
    proofUrl:d.proofUrl||null,
    createdAt:iso(d.createdAt),
    reviewedAt:d.reviewedAt?iso(d.reviewedAt):null,
  };
}
function emptyWallet(uid,now){
  return {
    userId:uid,fundWallet:0,incomeWallet:0,totalIncome:0,totalWithdrawal:0,
    basicPackageActive:0,fdPackageActive:0,directTeamCount:0,totalTeamCount:0,
    joiningBonus:0,referralIncome:0,todayRoiIncome:0,todayLevelIncome:0,
    totalRoiIncome:0,totalLevelIncome:0,fdTodayRoiIncome:0,fdTodayLevelIncome:0,
    fdTotalRoiIncome:0,fdTotalLevelIncome:0,fdReferralIncome:0,fdReleased:0,totalSalary:0,
    updatedAt:now,
  };
}
async function actorFromToken(req){
  const auth=String(req.headers.authorization||'');
  if(!auth.startsWith('Bearer ')) throw new Error('AUTH_REQUIRED');
  const decoded=await verifyFirebaseIdToken(auth.slice(7));
  const db=getFirestoreAdmin();
  const snap=await db.collection('users').doc(decoded.uid).get();
  if(!snap.exists) throw new Error('ACTIVE_MEMBER_REQUIRED');
  const u=snap.data()||{};
  const email=String(decoded.email||u.email||'').trim().toLowerCase();
  if(u.status!=='active') throw new Error('ACTIVE_MEMBER_REQUIRED');
  return {id:decoded.uid,email,name:u.name||decoded.name||'',role:u.role||'user',referralCode:u.referralCode||''};
}
function requireAdmin(actor){
  if(!['admin','super_admin','administrator'].includes(actor.role) && !adminEmailAllowed(actor.email)) throw new Error('ADMIN_REQUIRED');
}
async function createRecharge(db,actor,amount,txHash,proofUrl,walletAddress='',walletSignature=''){
  const now=new Date();
  const id='RCH_'+crypto.randomUUID().replaceAll('-','').slice(0,24);
  const ref=db.collection('usdtRecharges').doc(id);
  const txRef=db.collection('usdtDepositTx').doc(txHash);
  await db.runTransaction(async t=>{
    const txSnap=await t.get(txRef);
    if(txSnap.exists) throw new Error(txSnap.data()?.status==='approved'?'ALREADY_CREDITED':'TXID_ALREADY_SUBMITTED');
    const userSnap=await t.get(db.collection('users').doc(actor.id));
    if(!userSnap.exists || userSnap.data()?.status!=='active') throw new Error('ACTIVE_MEMBER_REQUIRED');
    t.set(ref,{
      id,userId:actor.id,userName:actor.name,userEmail:actor.email,referralCode:actor.referralCode,
      txHash,depositAddress:BEP20_WALLET.toLowerCase(),amountUsdt:amount,
      walletAddress:String(walletAddress||'').trim().toLowerCase()||null,
      walletSignature:String(walletSignature||'').trim()||null,
      status:'pending',creditUsdt:null,reviewNote:null,proofUrl:proofUrl||null,
      createdAt:now,reviewedAt:null,reviewedBy:null,ledgerId:null,storage:'firestore',
    });
    t.set(txRef,{txHash,userId:actor.id,rechargeId:id,status:'pending',amountUsdt:amount,createdAt:now},{merge:false});
    t.set(db.collection('auditLogs').doc(crypto.randomUUID()),{
      actorUserId:actor.id,actorEmail:actor.email,action:'USDT_RECHARGE_SUBMITTED',
      entityType:'usdt_recharge',entityId:id,
      metadata:{txHash,amountUsdt:amount,network:'BSC',autoCreditEnabled:autoCreditConfigured(),storage:'firestore'},
      timestamp:now,
    });
  });
  return id;
}
async function autoCreditRecharge({id,actor,txHash,amount,walletAddress='',walletSignature=''}){
  // Shared addresses cannot identify a member by destination alone. Require a
  // signed claim from the actual transaction sender before automatic credit.
  if(!autoCreditConfigured()) return {attempted:false,status:'pending',reason:'AUTO_CREDIT_DISABLED'};
  if(!walletAddress || !walletSignature) return {attempted:false,status:'pending',reason:'WALLET_SIGNATURE_REQUIRED'};
  let proof;
  try{
    await verifyDepositClaim({userId:actor.id,txHash,amountUsdt:amount,walletAddress,walletSignature});
    proof=await verifyBep20(txHash,amount,BEP20_WALLET);
  }
  catch(error){
    const code=String(error?.message||'');
    if(['TRANSACTION_NOT_CONFIRMED','TRANSFER_MISMATCH','WRONG_NETWORK','INVALID_TOKEN','BSC_RPC_FAILED','WALLET_SIGNATURE_REQUIRED','WALLET_SIGNATURE_INVALID','WALLET_SENDER_MISMATCH','TRANSACTION_NOT_FOUND','BSC_RPC_NOT_CONFIGURED'].includes(code)){
      const db=getFirestoreAdmin();
      await db.collection('usdtRecharges').doc(id).set({
        reviewNote:`Auto-credit deferred: ${code}`,updatedAt:new Date()
      },{merge:true}).catch(()=>{});
      return {attempted:true,status:'pending',deferred:'ONCHAIN_VERIFICATION_PENDING',message:'Transaction is still being verified. Check that the TXID, USDT amount, and deposit address match. No credit has been issued yet.'};
    }
    throw error;
  }
  const db=getFirestoreAdmin();
  const now=new Date();
  const rechargeRef=db.collection('usdtRecharges').doc(id);
  const txRef=db.collection('usdtDepositTx').doc(txHash);
  const walletRef=db.collection('wallets').doc(actor.id);
  // Avoid sending already-reviewed requests into the Neon credit path.
  const beforeCredit=await rechargeRef.get();
  if(!beforeCredit.exists) throw new Error('RECHARGE_NOT_FOUND');
  const before=beforeCredit.data()||{};
  if(before.status==='approved') return {attempted:true,status:'approved',autoCredited:true,alreadyCredited:true,creditUsdt:Number(Number(before.creditUsdt||amount).toFixed(8)),ledgerId:before.ledgerId||null};
  if(before.status!=='pending') throw new Error('ALREADY_REVIEWED');
  if(String(before.txHash||'').toLowerCase()!==String(txHash).toLowerCase()||String(before.amountUsdt)!==String(amount)) throw new Error('REVIEW_CHANGED');
  const claimedTx=await txRef.get();
  if(claimedTx.exists&&claimedTx.data()?.status==='approved') throw new Error('ALREADY_CREDITED');
  // Neon is the source of truth for the live Fund Wallet. Credit it first with
  // a deterministic TXID ledger key; retries will reuse the same credit.
  const neonCredit=await creditNeonRecharge({
    id,userId:actor.id,txHash,amount,depositAddress:BEP20_WALLET,actor,
    note:'Automatic credit after signed wallet claim and on-chain verification',proof,createdAt:now,
  });
  const ledgerRef=db.collection('transactions').doc(neonCredit.ledgerId);
  await db.runTransaction(async t=>{
    const [rechargeSnap,txSnap,walletSnap,userSnap,ledgerSnap]=await Promise.all([
      t.get(rechargeRef),t.get(txRef),t.get(walletRef),t.get(db.collection('users').doc(actor.id)),t.get(ledgerRef)
    ]);
    if(!rechargeSnap.exists) throw new Error('RECHARGE_NOT_FOUND');
    const r=rechargeSnap.data()||{};
    if(r.status!=='pending'){
      if(r.status==='approved') return;
      throw new Error('ALREADY_REVIEWED');
    }
    if(r.txHash!==txHash || String(r.amountUsdt)!==String(amount)) throw new Error('REVIEW_CHANGED');
    if(txSnap.exists && txSnap.data()?.status==='approved') throw new Error('ALREADY_CREDITED');
    if(!userSnap.exists || userSnap.data()?.status!=='active') throw new Error('MEMBER_UNAVAILABLE');
    const wallet=walletSnap.exists()?walletSnap.data()||{}:emptyWallet(actor.id,now);
    const credit=Number(Number(amount).toFixed(8));
    if(!Number.isFinite(credit)||credit<=0) throw new Error('INVALID_AUTO_CREDIT_AMOUNT');
    if(ledgerSnap.exists){
      const prior=ledgerSnap.data()||{};
      if(String(prior.userId)!==String(actor.id)||String(prior.referenceId)!==String(txHash)||Number(prior.amount)!==credit) throw new Error('TXID_ALREADY_CREDITED');
    }
    const ledger={
      id:ledgerRef.id,userId:actor.id,type:'recharge',category:'fund_wallet',flow:'credit',
      amount:credit,fee:0,netAmount:credit,
      description:`Auto-verified USDT BEP20 recharge ${id}`,
      referenceId:txHash,status:'completed',
      metadata:{rechargeId:id,amountUsdt:String(amount),walletCreditUsdt:credit,chainProof:proof,autoCredit:true},
      createdAt:now.toISOString()
    };
    if(!ledgerSnap.exists){
      t.set(ledgerRef,ledger);
      t.set(walletRef,{...wallet,userId:actor.id,fundWallet:Number((num(wallet.fundWallet)+credit).toFixed(8)),updatedAt:now},{merge:true});
    }
    t.set(rechargeRef,{
      status:'approved',creditUsdt:String(credit),
      reviewNote:'Auto-approved after on-chain verification',
      reviewedBy:actor.id,reviewedAt:now,ledgerId:ledgerRef.id,updatedAt:now
    },{merge:true});
    t.set(txRef,{status:'approved',creditedAt:now,ledgerId:ledgerRef.id,rechargeId:id,userId:actor.id,amountUsdt:String(amount)},{merge:true});
    t.set(db.collection('auditLogs').doc(crypto.randomUUID()),{
      actorUserId:actor.id,actorEmail:actor.email,action:'USDT_RECHARGE_AUTO_CREDITED',
      entityType:'usdt_recharge',entityId:id,
      metadata:{txHash,amountUsdt:String(amount),walletCreditUsdt:credit,ledgerId:ledgerRef.id,chainProof:proof,autoCredit:true},
      timestamp:now,
    });
  });
  return {attempted:true,status:'approved',autoCredited:true,creditUsdt:Number(Number(amount).toFixed(8)),ledgerId:ledgerRef.id};
}
async function listRequests(actor,admin){
  const db=getFirestoreAdmin();
  // Reconcile a pending/rejected request only if an exact manual credit already
  // exists for this recharge ID, member, and amount. Never change wallet balance.
  const q=admin
    ? db.collection('usdtRecharges')
    : db.collection('usdtRecharges').where('userId','==',actor.id);
  const snap=await q.get();
  const items=snap.docs.map(d=>({id:d.id,data:d.data()||{}}));
  const pool=getPool();
  for(const item of items){
    const r=item.data;
    if(!['pending','rejected'].includes(String(r.status||'')) || !r.userId || !r.amountUsdt || !r.txHash) continue;
    try{
      const normalizedRef=`MANUAL_USDT:${String(item.id).toLowerCase()}`;
      const found=await pool.query(
        `SELECT id,user_id,amount,flow,status,created_at
           FROM ledger_transactions
          WHERE lower(reference_id)=lower($1)
            AND type='admin_manual_credit'
          LIMIT 1`,
        [normalizedRef]
      );
      if(!found.rows.length) continue;
      const l=found.rows[0];
      if(String(l.user_id)!==String(r.userId) ||
         String(l.flow)!=='credit' || String(l.status)!=='completed' ||
         Number(l.amount)!==Number(r.amountUsdt)) continue;
      const txHash=String(r.txHash).toLowerCase();
      const now=new Date();
      const depositAddress=String(r.depositAddress||r.walletAddress||BEP20_WALLET).toLowerCase();
      const createdAt=dateValue(r.createdAt);
      const neonWrite=await pool.query(
        `INSERT INTO usdt_bep20_recharges
          (id,user_id,tx_hash,deposit_address,amount_usdt,status,ledger_id,review_note,reviewed_by,reviewed_at,created_at,proof_url)
         VALUES($1,$2,$3,$4,$5,'approved',$6,$7,$8,NOW(),COALESCE($9::timestamptz,NOW()),$10)
         ON CONFLICT(tx_hash) DO UPDATE SET
           status='approved',ledger_id=EXCLUDED.ledger_id,review_note=EXCLUDED.review_note,
           reviewed_by=EXCLUDED.reviewed_by,reviewed_at=EXCLUDED.reviewed_at
         WHERE usdt_bep20_recharges.user_id=EXCLUDED.user_id
           AND usdt_bep20_recharges.amount_usdt=EXCLUDED.amount_usdt
         RETURNING id,user_id,ledger_id`,
        [item.id,r.userId,txHash,depositAddress,Number(r.amountUsdt),String(l.id),
         'Reconciled with exact existing manual credit ledger; no additional wallet credit issued.',
         admin?actor.id:'SYSTEM',createdAt?createdAt.toISOString():null,r.paymentProofUrl||r.proofUrl||null]
      );
      if(!neonWrite.rows.length) continue;
      const ref=db.collection('usdtRecharges').doc(item.id);
      await db.runTransaction(async t=>{
        const fresh=await t.get(ref);
        if(!fresh.exists) return;
        const current=fresh.data()||{};
        if(!['pending','rejected','approved'].includes(String(current.status||'')) ||
           String(current.userId)!==String(r.userId) ||
           Number(current.amountUsdt)!==Number(r.amountUsdt) ||
           String(current.txHash||'').toLowerCase()!==txHash) return;
        t.set(ref,{
          status:'approved',creditUsdt:String(l.amount),ledgerId:String(l.id),
          reviewNote:'Reconciled with exact existing manual credit ledger; no additional wallet credit issued.',
          reviewedAt:now.toISOString(),updatedAt:now.toISOString()
        },{merge:true});
        t.set(db.collection('usdtDepositTx').doc(txHash),{
          status:'approved',creditedAt:now.toISOString(),ledgerId:String(l.id),
          rechargeId:item.id,userId:current.userId,amountUsdt:String(current.amountUsdt),
          reconciledManualCredit:true
        },{merge:true});
        t.set(db.collection('auditLogs').doc(crypto.randomUUID()),{
          actorUserId:admin?actor.id:'SYSTEM',actorEmail:admin?actor.email:null,
          action:'USDT_RECHARGE_MANUAL_LEDGER_RECONCILED',
          entityType:'usdt_recharge',entityId:item.id,
          metadata:{ledgerId:String(l.id),amountUsdt:String(l.amount),previousStatus:r.status,noAdditionalCredit:true},
          timestamp:now
        });
      });
      item.data={...r,status:'approved',creditUsdt:String(l.amount),ledgerId:String(l.id),
        reviewNote:'Reconciled with exact existing manual credit ledger; no additional wallet credit issued.',
        reviewedAt:now.toISOString()};
    }catch(error){
      console.error('Manual USDT ledger reconciliation skipped:',item.id,error instanceof Error?error.message:error);
    }
  }
  return items
    .sort((a,b)=>new Date(iso(b.data.createdAt)).getTime()-new Date(iso(a.data.createdAt)).getTime())
    .map(({id,data})=>mapRecharge(data,id));
}
async function creditNeonRecharge({id,userId,txHash,amount,depositAddress,actor,note,proof,createdAt}){
  const pool=getPool();
  const client=await pool.connect();
  const normalizedHash=String(txHash||'').toLowerCase();
  const credit=Number(Number(amount).toFixed(8));
  const rechargeCreatedAt=dateValue(createdAt);
  if(!Number.isFinite(credit)||credit<=0) throw new Error('INVALID_AUTO_CREDIT_AMOUNT');
  try{
    await client.query('BEGIN');
    // Serialize concurrent reviews of the same on-chain transaction.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[normalizedHash]);

    const prior=await client.query(
      `SELECT id,user_id,amount,flow,status
         FROM ledger_transactions
        WHERE lower(reference_id)=lower($1)
          AND type IN ('crypto_deposit','usdt_bep20_recharge')
        LIMIT 1
        FOR UPDATE`,
      [normalizedHash]
    );
    let ledgerId='';
    if(prior.rows.length){
      const existing=prior.rows[0];
      if(String(existing.user_id)!==String(userId) ||
         Number(existing.amount)!==credit ||
         existing.flow!=='credit' || existing.status!=='completed'){
        throw new Error('TXID_ALREADY_CREDITED');
      }
      ledgerId=String(existing.id);
    }else{
      const member=await client.query('SELECT id,status FROM users WHERE id=$1 FOR UPDATE',[userId]);
      if(!member.rows.length || String(member.rows[0].status||'').toLowerCase()!=='active'){
        throw new Error('NEON_MEMBER_UNAVAILABLE');
      }
      await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
      await client.query('SELECT user_id FROM wallets WHERE user_id=$1 FOR UPDATE',[userId]);

      ledgerId=`USDTDEP_${crypto.createHash('sha256').update(normalizedHash).digest('hex').slice(0,24)}`;
      await client.query(
        `INSERT INTO ledger_transactions
          (id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata,created_at)
         VALUES($1,$2,'usdt_bep20_recharge','fund_wallet','credit',$3,0,$3,$4,$5,'completed',$6::jsonb,NOW())`,
        [ledgerId,userId,credit,`Verified USDT BEP20 recharge ${id}`,normalizedHash,
          JSON.stringify({asset:'USDT',rechargeId:id,txHash:normalizedHash,depositAddress,adminId:actor.id,reviewNote:note,chainProof:proof})]
      );
      await client.query(
        'UPDATE wallets SET fund_wallet=fund_wallet+$1,updated_at=NOW() WHERE user_id=$2',
        [credit,userId]
      );
    }

    const existingRecharge=await client.query(
      'SELECT id,user_id FROM usdt_bep20_recharges WHERE tx_hash=$1 FOR UPDATE',
      [normalizedHash]
    );
    if(existingRecharge.rows.length && String(existingRecharge.rows[0].user_id)!==String(userId)){
      throw new Error('TXID_ALREADY_CREDITED');
    }
    const rechargeWrite=await client.query(
      `INSERT INTO usdt_bep20_recharges
        (id,user_id,tx_hash,deposit_address,amount_usdt,status,ledger_id,review_note,reviewed_by,reviewed_at,created_at,proof_url)
       VALUES($1,$2,$3,$4,$5,'approved',$6,$7,$8,NOW(),COALESCE($9::timestamptz,NOW()),$10)
       ON CONFLICT(tx_hash) DO UPDATE SET
         status='approved',ledger_id=EXCLUDED.ledger_id,review_note=EXCLUDED.review_note,
         reviewed_by=EXCLUDED.reviewed_by,reviewed_at=EXCLUDED.reviewed_at
       WHERE usdt_bep20_recharges.user_id=EXCLUDED.user_id
       RETURNING id`,
      [id,userId,normalizedHash,String(depositAddress||BEP20_WALLET).toLowerCase(),credit,ledgerId,note||'Approved after on-chain verification',actor.id,rechargeCreatedAt ? rechargeCreatedAt.toISOString() : null,null]
    );
    if(!rechargeWrite.rowCount) throw new Error('TXID_ALREADY_CREDITED');
    await client.query('COMMIT');
    return {ledgerId,creditUsdt:credit};
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{
    client.release();
  }
}

async function review(actor,id,action,note){
  requireAdmin(actor);
  const db=getFirestoreAdmin();
  const ref=db.collection('usdtRecharges').doc(id);
  const now=new Date();

  // Reconcile a partial approval safely when Neon already has the matching
  // completed deposit and wallet ledger. Do not re-verify or credit again:
  // the Neon balance may already have been spent on a package purchase.
  if(action==='approve'){
    const snap=await ref.get();
    if(!snap.exists) throw new Error('RECHARGE_NOT_FOUND');
    const r=snap.data()||{};
    if(r.status!=='pending') throw new Error('ALREADY_REVIEWED');
    const pool=getPool();
    const check=await pool.query(
      `SELECT r.id,r.user_id,r.amount_usdt,r.status,r.ledger_id,
              l.id AS matched_ledger_id,l.amount AS ledger_amount,l.flow,l.status AS ledger_status
         FROM usdt_bep20_recharges r
         JOIN ledger_transactions l
           ON l.id=r.ledger_id
          AND lower(l.reference_id)=lower(r.tx_hash)
        WHERE lower(r.tx_hash)=lower($1)
        LIMIT 1`,
      [String(r.txHash||'').toLowerCase()]
    );
    if(check.rows.length){
      const existing=check.rows[0];
      const sameMember=String(existing.user_id)===String(r.userId);
      const sameAmount=Number(existing.amount_usdt)===Number(r.amountUsdt);
      const validLedger=String(existing.flow)==='credit' && String(existing.ledger_status)==='completed' && Number(existing.ledger_amount)===Number(r.amountUsdt);
      if(!sameMember || !sameAmount || !validLedger) throw new Error('TXID_ALREADY_CREDITED');
      return db.runTransaction(async t=>{
        const fresh=await t.get(ref);
        if(!fresh.exists) throw new Error('RECHARGE_NOT_FOUND');
        const current=fresh.data()||{};
        if(current.status==='approved') return {status:'approved',alreadyReconciled:true,ledgerId:String(existing.matched_ledger_id),creditUsdt:Number(existing.amount_usdt)};
        if(current.status!=='pending') throw new Error('ALREADY_REVIEWED');
        if(String(current.txHash||'').toLowerCase()!==String(r.txHash||'').toLowerCase() || String(current.userId)!==String(r.userId) || Number(current.amountUsdt)!==Number(r.amountUsdt)) throw new Error('REVIEW_CHANGED');
        const txRef=db.collection('usdtDepositTx').doc(String(current.txHash));
        t.set(ref,{status:'approved',creditUsdt:String(existing.amount_usdt),ledgerId:String(existing.matched_ledger_id),reviewNote:'Reconciled with existing completed Neon deposit; no additional wallet credit issued.',reviewedBy:actor.id,reviewedAt:now.toISOString(),updatedAt:now.toISOString()},{merge:true});
        t.set(txRef,{status:'approved',creditedAt:now.toISOString(),ledgerId:String(existing.matched_ledger_id),rechargeId:id,userId:current.userId,amountUsdt:String(current.amountUsdt),reconciled:true},{merge:true});
        t.set(db.collection('auditLogs').doc(crypto.randomUUID()),{
          actorUserId:actor.id,actorEmail:actor.email,action:'USDT_RECHARGE_RECONCILED',
          entityType:'usdt_recharge',entityId:id,
          metadata:{txHash:current.txHash,amountUsdt:String(current.amountUsdt),ledgerId:String(existing.matched_ledger_id),note:'Existing completed Neon credit reused; no wallet balance changed.'},
          timestamp:now,
        });
        return {status:'approved',alreadyReconciled:true,ledgerId:String(existing.matched_ledger_id),creditUsdt:Number(existing.amount_usdt)};
      });
    }
  }

  // Verify the actual BSC transfer and credit its exact USDT amount. The admin
  // may add a note, but cannot key an arbitrary wallet credit.
  const initialSnap=await ref.get();
  if(!initialSnap.exists) throw new Error('RECHARGE_NOT_FOUND');
  const initial=initialSnap.data()||{};
  if(initial.status!=='pending') throw new Error('ALREADY_REVIEWED');

  let proof=null;
  let credit=0;
  if(action==='approve'){
    proof=await verifyBep20(String(initial.txHash||''),String(initial.amountUsdt||''),String(initial.depositAddress||BEP20_WALLET));
    credit=Number(Number(initial.amountUsdt).toFixed(8));
    if(!Number.isFinite(credit)||credit<=0) throw new Error('INVALID_AUTO_CREDIT_AMOUNT');
    // Neon powers the live member wallet and package transactions. Credit it
    // idempotently by TXID before finalizing the Firestore review state; retrying
    // a partially completed review will never credit the same TXID twice.
    await creditNeonRecharge({
      id,userId:initial.userId,txHash:initial.txHash,amount:initial.amountUsdt,
      depositAddress:initial.depositAddress||BEP20_WALLET,actor,note,proof,createdAt:initial.createdAt,
    });
  }

  return db.runTransaction(async t=>{
    const snap=await t.get(ref);
    if(!snap.exists) throw new Error('RECHARGE_NOT_FOUND');
    const r=snap.data()||{};
    if(r.status!=='pending') throw new Error('ALREADY_REVIEWED');
    if(action==='approve'){
      if(r.txHash!==initial.txHash||String(r.amountUsdt)!==String(initial.amountUsdt)) throw new Error('REVIEW_CHANGED');
      const userRef=db.collection('users').doc(r.userId);
      const walletRef=db.collection('wallets').doc(r.userId);
      const txRef=db.collection('usdtDepositTx').doc(r.txHash);
      const [userSnap,walletSnap,txSnap]=await Promise.all([t.get(userRef),t.get(walletRef),t.get(txRef)]);
      if(!userSnap.exists||userSnap.data()?.status!=='active') throw new Error('MEMBER_UNAVAILABLE');
      if(txSnap.exists&&txSnap.data()?.status==='approved') throw new Error('ALREADY_CREDITED');
      const wallet=walletSnap.exists?walletSnap.data()||{}:emptyWallet(r.userId,now);
      const ledgerRef=db.collection('transactions').doc('DEP_'+crypto.randomUUID().replaceAll('-','').slice(0,26));
      t.set(ledgerRef,{
        id:ledgerRef.id,userId:r.userId,type:'recharge',category:'fund_wallet',flow:'credit',
        amount:credit,fee:0,netAmount:credit,
        description:`Verified USDT BEP20 recharge ${id}`,referenceId:r.txHash,status:'completed',
        metadata:{rechargeId:id,amountUsdt:String(r.amountUsdt),walletCreditUsdt:credit,reviewNote:note,adminId:actor.id,chainProof:proof},
        createdAt:now.toISOString()
      });
      t.set(walletRef,{...wallet,userId:r.userId,fundWallet:Number((num(wallet.fundWallet)+credit).toFixed(8)),updatedAt:now.toISOString()},{merge:true});
      t.set(txRef,{status:'approved',creditedAt:now.toISOString(),ledgerId:ledgerRef.id,rechargeId:id,userId:r.userId,amountUsdt:String(r.amountUsdt)},{merge:true});
      t.set(ref,{status:'approved',creditUsdt:String(credit),ledgerId:ledgerRef.id,reviewNote:note||'Approved after on-chain verification',reviewedBy:actor.id,reviewedAt:now.toISOString(),updatedAt:now.toISOString()},{merge:true});
      t.set(db.collection('auditLogs').doc(crypto.randomUUID()),{
        actorUserId:actor.id,actorEmail:actor.email,action:'USDT_RECHARGE_APPROVED',
        entityType:'usdt_recharge',entityId:id,
        metadata:{txHash:r.txHash,amountUsdt:String(r.amountUsdt),walletCreditUsdt:credit,ledgerId:ledgerRef.id,note,chainProof:proof},
        timestamp:now,
      });
      return {status:'approved',ledgerId:ledgerRef.id,creditUsdt:credit};
    }
    t.set(ref,{status:'rejected',creditUsdt:null,reviewNote:note,reviewedBy:actor.id,reviewedAt:now.toISOString(),updatedAt:now.toISOString()},{merge:true});
    t.set(db.collection('usdtDepositTx').doc(r.txHash),{status:'rejected',reviewedAt:now.toISOString(),rechargeId:id},{merge:true});
    t.set(db.collection('auditLogs').doc(crypto.randomUUID()),{
      actorUserId:actor.id,actorEmail:actor.email,action:'USDT_RECHARGE_REJECTED',
      entityType:'usdt_recharge',entityId:id,
      metadata:{txHash:r.txHash,amountUsdt:String(r.amountUsdt),note},timestamp:now,
    });
    return {status:'rejected',ledgerId:null};
  });
}
export { autoCreditRecharge };


// Return the authenticated member's real Firestore downline. Never trust a
// referral code supplied by the browser; scope the query to the signed-in user.
async function loadDownline(pool, actor) {
  // Keep the account login status separate from the earning/referral ID status.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_status VARCHAR(16) NOT NULL DEFAULT 'active'`);
  // The live network, referral links, packages, and ledger are stored in Neon
  // Postgres. Read the production relational records instead of a possibly
  // stale Firestore copy; this is strictly read-only.
  const result = await pool.query(`
    WITH RECURSIVE root AS (
      SELECT
        u.id::text AS id,
        COALESCE(u.referral_code, '')::text AS referral_code
      FROM users u
      WHERE u.id::text = $1
         OR (
           NULLIF(BTRIM(COALESCE($2, '')), '') IS NOT NULL
           AND UPPER(BTRIM(COALESCE(u.referral_code, ''))) = UPPER(BTRIM($2))
         )
      ORDER BY CASE WHEN u.id::text = $1 THEN 0 ELSE 1 END
      LIMIT 1
    ),
    network AS (
      SELECT
        u.id::text AS id,
        u.sponsor_id,
        u.referral_code,
        u.name,
        u.email,
        u.phone,
        u.status,
        COALESCE(u.referral_status,'active') AS referral_status,
        u.created_at,
        1::int AS level,
        ARRAY[r.id, u.id::text] AS path
      FROM users u
      CROSS JOIN root r
      WHERE u.id::text <> r.id
        AND (
          (
            NULLIF(BTRIM(COALESCE(r.referral_code, '')), '') IS NOT NULL
            AND UPPER(BTRIM(COALESCE(u.sponsor_id::text, ''))) = UPPER(BTRIM(r.referral_code))
          )
          OR BTRIM(COALESCE(u.sponsor_id::text, '')) = r.id
          OR (
            NULLIF(BTRIM(COALESCE($1, '')), '') IS NOT NULL
            AND BTRIM(COALESCE(u.sponsor_id::text, '')) = BTRIM($1)
          )
        )
      UNION ALL
      SELECT
        child.id::text,
        child.sponsor_id,
        child.referral_code,
        child.name,
        child.email,
        child.phone,
        child.status,
        COALESCE(child.referral_status,'active') AS referral_status,
        child.created_at,
        parent.level + 1,
        parent.path || child.id::text
      FROM users child
      JOIN network parent
        ON BTRIM(COALESCE(child.sponsor_id::text, '')) = parent.id
        OR (
          NULLIF(BTRIM(COALESCE(parent.referral_code, '')), '') IS NOT NULL
          AND UPPER(BTRIM(COALESCE(child.sponsor_id::text, ''))) = UPPER(BTRIM(parent.referral_code))
        )
      WHERE parent.level < 15
        AND NOT child.id::text = ANY(parent.path)
    )
    SELECT
      n.id, n.sponsor_id, n.referral_code, n.name, n.email, n.phone,
      CASE WHEN n.status='active' AND n.referral_status='inactive' THEN 'inactive' ELSE n.status END AS status,
      n.status AS account_status,n.referral_status,n.created_at,n.level,
      COALESCE(pkg.active_package, 0)::numeric AS active_package,
      COALESCE(pkg.package_name, '')::text AS package_name,
      COALESCE(pkg.package_amount, 0)::numeric AS package_amount,
      COALESCE(pkg.package_status, '')::text AS package_status,
      COALESCE(comm.total_commission, 0)::numeric AS total_commission
    FROM network n
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('active', 'matured', 'completed')), 0) AS active_package,
        (ARRAY_AGG(p.package_name ORDER BY p.activated_at DESC NULLS LAST))[1] AS package_name,
        (ARRAY_AGG(p.amount ORDER BY p.activated_at DESC NULLS LAST))[1] AS package_amount,
        (ARRAY_AGG(p.status ORDER BY p.activated_at DESC NULLS LAST))[1] AS package_status
      FROM package_activations p
      WHERE p.user_id::text = n.id
    ) pkg ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(l.net_amount) AS total_commission
      FROM ledger_transactions l
      WHERE l.user_id::text = n.id
        AND l.flow = 'credit'
        AND l.status = 'completed'
        AND l.type IN ('referral_bonus','referral_income','direct_referral','basic_referral','fd_referral','level_bonus','level_income','basic_level','fd_level','rd_level')
    ) comm ON TRUE
    ORDER BY n.level ASC, COALESCE(n.name, '') ASC
  `, [actor.id, actor.referralCode || '']);

  return result.rows.map((u) => {
    const activePackage = Number(u.active_package || 0);
    const totalCommission = Number(u.total_commission || 0);
    const createdAt = u.created_at ? new Date(u.created_at).toISOString() : '';
    return {
      id: String(u.id),
      userId: String(u.id),
      sponsorId: String(u.sponsor_id || ''),
      referralCode: String(u.referral_code || ''),
      name: String(u.name || 'Member'),
      email: String(u.email || ''),
      phone: String(u.phone || ''),
      level: Number(u.level || 1),
      joinDate: createdAt,
      activePackage,
      packageName: String(u.package_name || ''),
      packageAmount: Number(u.package_amount || 0),
      packageStatus: String(u.package_status || ''),
      status: String(u.status || '').toLowerCase() === 'active' ? 'active' : 'inactive',
      commissionFromMember: totalCommission,
      totalCommissionFromMember: totalCommission,
    };
  });
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method)) return json(res,405,{error:'Method not allowed'});
  try{
    const actor=await actorFromToken(req);
    const searchParams=new URL(req.url,'http://localhost').searchParams;
    const scope=searchParams.get('scope');
    const action=String(searchParams.get('action')||'').trim().toLowerCase();
    const admin=['admin','super_admin','administrator'].includes(actor.role)||adminEmailAllowed(actor.email);

    if(req.method==='GET'){
      // Support both GET and POST callers for the authenticated downline API.
      // Some existing dashboard clients pass action in the query string.
      if(action==='downline'){
        if(admin) return json(res,403,{error:'Member account required'});
        const members=await loadDownline(getPool(),actor);
        return json(res,200,{members,total:members.length});
      }
      if(action==='deposit-address'){
        if(admin) return json(res,403,{error:'Member account required'});
        const sharedMode=String(process.env.USDT_DEPOSIT_MODE||'').trim().toLowerCase()==='shared';
        if(!sharedMode && addressGenerationConfigured()){
          const deposit=await getMemberDepositDetails(actor.id);
          return json(res,200,{...deposit,mode:'personal'});
        }
        if(sharedMode && !rechargeConfigured()) return json(res,503,{configured:false,error:'Shared USDT deposit mode is selected but the shared wallet and BSC verification settings are incomplete.'});
        if(rechargeConfigured()){
          return json(res,200,{
            configured:true,mode:'shared',network:'BNB Smart Chain (BEP20)',token:'USDT',
            contractAddress:String(process.env.USDT_BEP20_CONTRACT_ADDRESS||DEFAULT_USDT_BEP20_CONTRACT),
            depositAddress:BEP20_WALLET,derivationIndex:0,confirmationsRequired:12,deposits:[]
          });
        }
        return json(res,503,{configured:false,error:'Recharge setup is incomplete. The Binance BEP20 address and BSC verification settings must be configured by the site administrator before deposits can be accepted.'});
      }
      if(scope==='ledger'){
        const q=admin
          ? getFirestoreAdmin().collection('transactions').limit(1000)
          : getFirestoreAdmin().collection('transactions').where('userId','==',actor.id).limit(500);
        const snap=await q.get();
        const transactions=snap.docs
          .map(d=>({id:d.id,...(d.data()||{})}))
          .sort((a,b)=>new Date(iso(b.createdAt)).getTime()-new Date(iso(a.createdAt)).getTime());
        return json(res,200,{transactions});
      }
      if(scope==='admin'&&!admin) return json(res,403,{error:'Admin access required'});
      return json(res,200,{
        requests:await listRequests(actor,scope==='admin'),
        enabled:rechargeConfigured(),
        automaticDepositConfigured:(String(process.env.USDT_DEPOSIT_MODE||'').trim().toLowerCase()==='shared'?rechargeConfigured():addressGenerationConfigured()),
        autoCreditEnabled:autoCreditConfigured(),
        depositAddress:''
      });
    }

    const body=bodyOf(req);
    if(body.action==='downline'){
      if(admin) return json(res,403,{error:'Member account required'});
      const members=await loadDownline(getPool(),actor);
      return json(res,200,{members,total:members.length});
    }

    if(body.action==='manual-credit'){
      if(!admin) return json(res,403,{error:'Admin access required'});
      const memberKey=String(body.memberKey||'').trim();
      const amount=String(body.amountUsdt||'').trim();
      const reference=String(body.reference||'').trim();
      const note=String(body.note||'').trim();
      if(!memberKey || memberKey.length>200) return json(res,400,{error:'Enter a member ID, referral ID, or email.'});
      if(!amountPattern.test(amount)||!Number.isFinite(Number(amount))||Number(amount)<=0)
        return json(res,400,{error:'Enter a valid USDT amount greater than zero.'});
      if(!/^[A-Za-z0-9._:-]{4,120}$/.test(reference))
        return json(res,400,{error:'Enter a unique reference (4–120 letters/numbers or . _ : -).'});
      if(note.length>1000) return json(res,400,{error:'Note is too long.'});
      const pool=getPool();
      const client=await pool.connect();
      const normalizedRef='MANUAL_USDT:'+reference.toLowerCase();
      const credit=Number(Number(amount).toFixed(8));
      try{
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[normalizedRef]);
        const prior=await client.query(
          "SELECT id FROM ledger_transactions WHERE lower(reference_id)=lower($1) AND type='admin_manual_credit' LIMIT 1 FOR UPDATE",
          [normalizedRef]
        );
        if(prior.rows.length) throw new Error('MANUAL_REFERENCE_USED');
        const member=await client.query(
          "SELECT id,status,name,email,referral_code FROM users WHERE id::text=$1 OR lower(email)=lower($1) OR upper(COALESCE(referral_code,''))=upper($1) LIMIT 2 FOR UPDATE",
          [memberKey]
        );
        if(member.rows.length!==1) throw new Error(member.rows.length?'MEMBER_LOOKUP_AMBIGUOUS':'NEON_MEMBER_UNAVAILABLE');
        const target=member.rows[0];
        if(String(target.status||'').toLowerCase()!=='active') throw new Error('NEON_MEMBER_UNAVAILABLE');
        await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[target.id]);
        const wallet=await client.query('SELECT user_id FROM wallets WHERE user_id=$1 FOR UPDATE',[target.id]);
        if(!wallet.rows.length) throw new Error('WALLET_NOT_FOUND');
        const ledgerId='MANUAL_'+crypto.createHash('sha256').update(normalizedRef).digest('hex').slice(0,24);
        await client.query(
          `INSERT INTO ledger_transactions
            (id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata,created_at)
           VALUES($1,$2,'admin_manual_credit','fund_wallet','credit',$3,0,$3,$4,$5,'completed',$6::jsonb,NOW())`,
          [ledgerId,target.id,credit,`Admin manual USDT credit: ${note||'verified offline payment'}`,normalizedRef,
            JSON.stringify({asset:'USDT',manual:true,adminId:actor.id,adminEmail:actor.email,reference,note,memberEmail:target.email,memberReferralCode:target.referral_code})]
        );
        await client.query('UPDATE wallets SET fund_wallet=fund_wallet+$1,updated_at=NOW() WHERE user_id=$2',[credit,target.id]);
        await client.query('COMMIT');
        return json(res,200,{success:true,memberId:String(target.id),memberEmail:String(target.email||''),referralCode:String(target.referral_code||''),creditUsdt:credit,ledgerId});
      }catch(error){
        await client.query('ROLLBACK');
        throw error;
      }finally{client.release();}
    }

    if(body.action==='submit'){
      if(admin) return json(res,403,{error:'Member account required'});
      if(!rechargeConfigured()) return json(res,503,{error:'USDT recharge is not configured yet. Please contact support before sending funds.'});
      const amount=String(body.amountUsdt||'').trim();
      const txHash=String(body.txHash||'').trim().toLowerCase();
      const proofUrl=String(body.paymentProofUrl||'').trim();
      if(!amountPattern.test(amount)||!Number.isFinite(Number(amount))||Number(amount)<=0)
        return json(res,400,{error:'Enter a valid USDT amount greater than zero.'});
      if(!hashPattern.test(txHash))
        return json(res,400,{error:'Enter the transaction hash (TXID) from BNB Smart Chain.'});
      if(proofUrl && !/^https:\/\//i.test(proofUrl))
        return json(res,400,{error:'Payment proof must be a valid HTTPS URL.'});
      const walletAddress=String(body.walletAddress||'').trim();
      const walletSignature=String(body.walletSignature||'').trim();
      const id=await createRecharge(getFirestoreAdmin(),actor,amount,txHash,proofUrl||null,walletAddress,walletSignature);
      let auto={attempted:false,status:'pending',reason:'WALLET_SIGNATURE_REQUIRED'};
      try{
        auto=await autoCreditRecharge({id,actor,txHash,amount,walletAddress,walletSignature});
      }catch(error){
        // Keep the submitted request available for cron retry or emergency admin review.
        console.error('Immediate USDT auto-credit deferred:',id,error instanceof Error?error.message:error);
        auto={attempted:true,status:'pending',deferred:'CREDIT_PROCESSING_FAILED'};
      }
      const credited=auto.status==='approved';
      return json(res,201,{success:true,id,status:auto.status||'pending',...auto,message:credited?'USDT verified and credited to your Global Wallet.':walletSignature?'TXID saved. Automatic verification is pending; emergency admin review remains available.':'TXID saved. Connect and sign with the sending wallet for automatic credit, or contact support for emergency review.'});
    }

    if(body.action==='retry'){
      if(admin) return json(res,403,{error:'Member account required'});
      const id=String(body.id||'');
      const snap=await getFirestoreAdmin().collection('usdtRecharges').doc(id).get();
      if(!snap.exists||snap.data()?.userId!==actor.id) return json(res,404,{error:'Recharge not found'});
      const r=snap.data()||{};
      if(r.status!=='pending') return json(res,200,{success:true,status:r.status,alreadyProcessed:true});
      const result=await autoCreditRecharge({id,actor,txHash:r.txHash,amount:String(r.amountUsdt),walletAddress:String(r.walletAddress||''),walletSignature:String(r.walletSignature||'')});
      return json(res,200,{success:true,...result});
    }

    if(body.action==='approve'||body.action==='reject'){
      if(!admin) return json(res,403,{error:'Admin access required'});
      if(!rechargeConfigured()) return json(res,503,{error:'Recharge approval is disabled'});
      const id=String(body.id||'');
      if(!/^RCH_[0-9a-f]{24}$/.test(id)) return json(res,400,{error:'A valid recharge request is required'});
      const note=String(body.note||'').trim()|| (body.action==='approve'?'Approved by admin after manual payment verification.':'Rejected by admin after manual payment review.');
      if(note.length>1000) return json(res,400,{error:'Review note is too long'});
      return json(res,200,{success:true,...await review(actor,id,body.action,note)});
    }
    return json(res,400,{error:'Invalid action'});
  }catch(error){
    const message=String(error?.message||'');
    if(message==='AUTH_REQUIRED') return json(res,401,{error:'Authentication required'});
    if(message==='ADMIN_REQUIRED') return json(res,403,{error:'Admin access required'});
    if(message==='ACTIVE_MEMBER_REQUIRED'||message==='MEMBER_UNAVAILABLE') return json(res,403,{error:'Active member account required'});
    if(message==='RECHARGE_NOT_FOUND') return json(res,404,{error:'Recharge not found'});
    if(message==='MANUAL_REFERENCE_USED') return json(res,409,{error:'This manual payment reference has already been credited.'});
    if(message==='MEMBER_LOOKUP_AMBIGUOUS') return json(res,409,{error:'More than one member matched. Use the exact member UID or email.'});
    if(message==='TXID_ALREADY_SUBMITTED') return json(res,409,{error:'This TXID has already been submitted'});
    if(message==='TXID_ALREADY_CREDITED') return json(res,409,{error:'This TXID was already credited to a wallet.'});
    if(message==='ALREADY_CREDITED') return json(res,409,{error:'This TXID was already credited'});
    if(message==='ALREADY_REVIEWED') return json(res,409,{error:'Recharge has already been reviewed'});
    if(message==='REVIEW_CHANGED') return json(res,409,{error:'Recharge changed during verification'});
    if(message==='INVALID_AUTO_CREDIT_AMOUNT') return json(res,422,{error:'Automatic credit amount is invalid; request remains pending'});
    
    if(message==='INVALID_PROOF_URL') return json(res,400,{error:'Invalid payment screenshot URL'});
    if(['TRANSACTION_NOT_CONFIRMED','TRANSFER_MISMATCH','WRONG_NETWORK','INVALID_TOKEN','BSC_RPC_FAILED'].includes(message)) return json(res,422,{error:`On-chain verification pending: ${message}`});
    if(message==='RECHARGE_DISABLED') return json(res,503,{error:'Recharge is not available yet'});
    console.error('usdt-recharge failed:',error instanceof Error?error.stack||error.message:error);
    const code=String(error?.code||'');
    if(code==='permission-denied'||code==='7') return json(res,503,{error:'Recharge service database permission is not configured yet.'});
    if(code==='failed-precondition') return json(res,503,{error:'Recharge service database is not ready yet. Please try again in a moment.'});
    if(code==='unavailable') return json(res,503,{error:'Recharge service is temporarily unavailable. Please try again.'});
    return json(res,500,{error:'Recharge request could not be processed. Please try again.'});
  }
}
