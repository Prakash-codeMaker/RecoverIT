import { db } from 'hatchable';
import { getCase } from 'lib/case.js';
export const access='member'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.member.id); if(!c)return res.status(404).json({error:'Case not found.'});
 const reference=String(req.body?.upi_reference||c.transaction_reference||'').trim(); if(!reference)return res.status(400).json({error:'UPI reference/UTR is required.'});
 const rows=await db.query('SELECT * FROM financial_transactions WHERE user_id=$1 AND (reference=$2 OR external_transaction_id=$2) ORDER BY transaction_at DESC LIMIT 20',[req.member.id,reference]);
 const providerEvents=await db.query('SELECT provider,event_type,canonical_state,payload_json,received_at FROM provider_events WHERE payload_json::text ILIKE $1 ORDER BY received_at DESC LIMIT 20',['%'+reference+'%']);
 const matches=[...rows.rows.map(x=>({source:'financial_transaction',state:x.transaction_state,amount:x.amount,merchant:x.merchant_name,verified:x.verified})),...providerEvents.rows.map(x=>({source:x.provider,event_type:x.event_type,state:x.canonical_state,received_at:x.received_at}))];
 res.json({ok:true,upi_reference:reference,matched:matches.length>0,matches,network_note:'UPI-wide transaction visibility requires a PSP/bank/AA-authorized connection; RecoverIT does not bypass NPCI/PSP access controls.'});
}