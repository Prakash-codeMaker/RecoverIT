import { db, email } from 'hatchable';
import { getCase } from 'lib/case.js';
import { sendTwilio } from 'lib/integrations.js';
export const access='member'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.member.id); if(!c)return res.status(404).json({error:'Case not found.'});
 const destination=String(req.body?.destination||'').trim(),channel=String(req.body?.channel||'email').toLowerCase(); const approval=String(req.body?.approval_token||'').trim();
 if(approval!=='USER_APPROVED')return res.status(409).json({error:'Explicit user approval is required before an escalation is delivered.'});
 const prep=await db.query('SELECT * FROM escalation_preparations WHERE case_id=$1 ORDER BY created_at DESC LIMIT 1',[c.id]);if(!prep.rows[0])return res.status(404).json({error:'Prepare the escalation first.'});
 const complaint=prep.rows[0].complaint;
 const ins=await db.query('INSERT INTO escalation_deliveries (case_id,user_id,destination,channel,status,payload) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',[c.id,req.member.id,destination,channel,'SENDING',JSON.stringify({complaint})]);
 try{
  if(channel==='email'){await email.send({to:destination,subject:`RecoverIT escalation · ${c.case_number}`,html:`<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${complaint.replace(/[&<>]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[x]))}</div>`});}
  else {const out=await sendTwilio(channel,destination,complaint);if(!out.ok)throw Error(out.error||'Communication provider unavailable.');}
  await db.query('UPDATE escalation_deliveries SET status=$1,sent_at=now() WHERE id=$2',['SENT',ins.rows[0].id]);res.json({ok:true,status:'SENT',delivery_id:ins.rows[0].id});
 }catch(e){await db.query('UPDATE escalation_deliveries SET status=$1,error=$2 WHERE id=$3',['FAILED',String(e.message||e),ins.rows[0].id]);res.status(503).json({error:'Escalation delivery failed.',detail:String(e.message||e)})}
}