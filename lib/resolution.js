import { db } from 'hatchable';

export async function syncResolutionState(caseId){
  const q=await db.query(`SELECT c.id,c.user_id,c.status,c.issue_type,c.amount,c.currency,c.transaction_reference,c.merchant_name,c.ai_summary,c.ai_next_steps,c.updated_at,c.resolved_at,c.identity_status,c.payment_method,c.verification_state,c.verification_confidence,c.verification_reason,
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
    resolutionStatus='OPEN';actionType='USER_INPUT';needsUser=true;
    const vs=String(c.verification_state||'').toUpperCase();
    if(vs==='REJECTED'){phase='EVIDENCE_COLLECTION';nextAction='The uploaded proof did not support this case. Upload a relevant payment receipt, bank statement, transaction screen, or provider message.';summary='RecoverIT is waiting for a relevant replacement proof.';}
    else if(Number(c.evidence_count||0)===0){phase='EVIDENCE_COLLECTION';nextAction='Add the payment proof needed for this case. RecoverIT will verify it automatically before moving to later stages.';summary='RecoverIT needs a verifiable payment signal before it can continue.';}
    else if(vs==='REVIEW'){phase='EVIDENCE_REVIEW';nextAction='The attached proof is relevant but still needs review. RecoverIT will not contact an organization until the evidence is sufficiently supported.';summary='RecoverIT is holding the case at evidence review.';}
    else {phase='USER_ACTION';nextAction=c.latest_detail||'Add only the specific transaction, provider response, or other case detail RecoverIT requested.';summary='RecoverIT has reached a point where one specific detail is needed from you.';}
  }else if(c.identity_status!=='VERIFIED_ACCOUNT'){
    phase='IDENTITY';actionType='USER_INPUT';needsUser=true;nextAction='Verify your signed-in account details so RecoverIT can continue safely.';summary='Identity verification is required before the case can continue.';
  }else if(!String(c.transaction_reference||'').trim() && Number(c.evidence_count||0)===0){
    phase='EVIDENCE_COLLECTION';actionType='USER_INPUT';needsUser=true;nextAction='Add the payment proof needed for this case. RecoverIT will verify it automatically and then advance the same case.';summary='The case has a story but no verifiable payment signal yet.';
  }else if(c.status==='INVESTIGATING'){
    const verification=String(c.verification_state||'').toUpperCase();
    const dispute=(await db.query('SELECT phase,waiting_for_user,next_action FROM dispute_state WHERE case_id=$1 AND user_id=$2 LIMIT 1',[caseId,c.user_id])).rows[0]||null;
    const pending=(await db.query("SELECT count(*) AS n FROM dispute_requirements WHERE case_id=$1 AND user_id=$2 AND status='REQUESTED'",[caseId,c.user_id])).rows[0];
    const pendingCount=Number(pending?.n||0);
    const missingCore=[];
    if(c.amount==null || Number(c.amount)<=0)missingCore.push('payment amount');
    if(!String(c.payment_method||'').trim() || String(c.payment_method).toLowerCase()==='unknown')missingCore.push('payment method');
    if(!String(c.merchant_name||'').trim())missingCore.push('merchant/provider');
    if(!String(c.transaction_reference||'').trim())missingCore.push('transaction/UTR/RRN reference');
    if(verification!=='VERIFIED'){
      phase='EVIDENCE_VERIFICATION';actionType='MONITOR';nextAction='RecoverIT is checking the attached proof for this case. No external organization will be contacted until the evidence is verified.';summary=c.verification_reason||'RecoverIT is verifying the available payment evidence.';
    }else if(missingCore.length){
      phase='CASE_DETAILS';actionType='USER_INPUT';needsUser=true;nextAction=`RecoverIT needs the ${missingCore[0]} before it can choose or contact the correct organization.`;summary='The payment evidence is verified; RecoverIT needs only the next missing case fact.';
    }else if(dispute?.waiting_for_user||pendingCount>0){phase='USER_ACTION';actionType='USER_INPUT';needsUser=true;nextAction=dispute?.next_action||'Provide the specific evidence RecoverIT requested so the same case can continue.';summary='RecoverIT is waiting only for the evidence or response needed at this stage.';}
    else if(dispute?.phase==='READY_TO_CONTACT'||dispute?.phase==='READY'){phase='READY_TO_CONTACT';actionType='USER_INPUT';needsUser=true;nextAction=dispute?.next_action||'Review the prepared external contact and accept it when you are ready.';summary='RecoverIT has prepared the correct external organization, channel, message, and evidence package.';}
    else if(dispute?.phase==='AWAITING_RESPONSE'){phase='AWAITING_RESPONSE';actionType='MONITOR';nextAction=dispute?.next_action||'RecoverIT is waiting for the organization response and will keep the same thread active.';summary='The approved message has been sent and RecoverIT is tracking the response.';}
    else {phase='INVESTIGATION';actionType='MONITOR';nextAction='RecoverIT is checking the current payment trail. No external contact will appear until the case is verified and ready.';summary=c.ai_summary||'RecoverIT is actively reconciling the case.';}
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