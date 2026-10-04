import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { getPool, withTransaction } from './_lib/db.js';
import { getOrCreateDepositAddress, addressGenerationConfigured } from './_lib/usdtDeposit.js';

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});

  try{
    const auth=String(req.headers.authorization||'');
    if(!auth.startsWith('Bearer ')) return json(res,401,{error:'Authentication required'});
    const decoded=await verifyFirebaseIdToken(auth.slice(7));
    const userId=String(decoded.uid||'');
    const email=String(decoded.email||'').trim().toLowerCase();
    if(!userId||!email) return json(res,401,{error:'Authentication required'});

    const user=(await getPool().query(
      'SELECT id,status,role FROM users WHERE id=$1 AND email=$2 LIMIT 1',[userId,email]
    )).rows[0];
    if(!user||user.role!=='user'||user.status!=='active') return json(res,403,{error:'Active member account required'});

    if(!addressGenerationConfigured()){
      return json(res,503,{error:'Automatic deposit address system is not configured yet',configured:false});
    }

    const deposit=await getOrCreateDepositAddress(userId);
    const deposits=await getPool().query(
      `SELECT id,tx_hash,amount_usdt,status,block_number,confirmations,created_at,credited_at
         FROM usdt_deposit_events
        WHERE user_id=$1
        ORDER BY created_at DESC
        LIMIT 20`,
      [userId]
    );

    return json(res,200,{
      configured:true,
      network:'BSC',
      token:'USDT',
      contractAddress:String(process.env.USDT_BEP20_CONTRACT_ADDRESS||'').trim() || null,
      depositAddress:deposit.address,
      derivationIndex:deposit.derivationIndex,
      confirmationsRequired:12,
      deposits:deposits.rows.map(r=>({
        id:r.id,txHash:r.tx_hash,amountUsdt:String(r.amount_usdt),status:r.status,
        blockNumber:String(r.block_number),confirmations:Number(r.confirmations||0),
        createdAt:r.created_at,creditedAt:r.credited_at
      })),
    });
  }catch(error){
    console.error('usdt-deposit-address failed:',error instanceof Error?error.message:error);
    const message=String(error?.message||'');
    if(message==='DEPOSIT_XPUB_NOT_CONFIGURED') return json(res,503,{error:'Automatic deposit address system is not configured yet',configured:false});
    return json(res,500,{error:'Unable to load your USDT deposit address'});
  }
}
