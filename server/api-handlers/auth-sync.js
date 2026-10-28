import crypto from 'node:crypto';
import { getFirestoreAdmin, verifyFirebaseIdToken, getMaintenanceState } from '../../api/_lib/firebaseAdmin.js';
import { createSessionToken, sessionCookie } from '../../api/_lib/session.js';
import { sendWelcomeEmail } from '../../api/_lib/email.js';
import { syncMemberToNeon } from '../../api/_lib/syncMemberToNeon.js';
import { getPool, withTransaction } from '../../api/_lib/db.js';

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}

const SIGNUP_BONUS_USDT = 0.50;
async function creditSignupBonus(uid, email) {
  return await withTransaction(async (client) => {
    // Re-registering a previously deleted account may reuse the email, but must not
    // mint a second registration bonus for the same address.
    const priorDeletedAccount = await client.query(
      `SELECT 1 FROM audit_logs
       WHERE action='USER_DELETED_EMAIL_RELEASED' AND metadata->>'email'=$1
       LIMIT 1`,
      [String(email || '').trim().toLowerCase()],
    );
    if (priorDeletedAccount.rowCount) return { credited:false, amount:0, reason:'email previously registered' };
    const inserted = await client.query(
      `INSERT INTO ledger_transactions
        (id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
       VALUES ($1,$2,'joining_bonus','income_wallet','credit',$3,0,$3,$4,$5,'completed',$6::jsonb)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [`SIGNUP-BONUS-${uid}`, uid, SIGNUP_BONUS_USDT, 'New member registration bonus', `SIGNUP-BONUS-${uid}`, JSON.stringify({ asset:'USDT', source:'registration', bonusAmount:SIGNUP_BONUS_USDT })],
    );
    if (!inserted.rowCount) return { credited:false, amount:0 };
    await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [uid]);
    await client.query(
      'UPDATE wallets SET income_wallet=income_wallet+$2,total_income=total_income+$2,updated_at=NOW() WHERE user_id=$1',
      [uid, SIGNUP_BONUS_USDT],
    );
    await client.query(
      `INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
       VALUES($1,$2,$3,'SIGNUP_BONUS_CREDITED','ledger',$4,$5::jsonb)`,
      [crypto.randomUUID(), uid, email, `SIGNUP-BONUS-${uid}`, JSON.stringify({ amount:SIGNUP_BONUS_USDT, asset:'USDT' })],
    );
    return { credited:true, amount:SIGNUP_BONUS_USDT };
  });
}
function safeSponsor(value){const v=String(value||'').trim().toUpperCase();return /^GF\d{6}$/.test(v)?v:'';}
const SUB_ADMIN_UID='cqXqrEvo5UN2wD1qtxdO11JpJIK2';
const SUB_ADMIN_EMAIL='global@gf.online';
const isConfiguredSubAdmin=(uid,email)=>String(uid||'')===SUB_ADMIN_UID&&String(email||'').trim().toLowerCase()===SUB_ADMIN_EMAIL;
const FIRST_REFERRAL_NUMBER=201;
function formatReferralCode(number){return `GF${String(number).padStart(6,'0')}`;}
function generateTransactionPassword(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';let out='';for(let i=0;i<6;i++)out+=chars[crypto.randomInt(0,chars.length)];return out;}
function hashTransactionPassword(password){const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.scryptSync(password,salt,64).toString('hex');return `${salt}:${hash}`;}
function normalizePhone(value,country=''){const raw=String(value??'').trim();if(!raw)return null;const compact=raw.replace(/[\s().-]/g,'');if(!/^\+?\d{7,15}$/.test(compact))throw new Error('Please enter a valid mobile number.');let digits=compact.replace(/\D/g,'');if(String(country||'').toUpperCase()==='IN'){if(digits.startsWith('91')&&digits.length===12)digits=digits.slice(2);if(digits.length!==10)throw new Error('Enter a valid 10-digit Indian mobile number.');}return digits;}
function asIso(value){return value?.toDate?.()?.toISOString?.() || (value ? String(value) : new Date().toISOString());}
function mapProfile(data, uid){
  return {uid,name:data.name||'',email:data.email||'',phone:data.phone||undefined,country:data.country||undefined,
    referralCode:data.referralCode,sponsorId:data.sponsorId||undefined,sponsorName:data.sponsorName||undefined,
    rankCode:data.rankCode||'MEMBER',role:data.role||'user',status:data.status||'active',kycStatus:data.kycStatus||'unverified',
    panNumber:data.panNumber||undefined,bankAccount:data.bankAccount||undefined,bankName:data.bankName||undefined,
    ifscCode:data.ifscCode||undefined,upiId:data.upiId||undefined,createdAt:asIso(data.createdAt),updatedAt:asIso(data.updatedAt),uid};
}
function mapWallet(data,uid){
  const n=(v)=>Number(v||0);
  return {userId:uid,fundWallet:n(data.fundWallet),incomeWallet:n(data.incomeWallet),totalIncome:n(data.totalIncome),
    totalWithdrawal:n(data.totalWithdrawal),basicPackageActive:n(data.basicPackageActive),fdPackageActive:n(data.fdPackageActive),
    directTeamCount:n(data.directTeamCount),totalTeamCount:n(data.totalTeamCount),referralIncome:n(data.referralIncome),
    todayRoiIncome:n(data.todayRoiIncome),todayLevelIncome:n(data.todayLevelIncome),totalRoiIncome:n(data.totalRoiIncome),
    totalLevelIncome:n(data.totalLevelIncome),fdReferralIncome:n(data.fdReferralIncome),fdTodayRoiIncome:n(data.fdTodayRoiIncome),
    fdTodayLevelIncome:n(data.fdTodayLevelIncome),fdTotalRoiIncome:n(data.fdTotalRoiIncome),fdTotalLevelIncome:n(data.fdTotalLevelIncome),
    lockedMaturityPoints:n(data.lockedMaturityPoints),releasedMaturityPoints:n(data.releasedMaturityPoints),maturityPointsStatus:data.maturityPointsStatus||'none',maturityPointsReleasedAt:data.maturityPointsReleasedAt?asIso(data.maturityPointsReleasedAt):null,updatedAt:asIso(data.updatedAt)};
}
const emptyWallet=(uid,now)=>({userId:uid,fundWallet:0,incomeWallet:0,totalIncome:0,totalWithdrawal:0,basicPackageActive:0,fdPackageActive:0,
  directTeamCount:0,totalTeamCount:0,referralIncome:0,todayRoiIncome:0,todayLevelIncome:0,totalRoiIncome:0,totalLevelIncome:0,
  fdReferralIncome:0,fdTodayRoiIncome:0,fdTodayLevelIncome:0,fdTotalRoiIncome:0,fdTotalLevelIncome:0,lockedMaturityPoints:0,maturityPointsStatus:'none',maturityPointsReleasedAt:null,updatedAt:now});

async function memberLookup(identifier){
  const db=getFirestoreAdmin();
  const value=String(identifier||'').trim();
  const isMemberId=/^GF\d+$/i.test(value);
  if (!isMemberId) {
    const snap=await db.collection('users').where('email','==',value.toLowerCase()).limit(1).get();
    if(snap.empty) return null;
    return snap.docs[0].data()||null;
  }

  const normalized=value.toUpperCase();
  const byReferral=await db.collection('users').where('referralCode','==',normalized).limit(1).get();
  if(!byReferral.empty) return byReferral.docs[0].data()||null;
  const byMemberId=await db.collection('users').where('memberId','==',normalized).limit(1).get();
  if(!byMemberId.empty) return byMemberId.docs[0].data()||null;

  // Map current or old public IDs to the stable Firebase UID.
  const pool=getPool();
  const mapped=await pool.query(
    'SELECT id FROM users WHERE referral_code=$1 UNION SELECT user_id AS id FROM referral_id_aliases WHERE old_referral_code=$1 OR new_referral_code=$1 LIMIT 1',
    [normalized],
  );
  if(!mapped.rows.length) return null;
  const doc=await db.collection('users').doc(String(mapped.rows[0].id)).get();
  return doc.exists ? (doc.data()||null) : null;
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const maintenance=await getMaintenanceState();

    if(body.action==='member-login-lookup'){
      const profile=await memberLookup(body.memberId);
      if(!profile)return json(res,401,{error:'Invalid GF Member ID or password.'});
      return json(res,200,{email:profile.email});
    }

    const decoded=await verifyFirebaseIdToken(body.idToken);
    const uid=decoded.uid;
    const email=String(decoded.email||'').trim().toLowerCase();
    if(!uid||!email)return json(res,400,{error:'Verified account email is required'});

    const requestedName=String(body.name||decoded.name||email.split('@')[0]).trim().slice(0,255)||'Global Finance Member';
    const hasPhone=Object.prototype.hasOwnProperty.call(body,'phone');
    const country=Object.prototype.hasOwnProperty.call(body,'country')?String(body.country||'').trim().toUpperCase():null;
    const phone=hasPhone?normalizePhone(body.phone,country):null;
    if(country&&!/^[A-Z]{2}$/.test(country))return json(res,400,{error:'Please select a valid country.'});
    const sponsorCode=safeSponsor(body.sponsorCode);
    const configuredAdminEmails=Array.from(new Set([String(process.env.ADMIN_EMAIL||'').trim().toLowerCase(),'admin@gf.online','admin@gf.app'].filter(Boolean)));
    if(maintenance.maintenanceMode && !configuredAdminEmails.includes(email)){
      return json(res,503,{error:maintenance.message||'Member access is temporarily disabled for maintenance.',code:'MAINTENANCE_MODE'});
    }
    const db=getFirestoreAdmin();
    const now=new Date();
    let registrationTransactionPassword=null;
    let registrationEmail=null;

    const result=await db.runTransaction(async transaction=>{
      const userRef=db.collection('users').doc(uid);
      const walletRef=db.collection('wallets').doc(uid);
      const userSnap=await transaction.get(userRef);
      const walletSnap=await transaction.get(walletRef);

      // Enforce one primary mobile number per member account.
      // Firestore transaction reads make concurrent registrations conflict/retry.
      if(phone){
        const phoneMatches=await transaction.get(db.collection('users').where('phone','==',phone));
        if(phoneMatches.docs.some(doc=>doc.id!==uid)){
          const error=new Error('This mobile number is already registered. One mobile number can have only one Global Finance ID. Please sign in to the existing account.');
          error.statusCode=400;
          throw error;
        }
      }

      if(userSnap.exists){
        const current=userSnap.data()||{};
        const next={...current,email,name:requestedName,role:configuredAdminEmails.includes(email)?'admin':(isConfiguredSubAdmin(uid,email)?'sub_admin':(current.role||'user')),
          phone:hasPhone?phone:current.phone||null,country:country||current.country||null,updatedAt:now};
        transaction.set(userRef,next,{merge:true});
        if(!walletSnap.exists)transaction.set(walletRef,emptyWallet(uid,now));
        return {profile:{...current,...next},wallet:walletSnap.exists?(walletSnap.data()||{}):emptyWallet(uid,now),isNewRegistration:false};
      }

      // Existing users may sign in without a sponsor code. Every newly-created
      // member must have a valid, active sponsor; never silently create an orphan.
      if(!sponsorCode){
        const error=new Error('Sponsor Referral ID is required. Registration is only allowed with a valid sponsor ID.');
        error.statusCode=400;
        throw error;
      }
      let sponsorId=null,sponsorName=null,sponsorRef=null;
      if(sponsorCode){
        // Resolve old and canonical codes via Neon if Firestore still has a legacy ID.
        let sponsorQuery=await transaction.get(db.collection('users').where('referralCode','==',sponsorCode).limit(1));
        if(sponsorQuery.empty) sponsorQuery=await transaction.get(db.collection('users').where('memberId','==',sponsorCode).limit(1));
        if(sponsorQuery.empty){
          const pool=getPool();
          const mapped=await pool.query(
            'SELECT id FROM users WHERE referral_code=$1 UNION SELECT user_id AS id FROM referral_id_aliases WHERE old_referral_code=$1 OR new_referral_code=$1 LIMIT 1',
            [sponsorCode],
          );
          if(mapped.rows.length){
            const mappedDoc=await transaction.get(db.collection('users').doc(String(mapped.rows[0].id)));
            if(mappedDoc.exists) sponsorQuery={empty:false,docs:[mappedDoc]};
          }
        }
        if(!sponsorQuery.empty){
          const sponsorDoc=sponsorQuery.docs[0];
          const s=sponsorDoc.data()||{};
          const sponsorStatus=String(s.status??'').trim().toLowerCase();
          // Registration eligibility follows the sponsor's actual account status.
          // referralStatus controls income eligibility elsewhere; using it here
          // incorrectly rejects valid referral links for active members.
          if(!sponsorStatus || sponsorStatus==='active'){
            sponsorId=safeSponsor(s.referralCode||s.memberId||sponsorCode)||sponsorCode;
            sponsorName=String(s.name||s.displayName||s.fullName||'').trim()||null;
            sponsorRef=sponsorDoc.ref;
          }
        }
      }

      if(!sponsorRef || !sponsorId || !sponsorName){
        const error=new Error('Sponsor Referral ID was not found or is inactive. Please verify the ID before registering.');
        error.statusCode=400;
        throw error;
      }

      const sequenceRef=db.collection('_system').doc('referralSequence');
      const sequenceSnap=await transaction.get(sequenceRef);
      let candidateNumber=sequenceSnap.exists?Number(sequenceSnap.get('lastIssued')||FIRST_REFERRAL_NUMBER-1)+1:FIRST_REFERRAL_NUMBER;
      let code='';
      // Keep existing member IDs untouched and skip legacy IDs already in use.
      while(candidateNumber<=999999){
        const candidate=formatReferralCode(candidateNumber);
        const referralCollision=await transaction.get(db.collection('users').where('referralCode','==',candidate).limit(1));
        const memberIdCollision=await transaction.get(db.collection('users').where('memberId','==',candidate).limit(1));
        const neonCollision=await getPool().query('SELECT 1 FROM users WHERE referral_code=$1 LIMIT 1',[candidate]);
        if(referralCollision.empty&&memberIdCollision.empty&&neonCollision.rows.length===0){code=candidate;break;}
        candidateNumber++;
      }
      if(!code)throw new Error('Referral ID sequence exhausted');

      const issuedNumber=Number(code.slice(2));
      registrationTransactionPassword=generateTransactionPassword();
      const staffAccount=isConfiguredSubAdmin(uid,email);
      const profile={uid,email,name:requestedName,referralCode:code,memberId:code,sponsorId,sponsorName,role:configuredAdminEmails.includes(email)?'admin':(isConfiguredSubAdmin(uid,email)?'sub_admin':'user'),
        status:'active',referralStatus:staffAccount?'active':'inactive',kycStatus:configuredAdminEmails.includes(email)?'verified':'unverified',phone,country,rankCode:'MEMBER',
        transactionPasswordHash:hashTransactionPassword(registrationTransactionPassword),
        transactionPasswordCreatedAt:now,createdAt:now,updatedAt:now,storage:'firestore'};
      const wallet={...emptyWallet(uid,now),lockedMaturityPoints:staffAccount?0:150,maturityPointsStatus:staffAccount?'none':'locked',maturityPointsGrantedAt:staffAccount?null:now,maturityPointsReleasedAt:null};

      let sponsorWalletRef=null;
      let sponsorWalletSnap=null;
      if(sponsorRef){
        sponsorWalletRef=db.collection('wallets').doc(sponsorRef.id);
        sponsorWalletSnap=await transaction.get(sponsorWalletRef);
      }

      transaction.set(userRef,profile);
      transaction.set(walletRef,wallet);
      if(sequenceSnap.exists)transaction.set(sequenceRef,{lastIssued:issuedNumber,updatedAt:now},{merge:true});
      else transaction.set(sequenceRef,{lastIssued:issuedNumber,startsAt:'GF000201',updatedAt:now});

      const auditRef=db.collection('auditLogs').doc(crypto.randomUUID());
      transaction.set(auditRef,{actorUserId:uid,actorEmail:email,action:'USER_REGISTERED',entityType:'user',entityId:uid,
        metadata:{referralCode:code,sponsorId,sponsorName,role:profile.role,storage:'firestore',lockedMaturityPoints:150,maturityPointsStatus:'locked'},timestamp:now});
      if(sponsorRef&&sponsorWalletRef){
        const sw=sponsorWalletSnap?.exists?(sponsorWalletSnap.data()||{}):emptyWallet(sponsorRef.id,now);
        transaction.set(sponsorWalletRef,{...sw,directTeamCount:Number(sw.directTeamCount||0)+1,totalTeamCount:Number(sw.totalTeamCount||0)+1,updatedAt:now},{merge:true});
      }
      registrationEmail={email,name:requestedName,memberId:code,transactionPassword:registrationTransactionPassword};
      return {profile,wallet,isNewRegistration:true};
    });

    if(result.profile.status!=='active')return json(res,403,{error:'Account is suspended. Please contact support.'});

    // Neon contains canonical member IDs. Update Firestore when this existing
    // member signs in, without changing the stable Firebase UID or wallet data.
    const canonicalResult = await getPool().query(
      'SELECT referral_code, sponsor_id FROM users WHERE id=$1 LIMIT 1',
      [uid],
    );
    if (canonicalResult.rows.length) {
      const canonicalCode=canonicalResult.rows[0].referral_code;
      const canonicalSponsor=canonicalResult.rows[0].sponsor_id || result.profile.sponsorId || null;
      if (canonicalCode && (canonicalCode !== result.profile.referralCode || canonicalSponsor !== (result.profile.sponsorId || null))) {
        await db.collection('users').doc(uid).set({
          referralCode:canonicalCode, memberId:canonicalCode,
          sponsorId:canonicalSponsor, updatedAt:new Date(),
        }, {merge:true});
        result.profile={...result.profile,referralCode:canonicalCode,memberId:canonicalCode,sponsorId:canonicalSponsor};
      }
    }
    // Admin/network pages and financial APIs read Neon; wallet rows are created only when missing.
    await syncMemberToNeon(result.profile, result.wallet);
    if(result.isNewRegistration && result.profile.role==='user'){
      try {
        await creditSignupBonus(uid, email);
      } catch(error) {
        // Registration remains valid; the deterministic ledger ID makes safe retries possible.
        console.error('Signup bonus credit failed:',error instanceof Error?error.message:error);
      }
    }
    if(result.isNewRegistration&&registrationEmail){
      try {
        const emailResult = await sendWelcomeEmail({
          to: registrationEmail.email,
          name: registrationEmail.name,
          memberId: registrationEmail.memberId,
          transactionPassword: registrationEmail.transactionPassword,
        });
        if (emailResult?.sent) {
          console.info('Welcome email sent:', { uid, emailId: emailResult.id || null });
        } else {
          console.warn('Welcome email not sent:', { uid, reason: emailResult?.reason || 'provider_skipped' });
        }
      }
      catch(error){console.error('Welcome email failed:',error instanceof Error?error.message:error);}
    }

    const token=await createSessionToken({idToken:body.idToken});
    res.setHeader('Set-Cookie',sessionCookie(token));
    return json(res,200,{ok:true,profile:mapProfile(result.profile,uid),wallet:mapWallet(result.wallet,uid),isNewRegistration:result.isNewRegistration});
  }catch(error){
    console.error('auth-sync failed:',error instanceof Error?error.message:error);
    const status=Number(error?.statusCode)===400?400:500;
    return json(res,status,{error:status===400?error.message:'Unable to complete secure account synchronization.'});
  }
}
