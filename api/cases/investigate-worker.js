import { db, scheduler, email } from 'hatchable';
import { generateJSON } from 'lib/recoverit-ai.js';
import { getCase, addEvent } from 'lib/case.js';

export const access='scheduler';
export const methods=['POST'];

const STEPS=[
  ['payment','Understand your story'],
  ['timeline','Check your proof'],
  ['provider','Verify payment status'],
  ['safe_path','Build the recovery plan']
];

function cleanText(value,max=5000){return String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,' ').slice(0,max);}
function extractJson(text){
  const raw=String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(raw)}catch(_){
    const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
    if(start>=0&&end>start){try{return JSON.parse(raw.slice(start,end+1))}catch(_2){}}
    return null;
  }
}
async function setStep(id,key,status,detail){
  await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=$3 WHERE case_id=$4 AND step_key=$5',[status,detail,status==='DONE'?new Date().toISOString():null,id,key]);
}
async function scheduleNext(caseId,userId){
  await scheduler.at(new Date(Date.now()+1200).toISOString(),'/api/cases/investigate-worker',{payload:{case_id:caseId,user_id:userId}});
}
async function notify(userId,caseId,title,description){
  const recent=await db.query('SELECT id FROM notifications WHERE user_id=$1 AND case_id=$2 AND title=$3 AND created_at>now()-interval \'6 hours\' LIMIT 1',[userId,caseId,title]);
  if(recent.rows[0])return;
  await db.query('INSERT INTO notifications (user_id,case_id,type,title,description) VALUES ($1,$2,$3,$4,$5)',[userId,caseId,'case_update',title,description]);
  const user=await db.query('SELECT email FROM users WHERE id=$1',[userId]);
  const to=user.rows[0]?.email;
  if(to){try{await email.send({to,subject:`RecoverIT · ${title}`,html:`<div style="font-family:Arial,sans-serif;max-width:620px"><h2>${title}</h2><p>${description}</p><p><a href="https://recoverit.hatchable.site/case.html?case_id=${encodeURIComponent(caseId)}">Open your RecoverIT case</a></p></div>`});}catch(_){/* in-app notification remains authoritative */}}
}
async function aiInvestigate(c,step,evidence,provider,previous){
  const facts={
    issue_type:c.issue_type,description:cleanText(c.description,3000),amount:c.amount,currency:c.currency,
    merchant:c.merchant_name||null,transaction_reference:c.transaction_reference||null,payment_method:c.payment_method||null,
    evidence:evidence.map(x=>({filename:x.filename,content_type:x.content_type,bytes:x.bytes,sha256:x.sha256})),
    provider_events:provider.map(x=>({provider:x.provider,event_type:x.event_type,canonical_state:x.canonical_state,payload:x.payload_json,received_at:x.received_at})),
    recent_timeline:previous.map(x=>({title:x.title,detail:cleanText(x.detail,800),state:x.state,source:x.source,created_at:x.created_at}))
  };
  const instructions={
    payment:'Extract the payment facts from the customer story. Do not invent missing values. Flag ambiguity and return normalized facts.',
    timeline:'Assess whether the supplied proof metadata and case story are consistent. A filename, hash, file type or presence alone is NOT proof of authenticity. Identify what can and cannot be established.',
    provider:'Compare provider-side events against the customer story. Treat provider events as stronger operational evidence than the customer narrative, but do not infer a successful refund/payment unless the event state supports it. Identify contradictions.',
    safe_path:'Synthesize the investigation. State verified facts, unresolved facts, contradictions, confidence from 0-100, and the safest next actions. Never recommend a money-moving action solely from an AI guess.'
  };
  const schema=step==='payment'
    ? '{"summary":"string","facts":[{"field":"string","value":"string","status":"verified|reported|unknown"}],"confidence":0,"unknowns":["string"]}'
    : step==='safe_path'
    ? '{"summary":"string","findings":[{"text":"string","status":"verified|reported|conflict|unknown"}],"next_steps":["string"],"confidence":0}'
    : '{"summary":"string","findings":[{"text":"string","status":"verified|reported|conflict|unknown"}],"unknowns":["string"],"confidence":0}';
  const prompt=`You are RecoverIT's payment investigator. Perform ONE fast, evidence-aware pass using ONLY the supplied case data. Separate verified facts from user reports. Never invent a payment, refund, fee, or provider requirement. If something essential is missing, ask for only that information. Keep every string short.

CASE DATA:\n${JSON.stringify(facts)}\n\nReturn ONLY compact valid JSON, no markdown:\n{"summary":"<=200 chars","findings":[{"text":"<=160 chars","status":"verified|reported|conflict|unknown"}],"next_steps":["<=160 chars"],"confidence":0,"needs_user":false,"user_request":"<=200 chars"}`;
  try{
    const out=await generateJSON({prompt,purpose:'payment-investigation',userId:c.user_id,maxTokens:1000});
    let parsed=out.parsed;
    if(!parsed){
      const retryPrompt=`Analyze this RecoverIT case quickly and return ONLY valid JSON. Never invent facts. If information is missing, ask only for the smallest useful detail.\nCase: ${JSON.stringify({issue_type:c.issue_type,description:cleanText(c.description,1800),amount:c.amount,currency:c.currency,merchant:c.merchant_name||null,transaction_reference:c.transaction_reference||null,payment_method:c.payment_method||null,evidence_count:evidence.length,provider_events:provider.length})}\nJSON: {"summary":"short","findings":[{"text":"short","status":"verified|reported|conflict|unknown"}],"next_steps":["short"],"confidence":0,"needs_user":false,"user_request":"short"}`;
      const retry=await generateJSON({prompt:retryPrompt,purpose:'payment-investigation-retry',userId:c.user_id,maxTokens:600});
      parsed=retry.parsed;
    }
    if(!parsed)throw new Error('AI returned invalid investigation JSON.');
    return {...parsed,ai_provider:out.provider||null};
  }catch(error){
    const hasReference=Boolean(String(c.transaction_reference||'').trim());
    const hasEvidence=evidence.length>0;
    if(!hasReference&&!hasEvidence){
      return {summary:'The case is missing the payment signal needed for verification.',findings:[{text:'The user-reported issue has not been independently verified.',status:'reported'}],next_steps:['Provide the UTR/RRN/transaction reference or upload proof.', 'Add the provider or merchant response if available.'],confidence:0,needs_user:true,user_request:'Please provide the UTR/RRN/transaction reference or upload proof of the reported request.'};
    }
    return {available:false,summary:'RecoverIT could not complete the AI reasoning pass, but no unsupported payment state has been assumed. The case remains open and will retry automatically.',findings:[{text:'The available case information has not been converted into a final payment conclusion.',status:'unknown'}],unknowns:['AI reasoning result unavailable on this pass.'],next_steps:['RecoverIT will retry automatically. No action is required unless new evidence is available.'],confidence:0};
  }
}

