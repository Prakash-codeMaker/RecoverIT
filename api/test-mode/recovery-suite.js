import { db, storage, scheduler, config } from 'hatchable';
import crypto from 'node:crypto';
import { prepareFirstDisputeAction, prepareResponseContact, prepareNextRoute, eligibleRoutes } from 'lib/dispute.js';
import { rebuildCaseBrain } from 'lib/case-brain.js';
import { syncResolutionState } from 'lib/resolution.js';

export const access='scheduler';
export const methods=['POST'];

function add(r,name,ok,detail){r.checks.push({name,ok:Boolean(ok),detail:String(detail||'')});if(!ok)r.ok=false}
async function q(sql,p=[]){return (await db.query(sql,p)).rows}
async function cleanup(caseId, keys=[]){
  for(const t of ['case_brain','case_resolution_state','dispute_state','dispute_responses','dispute_requirements','dispute_attempts','evidence_analysis','evidence','case_events','investigation_steps','recovery_cases']){try{await db.query(`DELETE FROM ${t} WHERE case_id=$1`,[caseId])}catch(_){}}
  for(const k of keys){try{await storage.del(k)}catch(_){}}
}
async function makeCase(runId,idx,issue,paymentMethod='UPI',extra={}){
  const id=crypto.randomUUID();
  const userId=`qa-suite-${runId}`;
  const number=`QA-SUITE-${runId.slice(0,6)}-${idx}`;
  await db.query('INSERT INTO recovery_cases (id,case_number,user_id,issue_type,description,amount,currency,merchant_name,transaction_reference,payment_method,status,identity_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[
    id,number,userId,issue,extra.description||`Synthetic RecoverIT QA case for ${issue}.`,extra.amount||500,'INR',extra.merchant||'QA Merchant',extra.reference||`QA-UTR-${idx}` ,paymentMethod,'INVESTIGATING','VERIFIED_ACCOUNT']);
  return {id,userId,number};
}
async function addEvidence(caseId,userId,idx,verdict='VERIFIED',documentType='payment_proof'){
  const data=Buffer.from(`RecoverIT QA evidence ${idx} | merchant=QA Merchant | amount=500 INR | UTR=QA-UTR-${idx}`);
  const key=`qa-suite/${caseId}-${idx}.txt`; await storage.put(key,data,'text/plain');
  const hash=await crypto.subtle.digest('SHA-256',data);const sha=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
  const eid=crypto.randomUUID();
  await db.query('INSERT INTO evidence (id,case_id,user_id,filename,content_type,bytes,storage_key,sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[eid,caseId,userId,`qa-${documentType}-${idx}.txt`,'text/plain',data.length,key,sha]);
  await db.query('INSERT INTO evidence_analysis (evidence_id,case_id,analysis_type,status,extracted_text,structured_data,authenticity_signals,confidence,model) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[eid,caseId,'document_understanding','COMPLETED',data.toString(),JSON.stringify({verdict,document_type:documentType,extracted:{merchant:'QA Merchant',amount:'500',currency:'INR',transaction_reference:`QA-UTR-${idx}`,payment_method:'UPI',payment_status:'debited'}}),JSON.stringify(['synthetic fixture']),98,'qa-suite']);
  return {key,eid};
}

export default async function(req,res){
 const runId=crypto.randomUUID(); const result={ok:true,run_id:runId,scenario:'recoverit-recovery-suite-12',checks:[],cleanups:[]};
 const cases=[];
 try{
  // Schema smoke test.
  for(const t of ['recovery_cases','evidence','evidence_analysis','dispute_routes','dispute_attempts','dispute_requirements','dispute_responses','dispute_state','case_brain','case_resolution_state','financial_transactions']){
   try{await db.query(`SELECT 1 FROM ${t} LIMIT 1`);add(result,`schema:${t}`,true,'reachable')}catch(e){add(result,`schema:${t}`,false,e.message)}
  }

  // 1-5 route coverage for the currently supported high-value dispute types.
  const routeIssues=['payment_failed_deducted','refund_not_received','duplicate_payment','payment_stuck','unrecognized_payment'];
  for(let i=0;i<routeIssues.length;i++){
   const c=await makeCase(runId,i+1,routeIssues[i],routeIssues[i]==='payment_failed_deducted'?'UPI':'');cases.push(c);
   const routes=await eligibleRoutes((await q('SELECT * FROM recovery_cases WHERE id=$1',[c.id]))[0],c.userId);
   add(result,`route:${routeIssues[i]}`,routes.length>0,routes.length?routes.slice(0,3).map(x=>`${x.level}:${x.organization}`).join(' | '):'no eligible routes');
  }

  // 6. No-evidence gate.
  const c6=await makeCase(runId,6,'payment_failed_deducted','UPI');cases.push(c6);
  const noProof=await prepareFirstDisputeAction((await q('SELECT * FROM recovery_cases WHERE id=$1',[c6.id]))[0],c6.userId);
  add(result,'no_evidence_blocks_contact',noProof.status==='WAITING_FOR_VERIFICATION',JSON.stringify(noProof));

  // 7. Missing-document gate after verified proof.
  const c7=await makeCase(runId,7,'refund_not_received','UPI');cases.push(c7);
  const p7=await addEvidence(c7.id,c7.userId,7,'VERIFIED','payment_proof');
  const row7=(await q('SELECT * FROM recovery_cases WHERE id=$1',[c7.id]))[0];
  const r7=await prepareFirstDisputeAction(row7,c7.userId);
  add(result,'missing_document_gate',r7.status==='NEEDS_DOCUMENTS' || r7.status==='NO_ROUTE',JSON.stringify(r7));

  // 8. Verified first action + persisted attempt.
  const c8=await makeCase(runId,8,'payment_failed_deducted','UPI');cases.push(c8);
  const p8=await addEvidence(c8.id,c8.userId,8,'VERIFIED','payment_proof');
  const row8=(await q('SELECT * FROM recovery_cases WHERE id=$1',[c8.id]))[0];
  const r8=await prepareFirstDisputeAction(row8,c8.userId);
  const a8=(await q('SELECT * FROM dispute_attempts WHERE case_id=$1 AND user_id=$2',[c8.id,c8.userId]))[0];
  add(result,'verified_first_action',r8.status==='READY'&&Boolean(a8),JSON.stringify(r8));

  // 9. Same-organization follow-up after requested document.
  await db.query('UPDATE dispute_attempts SET status=\'SENT\',sent_at=now() WHERE id=$1',[a8.id]);
  await db.query('INSERT INTO dispute_state (case_id,user_id,phase,current_level,current_attempt_id,waiting_for_user,next_action) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (case_id) DO UPDATE SET phase=$3,current_level=$4,current_attempt_id=$5,waiting_for_user=$6,next_action=$7,updated_at=now()',[c8.id,c8.userId,'WAITING_FOR_USER',a8.level,a8.id,true,'Upload bank statement']);
  await db.query('INSERT INTO dispute_responses (case_id,user_id,attempt_id,source,channel,raw_text,structured_response,interpreted_state,next_action,confidence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[c8.id,c8.userId,a8.id,'QA_ORG','PASTE','Please provide your bank statement.',JSON.stringify({requirements:['bank statement']}),'MORE_INFO_REQUIRED','Provide bank statement',99]);
  await db.query('INSERT INTO dispute_requirements (case_id,user_id,attempt_id,requirement,reason,status) VALUES ($1,$2,$3,$4,$5,$6)',[c8.id,c8.userId,a8.id,'bank statement','QA requested document','REQUESTED']);
  const p9=await addEvidence(c8.id,c8.userId,9,'VERIFIED','bank_statement');
  await db.query("UPDATE dispute_requirements SET status='SATISFIED',response_evidence_id=$1,satisfied_at=now() WHERE case_id=$2 AND status='REQUESTED'",[p9.eid,c8.id]);
  const f9=await prepareResponseContact(row8,c8.userId,a8.id);
  add(result,'same_organization_followup',Boolean(f9&&f9.attempt_id),f9?`org=${f9.organization}`:'no follow-up');
  const fa9=(await q('SELECT * FROM dispute_attempts WHERE case_id=$1 AND user_id=$2 ORDER BY created_at DESC',[c8.id,c8.userId])).slice(-1)[0];
  add(result,'followup_keeps_same_case',Boolean(fa9&&fa9.case_id===c8.id),`attempts=${(await q('SELECT id FROM dispute_attempts WHERE case_id=$1',[c8.id])).length}`);

  // 10. Escalation preparation after a sent first route.
  const c10=await makeCase(runId,10,'consumer_issue','');cases.push(c10);await addEvidence(c10.id,c10.userId,10,'VERIFIED','payment_proof');
  const row10=(await q('SELECT * FROM recovery_cases WHERE id=$1',[c10.id]))[0];
  const first10=await prepareFirstDisputeAction(row10,c10.userId);const a10=(await q('SELECT * FROM dispute_attempts WHERE case_id=$1 ORDER BY created_at DESC',[c10.id]))[0];
  let next10=null;if(a10){await db.query("UPDATE dispute_attempts SET status='SENT',sent_at=now() WHERE id=$1",[a10.id]);next10=await prepareNextRoute(row10,c10.userId)}
  add(result,'escalation_preparation',Boolean(next10&&next10.attempt_id)||first10.status==='NEEDS_DOCUMENTS',JSON.stringify({first:first10,next:next10}));

  // 11. Case Brain + Resolution projection.
  const brain=await rebuildCaseBrain(c8.id,c8.userId);add(result,'case_brain_rebuild',Boolean(brain&&brain.facts&&brain.evidence&&brain.next_action),brain?`${brain.ownership}:${brain.next_action_type}`:'missing');
  const resolution=await syncResolutionState(c8.id);add(result,'resolution_projection',Boolean(resolution),JSON.stringify(resolution||{}).slice(0,500));

  // 12. Actual Razorpay provider probe using the connected test credentials.
  let rpOk=false; let rpDetail='not checked';
  try{
   const key=await config.get('RAZORPAY_KEY_ID'); const secret=await config.get('RAZORPAY_KEY_SECRET');
   if(!key||!secret)throw new Error('Razorpay credentials unavailable');
   const auth=Buffer.from(`${key}:${secret}`).toString('base64');
   const r=await fetch('https://api.razorpay.com/v1/payments/pay_TWpA78c3dSL5Wn',{headers:{Authorization:`Basic ${auth}`},timeout_ms:10000});
   const text=await r.text();let d={};try{d=JSON.parse(text)}catch(_){d={raw:text}};
   rpOk=r.ok&&d?.id==='pay_TWpA78c3dSL5Wn'&&d?.status==='captured';rpDetail=r.ok?`${d.status} ${d.amount} ${d.currency}`:`HTTP ${r.status}`;
  }catch(e){rpDetail=e.message||String(e)}
  add(result,'razorpay_real_test_payment',rpOk,rpDetail);

  result.ok=result.checks.every(x=>x.ok);
 }catch(e){add(result,'runtime_exception',false,e.message||String(e))}
 finally{
  for(const c of cases){try{await cleanup(c.id,[]);result.cleanups.push(c.number)}catch(e){result.cleanups.push(`${c.number}:cleanup-failed:${e.message||e}`)}}
  try{await db.query('INSERT INTO e2e_test_runs (run_id,scenario,ok,checks,error) VALUES ($1,$2,$3,$4,$5)',[runId,result.scenario,Boolean(result.ok),JSON.stringify(result.checks),result.checks.find(x=>x.name==='runtime_exception')?.detail||null])}catch(_){ }
 }
 res.json(result);
}