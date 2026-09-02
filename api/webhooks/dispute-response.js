import { db, config, webhooks } from 'hatchable';
import { applyExternalResponse } from 'lib/dispute-automation.js';
export const access='public'; export const methods=['POST'];
export default async function(req,res){
 const secret=await config.get('RECOVERIT_DISPUTE_WEBHOOK_SECRET');
 if(!secret)return res.status(503).json({error:'Inbound dispute response webhook is not configured.'});
 const signature=req.headers['x-recoverit-signature']||req.headers['x-webhook-signature']||'';
 if(!signature||!await webhooks.verifyHmac({raw:req.rawBody,signature,secret,algorithm:'sha256',encoding:'hex'}))return res.status(401).json({error:'Invalid webhook signature.'});
 const b=req.body||{};
 const attemptId=String(b.attempt_id||b.attemptId||'').trim(); const externalRef=String(b.external_reference||b.external_reference_id||b.message_id||'').trim(); const caseId=String(b.case_id||'').trim();
 if(attemptId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId))return res.status(400).json({error:'Invalid attempt_id.'});
 const q=await db.query(`SELECT a.*,c.description,c.amount AS case_amount,c.currency AS case_currency,c.merchant_name AS case_merchant,c.payment_method AS case_payment_method,c.user_id AS case_user_id
   FROM dispute_attempts a JOIN recovery_cases c ON c.id=a.case_id
   WHERE a.id=COALESCE(NULLIF($1,'')::uuid,a.id) AND (a.id=COALESCE(NULLIF($1,'')::uuid,a.id) OR a.external_reference=$2) AND ($3='' OR a.case_id::text=$3) LIMIT 1`,[attemptId,externalRef,caseId]);
 let a=q.rows[0];
 if(!a && externalRef)a=(await db.query('SELECT a.*,c.description,c.amount AS case_amount,c.currency AS case_currency,c.merchant_name AS case_merchant,c.payment_method AS case_payment_method,c.user_id AS case_user_id FROM dispute_attempts a JOIN recovery_cases c ON c.id=a.case_id WHERE a.external_reference=$1 ORDER BY a.created_at DESC LIMIT 1',[externalRef])).rows[0];
 if(!a)return res.status(404).json({error:'Dispute attempt not found.'});
 const provider=String(b.provider||'external_organization'); const externalMessageId=String(b.external_message_id||b.message_id||'').trim();
 if(externalMessageId){const prior=await db.query('SELECT id FROM communication_messages WHERE provider=$1 AND external_message_id=$2 LIMIT 1',[provider,externalMessageId]);if(prior.rows[0])return res.json({ok:true,idempotent:true,response_id:prior.rows[0].id});}
 const bodyText=String(b.body||b.text||b.message||'').trim();if(bodyText.length<2)return res.status(400).json({error:'Response body is required.'});
 await db.query('INSERT INTO communication_messages (user_id,case_id,channel,direction,destination,provider,external_message_id,status,body,metadata,sent_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())',[a.case_user_id,a.case_id,String(b.channel||'email').toLowerCase(),'INBOUND',String(b.from||a.destination||''),provider,externalMessageId||null,'RECEIVED',bodyText,JSON.stringify({subject:b.subject||'',thread_id:b.thread_id||null})]);
 const result=await applyExternalResponse({caseRow:{id:a.case_id,user_id:a.case_user_id,description:a.description,amount:a.case_amount,currency:a.case_currency,merchant_name:a.case_merchant,payment_method:a.case_payment_method},attemptId:a.id,source:provider,channel:String(b.channel||'email').toUpperCase(),rawText:bodyText,metadata:{external_reference:externalRef,refund_id:b.refund_id,refund_reference:b.refund_reference,requirements:b.requirements},attachments:b.attachments||[]});
 res.json({ok:true,...result});
}