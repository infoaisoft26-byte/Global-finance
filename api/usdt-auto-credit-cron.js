import crypto from 'node:crypto';
import { getFirestoreAdmin } from './_lib/firebaseAdmin.js';
import { autoCreditRecharge } from './usdt-recharge.js';
import { autoCreditConfigured } from './_lib/bep20.js';

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}

export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
  const configured=String(process.env.CRON_SECRET||'').trim();
  if(!configured) return json(res,503,{error:'CRON_SECRET is not configured'});
  if(String(req.headers.authorization||'')!==`Bearer ${configured}`) return json(res,401,{error:'Unauthorized'});
  if(!autoCreditConfigured()) return json(res,200,{ok:true,autoCreditEnabled:false,processed:0,approved:0,message:'Automatic recharge credit is not enabled.'});

  const db=getFirestoreAdmin();
  const snap=await db.collection('usdtRecharges').where('status','==','pending').limit(100).get();
  let processed=0,approved=0,deferred=0,failed=0;
  const details=[];
  for(const d of snap.docs){
    const r=d.data()||{};
    if(!r.userId||!r.txHash) continue;
    const userSnap=await db.collection('users').doc(r.userId).get();
    const u=userSnap.data()||{};
    if(!userSnap.exists||u.status!=='active') continue;
    processed++;
    try{
      const result=await autoCreditRecharge({id:d.id,actor:{id:r.userId,email:r.userEmail||u.email||'',name:r.userName||u.name||'',role:u.role||'user',referralCode:u.referralCode||r.referralCode||''},txHash:String(r.txHash).toLowerCase(),amount:String(r.amountUsdt)});
      if(result.status==='approved'){approved++;details.push({id:d.id,status:'approved'});}
      else{deferred++;details.push({id:d.id,status:'pending',reason:result.deferred||null});}
    }catch(error){
      failed++;
      console.error('Background Firestore auto-credit failed:',d.id,error instanceof Error?error.message:error);
      details.push({id:d.id,status:'failed'});
    }
  }
  await db.collection('auditLogs').doc(crypto.randomUUID()).set({
    actorUserId:'SYSTEM',actorEmail:null,action:'AUTOMATIC_USDT_RECHARGE_SCAN',
    entityType:'ledger',entityId:new Date().toISOString(),
    metadata:{processed,approved,deferred,failed,limit:100,storage:'firestore'},timestamp:new Date()
  });
  return json(res,200,{ok:true,autoCreditEnabled:true,processed,approved,deferred,failed,details});
}
