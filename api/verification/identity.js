import { db } from 'hatchable';
import { notifyUser } from 'lib/user-notifications.js';

export const access='user';
export const methods=['POST'];

export default async function(req,res){
  const caseId=String(req.body?.case_id||'');
  if(!caseId)return res.status(400).json({error:'Case ID is required.'});

  const own=await db.query('SELECT id FROM recovery_cases WHERE id=$1 AND user_id=$2',[caseId,req.user.id]);
  if(!own.rows[0])return res.status(404).json({error:'Case not found.'});

  const profile=await db.query('SELECT email,name,email_verified_at FROM users WHERE id=$1',[req.user.id]);
  const user=profile.rows[0];
  if(!user)return res.status(404).json({error:'Account profile not found.'});

  const suppliedName=String(req.body?.name||'').trim();
  const normalize=(v)=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
  const emailVerified=Boolean(user.email_verified_at);
  const nameMatches=!user.name || !suppliedName || normalize(user.name)===normalize(suppliedName);

  if(!emailVerified){
    await db.query('UPDATE recovery_cases SET identity_status=$1,updated_at=now() WHERE id=$2',['EMAIL_VERIFICATION_REQUIRED',caseId]);
    return res.json({verified:false,status:'EMAIL_VERIFICATION_REQUIRED',email:user.email,name:user.name||null,message:'Your signed-in email has not been verified yet. Verify the account email and return to this case.'});
  }

  if(user.name && suppliedName && !nameMatches){
    await db.query('UPDATE recovery_cases SET identity_status=$1,updated_at=now() WHERE id=$2',['NAME_MISMATCH',caseId]);
    return res.json({verified:false,status:'NAME_MISMATCH',email:user.email,name:user.name,message:'The name you entered does not match the signed-in account profile.'});
  }

  await db.query('UPDATE recovery_cases SET identity_status=$1,identity_verified_at=now(),updated_at=now() WHERE id=$2',['VERIFIED_ACCOUNT',caseId]);
  await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[caseId,'IDENTITY_VERIFIED','User details verified','RecoverIT verified the signed-in account email before continuing the recovery investigation.','INVESTIGATING','RecoverIT']);
  await notifyUser({userId:req.user.id,caseId,type:'case_update',title:'Identity verified',description:'Your signed-in account was verified. RecoverIT can continue investigating this case.'});

  res.json({verified:true,status:'VERIFIED_ACCOUNT',email:user.email,name:user.name||null,message:'Your account details are verified.'});
}