import { db, email } from 'hatchable';
import { getCase } from 'lib/case.js';
import { sendTwilio } from 'lib/integrations.js';
export const access='user'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.user.id);if(!c)return res.status(404).json({error:'Case not found.'});
 const id=String(req.body?.attempt_id||'').trim();const approval=String(req.body?.approval_token||'').trim();if(approval!=='USER_APPROVED')return res.status(409).json({error:'RecoverIT needs your explicit approval before contacting an external organization.'});
 const ar=await db.query('SELECT * FROM dispute_attempts WHERE id=$1 AND case_id=$2 AND user_id=$3',[id,c.id,req.user.id]);const a=ar.rows[0];if(!a)return res.status(404).json({error:'Dispute attempt not found.'});
 if(a.status==='SENT'||a.status==='RESOLVED')return res.json({ok:true,status:a.status,idempotent:true});
 const emailTarget=a.channel.includes('EMAIL')?String(req.body?.destination||a.destination).trim():'';
 try{
  const requestedChannel=String(req.body?.channel||'').toLowerCase();
  if(a.channel==='EMAIL_OR_PORTAL' && (requestedChannel==='email'||emailTarget.includes('@'))){const target=emailTarget.includes('@')?emailTarget:String(a.destination);if(!target.includes('@'))return res.status(409).json({status:'GUIDED',message:'Use the official portal route shown in RecoverIT for this organization.'});await email.send({to:target,subject:a.subject,html:`<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${a.body.replace(/[&<>]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[x]))}</div>`});}
  else if(a.channel.includes('WHATSAPP')||a.channel.includes('SMS')){const channel=requestedChannel==='sms'?'sms':(requestedChannel==='whatsapp'?'whatsapp':(a.channel.includes('WHATSAPP')?'whatsapp':'sms'));const target=String(req.body?.destination||'').trim();if(!target)throw Error('A destination is required for SMS/WhatsApp.');const out=await sendTwilio(channel,target,a.body);if(!out.ok)throw Error(out.error||'Communication provider unavailable.');}
  else return res.status(409).json({status:'GUIDED',message:'This organization requires the official portal/app route. RecoverIT prepared the complete complaint package; open the official route, submit it, and paste the acknowledgement number back into RecoverIT.'});
  await db.query('UPDATE dispute_attempts SET status=$1,sent_at=now(),next_follow_up_at=now()+interval \'72 hours\' WHERE id=$2',['SENT',a.id]);
  await db.query('UPDATE dispute_state SET phase=$1,waiting_for_user=$2,next_action=$3,next_action_at=now()+interval \'72 hours\',updated_at=now() WHERE case_id=$4',['AWAITING_RESPONSE',false,`Wait for ${a.organization} and capture the response or acknowledgement.`,c.id]);
  await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[c.id,'DISPUTE_SENT',`Contacted ${a.organization}`,`RecoverIT submitted the approved dispute request through ${a.channel}.`,'AWAITING_RESPONSE','RecoverIT']);
  res.json({ok:true,status:'SENT',organization:a.organization,next_follow_up_at:'72h'});
 }catch(e){await db.query('UPDATE dispute_attempts SET status=$1 WHERE id=$2',['FAILED',a.id]);res.status(503).json({error:'External organization contact failed.',detail:String(e.message||e)});}
}