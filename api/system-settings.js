// Secure production system-settings API backed by Firestore.
import crypto from 'node:crypto';
import { getFirestoreAdmin, verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

function normalizePayload(input={}){
  const data={...input};
  data.depositNetworkLabel='BNB Smart Chain (BEP20)';
  data.basicPackageEnabled=true;
  data.fdPackageEnabled=true;
  data.rechargeEnabled=false;
  data.withdrawalEnabled=true;
  data.minWithdrawal=2;
  data.withdrawalWindowStart='10:30';
  data.withdrawalWindowEnd='15:30';
  data.withdrawalTimezone='Asia/Kolkata';
  delete data.updatedBy;
  delete data.updatedAt;
  return data;
}

function isAdminEmail(email){
  const configured=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
  return [configured,'admin@gf.online','admin@gf.app'].filter(Boolean).includes(String(email||'').trim().toLowerCase());
}

async function authenticatedUser(req){
  const header=String(req.headers.authorization||'');
  const token=header.startsWith('Bearer ')?header.slice(7).trim():'';
  if(!token)throw new Error('Authentication required');
  return verifyFirebaseIdToken(token);
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{error:'Method not allowed'});
  try{
    const decoded=await authenticatedUser(req);
    const db=getFirestoreAdmin();
    const settingsRef=db.collection('system').doc('settings');
    const userRef=db.collection('users').doc(decoded.uid);
    const userSnap=await userRef.get();
    const user=userSnap.exists?(userSnap.data()||{}):{};
    const admin=isAdminEmail(decoded.email)||['admin','super_admin','administrator'].includes(String(user.role||'').toLowerCase());

    if(req.method==='GET'){
      if(!admin)return json(res,403,{error:'Admin permission required'});
      const snap=await settingsRef.get();
      if(!snap.exists)return json(res,200,{ok:true,settings:{}});
      const data=snap.data()||{};
      return json(res,200,{ok:true,settings:{
        ...data,
        updatedAt:data.updatedAt?.toDate?.()?.toISOString?.()||data.updatedAt||undefined
      }});
    }

    if(!admin||user.status==='suspended')return json(res,403,{error:'Admin permission required'});

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const settings=normalizePayload(body.settings||{});
    const now=new Date();

    await settingsRef.set({
      ...settings,
      updatedAt:now,
      updatedBy:decoded.uid,
      storage:'firestore'
    },{merge:true});

    await db.collection('auditLogs').doc(crypto.randomUUID()).set({
      actorUserId:decoded.uid,
      actorEmail:String(decoded.email||user.email||''),
      action:'SYSTEM_SETTINGS_UPDATED',
      entityType:'settings',
      entityId:'system/settings',
      metadata:{
        changedFields:Object.keys(body.settings||{}),
        depositNetwork:'BEP20',
        storage:'firestore'
      },
      timestamp:now
    });

    const saved=await settingsRef.get();
    const savedData=saved.data()||{};
    return json(res,200,{ok:true,settings:{
      ...savedData,
      updatedAt:savedData.updatedAt?.toDate?.()?.toISOString?.()||String(savedData.updatedAt||now.toISOString())
    }});
  }catch(error){
    const message=error instanceof Error?error.message:'Unable to process settings request';
    console.error('system-settings failed:',message);
    if(message==='Authentication required')return json(res,401,{error:message});
    return json(res,500,{error:'Unable to process system settings.'});
  }
}
