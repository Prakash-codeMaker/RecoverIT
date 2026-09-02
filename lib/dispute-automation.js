import { db, email, storage } from 'hatchable';
import { analyzeDocument } from 'lib/recoverit-ai.js';
import { clean, prepareResponseContact } from 'lib/dispute.js';

export function classifyExternalResponse(text, metadata={}) {
  const raw=clean(text,12000); const s=raw.toLowerCase();
  const refundRef=metadata.refund_reference||metadata.refund_id||((raw.match(/\b(?:refund|rrn|arn|utr)\s*(?:id|no|number|#|:)?\s*[:#-]?\s*([a-z0-9_-]{5,})\b/i)||[])[1]||null);
  const amountMatch=raw.match(/(?:₹|rs\.?|inr|amount\s*[:=]?\s*)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  const amount=amountMatch?Number(amountMatch[1].replace(/,/g,'')):null;
  let state='GENERAL_UPDATE';
  if(/(refund|reversal).*(initiated|raised|created|started|submitted|processing)/.test(s)||/(initiated|raised|created|started|submitted).*(refund|reversal)/.test(s)) state='REFUND_INITIATED';
  else if(/(refund|reversal).*(processed|completed|successful|successfully)/.test(s)||/processed.*refund/.test(s)) state='REFUND_PROCESSED';
  else if(/(refund|reversal).*(failed|rejected|declined|not possible)/.test(s)||/failed.*refund/.test(s)) state='REFUND_FAILED';
  else if(/(provide|submit|send|share|upload).*(document|statement|proof|invoice|screenshot|utr|rrn|reference|id)/.test(s)||/(document|statement|proof).*(required|needed|requested|pending)/.test(s)) state='MORE_INFO_REQUIRED';
  else if(/(resolved|case closed|issue resolved|complaint closed|dispute closed)/.test(s)) state='RESOLVED';
  else if(/(reject|rejected|cannot help|unable to resolve|denied)/.test(s)) state='REJECTED';
  return {state,summary:clean(raw.split(/\n+/)[0]||raw,800),refund_reference:refundRef,amount,confidence:state==='GENERAL_UPDATE'?65:88};
}

export async function notifyUser(userId,caseId,title,description,type='case_update') {
  try{await db.query('INSERT INTO notifications (user_id,case_id,type,title,description) SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id=$1 AND case_id=$2 AND title=$4 AND created_at>now()-interval \'30 minutes\')',[userId,caseId,type,title,clean(description,1800)]);}catch(_){ }
  try{
    const p=(await db.query('SELECT email FROM notification_preferences WHERE user_id=$1',[userId])).rows[0];
    const u=(await db.query('SELECT email FROM users WHERE id=$1',[userId])).rows[0];
    if(u?.email && p?.email!==false){await email.send({to:u.email,subject:title,html:`<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>`});}
  }catch(_){ }
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

export async function applyExternalResponse({caseRow,attemptId,source,channel,rawText,metadata={},attachments=[]}) {
  const parsed=classifyExternalResponse(rawText,metadata);
  const inserted=await db.query('INSERT INTO dispute_responses (case_id,user_id,attempt_id,source,channel,external_reference,raw_text,structured_response,interpreted_state,next_action,confidence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[caseRow.id,caseRow.user_id,attemptId||null,source||'EXTERNAL_ORGANIZATION',channel||'EMAIL',metadata.external_reference||parsed.refund_reference||null,clean(rawText,12000),parsed,parsed.state,String(parsed.state||'Continue the dispute loop.'),parsed.confidence]);
  await db.query('UPDATE dispute_attempts SET last_response_at=now(),status=$1 WHERE id=$2',[parsed.state==='RESOLVED'?'RESOLVED':parsed.state==='REJECTED'?'REJECTED':'RESPONDED',attemptId||'00000000-0000-0000-0000-000000000000']);
  let evidenceAdded=0;
  for(const att of Array.isArray(attachments)?attachments.slice(0,5):[]){
    try{
      const url=String(att.url||'').trim(); if(!/^https?:\/\//i.test(url))continue;
      const r=await fetch(url,{method:'GET'}); if(!r.ok)continue;
      const buf=Buffer.from(await r.arrayBuffer()); if(!buf.length||buf.length>10*1024*1024)continue;
      const ct=String(att.content_type||att.contentType||r.headers.get('content-type')||'application/octet-stream').split(';')[0];
      if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(ct))continue;
      const filename=String(att.filename||att.name||`organization-proof-${Date.now()}`).replace(/[^\w. -]/g,'_').slice(0,180);
      const key=`organization-evidence/${caseRow.user_id}/${crypto.randomUUID()}-${filename}`;
      await storage.put(key,buf,ct);
      const digest=await crypto.subtle.digest('SHA-256',buf); const sha=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
      const ev=await db.query('INSERT INTO evidence (case_id,user_id,filename,content_type,bytes,storage_key,sha256) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[caseRow.id,caseRow.user_id,filename,ct,buf.length,key,sha]);
      const prompt=`This is an attachment received from the organization in response to a payment dispute. Compare it to the RecoverIT case and determine which requested document it satisfies. Return ONLY JSON {"verdict":"VERIFIED|REVIEW|REJECT","document_type":"bank_statement|payment_proof|refund_message|merchant_message|invoice|order_record|other|unreadable","summary":"","extracted":{"merchant":"","amount":"","currency":"","transaction_reference":"","date":"","payment_status":""},"confidence":0}. CASE: ${clean(caseRow.description,2500)} Amount=${caseRow.amount||''} ${caseRow.currency||'INR'} reference=${caseRow.transaction_reference||''}.`;
      const out=await analyzeDocument({mimeType:ct,bytes:buf,prompt});
      const parsedEv=out?.data||out?.parsed;
      if(parsedEv){await db.query('INSERT INTO evidence_analysis (evidence_id,case_id,analysis_type,status,extracted_text,structured_data,authenticity_signals,confidence,model) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[ev.rows[0].id,caseRow.id,'document_understanding','COMPLETED',clean(parsedEv.summary||'',1500),parsedEv,JSON.stringify(parsedEv.authenticity_signals||[]),Number(parsedEv.confidence)||null,out.provider||'external_attachment']);}
      evidenceAdded++;
      if(parsedEv?.verdict==='VERIFIED'){
        const reqs=(await db.query('SELECT id,requirement FROM dispute_requirements WHERE case_id=$1 AND user_id=$2 AND status=\'REQUESTED\' ORDER BY created_at',[caseRow.id,caseRow.user_id])).rows;
        for(const q of reqs.slice(0,5)){
          const t=String(q.requirement||'').toLowerCase(); const dtype=String(parsedEv.document_type||'').toLowerCase();
          if((t.includes('bank statement')&&dtype.includes('bank_statement'))||(t.includes('refund')&&dtype.includes('refund'))||(t.includes('merchant')&&dtype.includes('message'))||(t.includes('payment')&&dtype.includes('payment'))||(t.includes('invoice')&&(dtype.includes('invoice')||dtype.includes('order')))){
            await db.query('UPDATE dispute_requirements SET status=\'SATISFIED\',response_evidence_id=$1,satisfied_at=now() WHERE id=$2',[ev.rows[0].id,q.id]);
          }
        }
      }
    }catch(_){ }
  }
  const reqs=(await db.query('SELECT id,requirement FROM dispute_requirements WHERE case_id=$1 AND user_id=$2 AND status=\'REQUESTED\'',[caseRow.id,caseRow.user_id])).rows;
  if(parsed.state==='MORE_INFO_REQUIRED'){
    let requirements=Array.isArray(metadata.requirements)?metadata.requirements.slice(0,6):[];
    if(!requirements.length){
      const candidates=[['bank statement',/bank\s+statement/i],['payment proof',/(payment|transaction)\s+(proof|receipt|screenshot)/i],['refund proof',/refund\s+(proof|receipt|message)/i],['merchant response',/(merchant|provider).*(response|communication)/i],['invoice or order record',/(invoice|order)\s+(record|details|proof)/i],['UTR/RRN/reference number',/(utr|rrn|transaction)\s*(number|no|id|reference)?/i]];
      requirements=candidates.filter(([,re])=>re.test(rawText)).map(([label])=>label).slice(0,4);
    }
    if(!requirements.length)requirements=['the document or information requested in the organization response'];
    for(const r of requirements){await db.query('INSERT INTO dispute_requirements (case_id,user_id,attempt_id,requirement,reason,status) SELECT $1,$2,$3,$4,$5,\'REQUESTED\' WHERE NOT EXISTS (SELECT 1 FROM dispute_requirements WHERE case_id=$1 AND user_id=$2 AND requirement=$4 AND status=\'REQUESTED\')',[caseRow.id,caseRow.user_id,attemptId||null,String(r),clean(parsed.summary||rawText,800)]);}
    await db.query('UPDATE dispute_state SET phase=\'WAITING_FOR_USER\',waiting_for_user=true,current_attempt_id=$1,next_action=$2,next_action_at=now(),updated_at=now() WHERE case_id=$3',[attemptId||null,`Organization requested more information. RecoverIT will show exactly what document is needed.`,caseRow.id]);
    await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[caseRow.id,'ORGANIZATION_REQUESTED_DOCUMENT','Document or information requested',clean(rawText,1600),'WAITING_FOR_USER',source||'Organization']);
    await notifyUser(caseRow.user_id,caseRow.id,'RecoverIT needs one more document',`The organization requested additional information. ${clean(parsed.summary||rawText,900)}`,'case_update');
  } else if(parsed.state==='REFUND_INITIATED'||parsed.state==='REFUND_PROCESSED'||parsed.state==='REFUND_FAILED'){
    const txState=parsed.state==='REFUND_INITIATED'?'REFUND_INITIATED':parsed.state==='REFUND_PROCESSED'?'REFUND_PROCESSED':'REFUND_FAILED';
    const ext=metadata.refund_id||parsed.refund_reference||metadata.external_reference||`dispute-refund-${inserted.rows[0].id}`;
    const existingRefund=(await db.query('SELECT id FROM financial_transactions WHERE provider=$1 AND external_transaction_id=$2 LIMIT 1',['dispute_organization_refund',ext])).rows[0];
    const refundValues=[caseRow.user_id,caseRow.id,'dispute_organization_refund',ext,parsed.refund_reference,parsed.amount||caseRow.amount,caseRow.currency||'INR',txState,caseRow.merchant_name,caseRow.payment_method,{parsed,metadata},source||'organization',true];
    if(existingRefund){await db.query('UPDATE financial_transactions SET reference=$1,amount=$2,currency=$3,transaction_state=$4,raw_payload=$5,source=$6,verified=$7,updated_at=now() WHERE id=$8',[parsed.refund_reference,parsed.amount||caseRow.amount,caseRow.currency||'INR',txState,{parsed,metadata},source||'organization',true,existingRefund.id]);}
    else {await db.query('INSERT INTO financial_transactions (user_id,case_id,provider,external_transaction_id,reference,amount,currency,transaction_state,merchant_name,payment_method,raw_payload,source,verified) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',refundValues);}
    await db.query('INSERT INTO payment_monitors (case_id,user_id,monitor_type,expected_at,last_status,active) VALUES ($1,$2,$3,now()+interval \'7 days\',$4,true)',[caseRow.id,caseRow.user_id,'refund',parsed.state]);
    const title=parsed.state==='REFUND_INITIATED'?'Refund initiated':'Refund update received';
    const desc=parsed.state==='REFUND_INITIATED'?`The organization says your refund of ${caseRow.currency||'INR'} ${parsed.amount||caseRow.amount||''} has been initiated. RecoverIT will keep tracking it.`:parsed.state==='REFUND_PROCESSED'?'The organization reports the refund as processed. RecoverIT will continue until the money is confirmed as received.':'The organization reported a refund-processing failure. RecoverIT will keep the case open and prepare the next step.';
    await db.query('UPDATE dispute_state SET phase=$1,waiting_for_user=false,next_action=$2,next_action_at=now()+interval \'48 hours\',updated_at=now() WHERE case_id=$3',[parsed.state==='REFUND_FAILED'?'ACTION_REQUIRED':'AWAITING_REFUND',desc,caseRow.id]);
    await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[caseRow.id,parsed.state,title,clean(rawText,1600),parsed.state==='REFUND_FAILED'?'ACTION_REQUIRED':'INVESTIGATING',source||'Organization']);
    await notifyUser(caseRow.user_id,caseRow.id,title,desc,'case_update');
  } else if(parsed.state==='RESOLVED'){
    await db.query('UPDATE dispute_state SET phase=\'RESOLVED\',waiting_for_user=false,resolution_status=\'RESOLVED\',next_action=\'Organization reports the issue resolved. Confirm the money/outcome is actually correct.\',next_action_at=now(),updated_at=now() WHERE case_id=$1',[caseRow.id]);
    await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[caseRow.id,'ORGANIZATION_RESOLVED','Organization reports resolution',clean(rawText,1600),'RESOLVED',source||'Organization']);
    await notifyUser(caseRow.user_id,caseRow.id,'The organization marked the case resolved','RecoverIT received a resolution response. Please confirm the money/outcome is actually correct before the case is considered closed.','case_update');
  } else if(parsed.state==='REJECTED'){
    await db.query('UPDATE dispute_state SET phase=\'ESCALATION_REQUIRED\',waiting_for_user=false,next_action=\'The organization did not resolve the dispute. RecoverIT is preparing the next eligible escalation.\',next_action_at=now(),updated_at=now() WHERE case_id=$1',[caseRow.id]);
    await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[caseRow.id,'ORGANIZATION_REJECTED','Organization rejected the dispute',clean(rawText,1600),'ACTION_REQUIRED',source||'Organization']);
    await notifyUser(caseRow.user_id,caseRow.id,'The organization did not resolve the dispute','RecoverIT is keeping the same case and preparing the next legitimate escalation path.','case_update');
  }
  let followup=null;
  const remaining=(await db.query('SELECT id FROM dispute_requirements WHERE case_id=$1 AND user_id=$2 AND status=\'REQUESTED\'',[caseRow.id,caseRow.user_id])).rows;
  if(evidenceAdded>0 && remaining.length===0 && parsed.state==='MORE_INFO_REQUIRED'){
    try{followup=await prepareResponseContact(caseRow,caseRow.user_id,attemptId)}catch(_){followup=null}
  }
  return {response_id:inserted.rows[0].id,...parsed,evidence_added:evidenceAdded,remaining_requirements:remaining.length,followup_ready:followup};
}