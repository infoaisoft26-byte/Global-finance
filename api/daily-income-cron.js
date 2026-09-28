import crypto from 'node:crypto';
import { withTransaction } from './_lib/db.js';
import { runDailyIncome } from './_lib/incomeEngine.js';

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  return res.end(JSON.stringify(body));
}

export default async function handler(req,res){
  if(req.method!=='GET' && req.method!=='POST') return json(res,405,{error:'Method not allowed'});
  const configured=String(process.env.CRON_SECRET||'').trim();
  const auth=String(req.headers.authorization||'');
  if(!configured) return json(res,503,{error:'CRON_SECRET is not configured'});
  if(auth!==`Bearer ${configured}`) return json(res,401,{error:'Unauthorized'});

  try{
    const requested=String(req.query?.date||'').trim();
    if(requested && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return json(res,400,{error:'Invalid date'});
    const result=await withTransaction(async client=>{
      const daily=await runDailyIncome(client,requested||undefined);
      await client.query(`INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
        VALUES($1,'SYSTEM',NULL,'AUTOMATIC_DAILY_INCOME_RUN','ledger',$2,$3::jsonb)`,[
          crypto.randomUUID(),
          daily.businessDate,
          JSON.stringify({packages:daily.packages,packagesProcessed:daily.packagesProcessed,roiCredits:daily.roiCredits,levelCredits:daily.levelCredits})
        ]);
      return daily;
    });
    return json(res,200,{ok:true,...result});
  }catch(error){
    console.error('daily-income-cron failed:',error instanceof Error?error.message:error);
    return json(res,500,{error:'Automatic daily income processing failed'});
  }
}
