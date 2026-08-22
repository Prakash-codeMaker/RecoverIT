import { db } from 'hatchable';
export const access='member'; export const methods=['GET'];
export default async function(req,res){
 const u=req.member; const id=String(req.query?.case_id||'');
 const params=id?[id,u.id]:[u.id];
 const sql=id?'SELECT id,case_number,status,issue_type,description,amount,currency,payment_method,merchant_name,transaction_reference,confidence_score,created_at,updated_at FROM recovery_cases WHERE id=$1 AND user_id=$2':'SELECT id,case_number,status,issue_type,description,amount,currency,payment_method,merchant_name,transaction_reference,confidence_score,created_at,updated_at FROM recovery_cases WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1';
 const r=await db.query(sql,params); if(!r.rows[0])return res.status(404).json({error:'Case not found.'});
 const c=r.rows[0];
 const [steps,events,evidence]=await Promise.all([
  db.query('SELECT step_key,title,status,detail,created_at,completed_at FROM investigation_steps WHERE case_id=$1 ORDER BY created_at ASC',[c.id]),
  db.query('SELECT title,detail,state,source,confidence,created_at FROM case_events WHERE case_id=$1 ORDER BY created_at ASC LIMIT 30',[c.id]),
  db.query('SELECT filename,content_type,bytes,sha256,created_at FROM evidence WHERE case_id=$1 ORDER BY created_at ASC',[c.id])
 ]);
 res.json({case:c,steps:steps.rows,events:events.rows,evidence:evidence.rows});
}