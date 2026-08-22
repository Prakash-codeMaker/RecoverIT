import { db, ai } from 'hatchable';
import { getCase, addEvent } from 'lib/case.js';
export const access='member'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.member.id); if(!c)return res.status(404).json({error:'Case not found.'});
 const prompt=`Classify this payment recovery case. Return JSON-like plain text with likely_canonical_state, risk, explanation. Never claim a provider confirmed anything. Issue: ${c.issue_type}; description: ${c.description}; amount: ${c.amount} ${c.currency}; merchant: ${c.merchant_name||'unknown'}; reference: ${c.transaction_reference||'unknown'}.`;
 let explanation='RecoverIT is checking the available information without assuming an unverified provider state.';
 try{ const out=await ai.generateText({model:'sonnet',prompt,purpose:'payment recovery investigation'}); explanation=String(out.text||out).slice(0,1000); }catch(e){ console.log('AI unavailable',e.message); }
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=now() WHERE case_id=$3 AND step_key=$4',['DONE',explanation,c.id,'payment']);
 await db.query('UPDATE investigation_steps SET status=$1 WHERE case_id=$2 AND step_key=$3',['DONE',c.id,'timeline']);
 await db.query('UPDATE investigation_steps SET status=$1 WHERE case_id=$2 AND step_key=$3',['RUNNING',c.id,'provider']);
 await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['INVESTIGATING',c.id]);
 await addEvent(c.id,'Payment investigation started',explanation,'INVESTIGATING','RecoverIT AI');
 res.json({ok:true,explanation});
}