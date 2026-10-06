import crypto from 'node:crypto';
import { getFirestoreAdmin, verifyFirebaseIdToken, getMaintenanceState } from './_lib/firebaseAdmin.js';
import { createSessionToken, sessionCookie } from './_lib/session.js';
import { sendWelcomeEmail } from './_lib/email.js';

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}
function safeSponsor(value){const v=String(value||'').trim().toUpperCase();return /^GF\d{6}$/.test(v)?v:'';}
function referralCode(){return `GF${crypto.randomInt(100000,1000000)}`;}
function generateTransactionPassword(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';let out='';for(let i=0;i<6;i++)out+=chars[crypto.randomInt(0,chars.length)];return out;}
function hashTransactionPassword(password){const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.scryptSync(password,salt,64).toString('hex');return `${salt}:${hash}`;}
function normalizePhone(value){const raw=String(value??'').trim();if(!raw)return null;const compact=raw.replace(/[\s()-]/g,'');if(!/^\+?\d{7,15}$/.test(compact))throw new Error('Please enter a valid mobile number.');return compact;}
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
    updatedAt:asIso(data.updatedAt)};
}
const emptyWallet=(uid,now)=>({userId:uid,fundWallet:0,incomeWallet:0,totalIncome:0,totalWithdrawal:0,basicPackageActive:0,fdPackageActive:0,
  directTeamCount:0,totalTeamCount:0,referralIncome:0,todayRoiIncome:0,todayLevelIncome:0,totalRoiIncome:0,totalLevelIncome:0,
  fdReferralIncome:0,fdTodayRoiIncome:0,fdTodayLevelIncome:0,fdTotalRoiIncome:0,fdTotalLevelIncome:0,updatedAt:now});

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
  // Support both the current referralCode field and legacy memberId fields
  // so existing real accounts remain login-compatible after the Firestore migration.
  const byReferral=await db.collection('users').where('referralCode','==',normalized).limit(1).get();
  if(!byReferral.empty) return byReferral.docs[0].data()||null;

  const byMemberId=await db.collection('users').where('memberId','==',normalized).limit(1).get();
  if(!byMemberId.empty) return byMemberId.docs[0].data()||null;

  return null;
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
    const phone=hasPhone?normalizePhone(body.phone):null;
    const country=Object.prototype.hasOwnProperty.call(body,'country')?String(body.country||'').trim().toUpperCase():null;
    if(country&&!/^[A-Z]{2}$/.test(country))return json(res,400,{error:'Please select a valid country.'});
    const sponsorCode=safeSponsor(body.sponsorCode);
    const configuredAdminEmail=String(process.env.ADMIN_EMAIL||'admin@gf.app').trim().toLowerCase();
    if(maintenance.maintenanceMode && email!==configuredAdminEmail){
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

      if(userSnap.exists){
        const current=userSnap.data()||{};
        const next={...current,email,name:requestedName,role:email===configuredAdminEmail?'admin':(current.role||'user'),
          phone:hasPhone?phone:current.phone||null,country:country||current.country||null,updatedAt:now};
        transaction.set(userRef,next,{merge:true});
        if(!walletSnap.exists)transaction.set(walletRef,emptyWallet(uid,now));
        return {profile:{...current,...next},wallet:walletSnap.exists?(walletSnap.data()||{}):emptyWallet(uid,now),isNewRegistration:false};
      }

      let sponsorId=null,sponsorName=null,sponsorRef=null;
      if(sponsorCode){
        const sponsorQuery=await transaction.get(db.collection('users').where('referralCode','==',sponsorCode).limit(1));
        if(!sponsorQuery.empty){
          const s=sponsorQuery.docs[0].data()||{};
          if(s.status!=='suspended'){sponsorId=sponsorCode;sponsorName=s.name||null;sponsorRef=sponsorQuery.docs[0].ref;}
        }
      }

      let code=referralCode();
      const codeQuery=await transaction.get(db.collection('users').where('referralCode','==',code).limit(1));
      if(!codeQuery.empty)code=referralCode();

      registrationTransactionPassword=generateTransactionPassword();
      const profile={uid,email,name:requestedName,referralCode:code,sponsorId,sponsorName,role:email===configuredAdminEmail?'admin':'user',
        status:'active',kycStatus:email===configuredAdminEmail?'verified':'unverified',phone,country,rankCode:'MEMBER',
        transactionPasswordHash:hashTransactionPassword(registrationTransactionPassword),
        transactionPasswordCreatedAt:now,createdAt:now,updatedAt:now,storage:'firestore'};
      const wallet=emptyWallet(uid,now);
      transaction.set(userRef,profile);
      transaction.set(walletRef,wallet);

      const auditRef=db.collection('auditLogs').doc(crypto.randomUUID());
      transaction.set(auditRef,{actorUserId:uid,actorEmail:email,action:'USER_REGISTERED',entityType:'user',entityId:uid,
        metadata:{referralCode:code,sponsorId,role:profile.role,storage:'firestore'},timestamp:now});
      if(sponsorRef){
        const sponsorWalletRef=db.collection('wallets').doc(sponsorRef.id);
        const sponsorWalletSnap=await transaction.get(sponsorWalletRef);
        const sw=sponsorWalletSnap.exists?(sponsorWalletSnap.data()||{}):emptyWallet(sponsorRef.id,now);
        transaction.set(sponsorWalletRef,{...sw,directTeamCount:Number(sw.directTeamCount||0)+1,totalTeamCount:Number(sw.totalTeamCount||0)+1,updatedAt:now},{merge:true});
      }
      registrationEmail={email,name:requestedName,memberId:code,transactionPassword:registrationTransactionPassword};
      return {profile,wallet,isNewRegistration:true};
    });

    if(result.profile.status!=='active')return json(res,403,{error:'Account is suspended. Please contact support.'});
    if(result.isNewRegistration&&registrationEmail){
      try{await sendWelcomeEmail(registrationEmail);}
      catch(error){console.error('Welcome email failed:',error instanceof Error?error.message:error);}
    }

    const token=await createSessionToken({idToken:body.idToken});
    res.setHeader('Set-Cookie',sessionCookie(token));
    return json(res,200,{ok:true,profile:mapProfile(result.profile,uid),wallet:mapWallet(result.wallet,uid),isNewRegistration:result.isNewRegistration});
  }catch(error){
    console.error('auth-sync failed:',error instanceof Error?error.message:error);
    return json(res,500,{error:'Unable to complete secure account synchronization.'});
  }
}
