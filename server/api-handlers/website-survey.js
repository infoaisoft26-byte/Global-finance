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
  await pool.query(`CREATE TABLE IF NOT EXISTS website_survey_responses (
   id BIGSERIAL PRIMARY KEY, user_id VARCHAR(128) NOT NULL UNIQUE,
   answers JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const user=await pool.query('SELECT id,role,name,email,referral_code FROM users WHERE id=$1 LIMIT 1',[uid]);
  if(!user.rows.length)return json(res,403,{error:'Member account not found'});
  const isAdmin=['admin','super_admin','superadmin','sub_admin'].includes(String(user.rows[0].role||'').toLowerCase());
  if(req.method==='GET'){
   if(req.query?.admin==='1'){
    if(!isAdmin)return json(res,403,{error:'Admin access required'});
    const [stats,rows]=await Promise.all([
     pool.query('SELECT COUNT(*)::int total FROM website_survey_responses'),
     pool.query('SELECT s.id,s.answers,s.created_at,u.name,u.email,u.referral_code FROM website_survey_responses s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 1000')
    ]);
    return json(res,200,{summary:{total:stats.rows[0].total},surveys:rows.rows});
   }
   const r=await pool.query('SELECT created_at FROM website_survey_responses WHERE user_id=$1',[uid]);
   return json(res,200,{submitted:!!r.rows.length,submittedAt:r.rows[0]?.created_at||null});
  }
  if(isAdmin)return json(res,403,{error:'Members only'});
  const a=body.answers||{};
  const allowed=['overall','navigation','dashboard','transactions','feature','recommend'];
  if(allowed.some(k=>typeof a[k]!=='string'||!a[k].trim())||typeof a.suggestion!=='string')return json(res,400,{error:'Please answer all required survey questions'});
  const answers={overall:a.overall.slice(0,80),navigation:a.navigation.slice(0,80),dashboard:a.dashboard.slice(0,80),transactions:a.transactions.slice(0,80),feature:a.feature.slice(0,120),recommend:a.recommend.slice(0,80),suggestion:a.suggestion.trim().slice(0,1500)};
  const inserted=await pool.query('INSERT INTO website_survey_responses(user_id,answers) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO NOTHING RETURNING id',[uid,JSON.stringify(answers)]);
  if(!inserted.rows.length)return json(res,409,{error:'Survey already completed'});
  return json(res,201,{success:true,message:'Survey saved'});
 }catch(e){console.error('website-survey error',e?.message||e);return json(res,500,{error:'Could not process survey right now'});}
}