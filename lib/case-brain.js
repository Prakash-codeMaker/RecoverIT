import { db } from 'hatchable';

function clean(v,max=1200){return String(v??'').replace(/[\u0000-\u001f]/g,' ').slice(0,max)}

export async function rebuildCaseBrain(caseId,userId){
 const cQ=await db.query(`SELECT id,user_id,case_number,issue_type,description,amount,currency,merchant_name,transaction_reference,payment_method,status,ai_summary,ai_next_steps,identity_status,verification_state,verification_confidence,verification_reason FROM recovery_cases WHERE id=$1 AND user_id=$2 LIMIT 1`,[caseId,userId]);
 const c=cQ.rows[0]; if(!c)return null;
 const [evQ,anQ,attQ,reqQ,respQ,stateQ,ctxQ]=await Promise.all([
  db.query(`SELECT id,filename,content_type,sha256,bytes,created_at FROM evidence WHERE case_id=$1 ORDER BY created_at`,[caseId]),
  db.query(`SELECT e.id,e.filename,ea.status,ea.structured_data,ea.confidence,ea.model,ea.updated_at FROM evidence_analysis ea JOIN evidence e ON e.id=ea.evidence_id WHERE ea.case_id=$1 AND ea.analysis_type='document_understanding' ORDER BY ea.updated_at DESC`,[caseId]),
  db.query(`SELECT id,level,organization,channel,destination,status,external_reference,subject,sent_at,next_follow_up_at,last_response_at,created_at FROM dispute_attempts WHERE case_id=$1 AND user_id=$2 ORDER BY created_at`,[caseId,userId]),
  db.query(`SELECT id,attempt_id,requirement,reason,status,created_at,satisfied_at FROM dispute_requirements WHERE case_id=$1 AND user_id=$2 ORDER BY created_at`,[caseId,userId]),
  db.query(`SELECT id,attempt_id,source,channel,external_reference,interpreted_state,next_action,confidence,created_at FROM dispute_responses WHERE case_id=$1 AND user_id=$2 ORDER BY created_at`,[caseId,userId]),
  db.query(`SELECT phase,current_level,current_attempt_id,waiting_for_user,next_action,next_action_at,resolution_status,updated_at FROM dispute_state WHERE case_id=$1 AND user_id=$2 LIMIT 1`,[caseId,userId]),
  db.query(`SELECT payment_rail,upi_app,upi_provider_key,payer_bank,payer_bank_key,beneficiary_bank,merchant_name,payment_gateway,card_issuer,card_network,acquirer,confidence,needs_user_confirmation FROM case_payment_context WHERE case_id=$1 AND user_id=$2 LIMIT 1`,[caseId,userId])
 ]);
 const analyses=anQ.rows;
 const verified=analyses.filter(a=>String(a.structured_data?.verdict||'').toUpperCase()==='VERIFIED');
 const rejected=analyses.filter(a=>String(a.structured_data?.verdict||'').toUpperCase()==='REJECT');
 const review=analyses.filter(a=>String(a.structured_data?.verdict||'').toUpperCase()==='REVIEW');
 const contradictions=analyses.flatMap(a=>Array.isArray(a.structured_data?.contradictions)?a.structured_data.contradictions.map(x=>clean(x,300)):[]).slice(0,20);
 const state=stateQ.rows[0]||{}; const activeAttempt=attQ.rows.slice().reverse().find(a=>['SENT','PREPARED'].includes(a.status))||null;
 let ownership='RECOVERIT',ownershipReason='RecoverIT is assessing and coordinating the case.';
 let nextActionType='MONITOR',nextAction='RecoverIT is checking the case for a meaningful change.',needsUser=false;
 if(c.status==='RESOLVED'){ownership='RESOLVED';ownershipReason='The case is marked resolved.';nextActionType='DONE';nextAction='Check the final outcome and tell RecoverIT if the money or result is still not right.'}
 else if(state.waiting_for_user || c.status==='WAITING_FOR_USER'){ownership='YOU';ownershipReason='RecoverIT needs one specific item from you to continue.';nextActionType='USER_INPUT';nextAction=state.next_action||'Provide the requested information or document.';needsUser=true}
 else if(activeAttempt?.status==='SENT'){ownership=activeAttempt.organization||'ORGANIZATION';ownershipReason=`Waiting for ${activeAttempt.organization||'the organization'} to respond.`;nextActionType='WAIT';nextAction=activeAttempt.next_follow_up_at?`Waiting for ${activeAttempt.organization||'the organization'}; follow-up is due ${new Date(activeAttempt.next_follow_up_at).toLocaleDateString('en-IN')}.`:`Waiting for ${activeAttempt.organization||'the organization'} to respond.`}
 else if(verified.length===0 && rejected.length>0 && review.length===0){ownership='YOU';ownershipReason='The current proof was not sufficient; a replacement document is needed.';nextActionType='USER_INPUT';nextAction='Upload a document that directly supports the payment problem.';needsUser=true}
 else if(verified.length>0 && !activeAttempt && state.phase==='READY_TO_CONTACT'){ownership='YOU';ownershipReason='A verified dispute is ready and needs your approval before contact.';nextActionType='APPROVAL';nextAction=state.next_action||'Review and approve the prepared complaint.';needsUser=true}
 else if(verified.length>0){ownership='RECOVERIT';ownershipReason='RecoverIT has enough verified evidence to work on the next route.';nextActionType='PLAN';nextAction=state.next_action||'RecoverIT is preparing the next legitimate dispute action.'}
 const facts={case_number:c.case_number,issue_type:c.issue_type,description:clean(c.description,2500),amount:c.amount,currency:c.currency,merchant_name:c.merchant_name,transaction_reference:c.transaction_reference,payment_method:c.payment_method,status:c.status,identity_status:c.identity_status,verification_state:c.verification_state,verification_confidence:c.verification_confidence,payment_context:ctxQ.rows[0]||{}};
 const evidence=evQ.rows.map(e=>({id:e.id,filename:e.filename,content_type:e.content_type,sha256:e.sha256,bytes:e.bytes,created_at:e.created_at,verification:analyses.find(a=>a.filename===e.filename)||null}));
 const claims=[{claim:'Payment problem reported',status:'REPORTED',source:'USER'}];
 if(c.transaction_reference)claims.push({claim:'Transaction reference available',status:'SUPPORTED',source:'CASE'});
 if(verified.length)claims.push({claim:'At least one document materially supports the payment problem',status:'SUPPORTED',source:'AI_EVIDENCE'});
 if(rejected.length)claims.push({claim:'At least one submitted document was rejected',status:'CONTRADICTED',source:'AI_EVIDENCE'});
 if(activeAttempt?.status==='SENT')claims.push({claim:`Contact sent to ${activeAttempt.organization}`,status:'SENT',source:'DISPUTE'});
 const workflow=(await db.query('SELECT workflow_step,workflow_next_action,workflow_status,workflow_reason FROM recovery_cases WHERE id=$1 AND user_id=$2 LIMIT 1',[caseId,userId])).rows[0]||null;
 if(workflow){
  ownership=workflow.workflow_status==='WAITING_FOR_USER'?'YOU':workflow.workflow_status==='DONE'?'RESOLVED':'RECOVERIT';
  ownershipReason=clean(workflow.workflow_reason,500)||ownershipReason;
  nextActionType=workflow.workflow_next_action==='APPROVE_CONTACT'?'APPROVAL':workflow.workflow_next_action==='REPLACE_EVIDENCE'||workflow.workflow_next_action==='UPLOAD_EVIDENCE'||workflow.workflow_next_action==='PROVIDE_REQUESTED_ITEM'||workflow.workflow_next_action==='VERIFY_IDENTITY'?'USER_INPUT':workflow.workflow_next_action==='DONE'?'DONE':workflow.workflow_status==='WAITING_FOR_AUTOMATION'?'WAIT':'MONITOR';
  nextAction=clean(workflow.workflow_reason,1200)||nextAction;
  needsUser=workflow.workflow_status==='WAITING_FOR_USER';
 }
 const factsWithWorkflow={...facts,workflow_step:workflow?.workflow_step||null,workflow_next_action:workflow?.workflow_next_action||null,workflow_status:workflow?.workflow_status||null};
 const brain={facts:factsWithWorkflow,evidence,claims,contradictions,ownership,ownershipReason,next_action_type:nextActionType,next_action:nextAction,needs_user:needsUser,confidence:verified.length?Math.max(...verified.map(x=>Number(x.confidence)||0)):null};
 await db.query(`INSERT INTO case_brain (case_id,user_id,version,facts,evidence,claims,contradictions,ownership,ownership_reason,next_action_type,next_action,needs_user,confidence,last_rebuilt_at,updated_at)
 VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now())
 ON CONFLICT (case_id) DO UPDATE SET user_id=EXCLUDED.user_id,version=case_brain.version+1,facts=EXCLUDED.facts,evidence=EXCLUDED.evidence,claims=EXCLUDED.claims,contradictions=EXCLUDED.contradictions,ownership=EXCLUDED.ownership,ownership_reason=EXCLUDED.ownership_reason,next_action_type=EXCLUDED.next_action_type,next_action=EXCLUDED.next_action,needs_user=EXCLUDED.needs_user,confidence=EXCLUDED.confidence,last_rebuilt_at=now(),updated_at=now()`,[caseId,userId,JSON.stringify(factsWithWorkflow),JSON.stringify(evidence),JSON.stringify(claims),JSON.stringify(contradictions),ownership,ownershipReason,nextActionType,nextAction,needsUser,brain.confidence]);
 return brain;
}

export async function getCaseBrain(caseId,userId){const q=await db.query('SELECT * FROM case_brain WHERE case_id=$1 AND user_id=$2 LIMIT 1',[caseId,userId]);return q.rows[0]||null}