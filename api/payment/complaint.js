export const access='public';
export const methods=['POST'];
export default async function(req,res){
 const b=req.body||{};
 const amount=String(b.amount||'').trim(); const date=String(b.date||'').trim(); const method=String(b.method||'').trim(); const merchant=String(b.merchant||'').trim(); const reference=String(b.reference||'').trim(); const problem=String(b.problem||'').trim(); const relief=String(b.relief||'').trim()||'Please investigate the transaction, confirm its status, and provide the appropriate resolution.';
 if(!problem)return res.status(400).json({error:'Describe the payment problem.'});
 const lines=[`Subject: Payment dispute — ${merchant||'Transaction'}`,``,`Dear Support Team,`,``,`I am writing to request an investigation of a payment issue.`,``,`Payment amount: ${amount||'Not provided'}`,`Payment date: ${date||'Not provided'}`,`Payment method: ${method||'Not provided'}`,`Merchant / provider: ${merchant||'Not provided'}`,`Transaction / UTR / RRN: ${reference||'Not provided'}`,``,`What happened:`,problem,``,`Requested resolution:`,relief,``,`Please confirm receipt of this complaint and provide the investigation/reference number and next steps.`,``,`Regards`];
 res.json({ok:true,subject:`Payment dispute — ${merchant||'Transaction'}`,body:lines.join('\n')});
}