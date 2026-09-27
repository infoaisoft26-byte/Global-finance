import crypto from 'node:crypto';
import { getPool, withTransaction } from './_lib/db.js';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { ensureCryptoTestnetSchema } from './_lib/cryptoTestnetSchema.js';
import { fetchConfirmedTrc20Transfers, getTronTestnetConfig, isMatchingBuyTransfer } from './_lib/tronTestnet.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, body) => { res.statusCode=code; res.end(JSON.stringify(body)); };
  if (req.method !== 'GET' && req.method !== 'POST') return send(405, { error:'Method not allowed' });
  try {
    const header=String(req.headers.authorization||'');
    if (!header.startsWith('Bearer ')) return send(401,{error:'Admin sign-in required.'});
    const decoded=await verifyFirebaseIdToken(header.slice(7));
    const pool=getPool();
    const {rows: admins}=await pool.query(`SELECT role,status FROM users WHERE id=$1 AND email=$2`,[decoded.uid,String(decoded.email||'').toLowerCase()]);
    if(admins[0]?.role!=='admin'||admins[0]?.status!=='active') return send(403,{error:'Admin access required.'});
    const config=getTronTestnetConfig();
    await ensureCryptoTestnetSchema();
    if(req.method==='GET'){
      const {rows}=await pool.query(`SELECT b.id,b.user_id,u.email,b.recipient_address,b.amount_inr,b.amount_usdt,b.status,b.txid,b.created_at FROM test_buy_orders b JOIN users u ON u.id=b.user_id ORDER BY b.created_at DESC LIMIT 100`);
      return send(200,{testnet:true,treasuryAddress:config.depositAddress,orders:rows});
    }
    const id=String(req.body?.id||'');
    const action=String(req.body?.action||'');
    const txid=String(req.body?.txid||'').toLowerCase();
    if(!/^TBUY_[a-f0-9]{24}$/.test(id)||!['complete','cancel'].includes(action)) return send(400,{error:'Invalid buy order.'});
    if(action==='complete'&&!/^[a-f0-9]{64}$/.test(txid)) return send(400,{error:'Enter a Nile transaction ID.'});
    const {rows: found}=await pool.query(`SELECT * FROM test_buy_orders WHERE id=$1`,[id]);
    const order=found[0];
    if(!order||order.status!=='pending') return send(409,{error:'Order is not pending.'});
    if(action==='complete'){
      const transfers=await fetchConfirmedTrc20Transfers({address:config.depositAddress,minTimestamp:new Date(order.created_at).getTime()-60000});
      const match=transfers.find(tx=>isMatchingBuyTransfer(tx,order,config,txid));
      if(!match) return send(409,{error:'Confirmed Nile transfer from the treasury to this address for the exact test USDT amount was not found.'});
    }
    const result=await withTransaction(async client=>{
      const {rows}=await client.query(`SELECT * FROM test_buy_orders WHERE id=$1 FOR UPDATE`,[id]);
      if(rows[0]?.status!=='pending') return {error:'Order already handled.'};
      if(action==='complete'){
        const {rows: duplicates}=await client.query(`SELECT id FROM test_buy_orders WHERE txid=$1`,[txid]);
        if(duplicates.length) return {error:'Transaction already used.'};
        await client.query(`UPDATE test_buy_orders SET status='completed',txid=$1,completed_at=NOW() WHERE id=$2`,[txid,id]);
      } else {
        await client.query(`UPDATE test_buy_orders SET status='cancelled',completed_at=NOW() WHERE id=$1`,[id]);
        await client.query(`UPDATE test_wallets SET balance_inr=balance_inr+$1,updated_at=NOW() WHERE user_id=$2`,[rows[0].amount_inr,rows[0].user_id]);
        await client.query(`INSERT INTO test_wallet_entries (id,user_id,amount_inr,kind,reference_id) VALUES ($1,$2,$3,'buy_refund',$4)`,[`TST_${crypto.randomUUID().replaceAll('-','').slice(0,26)}`,rows[0].user_id,rows[0].amount_inr,`${id}:refund`]);
      }
      return {status:action==='complete'?'completed':'cancelled'};
    });
    if(result.error) return send(409,{error:result.error});
    return send(200,{testnet:true,id,...result});
  }catch(error){console.error('admin-test-buys:',error);return send(500,{error:'Could not process Nile order.'});}
}
