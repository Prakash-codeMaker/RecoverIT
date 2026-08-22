import { db } from 'hatchable';
import { getCase, addEvent } from 'lib/case.js';
export const access='member'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.member.id); if(!c)return res.status(404).json({error:'Case not found.'});
 const key=`refund:${c.id}:${c.amount}`;
 const existing=await db.query('SELECT action_id,resulting_state,verification_state FROM actions WHERE idempotency_key=$1',[key]);
 if(existing.rows[0]){ await addEvent(c.id,'Duplicate action blocked','An existing refund action matches this payment. RecoverIT did not initiate another refund.','ACTION_REQUIRED','Action Ledger'); return res.status(409).json({blocked:true,reason:'DUPLICATE_ACTION',action:existing.rows[0]}); }
 const actionId=`ACT-${Math.floor(100000+Math.random()*900000)}`;
 try{
  await db.query('INSERT INTO actions (case_id,action_id,action_type,idempotency_key,actor,authorization,provider,amount,previous_state,requested_state,resulting_state,verification_state,approval_state) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[c.id,actionId,'REFUND',key,'system','policy-gated','RAZORPAY_TEST',c.amount,'REFUND_PENDING','REFUND_PENDING','REFUND_PENDING','PENDING','TEST_ONLY']);
 }catch(e){ const again=await db.query('SELECT action_id FROM actions WHERE idempotency_key=$1',[key]); if(again.rows[0])return res.status(409).json({blocked:true,reason:'CONCURRENT_DUPLICATE',action:again.rows[0]}); throw e; }
 await addEvent(c.id,'Safe refund action recorded','A test-mode refund action was recorded in the Action Ledger. No real money was moved.','RECOVERY_IN_PROGRESS','Action Ledger');
 res.json({accepted:true,test_mode:true,action_id:actionId});
}