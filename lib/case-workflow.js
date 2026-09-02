import { db, scheduler } from 'hatchable';

const CLOSED=new Set(['CLOSED','RESOLVED']);
const AUTO_STEPS=new Set(['START_CASE','VERIFY_EVIDENCE','INVESTIGATE','PREPARE_ROUTE','MONITOR_RESPONSE','MONITOR_PAYMENT','SYNC_OUTCOME']);

function text(v){return String(v??'').trim()}
function upper(v){return text(v).toUpperCase()}

async function loadCase(caseId,userId){
 const q=await db.query(`SELECT c.*,u.email,
   (SELECT count(*) FROM evidence e WHERE e.case_id=c.id)::int AS evidence_count,
   (SELECT count(*) FROM evidence e JOIN evidence_analysis ea ON ea.evidence_id=e.id AND ea.analysis_type='document_understanding' WHERE e.case_id=c.id AND ea.status='COMPLETED' AND COALESCE(ea.structured_data->>'verdict','')='VERIFIED' AND ea.confidence IS NOT NULL AND ea.confidence>=60)::int AS verified_evidence_count,
   (SELECT count(*) FROM evidence e JOIN evidence_analysis ea ON ea.evidence_id=e.id AND ea.analysis_type='document_understanding' WHERE e.case_id=c.id AND (ea.status<>'COMPLETED' OR COALESCE(ea.structured_data->>'verdict','')<>'VERIFIED' OR ea.confidence IS NULL OR ea.confidence<60))::int AS unverified_evidence_count,
   (SELECT phase FROM dispute_state WHERE case_id=c.id AND user_id=c.user_id LIMIT 1) AS dispute_phase,
   (SELECT waiting_for_user FROM dispute_state WHERE case_id=c.id AND user_id=c.user_id LIMIT 1) AS dispute_waiting,
   (SELECT next_action FROM dispute_state WHERE case_id=c.id AND user_id=c.user_id LIMIT 1) AS dispute_next_action,
   (SELECT status FROM dispute_attempts WHERE case_id=c.id AND user_id=c.user_id ORDER BY created_at DESC LIMIT 1) AS latest_attempt_status,
   (SELECT next_follow_up_at FROM dispute_attempts WHERE case_id=c.id AND user_id=c.user_id AND status='SENT' ORDER BY created_at DESC LIMIT 1) AS next_follow_up_at,
   (SELECT count(*) FROM investigation_steps WHERE case_id=c.id AND status NOT IN ('DONE','COMPLETED'))::int AS investigation_pending_count
   FROM recovery_cases c LEFT JOIN users u ON u.id=c.user_id WHERE c.id=$1 AND c.user_id=$2 LIMIT 1`,[caseId,userId]);
 return q.rows[0]||null;
}

async function persist(c,step,action,status,reason,trigger){
 const q=await db.query(`UPDATE recovery_cases SET workflow_step=$1,workflow_next_action=$2,workflow_status=$3,workflow_reason=$4,workflow_last_trigger=$5,workflow_updated_at=now() WHERE id=$6 AND user_id=$7 RETURNING id,workflow_step,workflow_next_action,workflow_status,workflow_reason,workflow_last_trigger,workflow_updated_at`,[step,action,status,reason,trigger,c.id,c.user_id]);
 return q.rows[0]||null;
}

async function arm(route,caseId,userId){try{await scheduler.now(route,{case_id:caseId,user_id:userId,workflow_trigger:'workflow'});return true}catch(_){return false}}
async function retryWorkflow(caseId,userId,minutes=10){try{await scheduler.at(new Date(Date.now()+minutes*60000).toISOString(),'/api/cases/workflow-advance',{payload:{case_id:caseId,user_id:userId,workflow_trigger:'automation_retry'}});return true}catch(_){return false}}

