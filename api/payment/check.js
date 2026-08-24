export const access='public';
export const methods=['POST'];

const classify=(text)=>{
 const s=String(text||'').toLowerCase();
 if(/refund|cashback|money back/.test(s)&&/not|never|missing|haven't|hasn't|didn't/.test(s))return ['refund_not_received','Refund not received'];
 if(/duplicate|twice|double charged|charged twice/.test(s))return ['duplicate_payment','Duplicate payment'];
 if(/failed|failure|declined/.test(s)&&/deduct|debit|charged|money/.test(s))return ['payment_failed_deducted','Payment failed but money was deducted'];
 if(/pending|stuck|processing/.test(s))return ['payment_stuck','Payment is pending or stuck'];
 if(/revers|reversal/.test(s))return ['payment_reversed','Payment reversed'];
 if(/unauthori|unrecognized|not mine|unknown payment/.test(s))return ['unrecognized_payment','Unrecognized payment'];
 if(/merchant|seller|store|shop|jio|amazon|flipkart/.test(s))return ['merchant_dispute','Merchant dispute'];
 return ['other','Payment issue'];
};
const method=(s)=>/\bupi\b/i.test(s)?'UPI':/credit card|debit card|\bcard\b/i.test(s)?'Card':/netbank/i.test(s)?'Netbanking':/wallet/i.test(s)?'Wallet':'Unknown';
export default async function(req,res){
 const text=String(req.body?.description||'').trim().slice(0,3000);
 if(!text)return res.status(400).json({error:'Tell us what happened.'});
 const [issue,label]=classify(text); const paymentMethod=method(text);
 const hasAmount=/(?:₹|rs\.?|inr)\s*[0-9]|\b[0-9][0-9,]*(?:\.\d{1,2})?\s*(?:rupees|rs|inr)\b/i.test(text);
 const hasReference=/\b(?:utr|rrn|txn|transaction|reference|ref)\s*(?:id|no|number|#)?\s*[:#-]?\s*[A-Z0-9_-]{6,}\b/i.test(text);
 const readiness=35+(hasAmount?25:0)+(hasReference?25:0)+(paymentMethod!=='Unknown'?15:0);
 const missing=[];
 if(!hasAmount)missing.push('payment amount');
 if(paymentMethod==='Unknown')missing.push('payment method');
 if(!hasReference)missing.push('transaction / UTR / RRN reference');
 const questions=issue==='refund_not_received'?['When was the refund marked as processed?','Do you have the refund/reference number?']:issue==='duplicate_payment'?['Which payment appears duplicated?','Do both transactions have separate references?']:issue==='payment_failed_deducted'?['What payment status did the app show?','Do you have the transaction/reference number?']:['What date did the payment happen?','What did the merchant or provider tell you?'];
 res.json({ok:true,issue,label,payment_method:paymentMethod,readiness,missing,questions,can_start_case:true,disclaimer:'This is a preliminary check, not a finding that a payment is valid, fraudulent, or refundable.'});
}