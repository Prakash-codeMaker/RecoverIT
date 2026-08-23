import { db } from 'hatchable';
export const access='user'; export const methods=['GET'];
export default async function(req,res){
 const u=req.user; const id=String(req.query?.case_id||'');
 const params=id?[id,u.id]:[u.id];
 const sql=id?'SELECT id,case_number,status,issue_type,description,amount,currency,payment_method,merchant_name,transaction_reference,confidence_score,created_at,updated_at FROM recovery_cases WHERE id=$1 AND user_id=$2':'SELECT id,case_number,status,issue_type,description,amount,currency,payment_method,merchant_name,transaction_reference,confidence_score,created_at,updated_at FROM recovery_cases WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1';
 const r=await db.query(sql,params); if(!r.rows[0])return res.status(404).json({error:'Case not found.'});
 const c=r.rows[0];
 const [steps,events,evidence]=await Promise.all([
  db.query('SELECT step_key,title,status,detail,created_at,completed_at FROM investigation_steps WHERE case_id=$1 ORDER BY created_at ASC',[c.id]),
  db.query('SELECT title,detail,state,source,confidence,created_at FROM case_events WHERE case_id=$1 ORDER BY created_at ASC LIMIT 30',[c.id]),
  db.query('SELECT filename,content_type,bytes,sha256,created_at FROM evidence WHERE case_id=$1 ORDER BY created_at ASC',[c.id])
 ]);
 const done=steps.rows.filter(s=>s.status==='DONE').length; const running=steps.rows.find(s=>s.status==='RUNNING'); const waiting=steps.rows.find(s=>s.status==='WAITING'); const progress=Math.round((done/Math.max(1,steps.rows.length))*100); const guidance=waiting?'RecoverIT needs more provider-side evidence before it can verify the payment state.':running?running.detail:(evidence.rows.length?'Keep your original proof and do not repeat a refund/payment action while the current state is unresolved.':'Upload the strongest proof you have: receipt, bank statement, refund message or merchant response.'); const elapsedMs=Math.max(0,Date.now()-new Date(c.created_at).getTime()); const elapsedMinutes=Math.floor(elapsedMs/60000); res.json({case:c,steps:steps.rows,events:events.rows,evidence:evidence.rows,progress:{percent:progress,done,total:steps.rows.length,elapsed_minutes:elapsedMinutes,last_updated:c.updated_at},guidance,current_step:running?.title||waiting?.title||'Investigation review complete'});
}