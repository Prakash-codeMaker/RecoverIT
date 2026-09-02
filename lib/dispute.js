import { db } from 'hatchable';
export function clean(v,max=4000){return String(v??'').replace(/[\u0000-\u001f]/g,' ').slice(0,max)}
export function hashText(s){let h=0x811c9dc5;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}
export async function getRoutes(c,providerKey=null){
 const issue=c.issue_type||''; const method=c.payment_method||''; const provider=providerKey||c.provider_key||null;
 const sql=`SELECT * FROM dispute_routes
 WHERE active=true
 AND (issue_type=$1 OR issue_type='consumer_issue')
 AND (payment_method=$2 OR payment_method IS NULL OR payment_method='')
 AND ($3::text IS NULL OR provider_key IS NULL OR provider_key=$3::text)
 ORDER BY CASE WHEN provider_key=$3::text THEN 0 WHEN issue_type=$1 THEN 1 ELSE 2 END,
          CASE WHEN payment_method=$2 THEN 0 WHEN payment_method IS NULL OR payment_method='' THEN 1 ELSE 2 END,
          level ASC`;
 const {rows}=await db.query(sql,[issue,method,provider]);
 return rows.filter((x,i,a)=>a.findIndex(y=>y.organization===x.organization&&y.level===x.level&&y.route_type===x.route_type)===i);
}
export async function currentAttempt(c,userId){
 const {rows}=await db.query("SELECT * FROM dispute_attempts WHERE case_id=$1 AND user_id=$2 AND status IN ('PREPARED','SENT') ORDER BY created_at DESC LIMIT 1",[c.id,userId]);
 return rows[0]||null;
}
export function buildPackage(c,evidence,aiSummary,route){
 const docs=(route.required_documents||[]);return {case_number:c.case_number,issue_type:c.issue_type,description:clean(c.description,2500),amount:c.amount,currency:c.currency,merchant:c.merchant_name,transaction_reference:c.transaction_reference,payment_method:c.payment_method,ai_summary:clean(aiSummary,1500),evidence:evidence.map(e=>({filename:e.filename,sha256:e.sha256,content_type:e.content_type,bytes:e.bytes})),required_documents:docs,organization:route.organization};
}
export async function eligibleRoutes(c,userId){
 const ctx=(await db.query('SELECT payer_bank_key,upi_provider_key,payment_rail,needs_user_confirmation FROM case_payment_context WHERE case_id=$1 AND user_id=$2 LIMIT 1',[c.id,userId])).rows[0]||{};
 const providerKey=ctx.payer_bank_key?`bank_${ctx.payer_bank_key}`:(ctx.upi_provider_key||null);const routes=await getRoutes(c,providerKey);
 const prior=await db.query("SELECT organization,status,level FROM dispute_attempts WHERE case_id=$1 AND user_id=$2 AND status IN ('SENT','RESPONDED','REJECTED','RESOLVED') ORDER BY created_at DESC",[c.id,userId]);
 const hasDirectProviderComplaint=prior.rows.some(x=>!['National Consumer Helpline','RBI Ombudsman','National Cyber Crime Reporting Portal'].includes(x.organization));
 const requireContext=ctx.payment_rail==='UPI' && !ctx.payer_bank_key && !ctx.upi_provider_key;
 if(requireContext)return [];
 return routes.filter(r=>r.organization!=='RBI Ombudsman'||hasDirectProviderComplaint);
}

