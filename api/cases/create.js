import { db, auth } from 'hatchable';
import { newCaseNumber, normalizeIssue, addEvent, addStep } from 'lib/case.js';
export const access = 'user';
export const methods = ['POST'];
export default async function(req,res){
  const u=req.user; const b=req.body||{};
  const issue=normalizeIssue(b.issue_type); const amount=Number(b.amount||0);
  if(!b.description || !Number.isFinite(amount) || amount<0) return res.status(400).json({error:'Tell us what happened and enter a valid amount.'});
  const caseNo=newCaseNumber();
  const r=await db.query('INSERT INTO recovery_cases (case_number,user_id,issue_type,description,amount,currency,merchant_name,transaction_reference,payment_method,status,priority,confidence_score) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,case_number,status,created_at',[caseNo,u.id,issue,b.description,amount,b.currency||'INR',b.merchant_name||null,b.transaction_reference||null,b.payment_method||null,'REPORTED',amount>=50000?'HIGH':'NORMAL',null]);
  const c=r.rows[0];
  await addEvent(c.id,'Case received','RecoverIT received your payment problem.','REPORTED','user');
  await addStep(c.id,'understanding','Understanding your report','DONE');
  await addStep(c.id,'payment','Checking payment information','RUNNING');
  await addStep(c.id,'timeline','Reconstructing payment timeline','PENDING');
  await addStep(c.id,'provider','Checking provider status','PENDING');
  await addStep(c.id,'safe_path','Determining safest next step','PENDING');
  await db.query('INSERT INTO notifications (user_id,case_id,type,title,description) VALUES ($1,$2,$3,$4,$5)',[u.id,c.id,'case_update','Case created',`Your case ${caseNo} is now being investigated.`]);
  return res.status(201).json(c);
}