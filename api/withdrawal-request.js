import { randomUUID } from 'node:crypto';
import { getPool, withTransaction } from './_lib/db.js';
import { getFirestoreAdmin, verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(body));}
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
 try{
  const auth=String(req.headers.authorization||'');if(!auth.startsWith('Bearer '))return json(res,401,{error:'Authentication required.'});
  const decoded=await verifyFirebaseIdToken(auth.slice(7));const uid=decoded.uid;const email=String(decoded.email||'').trim().toLowerCase();
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});const amount=Number(body.amount);const walletAddress=String(body.walletAddress||'').trim();const note=String(body.note||'').trim().slice(0,500);const otpId=String(body.otpId||'');
  if(!Number.isFinite(amount)||amount<2||!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)||!otpId)return json(res,400,{error:'Valid amount, BEP20 address and verified email OTP are required.'});
  const pool=getPool();const userQ=await pool.query('SELECT id,email,name,referral_code,status,role,kyc_status FROM users WHERE id=$1 AND email=$2 LIMIT 1',[uid,email]);const user=userQ.rows[0];
  if(!user||user.status!=='active'||user.role!=='user')return json(res,403,{error:'Active member account required.'});
  const settingsQ=await pool.query('SELECT data FROM app_settings WHERE id=$1 LIMIT 1',['global_finance_system_settings']).catch(()=>({rows:[]}));const settings=settingsQ.rows[0]?.data||{};
  if(settings.withdrawalEnabled===false)return json(res,403,{error:'Withdrawals are currently disabled.'});
  if(settings.requireKycForWithdrawal===true&&user.kyc_status!=='verified')return json(res,403,{error:'KYC verification is required before withdrawal.'});
  const min=Number(settings.minWithdrawal||2);const max=Number(settings.maxWithdrawal||1000000);if(amount<min||amount>max)return json(res,400,{error:'Withdrawal amount must be between '+min+' and '+max+' USDT.'});
  const secret=String(process.env.OTP_HASH_SECRET||process.env.RESEND_API_KEY||'').trim();if(!secret)return json(res,503,{error:'OTP security secret is not configured.'});
  const {createHash}=await import('node:crypto');const hash=(v)=>createHash('sha256').update(secret+':'+v).digest('hex');
  const payloadHash=hash(JSON.stringify({purpose:'withdrawal',amount,walletAddress,note}));
  const pendingSnap=await getFirestoreAdmin().collection('transaction_requests').where('userId','==',uid).where('requestType','==','withdrawal').where('status','in',['pending','under_review','approved','processing']).limit(1).get();if(!pendingSnap.empty)return json(res,409,{error:'You already have a pending withdrawal request.'});
  const result=await withTransaction(async client=>{
   const otpQ=await client.query('SELECT * FROM transaction_email_otps WHERE id=$1 AND user_id=$2 AND purpose=$3 FOR UPDATE',[otpId,uid,'withdrawal']);const otp=otpQ.rows[0];
   if(!otp||!otp.verified_at||otp.consumed_at||new Date(otp.expires_at).getTime()<Date.now()||otp.payload_hash!==payloadHash)throw new Error('OTP_REQUIRED_OR_INVALID');
   const walletQ=await client.query('SELECT income_wallet FROM wallets WHERE user_id=$1 FOR UPDATE',[uid]);const balance=Number(walletQ.rows[0]?.income_wallet||0);if(balance<amount)throw new Error('INSUFFICIENT_FUNDS');
   const feePercent=Number(settings.withdrawalFeePercent||5);const fee=Number((amount*feePercent/100).toFixed(6));const net=Number((amount-fee).toFixed(6));
   const reference='WTH_'+randomUUID().replaceAll('-','').slice(0,20);const id=randomUUID();const now=new Date().toISOString();
   const request={id,reference,userId:uid,userEmail:email,userName:user.name||'',userReferralCode:user.referral_code||'',requestType:'withdrawal',sourceWalletType:'income_wallet',destinationWalletType:'external_bank',amountRupees:amount,amountPaise:Math.round(amount*100),feeRupees:fee,feePaise:Math.round(fee*100),netAmountRupees:net,netAmountPaise:Math.round(net*100),status:'pending',userNote:'USDT BEP20: '+walletAddress+(note?'. '+note:''),metadata:{asset:'USDT',network:'BEP20 / BNB Smart Chain',withdrawalType:'usdt_bep20',destinationWalletAddress:walletAddress,destination:'USDT BEP20: '+walletAddress,feeAmountUsdt:fee,netPayoutUsdt:net},createdAt:now,updatedAt:now};
   await client.query('UPDATE transaction_email_otps SET consumed_at=NOW() WHERE id=$1',[otpId]);return request;
  });
  await getFirestoreAdmin().collection('transaction_requests').doc(result.id).create(result);
  return json(res,200,{success:true,request:{reference:result.reference,status:result.status},message:'Withdrawal request submitted successfully.'});
 }catch(error){const m=String(error?.message||'');if(m==='OTP_REQUIRED_OR_INVALID')return json(res,403,{error:'Email OTP is missing, expired, already used, or does not match this withdrawal.'});if(m==='INSUFFICIENT_FUNDS')return json(res,409,{error:'Insufficient available USDT balance.'});console.error('withdrawal request failed:',m);return json(res,500,{error:'Withdrawal request could not be submitted. Please try again.'});}
}