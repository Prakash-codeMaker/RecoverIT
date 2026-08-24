import { db } from 'hatchable';
export const access='user';
export const methods=['GET'];

export default async function(req,res){
  const id=req.query?.case_id;
  if(!id)return res.status(400).json({error:'Case ID is required.'});
  const r=await db.query(`SELECT c.id,c.case_number,c.issue_type,c.description,c.amount,c.currency,c.merchant_name,c.transaction_reference,c.payment_method,c.status,c.confidence_score,c.ai_summary,c.ai_findings,c.ai_next_steps,c.ai_confidence,c.ai_last_run_at,c.identity_status,c.identity_verified_at,c.ai_status,c.updated_at,
    COALESCE((SELECT json_agg(s ORDER BY s.created_at ASC) FROM (SELECT step_key,title,status,detail,created_at,completed_at FROM investigation_steps WHERE case_id=c.id) s),'[]'::json) AS steps
    FROM recovery_cases c WHERE c.id=$1 AND c.user_id=$2 LIMIT 1`,[id,req.user.id]);
  if(!r.rows[0])return res.status(404).json({error:'Case not found.'});
  const c=r.rows[0];
  const [events,evidence]=await Promise.all([
    db.query('SELECT title,detail,state,source,confidence,created_at FROM case_events WHERE case_id=$1 ORDER BY created_at DESC LIMIT 20',[id]),
    db.query('SELECT filename,content_type,bytes,sha256,created_at FROM evidence WHERE case_id=$1 ORDER BY created_at ASC',[id])
  ]);
  const steps=c.steps||[];
  const done=steps.filter(s=>s.status==='DONE').length;
  const running=steps.find(s=>s.status==='RUNNING');
  res.json({
    case:c,
    steps,
    events:events.rows,
    evidence:evidence.rows,
    progress:{done,total:steps.length,percent:steps.length?Math.round(done/steps.length*100):0},
    guidance:c.identity_status!=='VERIFIED_ACCOUNT'?'Verify your signed-in account details so RecoverIT can continue the investigation.':c.status==='WAITING_FOR_USER'?'Add the transaction/reference number or provider response so RecoverIT AI can continue reconciling the case.':running?.detail||'RecoverIT AI is continuously checking the evidence and provider trail.' ,
    ai:{ready:c.ai_status==='AVAILABLE',status:c.ai_status||'PENDING',summary:c.ai_summary,findings:Array.isArray(c.ai_findings)?c.ai_findings:[],next_steps:Array.isArray(c.ai_next_steps)?c.ai_next_steps:[],confidence:c.ai_confidence==null?null:Number(c.ai_confidence),last_run_at:c.ai_last_run_at}
  });
}