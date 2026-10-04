import crypto from 'node:crypto';
import { getPool } from './_lib/db.js';
import { autoCreditRecharge } from './usdt-recharge.js';
import { autoCreditConfigured } from './_lib/bep20.js';

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});

  const configured=String(process.env.CRON_SECRET||'').trim();
  const auth=String(req.headers.authorization||'');
  if(!configured) return json(res,503,{error:'CRON_SECRET is not configured'});
  if(auth!==`Bearer ${configured}`) return json(res,401,{error:'Unauthorized'});
  if(!autoCreditConfigured()) return json(res,200,{ok:true,autoCreditEnabled:false,processed:0,approved:0,message:'Automatic recharge credit is not enabled.'});

  const pool=getPool();
  const pending=await pool.query(
    `SELECT r.id,r.tx_hash,r.amount_usdt,r.user_id,u.email,u.name,u.status
       FROM usdt_bep20_recharges r
       JOIN users u ON u.id=r.user_id
      WHERE r.status='pending'
        AND u.status='active'
      ORDER BY r.created_at ASC
      LIMIT 100`
  );

  let processed=0,approved=0,deferred=0,failed=0;
  const details=[];

  for(const row of pending.rows){
    processed++;
    try{
      const result=await autoCreditRecharge({
        id:row.id,
        actor:{id:row.user_id,email:row.email,name:row.name},
        txHash:String(row.tx_hash||'').toLowerCase(),
        amount:String(row.amount_usdt),
      });
      if(result.status==='approved'){
        approved++;
        details.push({id:row.id,status:'approved'});
      }else{
        deferred++;
        details.push({id:row.id,status:'pending',reason:result.deferred||null});
      }
    }catch(error){
      failed++;
      console.error('Background auto-credit failed:',row.id,error instanceof Error?error.message:error);
      details.push({id:row.id,status:'failed'});
    }
  }

  await pool.query(
    `INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
     VALUES($1,'SYSTEM',NULL,'AUTOMATIC_USDT_RECHARGE_SCAN','ledger',$2,$3::jsonb)`,
    [
      crypto.randomUUID(),
      new Date().toISOString(),
      JSON.stringify({processed,approved,deferred,failed,limit:100})
    ]
  ).catch(()=>{});

  return json(res,200,{ok:true,autoCreditEnabled:true,processed,approved,deferred,failed,details});
}
