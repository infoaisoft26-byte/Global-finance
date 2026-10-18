import crypto from 'node:crypto';
import { getFirestoreAdmin, verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { BEP20_WALLET, rechargeConfigured, autoCreditConfigured, verifyBep20 } from './_lib/bep20.js';
import { addressGenerationConfigured, getMemberDepositDetails } from './_lib/usdtDeposit.js';

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  return res.end(JSON.stringify(body));
}
const hashPattern=/^0x[0-9a-fA-F]{64}$/;
const amountPattern=/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,8})?$/;

function bodyOf(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});}
function iso(v){return v?.toDate?.()?.toISOString?.() || (v ? String(v) : new Date().toISOString());}
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
async function createRecharge(db,actor,amount,txHash,proofUrl){
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
async function autoCreditRecharge({id,actor,txHash,amount}){
  if(!autoCreditConfigured()) return {attempted:false,status:'pending'};
  let proof;
  try{proof=await verifyBep20(txHash,amount);}
  catch(error){
    const code=String(error?.message||'');
    if(['TRANSACTION_NOT_CONFIRMED','TRANSFER_MISMATCH','WRONG_NETWORK','INVALID_TOKEN','BSC_RPC_FAILED'].includes(code)){
      const db=getFirestoreAdmin();
      await db.collection('usdtRecharges').doc(id).set({
        reviewNote:`Auto-credit deferred: ${code}`,updatedAt:new Date()
      },{merge:true}).catch(()=>{});
      return {attempted:true,status:'pending',deferred:code};
    }
    throw error;
  }
  const db=getFirestoreAdmin();
  const now=new Date();
  const rechargeRef=db.collection('usdtRecharges').doc(id);
  const txRef=db.collection('usdtDepositTx').doc(txHash);
  const walletRef=db.collection('wallets').doc(actor.id);
  const ledgerRef=db.collection('transactions').doc('DEP_'+crypto.randomUUID().replaceAll('-','').slice(0,26));
  await db.runTransaction(async t=>{
    const [rechargeSnap,txSnap,walletSnap,userSnap]=await Promise.all([
      t.get(rechargeRef),t.get(txRef),t.get(walletRef),t.get(db.collection('users').doc(actor.id))
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
    const ledger={
      id:ledgerRef.id,userId:actor.id,type:'recharge',category:'fund_wallet',flow:'credit',
      amount:credit,fee:0,netAmount:credit,
      description:`Auto-verified USDT BEP20 recharge ${id}`,
      referenceId:txHash,status:'completed',
      metadata:{rechargeId:id,amountUsdt:String(amount),walletCreditUsdt:credit,chainProof:proof,autoCredit:true},
      createdAt:now.toISOString()
    };
    t.set(ledgerRef,ledger);
    t.set(walletRef,{...wallet,userId:actor.id,fundWallet:Number((num(wallet.fundWallet)+credit).toFixed(8)),updatedAt:now},{merge:true});
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
  // Do not use orderBy/low limits here: older recharge documents may not have
  // createdAt, and small limits hide valid historical recharge records.
  const q=admin
    ? db.collection('usdtRecharges')
    : db.collection('usdtRecharges').where('userId','==',actor.id);
  const snap=await q.get();
  return snap.docs
    .map(d=>({id:d.id,data:d.data()||{}}))
    .sort((a,b)=>new Date(iso(b.data.createdAt)).getTime()-new Date(iso(a.data.createdAt)).getTime())
    .map(({id,data})=>mapRecharge(data,id));
}
async function review(actor,id,action,note){
  requireAdmin(actor);
  const db=getFirestoreAdmin();
  const ref=db.collection('usdtRecharges').doc(id);
  const now=new Date();

  // Verify the actual BSC transfer and credit its exact USDT amount. The admin
  // may add a note, but cannot key an arbitrary wallet credit.
  const initialSnap=await ref.get();
  if(!initialSnap.exists) throw new Error('RECHARGE_NOT_FOUND');
  const initial=initialSnap.data()||{};
  if(initial.status!=='pending') throw new Error('ALREADY_REVIEWED');

  let proof=null;
  let credit=0;
  if(action==='approve'){
    proof=await verifyBep20(String(initial.txHash||''),String(initial.amountUsdt||''));
    credit=Number(Number(initial.amountUsdt).toFixed(8));
    if(!Number.isFinite(credit)||credit<=0) throw new Error('INVALID_AUTO_CREDIT_AMOUNT');
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

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method)) return json(res,405,{error:'Method not allowed'});
  try{
    const actor=await actorFromToken(req);
    const searchParams=new URL(req.url,'http://localhost').searchParams;
    const scope=searchParams.get('scope');
    const action=String(searchParams.get('action')||'').trim().toLowerCase();
    const admin=['admin','super_admin','administrator'].includes(actor.role)||adminEmailAllowed(actor.email);

    if(req.method==='GET'){
      if(action==='deposit-address'){
        if(admin) return json(res,403,{error:'Member account required'});
        if(!addressGenerationConfigured()) return json(res,503,{configured:false,error:'Automatic personal deposit addresses are not configured. Do not send USDT until your personal address is visible.'});
        const deposit=await getMemberDepositDetails(actor.id);
        return json(res,200,deposit);
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
        automaticDepositConfigured:addressGenerationConfigured(),
        autoCreditEnabled:autoCreditConfigured(),
        depositAddress:''
      });
    }

    const body=bodyOf(req);
    if(body.action==='submit'){
      return json(res,410,{error:'Manual TXID submission has been retired. Open Recharge and send USDT only to your personal deposit address when it is displayed. Do not use the old shared address.'});
    }

    if(body.action==='retry'){
      if(admin) return json(res,403,{error:'Member account required'});
      const id=String(body.id||'');
      const snap=await getFirestoreAdmin().collection('usdtRecharges').doc(id).get();
      if(!snap.exists||snap.data()?.userId!==actor.id) return json(res,404,{error:'Recharge not found'});
      const r=snap.data()||{};
      if(r.status!=='pending') return json(res,200,{success:true,status:r.status,alreadyProcessed:true});
      const result=await autoCreditRecharge({id,actor,txHash:r.txHash,amount:String(r.amountUsdt)});
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
    if(message==='TXID_ALREADY_SUBMITTED') return json(res,409,{error:'This TXID has already been submitted'});
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
