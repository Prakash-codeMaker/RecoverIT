import { db, config } from 'hatchable';
import { applyExternalResponse } from 'lib/dispute-automation.js';
import { scheduler } from 'hatchable';
export const access='public'; export const methods=['POST'];
function safeEqual(a,b){const x=String(a||''),y=String(b||'');if(!x||!y||x.length!==y.length)return false;let n=0;for(let i=0;i<x.length;i++)n|=x.charCodeAt(i)^y.charCodeAt(i);return n===0}
export default async function(req,res){
 const secret=String(await config.get('recoverit_dispute_webhook_secret')||'').trim();
 if(!secret)return res.status(503).json({error:'Inbound dispute response webhook is not configured.'});
 const provided=String(req.headers['x-recoverit-webhook-secret']||req.headers['x-webhook-secret']||'');
 if(!safeEqual(provided,secret))return res.status(401).json({error:'Invalid webhook secret.'});
 const b=req.body||{},caseId=String(b.case_id||'').trim(),raw=String(b.response||b.body||b.message||'').trim();
 if(!caseId||raw.length<5)return res.status(400).json({error:'case_id and response text are required.'});
 const c=(await db.query('SELECT id,user_id,description,amount,currency,merchant_name,payment_method FROM recovery_cases WHERE id=$1 LIMIT 1',[caseId])).rows[0];
 if(!c)return res.status(404).json({error:'Case not found.'});
 const attemptId=String(b.attempt_id||'').trim()||null;
 const result=await applyExternalResponse({caseRow:c,attemptId,source:'EXTERNAL_WEBHOOK',channel:String(b.channel||'UNKNOWN'),rawText:raw,metadata:b.metadata||{},attachments:Array.isArray(b.attachments)?b.attachments:[]});
 try{await scheduler.now('/api/cases/workflow-advance',{case_id:caseId,user_id:c.user_id,workflow_trigger:'external_webhook'})}catch(_){ }
 res.json({ok:true,case_id:caseId,...result});
}