import { db, ai, scheduler } from 'hatchable';
import { getCase, addEvent } from 'lib/case.js';
export const access='scheduler'; export const methods=['POST'];

const stages=[
 {key:'payment',title:'Understanding the payment',detail:'Reading the story, amount, method and transaction references.'},
 {key:'timeline',title:'Reconstructing the timeline',detail:'Comparing your story with uploaded proof and recorded case events.'},
 {key:'provider',title:'Checking provider evidence',detail:'Looking for provider-side events that can confirm or contradict the reported state.'},
 {key:'safe_path',title:'Building your recovery plan',detail:'Turning verified facts into the safest next action for you.'}
];

export default async function(req,res){
 const body=req.body||{}; const c=await getCase(body.case_id,body.user_id); if(!c)return res.status(404).json({error:'Case not found.'});
 const stageIndex=Math.max(0,Math.min(stages.length-1,Number(body.stage||0)));
 const stage=stages[stageIndex];
 await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['INVESTIGATING',c.id]);
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['RUNNING',stage.detail,c.id,stage.key]);
 await addEvent(c.id,stage.title,stage.detail,'INVESTIGATING','RecoverIT');

 const ev=await db.query('SELECT title,detail,state,source,created_at FROM case_events WHERE case_id=$1 ORDER BY created_at ASC',[c.id]);
 const evidence=await db.query('SELECT filename,content_type,bytes,sha256 FROM evidence WHERE case_id=$1 ORDER BY created_at ASC',[c.id]);
 const provider=await db.query('SELECT provider,event_type,canonical_state,payload_json,received_at FROM provider_events WHERE payload_json::text ILIKE $1 ORDER BY received_at DESC LIMIT 10',['%'+String(c.transaction_reference||'')+'%']);

 if(stageIndex===0){
  await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=now() WHERE case_id=$3 AND step_key=$4',['DONE','Payment facts extracted from your report. No provider state has been assumed.',c.id,stage.key]);
  await db.query('UPDATE investigation_steps SET status=$1,detail=$2 WHERE case_id=$3 AND step_key=$4',['PENDING','Waiting for timeline reconstruction.',c.id,'timeline']);
  await scheduler.now('/api/cases/investigate-worker',{case_id:c.id,user_id:body.user_id,stage:1});
  return res.json({ok:true,stage:stage.key});
 }

 if(stageIndex===1){
  const detail=evidence.rows.length?`Compared ${evidence.rows.length} uploaded proof file(s) with the case story. Evidence consistency can be assessed, but file authenticity is not claimed from appearance alone.`:'No proof has been uploaded yet. The case can continue, but genuineness cannot be assessed without supporting evidence.';
  await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=now() WHERE case_id=$3 AND step_key=$4',['DONE',detail,c.id,stage.key]);
  await db.query('UPDATE investigation_steps SET status=$1,detail=$2 WHERE case_id=$3 AND step_key=$4',['PENDING','Checking for provider-side confirmation or contradiction.',c.id,'provider']);
  await addEvent(c.id,'Evidence review complete',detail,'INVESTIGATING','RecoverIT');
  await scheduler.now('/api/cases/investigate-worker',{case_id:c.id,user_id:body.user_id,stage:2});
  return res.json({ok:true,stage:stage.key});
 }

 if(stageIndex===2){
  const detail=provider.rows.length?`Found ${provider.rows.length} provider-side event(s) to compare with the reported transaction.`:'No provider-side confirmation is connected yet. RecoverIT will not pretend the payment or refund is confirmed.';
  await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=now() WHERE case_id=$3 AND step_key=$4',[provider.rows.length?'DONE':'WAITING',detail,c.id,stage.key]);
  await db.query('UPDATE investigation_steps SET status=$1,detail=$2 WHERE case_id=$3 AND step_key=$4',['PENDING','Turning the verified facts into the safest next step.',c.id,'safe_path']);
  await addEvent(c.id,'Provider check complete',detail,'INVESTIGATING',provider.rows.length?'Provider + RecoverIT':'RecoverIT');
  await scheduler.now('/api/cases/investigate-worker',{case_id:c.id,user_id:body.user_id,stage:3});
  return res.json({ok:true,stage:stage.key});
 }

 let explanation=''; let score=null;
 try{
  const prompt=`You are RecoverIT's evidence-aware payment investigation engine. Analyze ONLY supplied facts. Never invent provider confirmation and never declare a document authentic from appearance alone. Return a concise timeline, contradictions, evidence_consistency 0-100, verified facts, unverified facts, likely status, and the safest next 3 user actions. Case: issue=${c.issue_type}; description=${c.description}; amount=${c.amount} ${c.currency}; merchant=${c.merchant_name||'unknown'}; reference=${c.transaction_reference||'unknown'}; method=${c.payment_method||'unknown'}. Uploaded evidence=${JSON.stringify(evidence.rows)}. Provider events=${JSON.stringify(provider.rows)}. Recent events=${JSON.stringify(ev.rows.slice(-10))}.`;
  const out=await ai.generateText({model:'sonnet',prompt,purpose:'evidence-aware payment recovery investigation'}); explanation=String(out.text||out).slice(0,5000);
  const m=explanation.match(/evidence_consistency[^0-9]*(\d{1,3})/i); if(m)score=Math.min(100,Number(m[1]));
 }catch(e){ explanation=provider.rows.length?'Provider evidence is available, but the deeper AI reasoning layer is temporarily unavailable. Follow the verified provider state and do not repeat money movement while the state is unresolved.':'The deeper AI reasoning layer is temporarily unavailable. No provider confirmation has been assumed. Your safest next step is to provide the transaction reference and supporting proof to the merchant/payment provider, then upload their response here.'; }
 if(score!==null)await db.query('UPDATE recovery_cases SET confidence_score=$1 WHERE id=$2',[score,c.id]);
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=now() WHERE case_id=$3 AND step_key=$4',['DONE',explanation,c.id,stage.key]);
 await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['INVESTIGATING',c.id]);
 await addEvent(c.id,'Investigation guidance ready',explanation,'GUIDANCE',provider.rows.length?'Provider + RecoverIT':'RecoverIT');
 res.json({ok:true,stage:stage.key,complete:true});
}