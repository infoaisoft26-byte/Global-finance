import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { BEP20_WALLET, verifyBep20 } from '../api/_lib/bep20.js';

const tx = `0x${'a'.repeat(64)}`;
const contract = `0x${'b'.repeat(40)}`;
const topic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const target = `0x${BEP20_WALLET.slice(2).toLowerCase().padStart(64,'0')}`;
const savedFetch = globalThis.fetch;
const saved = Object.fromEntries(['PAYMENTS_ENABLED','USDT_RECHARGE_ENABLED','USDT_BEP20_CONTRACT_ADDRESS','BSC_RPC_URL'].map(key=>[key,process.env[key]]));
let receipt;
before(() => {
  Object.assign(process.env,{PAYMENTS_ENABLED:'true',USDT_RECHARGE_ENABLED:'true',USDT_BEP20_CONTRACT_ADDRESS:contract,BSC_RPC_URL:'https://example.invalid/rpc'});
  globalThis.fetch = async (_url,init) => {
    const {method} = JSON.parse(init.body);
    const result = {eth_chainId:'0x38',eth_getTransactionReceipt:receipt,eth_blockNumber:'0x76',eth_call:'0x12'}[method];
    return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}),{status:200});
  };
});
after(() => { globalThis.fetch=savedFetch; for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;} });
const valid = () => ({transactionHash:tx,status:'0x1',blockNumber:'0x64',logs:[{address:contract,topics:[topic,`0x${'0'.repeat(64)}`,target],data:`0x${(10n*10n**18n).toString(16)}`}]});

test('matching confirmed transfer is accepted',async()=>{receipt=valid();const proof=await verifyBep20(tx,'10.00000000');assert.equal(proof.confirmations,'19');});
test('failed or mismatched token transfer is rejected',async()=>{
  for(const change of [r=>{r.status='0x0';},r=>{r.logs[0].address=`0x${'c'.repeat(40)}`;},r=>{r.logs[0].topics[2]=`0x${'0'.repeat(64)}`;},r=>{r.logs[0].data='0x1';}]){
    receipt=valid();change(receipt);await assert.rejects(verifyBep20(tx,'10'),/TRANSACTION_NOT_CONFIRMED|TRANSFER_MISMATCH/);
  }
});
test('twelve confirmations are required',async()=>{receipt=valid();receipt.blockNumber='0x75';await assert.rejects(verifyBep20(tx,'10'),/TRANSACTION_NOT_CONFIRMED/);});
