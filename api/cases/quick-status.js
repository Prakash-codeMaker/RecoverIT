import { db } from 'hatchable';
export const access='user'; export const methods=['GET'];
export default async function(req,res){
 const u=req.user; const id=String(req.query?.case_id||'');
 const params=id?[id,u.id]:[u.id];
 const sql=id
  ? `SELECT rc.id,rc.case_number,rc.status,rc.issue_type,rc.description,rc.amount,rc.currency,rc.payment_method,rc.merchant_name,rc.transaction_reference,rc.confidence_score,rc.created_at,rc.updated_at,COALESCE((SELECT json_agg(json_build_object('step_key',s.step_key,'title',s.title,'status',s.status,'detail',s.detail,'created_at',s.created_at,'completed_at',s.completed_at) ORDER BY s.created_at ASC) FROM investigation_steps s WHERE s.case_id=rc.id),'[]'::json) AS steps FROM recovery_cases rc WHERE rc.id=$1 AND rc.user_id=$2 LIMIT 1`
  : `SELECT rc.id,rc.case_number,rc.status,rc.issue_type,rc.description,rc.amount,rc.currency,rc.payment_method,rc.merchant_name,rc.transaction_reference,rc.confidence_score,rc.created_at,rc.updated_at,COALESCE((SELECT json_agg(json_build_object('step_key',s.step_key,'title',s.title,'status',s.status,'detail',s.detail,'created_at',s.created_at,'completed_at',s.completed_at) ORDER BY s.created_at ASC) FROM investigation_steps s WHERE s.case_id=rc.id),'[]'::json) AS steps FROM recovery_cases rc WHERE rc.user_id=$1 ORDER BY rc.created_at DESC LIMIT 1`;
 const r=await db.query(sql,params); if(!r.rows[0])return res.status(404).json({error:'Case not found.'});
 const c=r.rows[0],steps=c.steps||[],done=steps.filter(s=>s.status==='DONE').length,running=steps.find(s=>s.status==='RUNNING'),waiting=steps.find(s=>s.status==='WAITING');
 const progress=Math.round((done/Math.max(1,steps.length))*100),elapsed=Math.floor(Math.max(0,Date.now()-new Date(c.created_at).getTime())/60000);
 res.json({case:c,steps,progress:{percent:progress,done,total:steps.length,elapsed_minutes:elapsed,last_updated:c.updated_at},current_step:running?.title||waiting?.title||'Investigation review complete',guidance:waiting?'We need one more piece of evidence from you before we can continue.':running?.detail||'RecoverIT is reviewing your case.'});
}