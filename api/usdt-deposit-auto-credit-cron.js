import { scanAndCreditDeposits } from './_lib/usdtDeposit.js';

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

  try{
    const result=await scanAndCreditDeposits();
    return json(res,200,{ok:true,...result});
  }catch(error){
    console.error('usdt-deposit-auto-credit-cron failed:',error instanceof Error?error.stack||error.message:error);
    return json(res,500,{ok:false,error:'Automatic USDT deposit scan failed'});
  }
}
