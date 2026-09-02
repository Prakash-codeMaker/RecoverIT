import { db } from 'hatchable';
import { getCase } from 'lib/case.js';
export const access='user'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.user.id);if(!c)return res.status(404).json({error:'Case not found.'});
 const state=(await db.query("SELECT transaction_state,amount,currency,external_transaction_id,reference FROM financial_transactions WHERE case_id=$1 AND transaction_state IN ('REFUND_INITIATED','REFUND_PROCESSED') ORDER BY updated_at DESC LIMIT 1",[c.id])).rows[0];
 if(!state)return res.status(409).json({error:'RecoverIT does not yet have a provider-confirmed refund to mark as received.'});
 const note=String(req.body?.note||'User confirmed the refund has reached the original payment account.').slice(0,1000);
 await db.query("UPDATE financial_transactions SET transaction_state='REFUND_RECEIVED',updated_at=now() WHERE id=$1",[state.id]);
 await db.query("UPDATE payment_monitors SET active=false,last_status='RECEIVED',last_checked_at=now() WHERE case_id=$1",[c.id]);
 await db.query("UPDATE dispute_state SET phase='RESOLVED',waiting_for_user=false,resolution_status='RESOLVED',next_action='Refund received and confirmed by you.',next_action_at=now(),updated_at=now() WHERE case_id=$1",[c.id]);
 await db.query("UPDATE recovery_cases SET status='RESOLVED',resolved_at=now(),updated_at=now() WHERE id=$1",[c.id]);
 await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[c.id,'REFUND_RECEIVED','Refund received',note,'RESOLVED','user']);
 await db.query('INSERT INTO notifications (user_id,case_id,type,title,description) VALUES ($1,$2,$3,$4,$5)',[req.user.id,c.id,'case_update','Refund received','You confirmed that the refunded money has reached your original payment account. RecoverIT has closed the case.']);
 res.json({ok:true,status:'REFUND_RECEIVED',message:'Refund receipt recorded and the case is now resolved.'});
}