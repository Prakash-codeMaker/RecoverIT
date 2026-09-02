import { storage, db, scheduler } from 'hatchable';
import crypto from 'node:crypto';
import { analyzeDocument } from 'lib/recoverit-ai.js';
import { prepareResponseContact } from 'lib/dispute.js';

export const access='user';
export const methods=['POST'];

export default async function(req,res){
  const f=(req.files||[]).find(x=>x.field==='file');
  const caseId=req.body?.case_id;
  if(!f||!caseId)return res.status(400).json({error:'File and case are required.'});

  const own=await db.query('SELECT id FROM recovery_cases WHERE id=$1 AND user_id=$2',[caseId,req.user.id]);
  if(!own.rows[0])return res.status(404).json({error:'Case not found.'});
  if(f.buffer.length>10*1024*1024)return res.status(413).json({error:'File too large. Max 10 MB.'});

  const allowed=new Set(['image/jpeg','image/png','image/webp','application/pdf','video/mp4']);
  if(!allowed.has(f.contentType))return res.status(415).json({error:'Unsupported file type.'});

  const hash=await crypto.subtle.digest('SHA-256',f.buffer);
  const hex=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
  const ext=(f.filename.split('.').pop()||'bin').toLowerCase();
  const key=`evidence/${req.user.id}/${crypto.randomUUID()}.${ext}`;
  const url=await storage.put(key,f.buffer,f.contentType);
  const inserted=await db.query(
    'INSERT INTO evidence (case_id,user_id,filename,content_type,bytes,storage_key,sha256) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [caseId,req.user.id,f.filename,f.contentType,f.buffer.length,key,hex]
  );

  let verification={status:'PENDING',summary:'Evidence was stored; document verification has not completed yet.'};
  const preflightId=String(req.body?.preflight_id||'').trim();
  const requirementId=String(req.body?.requirement_id||'').trim();

  try{
    if(preflightId){
      const pf=(await db.query('SELECT result,expires_at FROM case_preflights WHERE id=$1 AND user_id=$2',[preflightId,req.user.id])).rows[0];
      if(pf && new Date(pf.expires_at)>new Date()){
        const pfFiles=Array.isArray(pf.result?.files)?pf.result.files:[];
        const pfFile=pfFiles.find(x=>String(x.filename)===String(f.filename));
        if(pfFile){
          verification={status:String(pfFile.verdict||'REVIEW').toUpperCase(),summary:String(pfFile.summary||''),parsed:pfFile};
          await db.query(
            'INSERT INTO evidence_analysis (evidence_id,case_id,analysis_type,status,extracted_text,structured_data,authenticity_signals,confidence,model) VALUES ($1,$2,$3,$4,$5::text,$6::jsonb,$7::jsonb,$8::numeric,$9::text) ON CONFLICT (evidence_id,analysis_type) DO UPDATE SET status=$4::text,extracted_text=$5::text,structured_data=$6::jsonb,authenticity_signals=$7::jsonb,confidence=$8::numeric,model=$9::text,updated_at=now()',
            [inserted.rows[0].id,caseId,'document_understanding','COMPLETED',String(pfFile.extracted_text||pfFile.summary||''),pfFile,JSON.stringify(Array.isArray(pfFile.authenticity_signals)?pfFile.authenticity_signals:[]),Number.isFinite(Number(pfFile.confidence))?Number(pfFile.confidence):null,'preflight_cache']
          );
        }
      }
    }

    const caseRow=(await db.query(
      'SELECT id,description,amount,currency,merchant_name,transaction_reference,payment_method,issue_type,provider_key,ai_summary FROM recovery_cases WHERE id=$1 AND user_id=$2',
      [caseId,req.user.id]
    )).rows[0];

    const prompt=`Verify this payment evidence against the existing RecoverIT case. CASE STORY: ${String(caseRow?.description||'').slice(0,3500)}. Known amount=${caseRow?.amount||''} currency=${caseRow?.currency||'INR'} merchant=${caseRow?.merchant_name||''} reference=${caseRow?.transaction_reference||''} method=${caseRow?.payment_method||''}. Extract visible payment facts. Return ONLY JSON: {"verdict":"VERIFIED|REVIEW|REJECT","summary":"short","extracted":{"merchant":"","amount":"","currency":"","transaction_reference":"","date":"","payment_method":"","payment_status":""},"matches":["short"],"contradictions":["short"],"authenticity_signals":["short"],"confidence":0}. VERIFIED requires material support for the reported payment; REVIEW means relevant but incomplete; REJECT means unrelated, contradictory, or unreadable. Never claim authenticity solely from appearance.`;

    if(verification.status==='PENDING'){
      const out=await analyzeDocument({mimeType:f.contentType,bytes:f.buffer,prompt});
      if(out.available&&out.parsed){
        const parsed=out.parsed;
        verification={status:String(parsed.verdict||'REVIEW').toUpperCase(),summary:String(parsed.summary||'').slice(0,1000),parsed,provider:out.provider,failover_from:out.failover_from||[]};
        await db.query(
          'INSERT INTO evidence_analysis (evidence_id,case_id,analysis_type,status,extracted_text,structured_data,authenticity_signals,confidence,model) VALUES ($1,$2,$3,$4,$5::text,$6::jsonb,$7::jsonb,$8::numeric,$9::text) ON CONFLICT (evidence_id,analysis_type) DO UPDATE SET status=$4::text,extracted_text=$5::text,structured_data=$6::jsonb,authenticity_signals=$7::jsonb,confidence=$8::numeric,model=$9::text,updated_at=now()',
          [inserted.rows[0].id,caseId,'document_understanding','COMPLETED',String(parsed.extracted_text||parsed.summary||''),parsed,JSON.stringify(Array.isArray(parsed.authenticity_signals)?parsed.authenticity_signals:[]),Number.isFinite(Number(parsed.confidence))?Number(parsed.confidence):null,`${out.provider||'ai'}${out.failover_from?.length?'-failover':''}`]
        );
      }
    }
  }catch(_){/* stored evidence remains untrusted until a successful verification */}

  if(String(verification.status||'').toUpperCase()==='PENDING'){
    verification={...verification,status:'UNVERIFIED',summary:'Proof was attached successfully, but automated verification is temporarily unavailable. RecoverIT will retry it automatically.'};
  }
  const verificationResult=String(verification.status||verification.verdict||'UNVERIFIED').toUpperCase();
  const normalizedVerification=verificationResult==='REJECT'?'REJECTED':verificationResult==='PENDING'?'UNVERIFIED':verificationResult;
  const confidence=Number.isFinite(Number(verification.parsed?.confidence))?Number(verification.parsed.confidence):null;
  const reason=String(verification.summary||verification.reason||'New payment proof was attached and checked.');
  const aiStatus=normalizedVerification==='VERIFIED'?'EVIDENCE_VERIFIED':normalizedVerification==='REJECTED'?'EVIDENCE_REJECTED':normalizedVerification==='REVIEW'?'EVIDENCE_REVIEW':'PENDING';
  if(normalizedVerification==='VERIFIED'){
    const extracted=verification.parsed?.extracted||{};
    const merchant=String(extracted.merchant||'').trim();
    const reference=String(extracted.transaction_reference||extracted.utr||extracted.rrn||'').trim();
    const method=String(extracted.payment_method||'').trim();
    const amount=Number(extracted.amount);
    if(merchant)await db.query('UPDATE recovery_cases SET merchant_name=COALESCE(NULLIF(merchant_name,\'\'),$1) WHERE id=$2',[merchant,caseId]);
    if(reference)await db.query('UPDATE recovery_cases SET transaction_reference=COALESCE(NULLIF(transaction_reference,\'\'),$1) WHERE id=$2',[reference,caseId]);
    if(method)await db.query('UPDATE recovery_cases SET payment_method=CASE WHEN payment_method IS NULL OR payment_method=\'\' OR lower(payment_method)=\'unknown\' THEN $1 ELSE payment_method END WHERE id=$2',[method,caseId]);
    if(Number.isFinite(amount)&&amount>0)await db.query('UPDATE recovery_cases SET amount=CASE WHEN amount IS NULL OR amount=0 THEN $1 ELSE amount END WHERE id=$2',[amount,caseId]);
  }
  const evidenceTrusted=normalizedVerification==='VERIFIED';
  const evidenceRejected=normalizedVerification==='REJECTED';
  const evidenceNeedsReview=normalizedVerification==='REVIEW';
  const nextCaseStatus=evidenceRejected||evidenceNeedsReview?'WAITING_FOR_USER':'INVESTIGATING';
  await db.query('UPDATE recovery_cases SET status=$1,ai_status=$2,verification_state=$3,verification_confidence=$4,verification_last_checked_at=now(),verification_last_available_at=CASE WHEN $4::numeric IS NOT NULL THEN now() ELSE verification_last_available_at END,verification_reason=$5,updated_at=now() WHERE id=$6',[nextCaseStatus,aiStatus,normalizedVerification,confidence,reason,caseId]);
  if(evidenceTrusted){
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['DONE','Your proof is verified. RecoverIT is advancing to the next payment/timeline check.',caseId,'payment']);
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['RUNNING','Verified proof received. RecoverIT is comparing it with the existing case timeline.',caseId,'timeline']);
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['QUEUED','Waiting for the provider reconciliation.',caseId,'provider']);
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['QUEUED','Waiting for the updated recovery plan.',caseId,'safe_path']);
  }else if(evidenceRejected){
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['RUNNING','The uploaded proof could not be matched. RecoverIT is waiting for a relevant replacement.',caseId,'payment']);
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['PENDING','Waiting for usable payment proof.',caseId,'timeline']);
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['PENDING','Waiting until payment evidence is verified.',caseId,'provider']);
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['PENDING','Waiting until the payment evidence stage is complete.',caseId,'safe_path']);
  }else{
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['RUNNING','Proof is attached and automated verification is still in progress. No later stage will start until this proof is resolved.',caseId,'payment']);
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['PENDING','Waiting for payment proof verification.',caseId,'timeline']);
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['PENDING','Waiting for verified payment evidence.',caseId,'provider']);
    await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['PENDING','Waiting for the verified payment evidence stage.',caseId,'safe_path']);
  }
  await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[caseId,'EVIDENCE_RECEIVED','New proof received',evidenceRejected?'RecoverIT received the proof but it did not support the case.':evidenceNeedsReview?'RecoverIT received the proof but it still needs review.':evidenceTrusted?'RecoverIT verified the new proof and is advancing the same case.':'RecoverIT received the proof and is checking it now.',nextCaseStatus,'RecoverIT']);

  let followup=null;
  const dispute=(await db.query('SELECT waiting_for_user,current_attempt_id FROM dispute_state WHERE case_id=$1 AND user_id=$2',[caseId,req.user.id])).rows[0]||null;
  if(dispute?.waiting_for_user && verification.status==='VERIFIED'){
    const data=verification.parsed||{};
    const dtype=String(data.document_type||data.extracted?.document_type||'').toLowerCase();
    const ex=data.extracted||{};
    const pending=requirementId
      ? (await db.query('SELECT id,requirement FROM dispute_requirements WHERE id=$1 AND case_id=$2 AND user_id=$3 AND status=\'REQUESTED\'',[requirementId,caseId,req.user.id])).rows
      : (await db.query('SELECT id,requirement FROM dispute_requirements WHERE case_id=$1 AND user_id=$2 AND status=\'REQUESTED\' ORDER BY created_at',[caseId,req.user.id])).rows;

    let satisfied=0;
    for(const q of pending){
      const t=String(q.requirement||'').toLowerCase();
      let ok=false;
      if(t.includes('bank statement'))ok=dtype.includes('bank_statement')||dtype.includes('statement');
      else if(t.includes('payment proof')||t.includes('transaction proof')||t.includes('bank debit proof'))ok=true;
      else if(t.includes('refund proof')||t.includes('refund message'))ok=dtype.includes('refund')||dtype.includes('message');
      else if(t.includes('merchant response')||t.includes('merchant communication')||t.includes('provider response'))ok=dtype.includes('message')||dtype.includes('communication');
      else if(t.includes('invoice')||t.includes('order'))ok=dtype.includes('invoice')||dtype.includes('order');
      else if(t.includes('utr')||t.includes('rrn')||t.includes('reference'))ok=Boolean(String(ex.transaction_reference||'').trim());
      else if(t.includes('identity')||t.includes('contact'))ok=true;

      if(ok){
        await db.query('UPDATE dispute_requirements SET status=\'SATISFIED\',response_evidence_id=$1,satisfied_at=now() WHERE id=$2',[inserted.rows[0].id,q.id]);
        satisfied++;
      }
    }

    if(satisfied>0){
      const remaining=await db.query('SELECT id FROM dispute_requirements WHERE case_id=$1 AND user_id=$2 AND status=\'REQUESTED\'',[caseId,req.user.id]);
      if(!remaining.rows.length){
        try{followup=await prepareResponseContact(caseRow,req.user.id,dispute.current_attempt_id)}catch(_){followup=null}
        if(followup){
          await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[caseId,'DISPUTE_EVIDENCE_FOLLOWUP_READY',`Follow-up ready for ${followup.organization}`,'All requested evidence was verified. RecoverIT prepared a follow-up for the same organization instead of starting a new escalation.','ACTION_REQUIRED','RecoverIT']);
        }else{
          await db.query('UPDATE dispute_state SET phase=\'READY_TO_CONTACT\',waiting_for_user=false,next_action=\'Requested evidence has been verified. Review and approve re-contact.\',next_action_at=now(),updated_at=now() WHERE case_id=$1',[caseId]);
          await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[caseId,'DISPUTE_EVIDENCE_ADDED','Requested evidence verified','RecoverIT verified the newly supplied evidence against the organization requirements. Review and approve the updated contact.','ACTION_REQUIRED','RecoverIT']);
        }
      }
    }
  }

  await scheduler.now('/api/cases/investigate-worker',{case_id:caseId,user_id:req.user.id,interactive:true});
  try{await scheduler.now('/api/jobs/case-verification',{case_id:caseId,user_id:req.user.id})}catch(_){/* continuous verification also runs hourly */}

  res.status(201).json({url,key,sha256:hex,verification,investigation_started:true,followup_ready:followup?{attempt_id:followup.attempt_id,organization:followup.organization}:null});
}