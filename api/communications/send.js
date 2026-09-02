import { db, email } from 'hatchable';
import { getCase } from 'lib/case.js';
import { sendTwilio } from 'lib/integrations.js';
export const access='user'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.user.id); if(!c)return res.status(404).json({error:'Case not found.'});
 const channel=String(req.body?.channel||'').toLowerCase(); const to=String(req.body?.to||'').trim(); const body=String(req.body?.body||'').trim(); if(!['email','sms','whatsapp'].includes(channel)||!to||!body)return res.status(400).json({error:'channel, destination and body are required.'});
 const ins=await db.query('INSERT INTO communication_messages (user_id,case_id,channel,direction,destination,provider,status,body) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[req.member.id,c.id,channel,'OUTBOUND',to,channel==='email'?'hatchable':'twilio','QUEUED',body]); const id=ins.rows[0].id;
 try{
  let out;
  if(channel==='email'){await email.send({to,subject:`RecoverIT case ${c.case_number}`,html:`<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${body.replace(/[&<>]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[x]))}</div>`});out={ok:true};}
  else out=await sendTwilio(channel,to,body);
  if(!out.ok){await db.query('UPDATE communication_messages SET status=$1,error=$2 WHERE id=$3',['FAILED',out.error||JSON.stringify(out.data||{}),id]);return res.status(503).json(out)}
  await db.query('UPDATE communication_messages SET status=$1,sent_at=now(),external_message_id=$2 WHERE id=$3',['SENT',out.data?.sid||null,id]); res.json({ok:true,message_id:id,provider_response:out.data||null});
 }catch(e){await db.query('UPDATE communication_messages SET status=$1,error=$2 WHERE id=$3',['FAILED',String(e.message||e),id]);res.status(500).json({error:'Message could not be sent.',detail:String(e.message||e)})}
}