export async function advanceCaseWorkflow(caseId,userId,trigger='event'){
 let c=await loadCase(caseId,userId);
 if(!c)return null;
 const currentStep=text(c.workflow_step), currentAction=text(c.workflow_next_action), currentStatus=upper(c.workflow_status);
 const forceRecompute=new Set(['force','case_created','verification_completed','investigation_step_completed','investigation_evidence_gate','external_response_captured','external_contact_sent']).has(trigger);
 if(currentStatus==='RUNNING' && c.workflow_updated_at && (Date.now()-new Date(c.workflow_updated_at).getTime())<5*60*1000 && !forceRecompute){
   return {id:c.id,workflow_step:currentStep,workflow_next_action:currentAction,workflow_status:currentStatus,workflow_reason:text(c.workflow_reason),workflow_last_trigger:text(c.workflow_last_trigger),workflow_updated_at:c.workflow_updated_at,resumed:true};
 }
 if(CLOSED.has(upper(c.status))){return await persist(c,upper(c.status)==='RESOLVED'?'RESOLVED':'CLOSED','DONE','DONE',upper(c.status)==='RESOLVED'?'The case is resolved.':'The case is closed.',trigger)}

 // The workflow ledger is authoritative: first establish identity, then evidence, then facts, then route, then user approval/contact, then monitoring/outcome.
 if(upper(c.identity_status)!=='VERIFIED_ACCOUNT'){
   return await persist(c,'IDENTITY','VERIFY_IDENTITY','WAITING_FOR_USER','RecoverIT needs the signed-in account identity verified before it can safely continue this case.',trigger);
 }

 if(Number(c.evidence_count||0)===0){
   return await persist(c,'EVIDENCE','UPLOAD_EVIDENCE','WAITING_FOR_USER','No supporting payment evidence is attached. RecoverIT must receive and verify the relevant document before the case can advance.',trigger);
 }

 if(upper(c.verification_state)!=='VERIFIED' || Number(c.verified_evidence_count||0)!==Number(c.evidence_count||0) || Number(c.unverified_evidence_count||0)>0){
   const state=upper(c.verification_state);
   if(state==='REJECTED') return await persist(c,'EVIDENCE','REPLACE_EVIDENCE','WAITING_FOR_USER','At least one attached document was rejected for this case. Provide the correct, relevant payment proof; the same case will continue after verification.',trigger);
   if(state==='REVIEW') return await persist(c,'EVIDENCE','VERIFY_EVIDENCE','WAITING_FOR_AUTOMATION','The attached evidence is relevant but is not yet positively verified. RecoverIT will keep verifying it and will not advance the case until every attached document is verified.',trigger);
   if(text(c.verification_reason).toLowerCase().includes('unavailable') || upper(c.ai_status)==='UNAVAILABLE'){
     const retry=await retryWorkflow(caseId,userId,10);
     return await persist(c,'EVIDENCE','VERIFY_EVIDENCE','WAITING_FOR_AUTOMATION',retry?'The verifier is temporarily unavailable. RecoverIT saved this exact position and will retry automatically.':'The verifier is temporarily unavailable. RecoverIT saved this exact position and the global workflow heartbeat will retry it.',trigger);
   }
   const armed=await arm('/api/jobs/case-verification',caseId,userId);
   return await persist(c,'EVIDENCE','VERIFY_EVIDENCE',armed?'RUNNING':'WAITING_FOR_AUTOMATION',armed?'RecoverIT has started evidence verification for every attached document.':'The evidence verifier is temporarily unavailable; RecoverIT will retry automatically.',trigger);
 }

 const missing=[];
 if(c.amount==null || Number(c.amount)<=0)missing.push('payment amount');
 if(!text(c.payment_method) || upper(c.payment_method)==='UNKNOWN')missing.push('payment method');
 if(!text(c.merchant_name))missing.push('merchant/provider');
 if(!text(c.transaction_reference))missing.push('transaction/UTR/RRN reference');
 if(upper(c.ai_status)==='UNAVAILABLE'){
   const retry=await retryWorkflow(caseId,userId,10);
   return await persist(c,'INVESTIGATION','INVESTIGATE','WAITING_FOR_AUTOMATION',retry?'The investigation AI is temporarily unavailable. RecoverIT saved the exact case position and will retry automatically.':'The investigation AI is temporarily unavailable. RecoverIT saved the exact case position and the heartbeat will retry it.',trigger);
 }
 if(missing.length){
   const armed=await arm('/api/cases/investigate-worker',caseId,userId);
   return await persist(c,'INVESTIGATION','INVESTIGATE',armed?'RUNNING':'WAITING_FOR_AUTOMATION',armed?'RecoverIT is using the verified evidence and available AI investigation to resolve the next missing case fact.':'RecoverIT will retry the investigation automatically.',trigger);
 }
 if(Number(c.investigation_pending_count||0)>0){
   const armed=await arm('/api/cases/investigate-worker',caseId,userId);
   return await persist(c,'INVESTIGATION','INVESTIGATE',armed?'RUNNING':'WAITING_FOR_AUTOMATION',armed?'RecoverIT is continuing the next unfinished investigation step from the saved case state.':'The next investigation step will retry automatically.',trigger);
 }

 const phase=upper(c.dispute_phase);
 if(phase==='AWAITING_RESPONSE' || upper(c.latest_attempt_status)==='SENT'){
   return await persist(c,'EXTERNAL_RESPONSE','MONITOR_RESPONSE','ACTIVE','RecoverIT is monitoring the same external dispute thread. It will process an inbound response immediately and surface a follow-up when the response deadline is reached.',trigger);
 }
 if(phase==='READY_TO_CONTACT' || phase==='READY' || upper(c.latest_attempt_status)==='PREPARED'){
   return await persist(c,'USER_APPROVAL','APPROVE_CONTACT','WAITING_FOR_USER',c.dispute_next_action||'A legitimate external contact is prepared. Review the exact organization, channel, destination, message, and evidence, then explicitly approve sending.',trigger);
 }
 if(phase==='WAITING_FOR_USER' || c.dispute_waiting===true){
   return await persist(c,'USER_ACTION','PROVIDE_REQUESTED_ITEM','WAITING_FOR_USER',c.dispute_next_action||'RecoverIT needs the specific item requested by the current dispute stage.',trigger);
 }
 if(phase==='RESOLVED' || upper(c.status)==='RESOLVED'){
   return await persist(c,'RESOLVED','DONE','DONE','The case is resolved.',trigger);
 }

 const armed=await arm('/api/cases/dispute-plan',caseId,userId);
 return await persist(c,'ROUTE','PREPARE_ROUTE',armed?'RUNNING':'WAITING_FOR_AUTOMATION',armed?'RecoverIT is preparing the next legitimate route using the verified case facts and available provider intelligence.':'Route preparation will retry automatically.',trigger);
}

export async function getWorkflowState(caseId,userId){
 const q=await db.query(`SELECT id,case_number,status,workflow_step,workflow_next_action,workflow_status,workflow_reason,workflow_last_trigger,workflow_updated_at FROM recovery_cases WHERE id=$1 AND user_id=$2 LIMIT 1`,[caseId,userId]);
 return q.rows[0]||null;
}