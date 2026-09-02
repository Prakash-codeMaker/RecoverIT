import { db, webhooks, config, scheduler } from 'hatchable';
import { notifyUser } from 'lib/dispute-automation.js';
export const access='public'; export const methods=['POST'];
export default async function(req,res){
 const secret=await config.get('razorpay_webhook_secret');if(!secret)return res.status(503).json({error:'Razorpay webhook is not configured.'});
 const sig=req.headers['x-razorpay-signature']||'';const ok=await webhooks.verifyHmac({raw:req.rawBody,signature:sig,secret,algorithm:'sha256',encoding:'hex'});if(!ok)return res.status(401).json({error:'Invalid signature.'});
 const b=req.body||{};const event=String(b.event||'unknown');const p=b.payload?.payment?.entity||{};const refund=b.payload?.refund?.entity||{};const ext=String(b.event_id||refund.id||p.id||`razorpay-${Date.now()}`);
 const stateMap={'payment.authorized':'PAYMENT_AUTHORIZED','payment.captured':'PAYMENT_CAPTURED','payment.failed':'PAYMENT_FAILED','refund.created':'REFUND_INITIATED','refund.processed':'REFUND_PROCESSED','refund.failed':'REFUND_FAILED'};
 const ins=await db.query('INSERT INTO provider_events (provider,external_event_id,event_type,canonical_state,payload_json) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (external_event_id) DO NOTHING RETURNING id',["RAZORPAY",ext,event,stateMap[event]||'UNKNOWN',JSON.stringify(b)]);
 if(!ins.rows.length)return res.json({received:true,idempotent:true});
 let matched=[];
 if(refund?.payment_id){matched=(await db.query('SELECT c.id,c.user_id,c.case_number,c.amount,c.currency,c.merchant_name,c.payment_method FROM recovery_cases c WHERE c.transaction_reference=$1 OR EXISTS (SELECT 1 FROM financial_transactions t WHERE t.case_id=c.id AND t.provider=\'razorpay\' AND t.external_transaction_id=$1)',[String(refund.payment_id)])).rows;}
 if(!matched.length&&p.id){matched=(await db.query('SELECT c.id,c.user_id,c.case_number,c.amount,c.currency,c.merchant_name,c.payment_method FROM recovery_cases c WHERE c.transaction_reference=$1 OR EXISTS (SELECT 1 FROM financial_transactions t WHERE t.case_id=c.id AND t.provider=\'razorpay\' AND t.external_transaction_id=$1)',[String(p.id)])).rows;}
 for(const c of matched){
  if(refund?.id){
   const txState=event==='refund.created'?'REFUND_INITIATED':event==='refund.processed'?'REFUND_PROCESSED':event==='refund.failed'?'REFUND_FAILED':null;
   if(txState){await db.query('INSERT INTO financial_transactions (user_id,case_id,provider,external_transaction_id,reference,amount,currency,transaction_state,merchant_name,payment_method,raw_payload,source,verified,transaction_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CASE WHEN $14 IS NULL THEN NULL ELSE to_timestamp($14) END) ON CONFLICT (provider,external_transaction_id) DO UPDATE SET reference=$5,amount=$6,currency=$7,transaction_state=$8,raw_payload=$11,verified=$13,updated_at=now()',[c.user_id,c.id,'razorpay_refund',String(refund.id),refund.acquirer_data?.rrn||refund.acquirer_data?.arn||refund.acquirer_data?.utr||null,refund.amount?Number(refund.amount)/100:c.amount,refund.currency||c.currency||'INR',txState,c.merchant_name,c.payment_method,refund,'razorpay_webhook',true,refund.created_at?Number(refund.created_at):null]);
    if(event==='refund.created'){
      await db.query("INSERT INTO payment_monitors (case_id,user_id,monitor_type,expected_at,last_status,active) VALUES ($1,$2,'refund',now()+interval '7 days','REFUND_INITIATED',true)", [c.id,c.user_id]);
      await db.query("UPDATE dispute_state SET phase='AWAITING_REFUND',waiting_for_user=false,next_action='Razorpay has acknowledged the refund. RecoverIT is tracking the refund until it is processed.',next_action_at=now()+interval '48 hours',updated_at=now() WHERE case_id=$1",[c.id]);
      await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[c.id,'REFUND_INITIATED','Refund initiated','Razorpay reports that the refund has been created. RecoverIT will continue tracking it.','INVESTIGATING','Razorpay']);
      await notifyUser(c.user_id,c.id,'Your refund has been initiated',`Razorpay reports that the refund for ${c.currency||'INR'} ${refund.amount?Number(refund.amount)/100:(c.amount||'')} has been initiated. RecoverIT will keep tracking it.`);
    } else if(event==='refund.processed'){
      await db.query("UPDATE dispute_state SET phase='AWAITING_REFUND',waiting_for_user=false,next_action='Refund processed by Razorpay. RecoverIT is waiting for confirmation that the money reached your original payment account.',next_action_at=now(),updated_at=now() WHERE case_id=$1",[c.id]);
      await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[c.id,'REFUND_PROCESSED','Refund processed','Razorpay reports the refund as processed. This does not by itself prove the money has reached the customer account.','ACTION_REQUIRED','Razorpay']);
      await notifyUser(c.user_id,c.id,'Refund processed — confirm receipt',`Razorpay reports the refund as processed. RecoverIT will keep the case open until you confirm the money has actually reached your original payment account.`);
    } else if(event==='refund.failed'){
      await db.query("UPDATE dispute_state SET phase='ESCALATION_REQUIRED',waiting_for_user=false,next_action='Razorpay reports that the refund failed. RecoverIT is preparing the next legitimate resolution step.',next_action_at=now(),updated_at=now() WHERE case_id=$1",[c.id]);
      await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[c.id,'REFUND_FAILED','Refund failed','Razorpay reports that the refund could not be completed.','ACTION_REQUIRED','Razorpay']);
      await notifyUser(c.user_id,c.id,'Refund failed — RecoverIT is continuing','Razorpay reports that the refund failed. RecoverIT is keeping your case open and preparing the next resolution path.');
    }
   }
  } else {
   await notifyUser(c.user_id,c.id,'Payment provider update received',`RecoverIT received a new Razorpay event for case ${c.case_number} and is reconciling the latest payment state.`);
  }
  await scheduler.now('/api/cases/investigate-worker',{case_id:c.id,user_id:c.user_id});
 }
 res.json({received:true,matched_cases:matched.length,event,refund_state:refund?.status||null});
}