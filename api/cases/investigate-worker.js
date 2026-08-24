import { db, ai, scheduler } from 'hatchable';
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
  const prompt=`You are the RecoverIT AI payment investigator. This is a real case review, not a generic chatbot answer. Work ONLY from the supplied case data. ${instructions[step]}

CASE DATA:\n${JSON.stringify(facts)}\n\nReturn ONLY valid JSON matching this shape:\n${schema}`;
  try{
    const out=await ai.generateText({model:'sonnet',prompt,purpose:'payment-investigation',userId:c.user_id,maxTokens:1400});
    const parsed=extractJson(out.text);
    if(!parsed)throw new Error('AI returned invalid investigation JSON.');
    return parsed;
  }catch(error){
    return {summary:'AI investigation is temporarily unavailable; no unsupported payment state was assumed.',findings:[{text:'The case remains open because the reasoning service did not return a reliable result.',status:'unknown'}],unknowns:['AI analysis could not be completed on this pass.'],next_steps:['Keep the case open and provide the transaction/reference number or provider response.'],confidence:0};
  }
}

export default async function(req,res){
  const c=await getCase(req.body?.case_id,req.body?.user_id);
  if(!c)return res.status(404).json({error:'Case not found.'});

  const steps=await db.query('SELECT step_key,status,detail FROM investigation_steps WHERE case_id=$1 ORDER BY created_at ASC',[c.id]);
  const current=STEPS.find(s=>{const row=steps.rows.find(x=>x.step_key===s[0]);return row&&row.status!=='DONE';});
  if(!current){await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['WAITING_FOR_USER',c.id]);return res.json({ok:true,status:'WAITING_FOR_USER',complete:true});}

  const [key,title]=current;
  const evidence=(await db.query('SELECT filename,content_type,bytes,sha256 FROM evidence WHERE case_id=$1 ORDER BY created_at ASC',[c.id])).rows;
  const provider=(await db.query('SELECT provider,event_type,canonical_state,payload_json,received_at FROM provider_events WHERE payload_json::text ILIKE $1 ORDER BY received_at DESC LIMIT 20',['%'+String(c.transaction_reference||'')+'%'])).rows;
  const previous=(await db.query('SELECT title,detail,state,source,created_at FROM case_events WHERE case_id=$1 ORDER BY created_at DESC LIMIT 12',[c.id])).rows;

  await db.query('UPDATE recovery_cases SET status=$1,updated_at=now(),ai_last_run_at=now() WHERE id=$2',['INVESTIGATING',c.id]);
  await setStep(c.id,key,'RUNNING',key==='payment'?'AI is extracting the payment facts from your story.':key==='timeline'?'AI is comparing your proof metadata with the reported timeline.':key==='provider'?'AI is reconciling provider events with the reported payment state.':'AI is synthesizing verified facts into a safe recovery plan.');
  await addEvent(c.id,title,key==='payment'?'RecoverIT AI is extracting and normalizing the payment facts.':key==='timeline'?'RecoverIT AI is reviewing the supplied proof against the case timeline.':key==='provider'?'RecoverIT AI is reconciling provider evidence with the reported state.':'RecoverIT AI is building the final evidence-aware recovery plan.','INVESTIGATING','RecoverIT AI');

  const result=await aiInvestigate(c,key,evidence,provider,previous);
  const summary=cleanText(result.summary,5000);
  const findings=Array.isArray(result.findings)?result.findings.slice(0,10):Array.isArray(result.facts)?result.facts.slice(0,10):[];
  const unknowns=Array.isArray(result.unknowns)?result.unknowns.slice(0,8):[];
  const nextSteps=Array.isArray(result.next_steps)?result.next_steps.slice(0,6):[];
  const confidence=Math.max(0,Math.min(100,Number(result.confidence)||0));

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
  await db.query('UPDATE recovery_cases SET ai_summary=$1,ai_findings=$2::jsonb,ai_next_steps=$3::jsonb,ai_confidence=$4,confidence_score=$5,updated_at=now() WHERE id=$6',[summary,JSON.stringify(mergedFindings),JSON.stringify(nextSteps),confidence,confidence,c.id]);
  await setStep(c.id,key,'DONE',summary);
  await addEvent(c.id,key==='payment'?'AI facts extracted':key==='timeline'?'AI proof review complete':key==='provider'?'AI provider reconciliation complete':'AI recovery plan complete',summary,'INVESTIGATING','RecoverIT AI',confidence);

  const next=STEPS.findIndex(s=>s[0]===key)+1;
  if(next<STEPS.length){
    await scheduleNext(c.id,c.user_id);
  }else{
    const waiting=provider.length===0;
    await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',[waiting?'WAITING_FOR_USER':'INVESTIGATING',c.id]);
    await addEvent(c.id,waiting?'AI needs more evidence':'AI investigation pass complete',waiting?'AI could not verify a provider-side event for this case. Add the transaction/reference number or provider response so reconciliation can continue.':'AI completed an evidence-aware investigation pass. The case remains open for new provider events or proof.','INVESTIGATING','RecoverIT AI',confidence);
  }
  res.json({ok:true,status:'INVESTIGATING',step:key,confidence});
}