export async function prepareFirstDisputeAction(c,userId){
 const verified=await db.query("SELECT id FROM evidence_analysis WHERE case_id=$1 AND analysis_type='document_understanding' AND status='COMPLETED' AND confidence IS NOT NULL AND confidence>=60 AND COALESCE(structured_data->>'verdict','')='VERIFIED' LIMIT 1",[c.id]);
 if(!verified.rows[0])return {status:'WAITING_FOR_VERIFICATION'};
 const existing=await currentAttempt(c,userId);
 if(existing)return {status:'ALREADY_PREPARED',attempt_id:existing.id};
 const routes=await eligibleRoutes(c,userId);
 if(!routes.length){
   const ctx=(await db.query('SELECT payment_rail,needs_user_confirmation FROM case_payment_context WHERE case_id=$1 AND user_id=$2 LIMIT 1',[c.id,userId])).rows[0]||{};
   if(ctx.needs_user_confirmation || ctx.payment_rail==='UPI')return {status:'NEEDS_CONTEXT'};
   return {status:'NO_ROUTE'};
 }
 const route=routes[0];
 const evidence=(await db.query('SELECT id,filename,content_type,bytes,sha256 FROM evidence WHERE case_id=$1 ORDER BY created_at',[c.id])).rows;
 const analyses=(await db.query("SELECT filename,structured_data FROM evidence_analysis ea JOIN evidence e ON e.id=ea.evidence_id WHERE ea.case_id=$1 AND ea.analysis_type='document_understanding' AND ea.status='COMPLETED'",[c.id])).rows;
 const required=Array.isArray(route.required_documents)?route.required_documents:[];
 const names=analyses.map(a=>({name:String(a.filename||'').toLowerCase(),type:String(a.structured_data?.document_type||a.structured_data?.extracted?.document_type||'').toLowerCase()}));
 const missing=[];
 for(const doc of required){const t=String(doc).toLowerCase();let ok=false;if(t.includes('case summary'))ok=true;else if(t.includes('payment proof')||t.includes('transaction proof')||t.includes('payment screenshot')||t.includes('bank debit proof'))ok=analyses.some(a=>String(a.structured_data?.verdict||'').toUpperCase()==='VERIFIED');else if(t.includes('both transaction proofs'))ok=analyses.length>=2;else if(t.includes('bank statement'))ok=names.some(x=>x.type.includes('bank_statement')||x.type==='statement'||x.name.includes('bank-statement')||x.name.includes('bank_statement'));else if(t.includes('refund message'))ok=names.some(x=>x.type.includes('refund')||x.type.includes('message')||x.name.includes('refund'));else if(t.includes('merchant response')||t.includes('merchant communication')||t.includes('provider response'))ok=names.some(x=>x.type.includes('message')||x.type.includes('communication')||x.name.includes('response')||x.name.includes('merchant')||x.name.includes('provider'));else if(t.includes('order')||t.includes('invoice'))ok=names.some(x=>x.type.includes('invoice')||x.type.includes('order')||x.name.includes('invoice')||x.name.includes('order'));else if(t.includes('prior complaint')||t.includes('proof of complaint'))ok=(await db.query("SELECT id FROM dispute_attempts WHERE case_id=$1 AND user_id=$2 AND status IN ('SENT','RESPONDED','REJECTED','RESOLVED') LIMIT 1",[c.id,userId])).rows.length>0;else if(t.includes('identity')||t.includes('contact details'))ok=true;else if(t.includes('utr')||t.includes('rrn')||t.includes('reference'))ok=Boolean(String(c.transaction_reference||'').trim())||names.some(x=>x.name.includes('utr')||x.name.includes('rrn'));if(!ok)missing.push(doc);}
 if(missing.length){await db.query('INSERT INTO dispute_requirements (case_id,user_id,requirement,reason,status) SELECT $1,$2,$3,$4,\'REQUESTED\' WHERE NOT EXISTS (SELECT 1 FROM dispute_requirements WHERE case_id=$1 AND user_id=$2 AND requirement=$3 AND status=\'REQUESTED\')',[c.id,userId,missing[0],`Required before RecoverIT can prepare contact with ${route.organization}.`]);return {status:'NEEDS_DOCUMENTS',organization:route.organization,missing_requirements:missing};}
 const pack=buildPackage(c,evidence,c.ai_summary||'',route);
 const body=`I am requesting resolution of RecoverIT case ${c.case_number}.\n\n${clean(c.description,2500)}\n\nTransaction reference: ${c.transaction_reference||'Not supplied'}\nAmount: ${c.currency} ${c.amount||'Not supplied'}\n\nPlease review the attached evidence and provide the next action or resolution in writing.`;
 const ins=await db.query('INSERT INTO dispute_attempts (case_id,user_id,route_id,level,organization,channel,destination,status,subject,body,package_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[c.id,userId,route.id,route.level,route.organization,route.channel,route.destination,'PREPARED',`RecoverIT dispute ${c.case_number}`,body,pack]);
 await db.query('INSERT INTO dispute_state (case_id,user_id,phase,current_level,current_attempt_id,waiting_for_user,next_action,next_action_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT (case_id) DO UPDATE SET phase=$3,current_level=$4,current_attempt_id=$5,waiting_for_user=$6,next_action=$7,next_action_at=now(),updated_at=now()',[c.id,userId,'READY_TO_CONTACT',route.level,ins.rows[0].id,false,`Review and approve contact to ${route.organization}.`]);
 await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[c.id,'DISPUTE_ROUTE_READY',`Dispute route prepared: ${route.organization}`,`RecoverIT automatically prepared the first legitimate dispute route after evidence verification. No message has been sent without user approval.`,'ACTION_REQUIRED','RecoverIT']);
 return {status:'READY',attempt_id:ins.rows[0].id,organization:route.organization,route_level:route.level};
}
export async function prepareNextRoute(c,userId){
 const latest=await db.query('SELECT * FROM dispute_attempts WHERE case_id=$1 ORDER BY level DESC,created_at DESC LIMIT 1',[c.id]);const current=latest.rows[0];const routes=await eligibleRoutes(c,userId);const next=routes.find(r=>!current||r.level>Number(current.level));if(!next)return null;const evidence=(await db.query('SELECT id,filename,content_type,bytes,sha256 FROM evidence WHERE case_id=$1 ORDER BY created_at',[c.id])).rows;if(!evidence.length)return null;const pack=buildPackage(c,evidence,c.ai_summary||'',next);const body=`I am escalating RecoverIT case ${c.case_number} for resolution.\n\n${clean(c.description,2500)}\n\nTransaction reference: ${c.transaction_reference||'Not supplied'}\nAmount: ${c.currency} ${c.amount||'Not supplied'}\n\nPlease review the attached evidence and prior grievance trail. Please provide the next action or final resolution in writing.`;const ins=await db.query('INSERT INTO dispute_attempts (case_id,user_id,route_id,level,organization,channel,destination,status,subject,body,package_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[c.id,userId,next.id,next.level,next.organization,next.channel,next.destination,'PREPARED',`RecoverIT escalation ${c.case_number}`,body,pack]);await db.query('UPDATE dispute_state SET phase=$1,current_level=$2,current_attempt_id=$3,waiting_for_user=$4,next_action=$5,next_action_at=now(),updated_at=now() WHERE case_id=$6',['READY_TO_CONTACT',next.level,ins.rows[0].id,false,`Review and approve the next escalation to ${next.organization}.`,c.id]);await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[c.id,'DISPUTE_ADVANCED',`Next escalation prepared: ${next.organization}`,'The previous dispute route did not resolve the case. RecoverIT prepared the next legitimate escalation route.','ACTION_REQUIRED','RecoverIT']);return {attempt_id:ins.rows[0].id,route:next};}

export async function prepareResponseContact(c,userId,sourceAttemptId=null){
 const sourceQ=await db.query(`SELECT a.*,r.* FROM dispute_attempts a JOIN dispute_routes r ON r.id=a.route_id WHERE a.case_id=$1 AND a.user_id=$2 AND ($3::uuid IS NULL OR a.id=$3::uuid) ORDER BY CASE WHEN a.id=$3::uuid THEN 0 ELSE 1 END,a.created_at DESC LIMIT 1`,[c.id,userId,sourceAttemptId||null]);
 const source=sourceQ.rows[0]; if(!source)return null;
 const open=await db.query("SELECT id FROM dispute_attempts WHERE case_id=$1 AND user_id=$2 AND status='PREPARED' AND route_id=$3 LIMIT 1",[c.id,userId,source.route_id]);
 if(open.rows[0])return {attempt_id:open.rows[0].id,organization:source.organization,route_id:source.route_id,reused:true};
 const evidence=(await db.query('SELECT id,filename,content_type,bytes,sha256 FROM evidence WHERE case_id=$1 ORDER BY created_at',[c.id])).rows;
 const latestResponse=(await db.query('SELECT raw_text,structured_response,interpreted_state,next_action FROM dispute_responses WHERE case_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 1',[c.id,userId])).rows[0]||null;
 const pack=buildPackage(c,evidence,c.ai_summary||'',source);
 pack.follow_up={in_response_to:source.id,organization_response:latestResponse?.raw_text||'',interpreted_state:latestResponse?.interpreted_state||'',next_action:latestResponse?.next_action||''};
 const body=`I am following up on RecoverIT case ${c.case_number} with ${source.organization}.\n\n${clean(c.description,2500)}\n\nTransaction reference: ${c.transaction_reference||'Not supplied'}\nAmount: ${c.currency} ${c.amount||'Not supplied'}\n\nThis follow-up includes the additional evidence requested after your previous response. Please review the newly supplied information and continue processing the original request.\n\nAdditional context from your response: ${clean(latestResponse?.raw_text||'',2200)}\n\nPlease confirm the next action or resolution in writing.`;
 const ins=await db.query('INSERT INTO dispute_attempts (case_id,user_id,route_id,level,organization,channel,destination,status,subject,body,package_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[c.id,userId,source.route_id,source.level,source.organization,source.channel,source.destination,'PREPARED',`RecoverIT follow-up ${c.case_number}`,body,pack]);
 await db.query('UPDATE dispute_state SET phase=$1,current_level=$2,current_attempt_id=$3,waiting_for_user=$4,next_action=$5,next_action_at=now(),updated_at=now() WHERE case_id=$6',['READY_TO_CONTACT',source.level,ins.rows[0].id,false,`Review and approve the updated contact to ${source.organization}.`,c.id]);
 await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[c.id,'DISPUTE_FOLLOWUP_PREPARED',`Follow-up prepared for ${source.organization}`,'New requested evidence was verified and attached to a follow-up for the same organization.','ACTION_REQUIRED','RecoverIT']);
 return {attempt_id:ins.rows[0].id,organization:source.organization,route_id:source.route_id,reused:false};
}