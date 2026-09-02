import { db } from 'hatchable';
import { getCase } from 'lib/case.js';

export const access='user';
export const methods=['GET'];

export default async function(req,res){
  const caseId=String(req.query?.case_id||'').trim();
  const c=await getCase(caseId,req.user.id);
  if(!c)return res.status(404).json({error:'Case not found.'});

  const ev=(await db.query(`SELECT e.id,e.filename,e.content_type,e.bytes,e.created_at,
    COALESCE(a.status,'PENDING') analysis_status,
    COALESCE(a.structured_data->>'verdict','') verdict,
    COALESCE(a.confidence,0) confidence
    FROM evidence e LEFT JOIN LATERAL (
      SELECT status,structured_data,confidence FROM evidence_analysis
      WHERE evidence_id=e.id AND analysis_type='document_understanding'
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST LIMIT 1
    ) a ON true WHERE e.case_id=$1 AND e.user_id=$2 ORDER BY e.created_at DESC`,[caseId,req.user.id])).rows;

  const verifiedEvidence=ev.filter(x=>String(x.verdict).toUpperCase()==='VERIFIED').length;
  const reviewEvidence=ev.filter(x=>String(x.verdict).toUpperCase()==='REVIEW').length;
  const tx=(await db.query(`SELECT provider,external_transaction_id,amount,currency,transaction_state,merchant_name,payment_method,transaction_at,verified
    FROM financial_transactions WHERE case_id=$1 AND user_id=$2 ORDER BY transaction_at DESC NULLS LAST LIMIT 10`,[caseId,req.user.id])).rows;
  const verifiedTx=tx.filter(x=>x.verified===true || String(x.verified).toLowerCase()==='true');
  const ds=(await db.query(`SELECT phase,waiting_for_user,next_action,current_attempt_id FROM dispute_state WHERE case_id=$1 AND user_id=$2 LIMIT 1`,[caseId,req.user.id])).rows[0]||null;

  const facts={
    amount:Boolean(c.amount!=null),
    merchant:Boolean(String(c.merchant_name||'').trim()),
    reference:Boolean(String(c.transaction_reference||'').trim()),
    method:Boolean(String(c.payment_method||'').trim())
  };
  const factScore=Math.round((Object.values(facts).filter(Boolean).length/4)*30);
  const evidenceScore=Math.min(30,verifiedEvidence*15);
  const reconciliationScore=verifiedTx.length?20:0;
  const routeScore=(c.provider_key||c.payment_method)?10:0;
  const disputeScore=ds?.phase?10:0;
  const score=Math.max(0,Math.min(100,factScore+evidenceScore+reconciliationScore+routeScore+disputeScore));

  const blockers=[];
  if(!facts.reference)blockers.push('Transaction reference is missing');
  if(!facts.amount)blockers.push('Payment amount is missing');
  if(!facts.merchant)blockers.push('Merchant/provider is not identified');
  if(!verifiedEvidence && ev.length)blockers.push('Uploaded evidence has not been verified yet');
  if(!verifiedEvidence && !ev.length)blockers.push('Add payment proof');
  if(c.payment_method?.toLowerCase().includes('razorpay') && !verifiedTx.length)blockers.push('Razorpay transaction has not been reconciled');

  const next=blockers[0]|| (ds?.waiting_for_user?String(ds.next_action||'Provide the requested information'): 'RecoverIT can continue with the current evidence.');
  res.json({ok:true,readiness:{score,label:score>=80?'Strong':score>=60?'Good':score>=40?'Needs more proof':'Early stage',next_action:next,blockers,verified_evidence:verifiedEvidence,review_evidence:reviewEvidence,total_evidence:ev.length,reconciled_transactions:verifiedTx.length,facts},payment_transactions:tx.slice(0,5),evidence:ev.slice(0,8),dispute:ds});
}