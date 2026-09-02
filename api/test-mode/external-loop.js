import { db } from 'hatchable';
import crypto from 'node:crypto';
import { applyExternalResponse } from 'lib/dispute-automation.js';
export const access='scheduler'; export const methods=['POST'];
async function q(sql,p=[]){return (await db.query(sql,p)).rows;}
async function cleanup(id,keys=[]){for(const t of ['payment_monitors','financial_transactions','notifications','communication_messages','dispute_responses','dispute_requirements','dispute_attempts','dispute_state','case_events','evidence_analysis','evidence','recovery_cases']){try{await db.query(`DELETE FROM ${t} WHERE case_id=$1`,[id]);}catch(_){}}}
export default async function(req,res){
 const id=crypto.randomUUID(),userId=`qa-external-${crypto.randomUUID()}`,number=`QA-EXT-${id.slice(0,8)}`;const checks=[];const add=(name,ok,detail)=>checks.push({name,ok:Boolean(ok),detail:String(detail||'')});
 try{
  await db.query('INSERT INTO recovery_cases (id,case_number,user_id,issue_type,description,amount,currency,merchant_name,transaction_reference,payment_method,status,identity_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,number,userId,'refund_not_received','Merchant promised a refund of INR 500 after a failed payment.',500,'INR','QA Merchant','QA-EXT-REF-123','UPI','INVESTIGATING','VERIFIED_ACCOUNT']);
  const a=await db.query('INSERT INTO dispute_attempts (case_id,user_id,route_id,level,organization,channel,destination,status,subject,body,package_json) VALUES ($1,$2,(SELECT id FROM dispute_routes WHERE active=true LIMIT 1),1,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[id,userId,'QA Support','EMAIL_OR_PORTAL','qa@example.invalid','SENT','QA dispute', 'RecoverIT QA contact', JSON.stringify({})]);
  const attemptId=a.rows[0].id;await db.query('UPDATE dispute_attempts SET sent_at=now() WHERE id=$1',[attemptId]);await db.query("INSERT INTO dispute_state (case_id,user_id,phase,current_level,current_attempt_id,waiting_for_user,next_action,next_action_at) VALUES ($1,$2,'AWAITING_RESPONSE',1,$3,false,'Waiting for organization response.',now())",[id,userId,attemptId]);
  const c={id,user_id:userId,description:'Merchant promised a refund of INR 500 after a failed payment.',amount:500,currency:'INR',merchant_name:'QA Merchant',payment_method:'UPI'};
  const need=await applyExternalResponse({caseRow:c,attemptId,source:'QA_ORG',channel:'EMAIL',rawText:'Please provide your bank statement for the refund transaction.',metadata:{requirements:['bank statement']},attachments:[]});
  const reqs=(await q("SELECT requirement,status FROM dispute_requirements WHERE case_id=$1 AND status='REQUESTED'",[id]));add('organization_requests_document',need.state==='MORE_INFO_REQUIRED'&&reqs.length===1,JSON.stringify(reqs));
  const init=await applyExternalResponse({caseRow:c,attemptId,source:'QA_ORG',channel:'EMAIL',rawText:'Your refund of INR 500 has been initiated. Refund reference RFD123456.',metadata:{refund_reference:'RFD123456'},attachments:[]});
  const tx1=(await q("SELECT transaction_state,reference FROM financial_transactions WHERE case_id=$1 ORDER BY updated_at DESC LIMIT 1",[id]))[0];add('refund_initiated_recorded',tx1?.transaction_state==='REFUND_INITIATED',JSON.stringify(tx1));
  const mon=(await q("SELECT active,last_status FROM payment_monitors WHERE case_id=$1 ORDER BY created_at DESC LIMIT 1",[id]))[0];add('refund_monitor_started',Boolean(mon?.active),JSON.stringify(mon));
  const processed=await applyExternalResponse({caseRow:c,attemptId,source:'QA_ORG',channel:'EMAIL',rawText:'Refund reference RFD123456 is now processed successfully.',metadata:{refund_reference:'RFD123456'},attachments:[]});
  const tx2=(await q("SELECT transaction_state FROM financial_transactions WHERE case_id=$1 ORDER BY updated_at DESC LIMIT 1",[id]))[0];add('refund_processed_recorded',tx2?.transaction_state==='REFUND_PROCESSED',JSON.stringify(tx2));
  const notif=(await q("SELECT title FROM notifications WHERE case_id=$1 ORDER BY created_at DESC LIMIT 5",[id]));add('user_notified',notif.length>0,notif.map(x=>x.title).join(' | '));
  add('case_not_closed_before_receipt',(await q("SELECT status FROM recovery_cases WHERE id=$1",[id]))[0]?.status!=='RESOLVED','provider processing does not equal customer receipt');
  res.json({ok:checks.every(x=>x.ok),checks,cleanup:true,notes:'No real organization was contacted by this test.'});
 }catch(e){checks.push({name:'runtime_exception',ok:false,detail:String(e.message||e)});res.json({ok:false,checks,cleanup:true});}
 finally{await cleanup(id);}
}