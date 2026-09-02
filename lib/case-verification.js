import { db, storage } from 'hatchable';
import { analyzeDocument } from 'lib/recoverit-ai.js';

function parseJson(text){const raw=String(text||'').trim().replace(/^```json\\s*/i,'').replace(/```$/,'').trim();try{return JSON.parse(raw)}catch(_){const s=raw.indexOf('{'),e=raw.lastIndexOf('}');if(s>=0&&e>s){try{return JSON.parse(raw.slice(s,e+1))}catch(_2){}}return null}}
function clean(v,max=500){return String(v??'').replace(/[\\u0000-\\u001F]/g,' ').slice(0,max)}

export async function verifyCaseEvidence(caseId,userId,trigger='scheduled'){
 const c=(await db.query('SELECT id,user_id,case_number,issue_type,description,amount,currency,merchant_name,transaction_reference,payment_method FROM recovery_cases WHERE id=$1 AND user_id=$2',[caseId,userId])).rows[0];
 if(!c)return {ok:false,error:'Case not found.'};
 const evidence=(await db.query('SELECT id,filename,content_type,bytes,sha256,storage_key FROM evidence WHERE case_id=$1 ORDER BY created_at ASC',[caseId])).rows;
 if(!evidence.length){await db.query("UPDATE recovery_cases SET verification_state='UNVERIFIED',verification_confidence=NULL,verification_last_checked_at=now(),verification_reason=$1 WHERE id=$2",['No supporting evidence is attached yet.',caseId]);return {ok:true,result:'UNVERIFIED',ai_available:false,reason:'NO_EVIDENCE',verified:0,rejected:0,review:0};}
 const run=await db.query("INSERT INTO case_verification_runs (case_id,user_id,trigger,status) VALUES ($1,$2,$3,$4) ON CONFLICT (case_id) WHERE status='RUNNING' DO NOTHING RETURNING id",[caseId,userId,trigger,'RUNNING']);
 if(!run.rows[0])return {ok:true,result:'RUNNING',ai_available:false,reason:'A verification run is already in progress for this case.'};
 let verified=0,rejected=0,review=0,aiAvailable=false,totalConfidence=0;const details=[];
 for(const e of evidence){
  try{
   const existing=(await db.query("SELECT status,structured_data,confidence FROM evidence_analysis WHERE evidence_id=$1 AND analysis_type='document_understanding' ORDER BY updated_at DESC LIMIT 1",[e.id])).rows[0];
   const stale=!existing?.updated_at;
   const file=await storage.get(e.storage_key);if(!file?.buffer){details.push({filename:e.filename,status:'UNVERIFIED',reason:'Evidence bytes unavailable.'});review++;continue;}
   const prompt=`You are RecoverIT's continuous evidence verifier. Re-check this document against the existing payment case. CASE: ${JSON.stringify({issue_type:c.issue_type,description:clean(c.description,3000),amount:c.amount,currency:c.currency,merchant:c.merchant_name,transaction_reference:c.transaction_reference,payment_method:c.payment_method})}. Analyze ONLY visible/legible evidence. Return ONLY JSON: {"verdict":"VERIFIED|REVIEW|REJECT","summary":"<=240 chars","extracted":{"merchant":"","amount":"","currency":"","transaction_reference":"","date":"","payment_method":"","payment_status":""},"matches":["short"],"contradictions":["short"],"authenticity_signals":["short"],"confidence":0}. VERIFIED means the document materially supports the case facts; it does not mean forensic authenticity is proven. REJECT means unrelated, materially contradictory, or unusable. REVIEW means potentially relevant but not enough to verify. Never invent values.`;
   let out;
   try{const isPdf=e.content_type==='application/pdf';out=await analyzeDocument({mimeType:e.content_type,bytes:file.buffer,prompt,options:{purpose:'recoverit-continuous-document-verification',openRouterTimeoutMs:isPdf?30000:12000,groqVisionTimeoutMs:8000,geminiTimeoutMs:isPdf?25000:20000}})}catch(error){details.push({filename:e.filename,status:'UNVERIFIED',reason:String(error?.message||error)});review++;continue;}
   aiAvailable=true;
   const parsed=out.parsed||out.data||parseJson(out.text);
   if(!parsed){details.push({filename:e.filename,status:'REVIEW',reason:'Verifier returned invalid structured output.'});review++;continue;}
   const verdict=String(parsed.verdict||'REVIEW').toUpperCase();const conf=Number(parsed.confidence);if(verdict==='VERIFIED')verified++;else if(verdict==='REJECT')rejected++;else review++;if(Number.isFinite(conf))totalConfidence+=conf;
   await db.query('INSERT INTO evidence_analysis (evidence_id,case_id,analysis_type,status,extracted_text,structured_data,authenticity_signals,confidence,model) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (evidence_id,analysis_type) DO UPDATE SET status=$4,extracted_text=$5,structured_data=$6,authenticity_signals=$7,confidence=$8,model=$9,updated_at=now()',[e.id,caseId,'document_understanding','COMPLETED',String(parsed.extracted_text||parsed.summary||''),parsed,JSON.stringify(Array.isArray(parsed.authenticity_signals)?parsed.authenticity_signals:[]),Number.isFinite(conf)?conf:null,`${out.provider||'ai'}${out.failover_from?.length?'-failover':''}`]);
   details.push({filename:e.filename,status:verdict,confidence:Number.isFinite(conf)?conf:null,summary:String(parsed.summary||'').slice(0,240)});
  }catch(error){details.push({filename:e.filename,status:'UNVERIFIED',reason:String(error.message||error)});review++;}
 }
 const confidence=verified>0?Math.round(totalConfidence/Math.max(1,verified+review+rejected)):null;
 let result='UNVERIFIED',reason='';
 if(aiAvailable&&verified>0&&rejected===0&&review===0){result='VERIFIED';reason='At least one evidence item was independently assessed as materially supporting the case and no reviewed evidence contradicted it.';}
 else if(aiAvailable&&rejected===evidence.length){result='REJECTED';reason='All attached evidence was assessed as unrelated, contradictory, or unusable for the reported case.';}
 else if(aiAvailable){result='REVIEW';reason='Evidence was reviewed, but the case still contains unresolved or conflicting evidence.';}
 else {result='UNVERIFIED';reason='Automated evidence verification is unavailable right now. RecoverIT will retry automatically when the verifier is available.';}
 await db.query('UPDATE recovery_cases SET verification_state=$1,verification_confidence=$2,verification_last_checked_at=now(),verification_last_available_at=CASE WHEN $3 THEN now() ELSE verification_last_available_at END,verification_reason=$4,updated_at=now() WHERE id=$5',[result,confidence,aiAvailable,reason,caseId]);
 await db.query('UPDATE case_verification_runs SET status=$1,result=$2,confidence=$3,verified_evidence_count=$4,rejected_evidence_count=$5,review_evidence_count=$6,ai_available=$7,details=$8,completed_at=now() WHERE id=$9',['COMPLETED',result,confidence,verified,rejected,review,aiAvailable,JSON.stringify({reason,items:details}),run.rows[0].id]);
 if(result==='REJECTED'){await db.query('UPDATE recovery_cases SET ai_status=$1,ai_summary=$2 WHERE id=$3',['EVIDENCE_REJECTED',reason,caseId]);}
 else if(result==='REVIEW'){await db.query('UPDATE recovery_cases SET ai_status=$1 WHERE id=$2',['EVIDENCE_REVIEW',caseId]);}
 else if(result==='VERIFIED'){await db.query('UPDATE recovery_cases SET ai_status=CASE WHEN ai_status IS NULL OR ai_status IN (\'UNAVAILABLE\',\'EVIDENCE_REVIEW\',\'PENDING\',\'EVIDENCE_REJECTED\') THEN \'EVIDENCE_VERIFIED\' ELSE ai_status END WHERE id=$1',[caseId]);}
 return {ok:true,result,reason,ai_available:aiAvailable,verified,rejected,review,confidence,details};
}