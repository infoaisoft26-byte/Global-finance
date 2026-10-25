import { verifyFirebaseIdToken } from '../../api/_lib/firebaseAdmin.js';
import { getPool } from '../../api/_lib/db.js';
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}
async function auth(req,body){const h=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'');return verifyFirebaseIdToken(h||body.idToken||'');}
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method)) return json(res,405,{error:'Method not allowed'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const decoded=await auth(req,body); const uid=decoded.uid; if(!uid)return json(res,401,{error:'Sign in required'});
  const pool=getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS website_feedback (
   id BIGSERIAL PRIMARY KEY, user_id VARCHAR(128) NOT NULL UNIQUE,
   rating SMALLINT NOT NULL CHECK(rating BETWEEN 1 AND 5),
   website_experience VARCHAR(40), transaction_experience VARCHAR(40),
   comment VARCHAR(1200), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const user=await pool.query('SELECT id,role,name,email FROM users WHERE id=$1 LIMIT 1',[uid]);
  if(!user.rows.length)return json(res,403,{error:'Member account not found'});
  const isAdmin=['admin','super_admin','superadmin','sub_admin'].includes(String(user.rows[0].role||'').toLowerCase());
  if(req.method==='GET'){
   if(req.query?.admin==='1'){
    if(!isAdmin)return json(res,403,{error:'Admin access required'});
    const [stats,rows]=await Promise.all([
     pool.query('SELECT COUNT(*)::int total, COALESCE(ROUND(AVG(rating)::numeric,2),0) average, COUNT(*) FILTER(WHERE rating=5)::int five_star FROM website_feedback'),
     pool.query('SELECT f.id,f.rating,f.website_experience,f.transaction_experience,f.comment,f.created_at,u.name,u.email,u.referral_code FROM website_feedback f LEFT JOIN users u ON u.id=f.user_id ORDER BY f.created_at DESC LIMIT 500')
    ]);
    return json(res,200,{summary:{total:stats.rows[0].total,average_rating:stats.rows[0].average,five_star:stats.rows[0].five_star},feedback:rows.rows});
   }
   const r=await pool.query('SELECT rating,created_at FROM website_feedback WHERE user_id=$1',[uid]);
   return json(res,200,{submitted:!!r.rows.length,review:r.rows[0]||null});
  }
  const rating=Number(body.rating); if(!Number.isInteger(rating)||rating<1||rating>5)return json(res,400,{error:'Choose a rating from 1 to 5'});
  const website=String(body.websiteExperience||'').slice(0,40)||null;
  const transaction=String(body.transactionExperience||'').slice(0,40)||null;
  const comment=String(body.comment||'').trim().slice(0,1200)||null;
  const inserted=await pool.query('INSERT INTO website_feedback(user_id,rating,website_experience,transaction_experience,comment) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO NOTHING RETURNING id',[uid,rating,website,transaction,comment]);
  if(!inserted.rows.length)return json(res,409,{error:'You have already submitted your review'});
  return json(res,201,{success:true,message:'Thank you for your feedback!'});
 }catch(e){console.error('website-feedback error',e?.message||e);return json(res,500,{error:'Could not process feedback right now'});}
}