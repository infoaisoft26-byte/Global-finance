import crypto from 'node:crypto';
import { getPool, withTransaction } from './_lib/db.js';
import { readCookie, verifySessionToken } from './_lib/session.js';
import { ensureCryptoTestnetSchema } from './_lib/cryptoTestnetSchema.js';
import { fetchConfirmedTrc20Transfers, getTronTestnetConfig, isMatchingConfirmedTransfer } from './_lib/tronTestnet.js';

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(body));}
async function requireUser(req){const token=readCookie(req,'gf_session');if(!token)throw new Error('UNAUTHORIZED');return verifySessionToken(token);}

async function creditIntent(intent,tx,config){
  return withTransaction(async(client)=>{
    const locked=await client.query(`SELECT * FROM crypto_deposit_intents WHERE id=$1 AND user_id=$2 FOR UPDATE`,[intent.id,intent.user_id]);
    const current=locked.rows[0]; if(!current||current.status!=='pending') return {credited:false,alreadyProcessed:true};
    const duplicate=await client.query(`SELECT id FROM crypto_deposit_intents WHERE txid=$1 LIMIT 1`,[tx.transaction_id]); if(duplicate.rows[0]) return {credited:false,duplicate:true};
    const amountInr=Number(current.requested_amount_inr);
    await client.query(`INSERT INTO test_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,[current.user_id]);
    const walletUpdate=await client.query(`UPDATE test_wallets SET balance_inr=balance_inr+$1,updated_at=NOW() WHERE user_id=$2 RETURNING balance_inr`,[amountInr,current.user_id]);
    const ledgerId=`TST_${crypto.randomUUID().replaceAll('-','').slice(0,26)}`;
    await client.query(`INSERT INTO test_wallet_entries (id,user_id,amount_inr,kind,reference_id) VALUES ($1,$2,$3,'sell_usdt_test',$4)`,[ledgerId,current.user_id,amountInr,tx.transaction_id]);
    await client.query(`UPDATE crypto_deposit_intents SET status='credited',txid=$1,sender_address=$2,block_timestamp=$3,credited_at=NOW(),updated_at=NOW() WHERE id=$4`,[tx.transaction_id,tx.from||null,Number(tx.block_timestamp||0),current.id]);
    await client.query(`INSERT INTO audit_logs (id,actor_user_id,actor_email,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,'testnet_crypto_deposit_credited','crypto_deposit_intent',$4,$5::jsonb)`,[`AUD_${crypto.randomUUID().replaceAll('-','').slice(0,24)}`,current.user_id,null,current.id,JSON.stringify({testnet:true,network:'NILE',txid:tx.transaction_id,amountInr})]);
    return {credited:true,intentId:current.id,txid:tx.transaction_id,testBalanceInr:Number(walletUpdate.rows[0].balance_inr||0)};
  });
}

export default async function handler(req,res){
  if(req.method!=='POST'&&req.method!=='GET') return json(res,405,{error:'Method not allowed'});
  try{
    const session=await requireUser(req); const config=getTronTestnetConfig(); await ensureCryptoTestnetSchema(); const pool=getPool();
    await pool.query(`UPDATE crypto_deposit_intents SET status='expired',updated_at=NOW() WHERE user_id=$1 AND status='pending' AND expires_at<=NOW()`,[session.uid]);
    const {rows:intents}=await pool.query(`SELECT * FROM crypto_deposit_intents WHERE user_id=$1 AND network='NILE' AND status='pending' AND expires_at>NOW() ORDER BY created_at ASC LIMIT 5`,[session.uid]);
    if(!intents.length) return json(res,200,{success:true,testnet:true,credited:false,message:'No pending Nile deposits.'});
    const minTimestamp=Math.min(...intents.map(i=>new Date(i.created_at).getTime()))-60000; const transfers=await fetchConfirmedTrc20Transfers({address:config.depositAddress,minTimestamp});
    for(const intent of intents){const match=transfers.find(tx=>isMatchingConfirmedTransfer(tx,intent,config));if(!match)continue;const result=await creditIntent(intent,match,config);if(result.credited)return json(res,200,{success:true,testnet:true,...result});}
    return json(res,200,{success:true,testnet:true,credited:false,pending:intents.length,message:'No matching confirmed Nile transfer yet.'});
  }catch(error){if(error?.message==='UNAUTHORIZED')return json(res,401,{error:'Authentication required.'});console.error('crypto-deposit-sync:',error);return json(res,500,{error:error instanceof Error?error.message:'Testnet reconciliation failed.'});}
}
