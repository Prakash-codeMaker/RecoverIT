import { db, ai, scheduler } from 'hatchable';
import { getCase, addEvent } from 'lib/case.js';
export const access='scheduler'; export const methods=['POST'];

const STEPS=[
  ['payment','Understand your story','We read what you told us and identify the payment facts.'],
  ['timeline','Check your proof','We compare receipts, screenshots and other evidence with your story.'],
  ['provider','Check payment status','We look for provider-side events that can confirm or contradict the reported state.'],
  ['safe_path','Work out what to do','We turn verified facts into the safest next step for you.']
];

async function setStep(id,key,status,detail){
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=$3 WHERE case_id=$4 AND step_key=$5',[status,detail,status==='DONE'?new Date().toISOString():null,id,key]);
}
async function scheduleNext(caseId,userId){
 await scheduler.at(new Date(Date.now()+1200).toISOString(),'/api/cases/investigate-worker',{payload:{case_id:caseId,user_id:userId}});
}

export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.body?.user_id); if(!c)return res.status(404).json({error:'Case not found.'});
 const steps=await db.query('SELECT step_key,status,detail FROM investigation_steps WHERE case_id=$1 ORDER BY created_at ASC',[c.id]);
 const current=STEPS.find(s=>{const row=steps.rows.find(x=>x.step_key===s[0]);return row && row.status!=='DONE';});
 if(!current){
   await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['WAITING_FOR_USER',c.id]);
   return res.json({ok:true,status:'WAITING_FOR_USER',complete:true});
 }
 const [key,title]=current;
 const evidence=await db.query('SELECT filename,content_type,bytes,sha256 FROM evidence WHERE case_id=$1 ORDER BY created_at ASC',[c.id]);
 const provider=await db.query('SELECT provider,event_type,canonical_state,payload_json,received_at FROM provider_events WHERE payload_json::text ILIKE $1 ORDER BY received_at DESC LIMIT 10',['%'+String(c.transaction_reference||'')+'%']);
 const previous=await db.query('SELECT title,detail,state,source,created_at FROM case_events WHERE case_id=$1 ORDER BY created_at DESC LIMIT 8',[c.id]);

 await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['INVESTIGATING',c.id]);
 await setStep(c.id,key,'RUNNING', key==='payment'?'Reading your story and extracting the payment facts.':key==='timeline'?'Comparing your proof with the story you gave us.':key==='provider'?'Checking available provider-side events for this transaction.':'Turning verified facts into a safe action plan.');
 await addEvent(c.id,title, key==='payment'?'RecoverIT is reading your story and identifying the important facts.':key==='timeline'?'RecoverIT is comparing your uploaded proof with the reported problem.':key==='provider'?'RecoverIT is checking whether provider-side evidence confirms or conflicts with the story.':'RecoverIT is preparing the safest next step based only on verified facts.','INVESTIGATING','RecoverIT');

 let detail='';
 if(key==='payment'){
   detail=`We captured the report: “${String(c.description||'').slice(0,280)}” Amount: ${c.amount||'not provided'} ${c.currency||''}. Merchant: ${c.merchant_name||'not provided'}. Transaction reference: ${c.transaction_reference||'not provided'}.`;
 } else if(key==='timeline'){
   detail=evidence.rows.length?`Compared ${evidence.rows.length} uploaded proof file(s) with the case story. Evidence consistency can be assessed, but a file is not declared authentic from appearance alone.`:'No proof is attached yet. We cannot establish what happened from the story alone.';
 } else if(key==='provider'){
   detail=provider.rows.length?`Found ${provider.rows.length} provider-side event(s) connected to the supplied reference. These will be compared with the reported refund/payment state.`:'No provider-side confirmation is connected yet. RecoverIT will not pretend that a payment or refund is confirmed.';
 } else {
   try{
     const prompt=`You are RecoverIT's evidence-aware recovery investigator. Analyze ONLY the supplied facts. Never invent provider confirmation and never call a document authentic merely from appearance. Return a plain-English recovery update with: what is verified, what is still unknown, whether evidence is consistent or conflicting, and the safest 3 next actions. Case: issue=${c.issue_type}; description=${c.description}; amount=${c.amount} ${c.currency}; merchant=${c.merchant_name||'unknown'}; reference=${c.transaction_reference||'unknown'}; method=${c.payment_method||'unknown'}. Uploaded evidence=${JSON.stringify(evidence.rows)}. Provider events=${JSON.stringify(provider.rows)}. Recent timeline=${JSON.stringify(previous.rows)}.`;
     const out=await ai.generateText({model:'sonnet',prompt,purpose:'continuous payment recovery guidance'}); detail=String(out.text||out).slice(0,5000);
     const scoreMatch=detail.match(/(?:consisten(?:cy|t)|confidence)[^0-9]{0,30}(\d{1,3})/i); if(scoreMatch) await db.query('UPDATE recovery_cases SET confidence_score=$1 WHERE id=$2',[Math.min(100,Number(scoreMatch[1])),c.id]);
   }catch(e){ detail=provider.rows.length?'Provider evidence is available. RecoverIT will keep the case open while it compares the provider state with your proof.':'The deeper reasoning service is temporarily unavailable. No provider state has been assumed. Your safest next step is to provide the transaction/reference number to the merchant or payment provider and upload their response.'; }
 }
 await setStep(c.id,key,'DONE',detail);
 await db.query('UPDATE recovery_cases SET updated_at=now() WHERE id=$1',[c.id]);
 await addEvent(c.id, key==='payment'?'Payment facts captured':key==='timeline'?'Evidence review updated':key==='provider'?'Provider check updated':'Recovery guidance updated',detail,'INVESTIGATING',provider.rows.length?'Provider + RecoverIT':'RecoverIT');
 const next=STEPS.findIndex(s=>s[0]===key)+1;
 if(next<STEPS.length) await scheduleNext(c.id,c.user_id); else {
   const waiting=provider.rows.length===0;
   await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',[waiting?'WAITING_FOR_USER':'INVESTIGATING',c.id]);
   await addEvent(c.id,waiting?'Action needed':'Investigation pass complete',waiting?'Please add the provider transaction/refund reference or upload the merchant/provider response. RecoverIT will continue when new evidence is added.':'This investigation pass is complete. The case remains open so new evidence can be checked as it arrives.','INVESTIGATING','RecoverIT');
 }
 res.json({ok:true,status:'INVESTIGATING',step:key});
}