import { db } from 'hatchable';
import crypto from 'node:crypto';
import { getCase } from 'lib/case.js';
import { razorpayRequest } from 'lib/integrations.js';
export const access='user'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.user.id); if(!c)return res.status(404).json({error:'Case not found.'});
 const paymentId=String(req.body?.payment_id||c.transaction_reference||'').trim(); if(!paymentId)return res.status(400).json({error:'A Razorpay payment ID is required.'});
 const amount=req.body?.amount==null?null:Number(req.body.amount); if(amount!==null&&(!Number.isFinite(amount)||amount<=0))return res.status(400).json({error:'Invalid refund amount.'});
 const approval=String(req.body?.approval_token||'').trim(); if(approval!=='USER_APPROVED')return res.status(409).json({error:'Explicit user approval is required. This endpoint never moves money from an AI-only recommendation.'});
 const idem=`recoverit:${c.id}:razorpay:refund:${paymentId}:${amount??'full'}`;
 const prior=await db.query('SELECT action_id,status,external_id,response_json FROM action_executions WHERE action_id=$1',[idem]); if(prior.rows[0])return res.json({ok:true,idempotent:true,execution:prior.rows[0]});
 const actionId=`refund_${crypto.randomUUID()}`; await db.query('INSERT INTO action_executions (action_id,case_id,user_id,provider,operation,status) VALUES ($1,$2,$3,$4,$5,$6)',[idem,c.id,req.user.id,'razorpay','refund','EXECUTING']);
 const body=amount===null?{}:{amount:Math.round(amount*100)}; const out=await razorpayRequest('POST',`/payments/${encodeURIComponent(paymentId)}/refund`,body);
 if(!out.configured){await db.query('UPDATE action_executions SET status=$1,error=$2 WHERE action_id=$3',['BLOCKED',out.error,idem]);return res.status(503).json(out)}
 if(!out.ok){await db.query('UPDATE action_executions SET status=$1,error=$2,response_json=$3 WHERE action_id=$4',['FAILED','Razorpay refund request failed.',out.data,idem]);return res.status(out.status).json({error:'Refund request failed.',provider:out.data})}
 await db.query('UPDATE action_executions SET status=$1,external_id=$2,response_json=$3,executed_at=now(),completed_at=CASE WHEN $4=$5 THEN now() ELSE NULL END WHERE action_id=$6',['SUBMITTED',out.data?.id||null,out.data,String(out.data?.status||'').toLowerCase(),'processed',idem]);
 await db.query('UPDATE recovery_cases SET updated_at=now() WHERE id=$1',[c.id]);
 res.json({ok:true,provider:'razorpay',refund:out.data,idempotency_key:idem});
}