import { getPool } from './_lib/db.js';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { ensureIncomeSchema, evaluateSalaryRanks } from './_lib/incomeEngine.js';

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(body));}

export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
  try{
    const auth=String(req.headers.authorization||'');
    if(!auth.startsWith('Bearer ')) return json(res,401,{error:'Authentication required'});
    const decoded=await verifyFirebaseIdToken(auth.slice(7));
    const pool=getPool();
    const actorResult=await pool.query('SELECT id,email,role,status FROM users WHERE id=$1 AND email=$2 LIMIT 1',[decoded.uid,String(decoded.email||'').trim().toLowerCase()]);
    const actor=actorResult.rows[0];
    if(!actor||actor.role!=='admin'||actor.status!=='active') return json(res,403,{error:'Admin access required'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await ensureIncomeSchema(client);
      const salaryRanks=await evaluateSalaryRanks(client);
      await client.query('COMMIT');

      const [ledger,purchases,wallets,incomes,rules,summary] = await Promise.all([
        pool.query(`SELECT l.*,u.name,u.email,u.referral_code FROM ledger_transactions l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 1000`),
        pool.query(`SELECT p.*,u.name,u.email,u.referral_code FROM package_activations p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.activated_at DESC LIMIT 500`),
        pool.query(`SELECT w.*,u.name,u.email,u.referral_code,u.rank_code FROM wallets w JOIN users u ON u.id=w.user_id ORDER BY w.updated_at DESC LIMIT 1000`),
        pool.query(`SELECT d.*,r.name recipient_name,r.referral_code recipient_code,s.name source_name,s.referral_code source_code FROM income_distributions d JOIN users r ON r.id=d.recipient_user_id JOIN users s ON s.id=d.source_user_id ORDER BY d.created_at DESC LIMIT 1000`),
        pool.query(`SELECT * FROM salary_rules ORDER BY sort_order`),
        pool.query(`SELECT
          COALESCE(SUM(CASE WHEN l.type IN ('crypto_deposit','usdt_bep20_recharge','recharge') AND l.flow='credit' THEN l.amount ELSE 0 END),0) total_deposits,
          COUNT(*) FILTER(WHERE l.type IN ('crypto_deposit','usdt_bep20_recharge','recharge') AND l.flow='credit') deposit_count,
          COALESCE(SUM(CASE WHEN l.type='package_purchase' AND l.flow='debit' THEN l.amount ELSE 0 END),0) total_package_purchases,
          COUNT(*) FILTER(WHERE l.type='package_purchase' AND l.flow='debit') purchase_count,
          COALESCE((SELECT SUM(fund_wallet) FROM wallets),0) available_usdt,
          COALESCE((SELECT SUM(income_wallet) FROM wallets),0) income_wallet,
          COALESCE((SELECT SUM(basic_package_active) FROM wallets),0) active_basic,
          COALESCE((SELECT SUM(fd_package_active) FROM wallets),0) active_fd,
          COALESCE((SELECT SUM(total_roi_income) FROM wallets),0) roi_income,
          COALESCE((SELECT SUM(total_level_income) FROM wallets),0) level_income,
          COALESCE((SELECT SUM(referral_income) FROM wallets),0) referral_income,
          COALESCE((SELECT SUM(total_salary) FROM wallets),0) salary_income
          FROM ledger_transactions l`)
      ]);
      const s=summary.rows[0]||{};
      return json(res,200,{generatedAt:new Date().toISOString(),summary:{
        totalDeposits:Number(s.total_deposits||0),totalPackagePurchases:Number(s.total_package_purchases||0),depositCount:Number(s.deposit_count||0),purchaseCount:Number(s.purchase_count||0),availableUsdt:Number(s.available_usdt||0),incomeWallet:Number(s.income_wallet||0),activeBasic:Number(s.active_basic||0),activeFd:Number(s.active_fd||0),roiIncome:Number(s.roi_income||0),levelIncome:Number(s.level_income||0),referralIncome:Number(s.referral_income||0),salaryIncome:Number(s.salary_income||0)},ledger:ledger.rows,purchases:purchases.rows,wallets:wallets.rows,incomes:incomes.rows,salaryRules:rules.rows,salaryRanks});
    }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  }catch(error){console.error('admin-finance-report failed',error);return json(res,500,{error:'Unable to load live finance report'});}
}
