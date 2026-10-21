import crypto from 'node:crypto';
import { getFirestoreAdmin } from '../../api/_lib/firebaseAdmin.js';
import { autoCreditRecharge } from './usdt-recharge.js';
import { autoCreditConfigured } from '../../api/_lib/bep20.js';
import { scanAndCreditDeposits } from '../../api/_lib/usdtDeposit.js';
import { withTransaction } from '../../api/_lib/db.js';
import { runDailyIncome } from '../../api/_lib/incomeEngine.js';

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method)) return json(res,405,{error:'Method not allowed'});
  const configured=String(process.env.CRON_SECRET||'').trim();
  const auth=String(req.headers.authorization||'');
  if(!configured) return json(res,503,{error:'CRON_SECRET is not configured'});
  if(auth!==`Bearer ${configured}`) return json(res,401,{error:'Unauthorized'});

  let dailyIncome={ok:false,failed:true,reason:'NOT_RUN'};
  try{
    dailyIncome=await withTransaction(async(client)=>{
      const daily=await runDailyIncome(client);
      await client.query(`INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
        VALUES($1,'SYSTEM',NULL,'AUTOMATIC_DAILY_INCOME_RUN','ledger',$2,$3::jsonb)`,[
        crypto.randomUUID(),
        daily.businessDate,
        JSON.stringify({packages:daily.packages,packagesProcessed:daily.packagesProcessed,roiCredits:daily.roiCredits,levelCredits:daily.levelCredits,maturityPointsReleased:daily.maturityPointsReleased,timezone:'Asia/Kolkata'})
      ]);
      return {ok:true,...daily};
    });
  }catch(error){
    console.error('Automatic daily income settlement failed:',error instanceof Error?error.stack||error.message:error);
    dailyIncome={ok:false,failed:true,reason:'DAILY_INCOME_SETTLEMENT_FAILED'};
  }

  // Recovery mode runs only the idempotent daily-income settlement, without deposit scanning or recharge auto-credit.
  if(String(req.query?.dailyIncomeOnly||'')==='1'){
    return json(res,dailyIncome.failed?500:200,{ok:!dailyIncome.failed,mode:'daily-income-only',dailyIncome});
  }

  let depositScan={configured:false,scannedTo:null,found:0,credited:0,reason:'DEPOSIT_NOT_CONFIGURED'};
  try{
    depositScan=await scanAndCreditDeposits();
  }catch(error){
    console.error('Automatic USDT deposit scan failed:',error instanceof Error?error.stack||error.message:error);
    return json(res,500,{ok:false,error:'Automatic USDT deposit scan failed',dailyIncome,depositScan:{configured:true,failed:true}});
  }

  if(!autoCreditConfigured()){
    return json(res,dailyIncome.failed?500:200,{
      ok:!dailyIncome.failed,
      autoCreditEnabled:false,
      processed:0,
      approved:0,
      dailyIncome,
      depositScan,
      message:dailyIncome.failed?'Daily income settlement failed; inspect runtime logs.':'Daily income settled; unique-address scan ran when configured; legacy TXID auto-credit is disabled.',
    });
  }

  const db=getFirestoreAdmin();
  const snap=await db.collection('usdtRecharges').where('status','==','pending').limit(100).get();
  let processed=0,approved=0,deferred=0,failed=0;
  const details=[];

  for(const d of snap.docs){
    const r=d.data()||{};
    const userSnap=await db.collection('users').doc(r.userId).get();
    const u=userSnap.data()||{};
    if(!userSnap.exists||u.status!=='active') continue;
    processed++;
    try{
      const result=await autoCreditRecharge({
        id:d.id,
        actor:{id:r.userId,email:r.userEmail||u.email||'',name:r.userName||u.name||'',role:u.role||'user',referralCode:u.referralCode||r.referralCode||''},
        txHash:String(r.txHash).toLowerCase(),
        amount:String(r.amountUsdt)
      });
      if(result.status==='approved'){approved++;details.push({id:d.id,status:'approved'});}
      else{deferred++;details.push({id:d.id,status:'pending',reason:result.deferred||null});}
    }catch(error){
      failed++;
      console.error('Legacy USDT recharge auto-credit failed:',d.id,error instanceof Error?error.message:error);
      details.push({id:d.id,status:'failed'});
    }
  }

  await db.collection('auditLogs').doc(crypto.randomUUID()).set({
    actorUserId:'SYSTEM',actorEmail:null,action:'USDT_AUTO_CREDIT_CRON',
    entityType:'system_job',entityId:new Date().toISOString(),
    metadata:{processed,approved,deferred,failed,limit:100,depositScan,dailyIncome,legacyTxidQueue:true},
    timestamp:new Date()
  });
  return json(res,dailyIncome.failed?500:200,{ok:!dailyIncome.failed,autoCreditEnabled:true,processed,approved,deferred,failed,details,dailyIncome,depositScan});
}
