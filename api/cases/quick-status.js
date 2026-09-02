import { db } from 'hatchable';
export const access='user'; export const methods=['GET'];
export default async function(req,res){
 const u=req.user; const id=String(req.query?.case_id||'');
 const params=id?[id,u.id]:[u.id];
 const sql=id
  ? `SELECT rc.id,rc.case_number,rc.status,rc.issue_type,rc.description,rc.amount,rc.currency,rc.payment_method,rc.merchant_name,rc.transaction_reference,rc.confidence_score,rc.created_at,rc.updated_at,rc.verification_state,rc.verification_confidence,rc.verification_last_checked_at,rc.verification_last_available_at,rc.verification_reason FROM recovery_cases rc WHERE (rc.id::text=$1 OR rc.case_number=$1) AND rc.user_id=$2 LIMIT 1`
  : `SELECT rc.id,rc.case_number,rc.status,rc.issue_type,rc.description,rc.amount,rc.currency,rc.payment_method,rc.merchant_name,rc.transaction_reference,rc.confidence_score,rc.created_at,rc.updated_at,rc.verification_state,rc.verification_confidence,rc.verification_last_checked_at,rc.verification_last_available_at,rc.verification_reason FROM recovery_cases rc WHERE rc.user_id=$1 ORDER BY rc.created_at DESC LIMIT 1`;
 const r=await db.query(sql,params); if(!r.rows[0])return res.status(404).json({error:'Case not found.'});
 const c=r.rows[0];
 res.json({case:c,steps:[],progress:{percent:0,done:0,total:0,elapsed_minutes:Math.floor(Math.max(0,Date.now()-new Date(c.created_at).getTime())/60000),last_updated:c.updated_at},current_step:'Loading investigation',guidance:'RecoverIT is opening your case. Detailed evidence and timeline load in the background.',verification:{state:c.verification_state||'UNVERIFIED',confidence:c.verification_confidence==null?null:Number(c.verification_confidence),last_checked_at:c.verification_last_checked_at,last_available_at:c.verification_last_available_at,reason:c.verification_reason||'RecoverIT is checking the available evidence.'}});
}