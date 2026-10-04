import { randomUUID } from 'node:crypto';
import { getPool, withTransaction } from './_lib/db.js';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { applyActivationIncome, ensureIncomeSchema } from './_lib/incomeEngine.js';

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(body));}
function body(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});}
function money(v){return Number(Number(v||0).toFixed(2));}

export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:'Method not allowed'});
  try{
    const auth=String(req.headers.authorization||'');
    if(!auth.startsWith('Bearer ')) return json(res,401,{error:'Authentication required'});
    const decoded=await verifyFirebaseIdToken(auth.slice(7));
    const input=body(req);
    const userId=String(input.userId||decoded.uid);
    if(userId!==decoded.uid) return json(res,403,{error:'User mismatch'});
    const packageType=input.packageType==='fd'?'fd':'basic';
    const packageName=String(input.packageName||'').trim().slice(0,120);
    const amount=money(input.amount);
    const roiRate=Number(input.roiRate);
    const durationDays=Math.floor(Number(input.durationDays));
    if(!packageName||!Number.isFinite(amount)||amount<=0||!Number.isFinite(roiRate)||roiRate<=0||!Number.isInteger(durationDays)||durationDays<=0){
      return json(res,400,{error:'Valid package details are required'});
    }

    const result=await withTransaction(async client=>{
      await ensureIncomeSchema(client);
      await client.query(\`CREATE TABLE IF NOT EXISTS package_activations(
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id),
        package_type VARCHAR(16) NOT NULL,
        package_name VARCHAR(120) NOT NULL,
        amount NUMERIC(16,2) NOT NULL CHECK(amount>0),
        roi_daily_rate NUMERIC(10,4) NOT NULL,
        duration_days INT NOT NULL,
        total_earned NUMERIC(16,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )\`);
      await client.query('ALTER TABLE wallets ADD COLUMN IF NOT EXISTS basic_package_active NUMERIC(16,2) NOT NULL DEFAULT 0');
      await client.query('ALTER TABLE wallets ADD COLUMN IF NOT EXISTS fd_package_active NUMERIC(16,2) NOT NULL DEFAULT 0');

      const member=(await client.query('SELECT id,status,role FROM users WHERE id=$1 AND email=$2 LIMIT 1',[decoded.uid,String(decoded.email||'').trim().toLowerCase()])).rows[0];
      if(!member||member.status!=='active'||member.role!=='user') throw new Error('ACTIVE_MEMBER_REQUIRED');

      const walletQ=await client.query('SELECT * FROM wallets WHERE user_id=$1 FOR UPDATE',[userId]);
      if(!walletQ.rowCount) throw new Error('WALLET_NOT_FOUND');
      const wallet=walletQ.rows[0];
      const available=Number(wallet.fund_wallet||0);
      if(available<amount) throw new Error('INSUFFICIENT_FUNDS');

      const id=\`PKG_\${randomUUID().replaceAll('-','').slice(0,24)}\`;
      const expiresAt=new Date(Date.now()+durationDays*86400000).toISOString();
      await client.query(\`INSERT INTO package_activations(id,user_id,package_type,package_name,amount,roi_daily_rate,duration_days,total_earned,status,activated_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,0,'active',NOW(),$8)\`,[id,userId,packageType,packageName,amount,roiRate,durationDays,expiresAt]);

      const ledgerId=\`LED_\${randomUUID().replaceAll('-','').slice(0,26)}\`;
      await client.query(\`INSERT INTO ledger_transactions(id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
        VALUES($1,$2,'package_activation','fund_wallet','debit',$3,0,$3,$4,$5,'completed',$6::jsonb)\`,
        [ledgerId,userId,amount,\`Activated \${packageName} (\${packageType.toUpperCase()})\`,id,JSON.stringify({packageId:id,packageType,packageName,amount,roiRate,durationDays})]);

      const walletField=packageType==='fd'?'fd_package_active':'basic_package_active';
      await client.query(\`UPDATE wallets SET fund_wallet=fund_wallet-$1,\${walletField}=\${walletField}+$1,updated_at=NOW() WHERE user_id=$2\`,[amount,userId]);

      const income=await applyActivationIncome(client,{activationId:id,userId,amount,packageName,packageType});
      return {packageId:id,ledgerId,income};
    });

    return json(res,200,{success:true,...result});
  }catch(error){
    const message=String(error?.message||'');
    if(message==='ACTIVE_MEMBER_REQUIRED') return json(res,403,{error:'Active member account required'});
    if(message==='WALLET_NOT_FOUND') return json(res,409,{error:'Wallet not found'});
    if(message==='INSUFFICIENT_FUNDS') return json(res,409,{error:'Insufficient Available Fund balance'});
    console.error('package-activate failed:',message);
    return json(res,500,{error:'Package activation could not be completed'});
  }
}
