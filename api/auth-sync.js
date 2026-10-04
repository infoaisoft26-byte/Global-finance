import crypto from 'node:crypto';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { withTransaction } from './_lib/db.js';
import { createSessionToken, sessionCookie } from './_lib/session.js';
import { sendWelcomeEmail } from './_lib/email.js';
import { ensureIncomeSchema } from './_lib/incomeEngine.js';

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));}
function safeSponsor(value){const v=String(value||'').trim().toUpperCase();return /^GF\d{6}$/.test(v)?v:'';}
function referralCode(){return `GF${Math.floor(100000+Math.random()*900000)}`;}
function normalizePhone(value){const raw=String(value??'').trim();if(!raw)return null;const compact=raw.replace(/[\\s()-]/g,'');if(!/^\\+?\\d{7,15}$/.test(compact))throw new Error('Please enter a valid mobile number.');return compact;}
function mapProfile(row,sponsorName){return {uid:row.id,name:row.name,email:row.email,phone:row.phone||undefined,secondPhone:row.second_phone||undefined,referralCode:row.referral_code,sponsorId:row.sponsor_id||undefined,sponsorName:sponsorName||undefined,rankCode:row.rank_code||'MEMBER',role:row.role,status:row.status,kycStatus:row.kyc_status,panNumber:row.pan_number||undefined,bankAccount:row.bank_account||undefined,bankName:row.bank_name||undefined,ifscCode:row.ifsc_code||undefined,upiId:row.upi_id||undefined,createdAt:row.created_at?.toISOString?.()||String(row.created_at),updatedAt:row.updated_at?.toISOString?.()||String(row.updated_at)};}
function mapWallet(row){return {
  userId:row.user_id,fundWallet:Number(row.fund_wallet||0),incomeWallet:Number(row.income_wallet||0),totalIncome:Number(row.total_income||0),totalWithdrawal:Number(row.total_withdrawal||0),
  basicPackageActive:Number(row.basic_package_active||0),fdPackageActive:Number(row.fd_package_active||0),directTeamCount:Number(row.direct_team_count||0),totalTeamCount:Number(row.total_team_count||0),
  referralIncome:Number(row.referral_income||0),todayRoiIncome:Number(row.today_roi_income||0),todayLevelIncome:Number(row.today_level_income||0),totalRoiIncome:Number(row.total_roi_income||0),totalLevelIncome:Number(row.total_level_income||0),
  fdReferralIncome:Number(row.fd_referral_income||0),fdTodayRoiIncome:Number(row.fd_today_roi_income||0),fdTodayLevelIncome:Number(row.fd_today_level_income||0),fdTotalRoiIncome:Number(row.fd_total_roi_income||0),fdTotalLevelIncome:Number(row.fd_total_level_income||0),
  updatedAt:row.updated_at?.toISOString?.()||String(row.updated_at)
};}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const decoded=await verifyFirebaseIdToken(body.idToken);
    const uid=decoded.uid;const email=String(decoded.email||'').trim().toLowerCase();
    if(!uid||!email)return json(res,400,{error:'Verified account email is required'});
    const requestedName=String(body.name||decoded.name||email.split('@')[0]).trim().slice(0,255)||'Global Finance Member';
    const hasPhone=Object.prototype.hasOwnProperty.call(body,'phone');
    const hasSecondPhone=Object.prototype.hasOwnProperty.call(body,'secondPhone');
    const phone=hasPhone?normalizePhone(body.phone):null;
    const secondPhone=hasSecondPhone?normalizePhone(body.secondPhone):null;
    if(phone&&secondPhone&&phone===secondPhone)throw new Error('Second mobile number must be different from the primary mobile number.');
    const sponsorCode=safeSponsor(body.sponsorCode);const configuredAdminEmail=String(process.env.ADMIN_EMAIL||'admin@gf.app').trim().toLowerCase();
    const result=await withTransaction(async client=>{
      await ensureIncomeSchema(client);
      let existing=await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[uid]);let isNewRegistration=false;
      if(!existing.rowCount){
        isNewRegistration=true;let sponsorId=null;let sponsorUserId=null;
        if(sponsorCode){const sponsor=await client.query(`SELECT id,referral_code FROM users WHERE referral_code=$1 AND status='active' LIMIT 1 FOR UPDATE`,[sponsorCode]);if(sponsor.rowCount){sponsorId=sponsorCode;sponsorUserId=sponsor.rows[0].id;}}
        let code='';for(let i=0;i<20;i++){const candidate=referralCode();const used=await client.query('SELECT 1 FROM users WHERE referral_code=$1',[candidate]);if(!used.rowCount){code=candidate;break;}}
        if(!code)throw new Error('Unable to allocate referral code');
        const role=email===configuredAdminEmail?'admin':'user';
        existing=await client.query(`INSERT INTO users(id,email,name,referral_code,sponsor_id,phone,second_phone,role,status,kyc_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active',$9) RETURNING *`,[uid,email,requestedName,code,sponsorId,phone,secondPhone,role,role==='admin'?'verified':'unverified']);
        await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[uid]);
        await client.query(`INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'USER_REGISTERED','user',$2,$4::jsonb)`,[crypto.randomUUID(),uid,email,JSON.stringify({referralCode:code,sponsorId,role})]);
        if(sponsorUserId&&role==='user'){
          await client.query(`UPDATE wallets SET direct_team_count=direct_team_count+1,total_team_count=total_team_count+1,updated_at=NOW() WHERE user_id=$1`,[sponsorUserId]);
          await client.query(`WITH RECURSIVE up AS (SELECT sponsor_id FROM users WHERE id=$1 AND sponsor_id IS NOT NULL UNION ALL SELECT u.sponsor_id FROM users u JOIN up x ON u.referral_code=x.sponsor_id WHERE u.sponsor_id IS NOT NULL) UPDATE wallets w SET total_team_count=total_team_count+1,updated_at=NOW() FROM users u WHERE w.user_id=u.id AND u.referral_code IN(SELECT sponsor_id FROM up) AND u.id<>$2`,[sponsorUserId,sponsorUserId]);
        }
      }else{
        const current=existing.rows[0];const promotedRole=email===configuredAdminEmail?'admin':current.role;
        existing=await client.query(`UPDATE users SET email=$2,name=$3,role=$4,phone=CASE WHEN $5 THEN $6 ELSE phone END,second_phone=CASE WHEN $7 THEN $8 ELSE second_phone END,updated_at=NOW() WHERE id=$1 RETURNING *`,[uid,email,requestedName,promotedRole,hasPhone,phone,hasSecondPhone,secondPhone]);
        await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[uid]);
      }
      const profile=existing.rows[0];if(profile.status!=='active')return{suspended:true,profile,isNewRegistration};
      const sponsorResult=profile.sponsor_id
        ? await client.query("SELECT name FROM users WHERE referral_code=$1 AND status='active' LIMIT 1",[profile.sponsor_id])
        : {rows:[]};
      const walletResult=await client.query('SELECT * FROM wallets WHERE user_id=$1 LIMIT 1',[uid]);return{suspended:false,profile,wallet:walletResult.rows[0],sponsorName:sponsorResult.rows[0]?.name||null,isNewRegistration};
    });
    if(result.suspended)return json(res,403,{error:'Account is suspended. Please contact support.'});
    if(result.isNewRegistration){try{await sendWelcomeEmail({to:result.profile.email,name:result.profile.name,memberId:result.profile.referral_code});}catch(emailError){console.error('Welcome email failed:',emailError instanceof Error?emailError.message:emailError);}}
    const token=await createSessionToken({idToken:body.idToken});res.setHeader('Set-Cookie',sessionCookie(token));
    return json(res,200,{ok:true,profile:mapProfile(result.profile,result.sponsorName),wallet:mapWallet(result.wallet)});
  }catch(error){console.error('auth-sync failed:',error instanceof Error?error.message:error);const message=error instanceof Error?error.message:'';if(message.includes('Database connection URL')||message.includes('DATABASE_URL'))return json(res,503,{error:'Login service database is not configured.'});return json(res,500,{error:'Unable to complete secure login.'});}
}
