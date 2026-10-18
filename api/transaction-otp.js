import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { getPool, withTransaction } from './_lib/db.js';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { sendTransactionOtp } from './_lib/email.js';

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(body));}
function hash(value){const secret=String(process.env.OTP_HASH_SECRET||process.env.RESEND_API_KEY||'').trim();if(!secret)throw new Error('OTP_SECRET_NOT_CONFIGURED');return createHash('sha256').update(secret+':'+value).digest('hex');}
function stablePayload(body,purpose){if(purpose==='p2p_transfer')return JSON.stringify({purpose,recipientCode:String(body.recipientCode||'').trim().toUpperCase(),amount:Number(body.amount),note:String(body.note||'').trim().slice(0,250)});const address=String(body.walletAddress||'').trim();if(!/^0x[a-fA-F0-9]{40}$/.test(address))throw new Error('Enter a valid USDT BEP20 wallet address before requesting OTP.');return JSON.stringify({purpose,amount:Number(body.amount),walletAddress:address,note:String(body.note||'').trim().slice(0,500)});}
async function actor(req){const auth=String(req.headers.authorization||'');if(!auth.startsWith('Bearer '))throw new Error('AUTH_REQUIRED');const decoded=await verifyFirebaseIdToken(auth.slice(7));const email=String(decoded.email||'').trim().toLowerCase();const {rows}=await getPool().query('SELECT id,email,name,role,status FROM users WHERE id=$1 AND email=$2 LIMIT 1',[decoded.uid,email]);const user=rows[0];if(!user||user.status!=='active'||user.role!=='user')throw new Error('ACTIVE_MEMBER_REQUIRED');if(!email)throw new Error('VERIFIED_EMAIL_REQUIRED');return user;}
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
 try{
  const user=await actor(req);const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});const purpose=String(body.purpose||'');
  if(!['p2p_transfer','withdrawal'].includes(purpose))return json(res,400,{error:'Invalid transaction OTP purpose.'});
  const payloadHash=hash(stablePayload(body,purpose));const pool=getPool();
  if(body.action==='send'){
   const recent=await pool.query("SELECT COUNT(*)::int AS count FROM transaction_email_otps WHERE user_id=$1 AND purpose=$2 AND created_at>NOW()-INTERVAL '1 hour'",[user.id,purpose]);
   if(Number(recent.rows[0]?.count||0)>=5)return json(res,429,{error:'OTP limit reached. Please try again later.'});
   const pending=await pool.query('SELECT created_at FROM transaction_email_otps WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1',[user.id,purpose]);
   if(pending.rows[0]&&Date.now()-new Date(pending.rows[0].created_at).getTime()<60000)return json(res,429,{error:'Please wait 60 seconds before requesting another OTP.'});
   const code=String(randomInt(0,1000000)).padStart(6,'0');const id=randomUUID();
   await pool.query("INSERT INTO transaction_email_otps(id,user_id,purpose,code_hash,payload_hash,expires_at) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '10 minutes')",[id,user.id,purpose,hash(user.id+':'+purpose+':'+code),payloadHash]);
   try{await sendTransactionOtp({to:user.email,name:user.name,code,purpose});}catch(error){await pool.query('UPDATE transaction_email_otps SET consumed_at=NOW() WHERE id=$1',[id]);if(String(error?.message)==='EMAIL_DELIVERY_NOT_CONFIGURED')return json(res,503,{error:'Email OTP is not configured yet. Set RESEND_API_KEY and EMAIL_FROM in Vercel.'});throw error;}
   return json(res,200,{success:true,otpId:id,expiresInSeconds:600,maskedEmail:user.email.replace(/^(.{2}).*(@.*)$/,'$1***$2'),message:'OTP sent to your registered email.'});
  }
  if(body.action==='verify'){
   const otpId=String(body.otpId||'');const code=String(body.code||'').trim();if(!/^[0-9]{6}$/.test(code)||!otpId)return json(res,400,{error:'Enter the 6-digit email OTP.'});
   await withTransaction(async client=>{
    const q=await client.query('SELECT * FROM transaction_email_otps WHERE id=$1 AND user_id=$2 AND purpose=$3 FOR UPDATE',[otpId,user.id,purpose]);const row=q.rows[0];
    if(!row||row.consumed_at||new Date(row.expires_at).getTime()<Date.now())throw new Error('OTP_EXPIRED');if(row.verified_at)throw new Error('OTP_ALREADY_VERIFIED');if(row.payload_hash!==payloadHash)throw new Error('OTP_PAYLOAD_MISMATCH');if(Number(row.attempts)>=5)throw new Error('OTP_ATTEMPTS_EXCEEDED');
    const supplied=Buffer.from(hash(user.id+':'+purpose+':'+code),'hex');const expected=Buffer.from(row.code_hash,'hex');
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){await client.query('UPDATE transaction_email_otps SET attempts=attempts+1 WHERE id=$1',[otpId]);throw new Error('OTP_INVALID');}
    await client.query('UPDATE transaction_email_otps SET verified_at=NOW() WHERE id=$1',[otpId]);
   });
   return json(res,200,{success:true,otpId,message:'Email OTP verified. Complete the transaction now.'});
  }
  return json(res,400,{error:'Invalid OTP action.'});
 }catch(error){const m=String(error?.message||'');if(m==='AUTH_REQUIRED')return json(res,401,{error:'Authentication required.'});if(m==='ACTIVE_MEMBER_REQUIRED')return json(res,403,{error:'Active member account required.'});if(m==='OTP_EXPIRED')return json(res,400,{error:'OTP expired or already used. Request a new OTP.'});if(m==='OTP_ALREADY_VERIFIED')return json(res,409,{error:'OTP already verified. Submit the transaction.'});if(m==='OTP_PAYLOAD_MISMATCH')return json(res,409,{error:'Transaction details changed. Request a new OTP.'});if(m==='OTP_ATTEMPTS_EXCEEDED')return json(res,429,{error:'Too many incorrect OTP attempts. Request a new OTP.'});if(m==='OTP_INVALID')return json(res,400,{error:'Incorrect OTP. Please check the email and try again.'});if(m==='OTP_SECRET_NOT_CONFIGURED')return json(res,503,{error:'OTP security secret is not configured in Vercel.'});console.error('transaction OTP failed:',m);return json(res,500,{error:'Could not process email OTP. Please try again.'});}
}