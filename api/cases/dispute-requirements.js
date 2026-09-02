import { db } from 'hatchable';
import { getCase } from 'lib/case.js';
export const access='user'; export const methods=['GET'];
export default async function(req,res){
 const c=await getCase(req.query?.case_id,req.user.id);if(!c)return res.status(404).json({error:'Case not found.'});
 const state=(await db.query('SELECT * FROM dispute_state WHERE case_id=$1',[c.id])).rows[0]||null;
 const attempts=(await db.query(`SELECT a.id,a.level,a.organization,a.channel,a.destination,a.status,a.subject,a.body,a.external_reference,a.sent_at,a.next_follow_up_at,a.last_response_at,r.official_url FROM dispute_attempts a LEFT JOIN dispute_routes r ON r.id=a.route_id WHERE a.case_id=$1 AND a.user_id=$2 ORDER BY a.created_at DESC`,[c.id,req.user.id])).rows;
 const requirements=(await db.query('SELECT id,attempt_id,requirement,reason,status,response_evidence_id,created_at,satisfied_at FROM dispute_requirements WHERE case_id=$1 AND user_id=$2 ORDER BY created_at DESC',[c.id,req.user.id])).rows;
 const communications=(await db.query('SELECT id,channel,direction,destination,provider,external_message_id,status,body,created_at,sent_at,delivered_at,failed_at,error FROM communication_messages WHERE case_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 30',[c.id,req.user.id])).rows;
 const refunds=(await db.query("SELECT id,provider,external_transaction_id,reference,amount,currency,transaction_state,transaction_at,updated_at FROM financial_transactions WHERE case_id=$1 AND transaction_state IN ('REFUND_INITIATED','REFUND_PROCESSED','REFUND_FAILED','REFUND_RECEIVED') ORDER BY updated_at DESC",[c.id])).rows;
 res.json({state,attempts,requirements,communications,refunds});
}