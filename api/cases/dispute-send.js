import { db, email } from 'hatchable';
import { getCase } from 'lib/case.js';
import { sendTwilio } from 'lib/integrations.js';
import { advanceCaseWorkflow } from 'lib/case-workflow.js';
export const access='user'; export const methods=['POST'];
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.user.id);if(!c)return res.status(404).json({error:'Case not found.'});
 const evidenceCheck=await db.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE ea.status='COMPLETED' AND COALESCE(ea.structured_data->>'verdict','')='VERIFIED' AND ea.confidence IS NOT NULL AND ea.confidence>=60)::int AS verified FROM evidence e LEFT JOIN evidence_analysis ea ON ea.evidence_id=e.id AND ea.analysis_type='document_understanding' WHERE e.case_id=$1",[c.id]);
 const ev=evidenceCheck.rows[0]||{total:0,verified:0};
 if(String(c.verification_state||'').toUpperCase()!=='VERIFIED'||Number(ev.total)!==Number(ev.verified)||Number(ev.total)===0)return res.status(409).json({error:'External contact is blocked until every attached document is positively verified.',code:'ALL_EVIDENCE_VERIFICATION_REQUIRED',next_action:'RecoverIT will verify the attached documents first. Replace any incorrect proof before approving contact.'});
 const id=String(req.body?.attempt_id||'').trim();const approval=String(req.body?.approval_token||'').trim();if(approval!=='USER_APPROVED')return res.status(409).json({error:'RecoverIT needs your explicit approval before contacting an external organization.'});
 const a=(await db.query('SELECT * FROM dispute_attempts WHERE id=$1 AND case_id=$2 AND user_id=$3',[id,c.id,req.user.id])).rows[0];if(!a)return res.status(404).json({error:'Dispute attempt not found.'});
 if(a.status==='SENT'||a.status==='RESOLVED')return res.json({ok:true,status:a.status,idempotent:true,organization:a.organization,external_reference:a.external_reference||null});
 const requestedChannel=String(req.body?.channel||'').toLowerCase();
 const channel=requestedChannel||(/WHATSAPP/i.test(a.channel)?'whatsapp':/SMS/i.test(a.channel)?'sms':/EMAIL/i.test(a.channel)?'email':'');
 if(channel==='email'&&!String(a.destination||'').includes('@'))return res.status(409).json({status:'GUIDED',message:'This organization requires its official portal route; RecoverIT cannot safely invent an email destination.'});
 const destination=String(a.destination||'').trim();
 if((channel==='sms'||channel==='whatsapp')&&!destination)return res.status(409).json({status:'GUIDED',message:'No verified phone destination is configured for this organization. Use the official route shown in RecoverIT.'});
 const msg=await db.query('INSERT INTO communication_messages (user_id,case_id,channel,direction,destination,provider,status,template_key,body,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[req.user.id,c.id,channel||'portal','OUTBOUND',destination||null,channel==='email'?'hatchable':'twilio','QUEUED','dispute_attempt',a.body,JSON.stringify({attempt_id:a.id,organization:a.organization,route_id:a.route_id,approval:true})]);
 try{
  let out={ok:false};
  if(channel==='email'){await email.send({to:destination,subject:a.subject||`RecoverIT dispute ${c.case_number}`,html:`<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${esc(a.body)}</div>`});out={ok:true,data:{provider:'hatchable'}};}
  else if(channel==='sms'||channel==='whatsapp')out=await sendTwilio(channel,destination,a.body);
  else return res.status(409).json({status:'GUIDED',message:'This organization requires the official portal/app route. RecoverIT prepared the complete complaint package; submit it there and paste the acknowledgement number back into RecoverIT.',attempt_id:a.id});
  if(!out.ok)throw Error(out.error||'Communication provider unavailable.');
  const ext=out.data?.sid||out.data?.id||null;
  await db.query('UPDATE communication_messages SET status=$1,sent_at=now(),external_message_id=$2 WHERE id=$3',['SENT',ext,msg.rows[0].id]);
  await db.query('UPDATE dispute_attempts SET status=$1,sent_at=now(),external_reference=COALESCE($2,external_reference),next_follow_up_at=now()+interval \'72 hours\' WHERE id=$3',['SENT',ext,a.id]);
  await db.query('INSERT INTO dispute_state (case_id,user_id,phase,current_level,current_attempt_id,waiting_for_user,next_action,next_action_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()+interval \'72 hours\') ON CONFLICT (case_id) DO UPDATE SET phase=$3,current_level=$4,current_attempt_id=$5,waiting_for_user=$6,next_action=$7,next_action_at=now()+interval \'72 hours\',updated_at=now()',[c.id,req.user.id,'AWAITING_RESPONSE',a.level,a.id,false,`Waiting for ${a.organization}. RecoverIT will process the next response or document automatically.`,]);
  await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[c.id,'DISPUTE_SENT',`Contacted ${a.organization}`,`RecoverIT sent the user-approved dispute through ${channel}.`,'AWAITING_RESPONSE','RecoverIT']);
  let workflow=null;try{workflow=await advanceCaseWorkflow(c.id,req.user.id,'external_contact_sent')}catch(_){ }
  res.json({ok:true,status:'SENT',organization:a.organization,channel,external_reference:ext,communication_message_id:msg.rows[0].id,next_follow_up_at:'72h',workflow});
 }catch(e){await db.query('UPDATE communication_messages SET status=$1,error=$2,failed_at=now() WHERE id=$3',['FAILED',String(e.message||e),msg.rows[0].id]);await db.query('UPDATE dispute_attempts SET status=$1 WHERE id=$2',['FAILED',a.id]);res.status(503).json({error:'External organization contact failed.',detail:String(e.message||e)});}
}