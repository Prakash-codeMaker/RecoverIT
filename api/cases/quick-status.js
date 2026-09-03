import { db } from 'hatchable';
export const access='user';
export const methods=['GET'];

export default async function(req,res){
  const id=String(req.query?.case_id||'');
  const u=req.user;
  if(!id)return res.status(400).json({error:'Case ID is required.'});
  const r=await db.query(`SELECT rc.id,rc.case_number,rc.status,rc.issue_type,rc.description,rc.amount,rc.currency,rc.payment_method,rc.merchant_name,rc.transaction_reference,rc.confidence_score,rc.created_at,rc.updated_at,rc.ai_status,rc.ai_summary,rc.verification_state,rc.verification_confidence,rc.verification_last_checked_at,rc.verification_last_available_at,rc.verification_reason,
    COALESCE((SELECT COUNT(*) FROM evidence e WHERE e.case_id=rc.id),0) AS evidence_count,
    COALESCE((SELECT json_agg(e ORDER BY e.created_at ASC) FROM (SELECT id,filename,content_type,bytes,created_at FROM evidence WHERE case_id=rc.id ORDER BY created_at ASC LIMIT 20) e),'[]'::json) AS evidence,
    COALESCE((SELECT json_agg(s ORDER BY s.created_at ASC) FROM (SELECT step_key,title,status,detail,created_at,completed_at FROM investigation_steps WHERE case_id=rc.id) s),'[]'::json) AS steps
    FROM recovery_cases rc
    WHERE (rc.id::text=$1 OR rc.case_number=$1) AND rc.user_id=$2 LIMIT 1`,[id,u.id]);
  if(!r.rows[0])return res.status(404).json({error:'Case not found.'});
  const c=r.rows[0];
  const steps=Array.isArray(c.steps)?c.steps:[];
  const done=steps.filter(s=>s.status==='DONE').length;
  const running=steps.find(s=>s.status==='RUNNING')||steps.find(s=>s.status==='QUEUED')||null;
  const waiting=steps.find(s=>s.status==='WAITING')||null;
  const guidance=c.verification_state==='REJECTED'
    ? 'This proof was not a match. Upload a replacement proof.'
    : Number(c.evidence_count)>0 && c.verification_state!=='VERIFIED'
      ? 'Proof received. RecoverIT is checking it now. No action is needed.'
      : c.status==='WAITING_FOR_USER'
        ? (waiting?.detail||'Add only the specific detail RecoverIT requests for this case.')
        : running?.detail || (Number(c.evidence_count)>0 ? 'Proof verified. RecoverIT is moving to the next step.' : 'RecoverIT is preparing the case and will ask for proof only when it is needed.');
  const currentStep=running?.title||waiting?.title||(done<steps.length?steps[done]?.title:null)||'Investigation';
  const elapsed=Math.floor(Math.max(0,Date.now()-new Date(c.created_at).getTime())/60000);
  const {steps:_ignored,...caseWithoutSteps}=c;
  res.json({
    case:caseWithoutSteps,
    steps,
    evidence_count:Number(c.evidence_count||0),
    progress:{done,total:steps.length,percent:steps.length?Math.round(done/steps.length*100):0,elapsed_minutes:elapsed,last_updated:c.updated_at},
    current_step:currentStep,
    guidance,
    verification:{state:c.verification_state||'UNVERIFIED',confidence:c.verification_confidence==null?null:Number(c.verification_confidence),last_checked_at:c.verification_last_checked_at,last_available_at:c.verification_last_available_at,reason:c.verification_reason||'RecoverIT is checking the available evidence.'},
    ai:{status:c.ai_status||'PENDING',summary:c.ai_summary||null}
  });
}