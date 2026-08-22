import { db } from 'hatchable';
export const access='member'; export const methods=['GET'];
export default async function(req,res){
 const id=req.query?.case_id;
 if(!id)return res.status(400).json({error:'Case ID is required.'});
 const r=await db.query(`SELECT c.id,c.case_number,c.issue_type,c.description,c.amount,c.currency,c.merchant_name,c.payment_method,c.status,c.confidence_score,c.updated_at,
 COALESCE((SELECT json_agg(s ORDER BY s.created_at ASC) FROM (SELECT step_key,title,status,detail,created_at,completed_at FROM investigation_steps WHERE case_id=c.id) s),'[]'::json) AS steps
 FROM recovery_cases c WHERE c.id=$1 AND c.user_id=$2 LIMIT 1`,[id,req.member.id]);
 if(!r.rows[0])return res.status(404).json({error:'Case not found.'});
 res.json({case:r.rows[0],steps:r.rows[0].steps||[]});
}