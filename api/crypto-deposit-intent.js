import crypto from 'node:crypto';
import { getPool } from './_lib/db.js';
import { readCookie, verifySessionToken } from './_lib/session.js';
import { ensureCryptoTestnetSchema } from './_lib/cryptoTestnetSchema.js';
import { getTronTestnetConfig } from './_lib/tronTestnet.js';

function json(res, status, body) { res.statusCode=status; res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store'); return res.end(JSON.stringify(body)); }
async function requireUser(req) { const token=readCookie(req,'gf_session'); if(!token) throw new Error('UNAUTHORIZED'); return verifySessionToken(token); }
function mapIntent(row){return{ id:row.id,network:row.network,token:row.token,depositAddress:row.deposit_address,expectedAmountUsdt:Number(row.expected_amount_usdt),requestedAmountInr:Number(row.requested_amount_inr),rateInrPerUsdt:Number(row.rate_inr_per_usdt),status:row.status,txid:row.txid||undefined,expiresAt:row.expires_at?.toISOString?.()||String(row.expires_at),creditedAt:row.credited_at?.toISOString?.()||(row.credited_at?String(row.credited_at):undefined),createdAt:row.created_at?.toISOString?.()||String(row.created_at)}}

export default async function handler(req,res){
  try{
    const session=await requireUser(req); const config=getTronTestnetConfig(); await ensureCryptoTestnetSchema(); const pool=getPool();
    if(req.method==='GET'){ const {rows}=await pool.query(`SELECT * FROM crypto_deposit_intents WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`,[session.uid]); return json(res,200,{success:true,testnet:true,intents:rows.map(mapIntent)}); }
    if(req.method!=='POST') return json(res,405,{error:'Method not allowed'});
    const amountInr=Number(req.body?.amountInr); if(!Number.isFinite(amountInr)||amountInr<100||amountInr>500000) return json(res,400,{error:'Test deposit amount must be between ₹100 and ₹5,00,000.'});
    const userCheck=await pool.query(`SELECT id,status FROM users WHERE id=$1 LIMIT 1`,[session.uid]); if(!userCheck.rows[0]||userCheck.rows[0].status!=='active') return json(res,403,{error:'Account is not active.'});
    await pool.query(`UPDATE crypto_deposit_intents SET status='expired',updated_at=NOW() WHERE user_id=$1 AND status='pending' AND network<>'NILE'`,[session.uid]);
    const active=await pool.query(`SELECT * FROM crypto_deposit_intents WHERE user_id=$1 AND network='NILE' AND status='pending' AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1`,[session.uid]);
    if(active.rows[0]) return json(res,200,{success:true,testnet:true,intent:mapIntent(active.rows[0])});
    const scale=10**config.decimals; const baseAtomic=Math.max(1,Math.round((amountInr/config.rateInrPerUsdt)*scale)); let expectedAtomic=0;
    for(let attempt=0;attempt<10;attempt+=1){ const suffixMax=Math.min(999,Math.max(1,scale-1)); const suffix=crypto.randomInt(1,suffixMax+1); const candidate=baseAtomic+suffix; const collision=await pool.query(`SELECT 1 FROM crypto_deposit_intents WHERE network='NILE' AND deposit_address=$1 AND expected_amount_atomic=$2 AND status='pending' AND expires_at>NOW() LIMIT 1`,[config.depositAddress,String(candidate)]); if(!collision.rows[0]){expectedAtomic=candidate;break;} }
    if(!expectedAtomic) return json(res,409,{error:'Could not reserve a unique test amount. Try again.'});
    const id=`TDEP_${crypto.randomUUID().replaceAll('-','').slice(0,24)}`; const expectedAmountUsdt=expectedAtomic/scale;
    const {rows}=await pool.query(`INSERT INTO crypto_deposit_intents (id,user_id,network,token,deposit_address,token_contract,token_decimals,expected_amount_atomic,expected_amount_usdt,requested_amount_inr,rate_inr_per_usdt,status,expires_at,metadata) VALUES ($1,$2,'NILE','USDT-TEST',$3,$4,$5,$6,$7,$8,$9,'pending',NOW()+INTERVAL '30 minutes',$10::jsonb) RETURNING *`,[id,session.uid,config.depositAddress,config.contractAddress,config.decimals,String(expectedAtomic),expectedAmountUsdt,amountInr,config.rateInrPerUsdt,JSON.stringify({mode:'testnet',network:'NILE',uniqueAmountMatching:true})]);
    return json(res,201,{success:true,testnet:true,intent:mapIntent(rows[0])});
  }catch(error){ if(error?.message==='UNAUTHORIZED') return json(res,401,{error:'Authentication required.'}); console.error('crypto-deposit-intent:',error); return json(res,500,{error:error instanceof Error?error.message:'Testnet deposit setup failed.'}); }
}
