import { db } from 'hatchable';
import { getCase } from 'lib/case.js';
import { razorpayRequest, canonicalPaymentState } from 'lib/integrations.js';
export const access='member'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.member.id); if(!c)return res.status(404).json({error:'Case not found.'});
 const paymentId=String(req.body?.payment_id||c.transaction_reference||'').trim(); if(!paymentId)return res.status(400).json({error:'A Razorpay payment ID is required.'});
 const out=await razorpayRequest('GET',`/payments/${encodeURIComponent(paymentId)}`); if(!out.configured)return res.status(503).json(out); if(!out.ok)return res.status(out.status).json({error:'Razorpay request failed.',provider:out.data});
 const p=out.data;
 await db.query('INSERT INTO financial_transactions (user_id,case_id,provider,external_transaction_id,reference,amount,currency,transaction_state,transaction_at,merchant_name,payment_method,raw_payload,source,verified) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING',[req.member.id,c.id,'razorpay',p.id,p.order_id||p.id,p.amount?Number(p.amount)/100:null,p.currency||'INR',canonicalPaymentState(p.status),p.created_at?new Date(Number(p.created_at)*1000).toISOString():null,p.description||null,p.method||null,p,'razorpay_api',true]);
 await db.query('UPDATE recovery_cases SET transaction_reference=COALESCE(transaction_reference,$1),updated_at=now() WHERE id=$2',[paymentId,c.id]);
 res.json({ok:true,provider:'razorpay',payment:p,canonical_state:canonicalPaymentState(p.status)});
}