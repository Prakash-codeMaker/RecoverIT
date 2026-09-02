import { db } from 'hatchable';
import { getCase } from 'lib/case.js';
export const access='member'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.member.id); if(!c)return res.status(404).json({error:'Case not found.'});
 const run=await db.query('INSERT INTO reconciliation_runs (case_id,user_id,source,status) VALUES ($1,$2,$3,$4) RETURNING id',[c.id,req.member.id,'connected_financial_sources','RUNNING']);
 const reference=String(c.transaction_reference||'').trim(); const amount=Number(c.amount||0); const merchant=String(c.merchant_name||'').toLowerCase();
 const tx=await db.query('SELECT * FROM financial_transactions WHERE user_id=$1 AND (case_id=$2 OR ($3<>\'\' AND (reference=$3 OR external_transaction_id=$3))) ORDER BY transaction_at DESC NULLS LAST LIMIT 50',[req.member.id,c.id,reference]);
 let best=null,bestScore=0; for(const row of tx.rows){let score=0;if(reference&&(row.reference===reference||row.external_transaction_id===reference))score+=70;if(amount&&Number(row.amount)===amount)score+=20;if(merchant&&String(row.merchant_name||'').toLowerCase().includes(merchant))score+=10;if(score>bestScore){bestScore=score;best=row}}
 const findings=best?[{type:'transaction_match',status:bestScore>=80?'MATCHED':'POSSIBLE_MATCH',score:bestScore,transaction_id:best.id,transaction_state:best.transaction_state}]:[{type:'transaction_match',status:'NO_MATCH',message:'No connected financial transaction matched the case facts.'}];
 await db.query('UPDATE reconciliation_runs SET status=$1,matched_transaction_id=$2,match_score=$3,findings=$4,completed_at=now() WHERE id=$5',[best?'COMPLETED':'NO_MATCH',best?.id||null,bestScore,JSON.stringify(findings),run.rows[0].id]);
 res.json({ok:true,run_id:run.rows[0].id,status:best?'MATCHED':'NO_MATCH',match_score:bestScore,transaction:best,findings});
}