export default async function(req,res){
  if(!req.body?.case_id){
    const active=await db.query("SELECT id,user_id FROM recovery_cases WHERE status='INVESTIGATING' AND transaction_reference IS NOT NULL ORDER BY updated_at ASC LIMIT 25");
    for(const row of active.rows) await scheduler.now('/api/cases/investigate-worker',{case_id:row.id,user_id:row.user_id});
    return res.json({ok:true,monitored_cases:active.rows.length});
  }
  const c=await getCase(req.body?.case_id,req.body?.user_id);
  if(!c)return res.status(404).json({error:'Case not found.'});

  const identity=await db.query('SELECT email_verified_at FROM users WHERE id=$1',[c.user_id]);
  if(!identity.rows[0]?.email_verified_at){
    await db.query('UPDATE recovery_cases SET status=$1,identity_status=$2,updated_at=now() WHERE id=$3',['WAITING_FOR_USER','EMAIL_VERIFICATION_REQUIRED',c.id]);
    await addEvent(c.id,'Identity verification required','RecoverIT paused the investigation until the signed-in account email is verified.','WAITING_FOR_USER','RecoverIT');
    await notify(c.user_id,c.id,'Verify your account details','Verify the email used for this RecoverIT account. Once verified, the investigation will continue automatically.');
    return res.json({ok:true,status:'WAITING_FOR_USER',reason:'EMAIL_VERIFICATION_REQUIRED'});
  }
  if(c.identity_status!=='VERIFIED_ACCOUNT'){
    await db.query('UPDATE recovery_cases SET identity_status=$1,identity_verified_at=now(),updated_at=now() WHERE id=$2',['VERIFIED_ACCOUNT',c.id]);
    await addEvent(c.id,'Identity verified','RecoverIT verified the signed-in account email before continuing the investigation.','INVESTIGATING','RecoverIT');
    await notify(c.user_id,c.id,'Identity verified','Your signed-in account is verified. RecoverIT is continuing the investigation.');
  }

  const steps=await db.query('SELECT step_key,status,detail FROM investigation_steps WHERE case_id=$1 ORDER BY created_at ASC',[c.id]);
  let current=STEPS.find(s=>{const row=steps.rows.find(x=>x.step_key===s[0]);return row&&row.status!=='DONE';});
  if(!current){
    const reference=String(c.transaction_reference||'').trim();
    if(!reference){
      await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['WAITING_FOR_USER',c.id]);
      await addEvent(c.id,'More detail required','RecoverIT needs the transaction/reference number or a provider response before it can verify the payment-side trail.','WAITING_FOR_USER','RecoverIT');
      await notify(c.user_id,c.id,'One detail is needed','Add the transaction/reference number or paste the provider response. RecoverIT will continue automatically after you add it.');
      return res.json({ok:true,status:'WAITING_FOR_USER',reason:'REFERENCE_REQUIRED'});
    }
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['RUNNING','New provider information may have arrived. RecoverIT is checking again.',c.id,'provider']);
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['QUEUED','Waiting for the latest provider reconciliation.',c.id,'safe_path']);
    current=STEPS.find(s=>s[0]==='provider');
  }

  const [key,title]=current;
  if(key==='provider' && !String(c.transaction_reference||'').trim()){
    await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['WAITING_FOR_USER',c.id]);
    await addEvent(c.id,'Transaction reference required','RecoverIT reviewed the available story and proof, but provider reconciliation requires a UTR/RRN/transaction reference or provider response.','WAITING_FOR_USER','RecoverIT');
    await notify(c.user_id,c.id,'Transaction reference needed','Add the UTR/RRN/transaction reference or paste the provider response. RecoverIT will continue automatically after you provide it.');
    return res.json({ok:true,status:'WAITING_FOR_USER',reason:'REFERENCE_REQUIRED'});
  }
  const evidence=(await db.query('SELECT filename,content_type,bytes,sha256 FROM evidence WHERE case_id=$1 ORDER BY created_at ASC',[c.id])).rows;
  const evidenceAnalysis=(await db.query('SELECT evidence_id,status,structured_data,confidence FROM evidence_analysis WHERE case_id=$1 AND analysis_type=$2 ORDER BY created_at ASC',[c.id,'document_understanding'])).rows;
  const rejectedEvidence=evidenceAnalysis.filter(x=>String(x.structured_data?.verdict||'').toUpperCase()==='REJECT');
  const verifiedEvidence=evidenceAnalysis.filter(x=>String(x.structured_data?.verdict||'').toUpperCase()==='VERIFIED');
  const reference=String(c.transaction_reference||'').trim();
  if(evidence.length && rejectedEvidence.length===evidence.length){
    const message='The uploaded proof could not be matched to the reported payment. RecoverIT has paused the investigation instead of treating the proof as valid.';
    await db.query('UPDATE recovery_cases SET status=$1,ai_status=$2,ai_summary=$3,updated_at=now() WHERE id=$4',['WAITING_FOR_USER','EVIDENCE_REJECTED',message,c.id]);
    await addEvent(c.id,'Proof needs replacement',message,'WAITING_FOR_USER','RecoverIT');
    await notify(c.user_id,c.id,'Proof could not be verified','Upload a clearer or relevant payment receipt, bank statement, UPI screen, merchant message, or refund message.');
    return res.json({ok:true,status:'WAITING_FOR_USER',reason:'EVIDENCE_REJECTED'});
  }
  if(key==='payment' && !reference && evidence.length===0){
    const message='We captured your story, but we cannot verify the payment request yet. Upload a screenshot, receipt, invoice, provider message, or provide the UTR/RRN/transaction reference. RecoverIT will continue automatically once we have a verifiable signal.';
    await db.query('UPDATE recovery_cases SET status=$1,ai_status=$2,ai_summary=$3,ai_findings=$4::jsonb,ai_next_steps=$5::jsonb,ai_confidence=NULL,confidence_score=NULL,updated_at=now() WHERE id=$6',['WAITING_FOR_USER','NEEDS_EVIDENCE',message,JSON.stringify([{text:'The reported payment request has not been independently verified.',status:'reported'},{text:'No proof or transaction reference is available yet.',status:'unknown'}]),JSON.stringify(['Upload proof of the payment request.','Provide the UTR/RRN/transaction reference or provider response if available.']),c.id]);
    await setStep(c.id,key,'DONE',message);
    await addEvent(c.id,'Evidence needed',message,'WAITING_FOR_USER','RecoverIT');
    await notify(c.user_id,c.id,'Proof needed to verify your case',message);
    return res.json({ok:true,status:'WAITING_FOR_USER',step:key,needs_evidence:true});
  }
  const provider=(await db.query('SELECT provider,event_type,canonical_state,payload_json,received_at FROM provider_events WHERE payload_json::text ILIKE $1 ORDER BY received_at DESC LIMIT 20',['%'+reference+'%'])).rows;
  const previous=(await db.query('SELECT title,detail,state,source,created_at FROM case_events WHERE case_id=$1 ORDER BY created_at DESC LIMIT 12',[c.id])).rows;

  await db.query('UPDATE recovery_cases SET status=$1,updated_at=now(),ai_last_run_at=now() WHERE id=$2',['INVESTIGATING',c.id]);
  await setStep(c.id,key,'RUNNING',key==='payment'?'AI is extracting the payment facts from your story.':key==='timeline'?'AI is comparing your proof metadata with the reported timeline.':key==='provider'?'AI is reconciling provider events with the reported payment state.':'AI is synthesizing verified facts into a safe recovery plan.');
  await addEvent(c.id,title,key==='payment'?'RecoverIT AI is extracting and normalizing the payment facts.':key==='timeline'?'RecoverIT AI is reviewing the supplied proof against the case timeline.':key==='provider'?'RecoverIT AI is reconciling provider evidence with the reported state.':'RecoverIT AI is building the final evidence-aware recovery plan.','INVESTIGATING','RecoverIT AI');

  const result=await aiInvestigate(c,key,evidence,provider,previous);
  if(result.available===false){
    const missingReference=!String(c.transaction_reference||'').trim();
    const missingProof=evidence.length===0;
    const needsEvidence=missingReference&&missingProof;
    const providerState=provider[0]?.canonical_state||null;
    const message=needsEvidence ? 'We captured your story, but we cannot verify the request yet. Upload a receipt, statement, transaction screenshot, provider message, or provide the UTR/RRN/transaction reference. RecoverIT will continue automatically once we have a verifiable signal.' : missingReference ? 'We reviewed the available information, but provider reconciliation needs the UTR/RRN/transaction reference or provider response. Add it and RecoverIT will continue automatically.' : providerState ? `RecoverIT found a provider-side state (${providerState}) but the AI reasoning service is unavailable. The provider signal has not been turned into a final conclusion yet; monitoring continues automatically.` : 'RecoverIT is checking the available evidence and provider trail. The AI reasoning service is temporarily unavailable, so no unsupported payment state has been assumed.';
    const nextSteps=needsEvidence ? ['Upload the proof needed for this case or provide the UTR/RRN/transaction reference.','Add a provider or merchant response when it becomes available.'] : [message];
    const caseAmount=c.amount!=null?`${c.currency||'INR'} ${c.amount}`:'the reported payment';
    await db.query('UPDATE recovery_cases SET status=$1,ai_status=$2,ai_summary=$3,ai_findings=$4::jsonb,ai_next_steps=$5::jsonb,ai_confidence=NULL,confidence_score=NULL,updated_at=now() WHERE id=$6',[needsEvidence?'WAITING_FOR_USER':'INVESTIGATING','UNAVAILABLE',message,JSON.stringify([{text:`The ${caseAmount} payment request has not been independently verified.`,status:'reported'},{text:'RecoverIT will not label the charge valid or invalid without supporting evidence.',status:'unknown'}]),JSON.stringify(nextSteps),c.id]);
    await setStep(c.id,key,needsEvidence?'DONE':'RUNNING',message);
    await addEvent(c.id,needsEvidence?'Evidence needed':'AI retry scheduled',message,needsEvidence?'WAITING_FOR_USER':'INVESTIGATING','RecoverIT');
    await notify(c.user_id,c.id,needsEvidence?'Proof needed to verify the ₹500 request':'Investigation retry scheduled',message);
    return res.json({ok:true,status:needsEvidence?'WAITING_FOR_USER':'INVESTIGATING',step:key,retry:!needsEvidence});
  }
  const summary=cleanText(result.summary,5000);
  const findings=Array.isArray(result.findings)?result.findings.slice(0,10):Array.isArray(result.facts)?result.facts.slice(0,10):[];
  const unknowns=Array.isArray(result.unknowns)?result.unknowns.slice(0,8):[];
  const nextSteps=Array.isArray(result.next_steps)?result.next_steps.slice(0,6):[];
  const rawConfidence=Number(result.confidence);
  const confidence=Number.isFinite(rawConfidence)?Math.max(0,Math.min(100,rawConfidence)):(String(result.confidence||'').toLowerCase()==='high'?85:String(result.confidence||'').toLowerCase()==='medium'?65:String(result.confidence||'').toLowerCase()==='low'?35:0);

  if(key==='payment'){
    const facts=Array.isArray(result.facts)?result.facts:[];
    for(const fact of facts){
      const field=String(fact.field||'');const value=String(fact.value||'').trim();
      if(!value||fact.status==='unknown')continue;
      if(field==='merchant'&&(!c.merchant_name||c.merchant_name===''))await db.query('UPDATE recovery_cases SET merchant_name=$1 WHERE id=$2',[value,c.id]);
      if(field==='transaction_reference'&&(!c.transaction_reference||c.transaction_reference===''))await db.query('UPDATE recovery_cases SET transaction_reference=$1 WHERE id=$2',[value,c.id]);
      if(field==='payment_method'&&(!c.payment_method||c.payment_method===''))await db.query('UPDATE recovery_cases SET payment_method=$1 WHERE id=$2',[value,c.id]);
    }
  }

  const mergedFindings=[...findings,...unknowns.map(x=>({text:x,status:'unknown'}))];
  await db.query('UPDATE recovery_cases SET ai_status=$1,ai_summary=$2,ai_findings=$3::jsonb,ai_next_steps=$4::jsonb,ai_confidence=$5,confidence_score=$6,updated_at=now() WHERE id=$7',['AVAILABLE',summary,JSON.stringify(mergedFindings),JSON.stringify(nextSteps),confidence,confidence,c.id]);
  await setStep(c.id,key,'DONE',summary);
  await addEvent(c.id,'Investigation pass complete',summary,'INVESTIGATING','RecoverIT AI',confidence);

  // Each investigation stage is persisted independently. A completed payment pass
  // must not claim that timeline/provider/recovery-plan work is already complete.

  const aiNeedsUser=Boolean(result.needs_user) || (!String(c.transaction_reference||'').trim() && evidence.length===0);
  if(aiNeedsUser){
    const request=cleanText(result.user_request||nextSteps[0]||'Please provide the missing transaction/reference number, provider response, or proof needed to verify this case.',1200);
    await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['WAITING_FOR_USER',c.id]);
    await addEvent(c.id,'One detail is needed',request,'WAITING_FOR_USER','RecoverIT AI',confidence);
    await notify(c.user_id,c.id,'RecoverIT needs one detail',request);
    return res.json({ok:true,status:'WAITING_FOR_USER',step:key,confidence,needs_user:true});
  }

  if(key==='payment' && !String(c.transaction_reference||'').trim() && evidence.length===0){
    await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['WAITING_FOR_USER',c.id]);
    await addEvent(c.id,'More information needed','RecoverIT has captured the payment story, but there is no transaction/reference number or proof to verify the payment trail. Add either one and the investigation will continue automatically.','WAITING_FOR_USER','RecoverIT AI',confidence);
    await notify(c.user_id,c.id,'One detail is needed','Please add the UTR/RRN/transaction reference, provider response, or payment proof. RecoverIT will continue automatically after you add it.');
    return res.json({ok:true,status:'WAITING_FOR_USER',step:key,reason:'REFERENCE_OR_PROOF_REQUIRED',confidence});
  }

  const next=key==='payment' ? STEPS.length : STEPS.findIndex(s=>s[0]===key)+1;
  if(next<STEPS.length){
    await scheduleNext(c.id,c.user_id);
  }else{
    // Once the evidence-aware investigation reaches the recovery-plan stage, prepare the dispute route automatically.
    // The dispute-plan endpoint is idempotent and will reuse an existing active attempt instead of creating duplicates.
    const verification=String(c.verification_state||'').toUpperCase();
    const readyForExternal=verification==='VERIFIED'
      && evidence.length>0
      && Boolean(String(c.transaction_reference||'').trim())
      && Boolean(String(c.merchant_name||'').trim())
      && Boolean(String(c.payment_method||'').trim())
      && c.payment_method!=='Unknown';
    if(readyForExternal){try{await scheduler.now('/api/cases/dispute-plan',{case_id:c.id,user_id:c.user_id})}catch(_){/* route preparation must never break the core investigation */}}
    const reference=String(c.transaction_reference||'').trim();
    const waitingForReference=!reference;
    if(waitingForReference){
      await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['WAITING_FOR_USER',c.id]);
      await addEvent(c.id,'More detail required','RecoverIT completed every available investigation step but still needs the transaction/reference number or provider response to verify the payment trail.','WAITING_FOR_USER','RecoverIT AI',confidence);
      await notify(c.user_id,c.id,'One detail is needed','RecoverIT has finished the available checks. Add the transaction/reference number or provider response so it can continue verifying the case.');
    }else if(provider.length===0){
      await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['INVESTIGATING',c.id]);
      await addEvent(c.id,'Provider monitoring continues','No matching provider event is visible yet. RecoverIT will keep checking the provider trail automatically and update you when something changes.','INVESTIGATING','RecoverIT AI',confidence);
      await notify(c.user_id,c.id,'Investigation continues','RecoverIT could not verify a provider-side event yet. It will keep checking automatically; no action is needed right now.');
      // The global hourly monitor keeps this case active.
    }else{
      await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['INVESTIGATING',c.id]);
      await addEvent(c.id,'Investigation remains active','RecoverIT found provider-side evidence and will continue reconciling new events until the case reaches a defensible resolution.','INVESTIGATING','RecoverIT AI',confidence);
      await notify(c.user_id,c.id,'New investigation pass complete','RecoverIT has new provider evidence and is continuing reconciliation. You will be asked for information only if the case requires it.');
      // The global hourly monitor keeps this case active.
    }
  }
  res.json({ok:true,status:'INVESTIGATING',step:key,confidence});
}