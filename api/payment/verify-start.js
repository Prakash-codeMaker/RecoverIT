import { db } from 'hatchable';
import { verifyCaseEvidence } from 'lib/case-verification.js';
export const access='user'; export const methods=['POST'];
export default async function(req,res){
 const user=req.user;const b=req.body||{};const caseId=String(b.case_id||'').trim();
 if(!caseId)return res.status(400).json({error:'Case ID is required.'});
 const {rows}=await db.query('SELECT id,case_number,amount,currency,payment_method,transaction_reference,merchant_name,description FROM recovery_cases WHERE id=$1 AND user_id=$2',[caseId,user.id]);
 const c=rows[0];if(!c)return res.status(404).json({error:'Case not found.'});
 const checks=[];
 checks.push({key:'case_owner',label:'Signed-in account matches this case',status:'verified'});
 checks.push({key:'transaction_reference',label:'Payment reference',status:c.transaction_reference?'provided':'needed'});
 checks.push({key:'payment_amount',label:'Payment amount',status:c.amount!=null?'provided':'needed'});
 checks.push({key:'payment_method',label:'Payment method',status:c.payment_method?'provided':'needed'});
 checks.push({key:'merchant',label:'Merchant information',status:c.merchant_name?'provided':'optional'});
 const supported=checks.filter(x=>x.status==='verified'||x.status==='provided').length;
 let verification=null;
 try{verification=await verifyCaseEvidence(c.id,user.id,'manual_check_now');}
 catch(error){verification={ok:false,result:'UNVERIFIED',ai_available:false,reason:String(error?.message||error)};}
 const next=verification?.result==='VERIFIED'
  ? 'Evidence is verified. RecoverIT can now use the verified facts for the provider/dispute workflow.'
  : verification?.result==='REVIEW'
   ? 'Proof received. RecoverIT is checking it now. You do not need to upload anything else unless RecoverIT asks.'
   : verification?.result==='REJECTED'
    ? 'The attached evidence does not currently support the case. Add relevant payment proof to continue.'
    : 'RecoverIT could not complete automated verification right now. The case remains open and the verifier will retry automatically.';
 res.json({ok:true,case:{id:c.id,case_number:c.case_number,amount:c.amount,currency:c.currency,payment_method:c.payment_method,merchant_name:c.merchant_name},checks,verification,verification_summary:{verified:supported,needs_attention:checks.filter(x=>x.status==='needed').map(x=>x.label)},next});
}