import { db, scheduler } from 'hatchable';
import { razorpayRequest } from 'lib/integrations.js';
import { notifyUser } from 'lib/dispute-automation.js';
export const access='scheduler'; export const methods=['POST']; export const schedule='15 * * * *';
export default async function(req,res){
 const r=await db.query(`SELECT pm.id,pm.case_id,pm.user_id,pm.expected_at,pm.last_status,c.case_number,c.amount,c.currency,c.transaction_reference,c.status,
  (SELECT t.external_transaction_id FROM financial_transactions t WHERE t.case_id=pm.case_id AND t.provider='razorpay_refund' ORDER BY t.updated_at DESC LIMIT 1) AS refund_id
  FROM payment_monitors pm JOIN recovery_cases c ON c.id=pm.case_id WHERE pm.active=true LIMIT 100`);
 let checked=0,alerts=0,providerChecks=0;
 for(const m of r.rows){
  let status=m.last_status||'WATCHING';
  if(m.refund_id){
   try{const out=await razorpayRequest('GET',`/refunds/${encodeURIComponent(m.refund_id)}`);providerChecks++;if(out.ok){const st=String(out.data?.status||'').toLowerCase();if(st==='pending')status='REFUND_PENDING';else if(st==='processed')status='REFUND_PROCESSED';else if(st==='failed')status='REFUND_FAILED';
     if(st==='processed'&&m.last_status!=='REFUND_PROCESSED'){await db.query("UPDATE financial_transactions SET transaction_state='REFUND_PROCESSED',reference=COALESCE($1,reference),raw_payload=$2,updated_at=now() WHERE provider='razorpay_refund' AND external_transaction_id=$3",[out.data?.acquirer_data?.rrn||out.data?.acquirer_data?.arn||out.data?.acquirer_data?.utr||null,out.data,m.refund_id]);await db.query("UPDATE dispute_state SET phase='AWAITING_REFUND',next_action='Refund processed. Confirm once the money appears in your original payment account.',next_action_at=now(),updated_at=now() WHERE case_id=$1",[m.case_id]);await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[m.case_id,'REFUND_PROCESSED','Refund processed','Provider API confirms the refund is processed; customer receipt is still pending confirmation.','ACTION_REQUIRED','Razorpay']);await notifyUser(m.user_id,m.case_id,'Refund processed — confirmation needed','The payment provider now reports the refund as processed. Please confirm once the money actually reaches your original payment account.');alerts++;}
     if(st==='failed'&&m.last_status!=='REFUND_FAILED'){await notifyUser(m.user_id,m.case_id,'Refund failed — RecoverIT is continuing','The payment provider reports a refund failure. RecoverIT will keep your case open and continue with the next resolution path.');alerts++;}
   }}catch(_){ }
  }
  const due=m.expected_at&&new Date(m.expected_at).getTime()<=Date.now();if(due&&status==='WATCHING')status='OVERDUE_CHECK';
  await db.query('UPDATE payment_monitors SET last_status=$1,last_checked_at=now() WHERE id=$2',[status,m.id]);
  if(due&&m.last_status!=='OVERDUE_CHECK'&&status==='OVERDUE_CHECK'){await notifyUser(m.user_id,m.case_id,'Refund/payment checkpoint reached',`RecoverIT reached the expected checkpoint for case ${m.case_number}. We are checking the provider trail now.`);alerts++;}
  checked++;
 }
 res.json({ok:true,checked,alerts,provider_checks:providerChecks});
}