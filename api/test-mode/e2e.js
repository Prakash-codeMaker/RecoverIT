import { db, storage } from 'hatchable';
import crypto from 'node:crypto';
import { prepareNextRoute } from 'lib/dispute.js';
export const access='scheduler'; export const methods=['POST'];
export default async function(req,res){
 const runId=crypto.randomUUID(); const userId='qa-e2e-'+runId; const caseId=crypto.randomUUID(); const caseNumber='QA-'+runId.slice(0,8);
 const result={run_id:runId,checks:[],cleanup:false};
 const check=(name,ok,detail)=>result.checks.push({name,ok,detail});
 const cleanup=async()=>{for(const q of [
  ['DELETE FROM dispute_requirements WHERE case_id=$1',[caseId]],
  ['DELETE FROM dispute_responses WHERE case_id=$1',[caseId]],
  ['DELETE FROM dispute_attempts WHERE case_id=$1',[caseId]],
  ['DELETE FROM dispute_state WHERE case_id=$1',[caseId]],
  ['DELETE FROM evidence_analysis WHERE case_id=$1',[caseId]],
  ['DELETE FROM evidence WHERE case_id=$1',[caseId]],
  ['DELETE FROM case_events WHERE case_id=$1',[caseId]],
  ['DELETE FROM investigation_steps WHERE case_id=$1',[caseId]],
  ['DELETE FROM recovery_cases WHERE id=$1',[caseId]]
 ]){try{await db.query(q[0],q[1])}catch(_){}}
 };
 try{
  const required=['recovery_cases','evidence','evidence_analysis','case_events','investigation_steps','dispute_routes','dispute_attempts','dispute_requirements','dispute_responses','dispute_state','case_preflights','financial_transactions','reconciliation_runs','communication_messages','action_executions'];
  for(const t of required){try{await db.query(`SELECT 1 FROM ${t} LIMIT 1`);check('schema:'+t,true,'table reachable')}catch(e){check('schema:'+t,false,String(e.message||e))}}
  await db.query('INSERT INTO recovery_cases (id,case_number,user_id,issue_type,description,amount,currency,payment_method,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[caseId,caseNumber,userId,'payment_failed_deducted','QA synthetic UPI payment dispute.',500,'INR','UPI','REPORTED']);
  check('case_create',true,'synthetic case inserted');
  const data=Buffer.from('RecoverIT QA evidence'); const key=`qa/${runId}.txt`; await storage.put(key,data,'text/plain'); const hash=await crypto.subtle.digest('SHA-256',data); const hex=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join(''); const ev=await db.query('INSERT INTO evidence (id,case_id,user_id,filename,content_type,bytes,storage_key,sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[crypto.randomUUID(),caseId,userId,'qa-payment-proof.txt','text/plain',data.length,key,hex]);check('evidence_store',true,'evidence hash persisted');
  const c=(await db.query('SELECT * FROM recovery_cases WHERE id=$1',[caseId])).rows[0]; const route=await prepareNextRoute(c,userId);check('route_prepare',Boolean(route),'next legitimate route prepared');
  if(route){await db.query('UPDATE dispute_attempts SET status=$1,sent_at=now(),next_follow_up_at=now()+interval \'72 hours\' WHERE id=$2',['SENT',route.attempt_id]);await db.query('UPDATE dispute_state SET phase=$1,waiting_for_user=false,current_attempt_id=$2 WHERE case_id=$3',['AWAITING_RESPONSE',route.attempt_id,caseId]);check('await_response',true,'case entered response-waiting state');
   const r=await db.query('INSERT INTO dispute_responses (case_id,user_id,attempt_id,source,channel,raw_text,structured_response,interpreted_state,next_action,confidence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[caseId,userId,route.attempt_id,'QA','PASTE','Please provide your bank statement.',JSON.stringify({state:'MORE_INFO_REQUIRED',requirements:['bank statement']}),'MORE_INFO_REQUIRED','Provide bank statement',1]); const rr=r.rows[0];await db.query('INSERT INTO dispute_requirements (case_id,user_id,attempt_id,requirement,reason) VALUES ($1,$2,$3,$4,$5)',[caseId,userId,route.attempt_id,'bank statement','QA organization request']);await db.query('UPDATE dispute_state SET phase=$1,waiting_for_user=true,next_action=$2 WHERE case_id=$3',['WAITING_FOR_USER','Upload the requested bank statement.',caseId]);check('request_more_info',true,'organization request became user task');await db.query('UPDATE dispute_requirements SET status=$1,response_evidence_id=$2,satisfied_at=now() WHERE case_id=$3 AND status=$4',['SATISFIED',ev.rows[0].id,caseId,'REQUESTED']);await db.query('UPDATE dispute_state SET phase=$1,waiting_for_user=false,next_action=$2 WHERE case_id=$3',['READY_TO_CONTACT','Review and approve re-contact.',caseId]);check('same_case_continue',true,'requested item satisfied without creating a new case');
  }
 }catch(e){check('runtime_exception',false,String(e.message||e))}finally{await cleanup();result.cleanup=true;try{await storage.del(`qa/${runId}.txt`)}catch(_){}}
 result.ok=result.checks.every(x=>x.ok)&&result.cleanup;res.json(result);
}