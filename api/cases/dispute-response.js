import { db } from 'hatchable';
import { getCase } from 'lib/case.js';
import { applyExternalResponse } from 'lib/dispute-automation.js';
export const access='user'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.user.id);if(!c)return res.status(404).json({error:'Case not found.'});
 const raw=String(req.body?.response||'').trim();if(raw.length<5)return res.status(400).json({error:'Paste the organization response, acknowledgement, or the next message you received.'});
 let attemptId=String(req.body?.attempt_id||'').trim()||null;
 if(!attemptId){attemptId=(await db.query('SELECT current_attempt_id FROM dispute_state WHERE case_id=$1 AND user_id=$2',[c.id,req.user.id])).rows[0]?.current_attempt_id||null;}
 const result=await applyExternalResponse({caseRow:{id:c.id,user_id:c.user_id,description:c.description,amount:c.amount,currency:c.currency,merchant_name:c.merchant_name,payment_method:c.payment_method},attemptId,source:'USER_CAPTURED',channel:'PASTE',rawText:raw,metadata:{requirements:req.body?.requirements||[]},attachments:req.body?.attachments||[]});
 res.json({ok:true,...result,next_escalation:null});
}