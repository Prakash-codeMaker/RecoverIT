import { db } from 'hatchable';
export function clean(v,max=4000){return String(v??'').replace(/[\u0000-\u001f]/g,' ').slice(0,max)}
export function hashText(s){let h=0x811c9dc5;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}
export async function getRoutes(c){
 const {rows}=await db.query('SELECT * FROM dispute_routes WHERE active=true AND (issue_type=$1 OR issue_type=$2 OR issue_type=$3) AND (payment_method=$4 OR payment_method IS NULL) ORDER BY CASE WHEN issue_type=$1 THEN 0 WHEN issue_type=$2 THEN 1 ELSE 2 END, level ASC',[c.issue_type,c.issue_type==='unrecognized_payment'?'unrecognized_payment':'consumer_issue',c.issue_type==='payment_failed_deducted'?'payment_failed_deducted':'consumer_issue',c.payment_method||null]);
 return rows.filter((x,i,a)=>a.findIndex(y=>y.organization===x.organization&&y.level===x.level)===i);
}
export function buildPackage(c,evidence,aiSummary,route){
 const docs=(route.required_documents||[]);return {case_number:c.case_number,issue_type:c.issue_type,description:clean(c.description,2500),amount:c.amount,currency:c.currency,merchant:c.merchant_name,transaction_reference:c.transaction_reference,payment_method:c.payment_method,ai_summary:clean(aiSummary,1500),evidence:evidence.map(e=>({filename:e.filename,sha256:e.sha256,content_type:e.content_type,bytes:e.bytes})),required_documents:docs,organization:route.organization};
}