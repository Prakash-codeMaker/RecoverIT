import { db, ai } from 'hatchable';
import { getCase, addEvent } from 'lib/case.js';
export const access='scheduler'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.body?.user_id); if(!c)return res.status(404).json({error:'Case not found.'});
 const ev=await db.query('SELECT title,detail,state,source,created_at FROM case_events WHERE case_id=$1 ORDER BY created_at ASC',[c.id]);
 const evidence=await db.query('SELECT filename,content_type,bytes,sha256 FROM evidence WHERE case_id=$1 ORDER BY created_at ASC',[c.id]);
 const provider=await db.query('SELECT provider,event_type,canonical_state,payload_json,received_at FROM provider_events WHERE payload_json::text ILIKE $1 ORDER BY received_at DESC LIMIT 10',['%'+String(c.transaction_reference||'')+'%']);
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2 WHERE case_id=$3 AND step_key=$4',['RUNNING','Comparing the story with the supplied proof.',c.id,'payment']);
 let explanation='Investigation completed using the available case evidence. No provider confirmation is assumed unless provider-side evidence is present.';
 try{
  const prompt=`You are the investigation engine for a payment-recovery service. Analyze ONLY supplied facts. Never invent provider confirmation and never declare a document authentic from appearance alone. Return: concise timeline; contradictions; evidence_consistency 0-100; likely_status; verified facts; unverified facts; safest next 3 user actions. Case: issue=${c.issue_type}; description=${c.description}; amount=${c.amount} ${c.currency}; merchant=${c.merchant_name||'unknown'}; reference=${c.transaction_reference||'unknown'}; method=${c.payment_method||'unknown'}. Uploaded evidence metadata=${JSON.stringify(evidence.rows)}. Provider-side events=${JSON.stringify(provider.rows)}. Previous events=${JSON.stringify(ev.rows.slice(-8))}.`;
  const out=await ai.generateText({model:'sonnet',prompt,purpose:'evidence-aware payment recovery investigation'}); explanation=String(out.text||out).slice(0,5000);
  const scoreMatch=explanation.match(/evidence_consistency[^0-9]*(\d{1,3})/i); const score=scoreMatch?Math.min(100,Number(scoreMatch[1])):null;
  if(score!==null) await db.query('UPDATE recovery_cases SET confidence_score=$1 WHERE id=$2',[score,c.id]);
 }catch(e){ explanation='AI investigation is temporarily unavailable. The case remains open and no provider state has been assumed. Next safest step: verify the transaction reference with the merchant/payment provider and upload their response.'; }
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=now() WHERE case_id=$3 AND step_key=$4',['DONE',explanation,c.id,'payment']);
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=now() WHERE case_id=$3 AND step_key=$4',['DONE',evidence.rows.length?'Evidence received; consistency review completed.':'No proof uploaded yet; evidence review cannot establish genuineness.',c.id,'timeline']);
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=now() WHERE case_id=$3 AND step_key=$4',[provider.rows.length?'DONE':'WAITING','Provider evidence '+(provider.rows.length?'found for comparison.':'is not available yet; connect the relevant provider/webhook or provide the transaction reference.'),c.id,'provider']);
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=now() WHERE case_id=$3 AND step_key=$4',['DONE',provider.rows.length?'Provider-side evidence was found. Follow the highlighted user actions and do not repeat a refund while an existing refund is unresolved.':'No provider confirmation is available yet. Use the transaction reference with the merchant/payment provider and upload their response.',c.id,'safe_path']);
 await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['INVESTIGATING',c.id]);
 await addEvent(c.id,'Investigation update',explanation,'INVESTIGATING',provider.rows.length?'Provider + RecoverIT':'RecoverIT');
 res.json({ok:true});
}