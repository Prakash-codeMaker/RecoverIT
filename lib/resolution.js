import { db } from 'hatchable';

export async function syncResolutionState(caseId){
  const q=await db.query(`SELECT c.id,c.user_id,c.status,c.issue_type,c.amount,c.currency,c.transaction_reference,c.merchant_name,c.ai_summary,c.ai_next_steps,c.updated_at,c.resolved_at,c.identity_status,
    (SELECT detail FROM case_events WHERE case_id=c.id ORDER BY created_at DESC LIMIT 1) AS latest_detail,
    (SELECT title FROM case_events WHERE case_id=c.id ORDER BY created_at DESC LIMIT 1) AS latest_title,
    (SELECT state FROM case_events WHERE case_id=c.id ORDER BY created_at DESC LIMIT 1) AS latest_state,
    (SELECT created_at FROM case_events WHERE case_id=c.id ORDER BY created_at DESC LIMIT 1) AS latest_event_at,
    (SELECT count(*) FROM evidence WHERE case_id=c.id) AS evidence_count
    FROM recovery_cases c WHERE c.id=$1 LIMIT 1`,[caseId]);
  const c=q.rows[0];
  if(!c)return null;
  let resolutionStatus='OPEN',phase='MONITORING',actionType='MONITOR',nextAction='RecoverIT is monitoring this case for a meaningful change.',needsUser=false,dueAt=null,summary=c.ai_summary||'RecoverIT is following the case and reconciling new information.';
  if(c.status==='RESOLVED'){
    resolutionStatus='RESOLVED';phase='RESOLVED';actionType='DONE';nextAction='This case is marked resolved. Tell RecoverIT if the money or outcome is still not right.';summary=c.ai_summary||'The case has been marked resolved.';
  }else if(c.status==='WAITING_FOR_USER'){
    resolutionStatus='OPEN';phase='USER_ACTION';actionType='USER_INPUT';needsUser=true;
    nextAction=c.latest_detail||'Add the missing transaction/reference number, provider response, or proof so RecoverIT can continue.';
    summary='RecoverIT has reached a point where one useful detail is needed from you.';
  }else if(c.identity_status!=='VERIFIED_ACCOUNT'){
    phase='IDENTITY';actionType='USER_INPUT';needsUser=true;nextAction='Verify your signed-in account details so RecoverIT can continue safely.';summary='Identity verification is required before the case can continue.';
  }else if(!String(c.transaction_reference||'').trim() && Number(c.evidence_count||0)===0){
    phase='EVIDENCE';actionType='USER_INPUT';needsUser=true;nextAction='Add a transaction/reference number or upload proof of the payment problem.';summary='The story is captured, but there is not yet a verifiable payment signal.';
  }else if(c.status==='INVESTIGATING'){
    phase='INVESTIGATION';actionType='MONITOR';nextAction='No action needed right now. RecoverIT is checking the evidence and provider trail and will ask only if something is missing.';summary=c.ai_summary||'RecoverIT is actively reconciling the case.';
  }else if(c.status==='REPORTED'){
    phase='UNDERSTANDING';actionType='INVESTIGATE';nextAction='RecoverIT is starting the investigation. No action is needed unless we ask for a missing detail.';summary='Your case is received and queued for investigation.';
  }
  const lastMeaningful=c.latest_event_at||c.updated_at||new Date().toISOString();
  const up=await db.query(`INSERT INTO case_resolution_state (case_id,user_id,resolution_status,phase,next_action_type,next_action,needs_user,due_at,last_meaningful_update_at,summary,verified_amount,resolved_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
    ON CONFLICT (case_id) DO UPDATE SET user_id=EXCLUDED.user_id,resolution_status=EXCLUDED.resolution_status,phase=EXCLUDED.phase,next_action_type=EXCLUDED.next_action_type,next_action=EXCLUDED.next_action,needs_user=EXCLUDED.needs_user,due_at=EXCLUDED.due_at,last_meaningful_update_at=EXCLUDED.last_meaningful_update_at,summary=EXCLUDED.summary,verified_amount=EXCLUDED.verified_amount,resolved_at=EXCLUDED.resolved_at,updated_at=now()
    RETURNING case_id,resolution_status,phase,next_action_type,next_action,needs_user,due_at,last_meaningful_update_at,summary,verified_amount,resolved_at,updated_at`,[c.id,c.user_id,resolutionStatus,phase,actionType,nextAction,needsUser,dueAt,lastMeaningful,summary,c.amount,c.resolved_at||null]);
  return up.rows[0];
}