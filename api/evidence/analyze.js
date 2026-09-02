import { db, storage } from 'hatchable';
import { getCase } from 'lib/case.js';
import { googleVisionDocument, extractGeminiText } from 'lib/integrations.js';
export const access='user'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.user.id); if(!c)return res.status(404).json({error:'Case not found.'});
 const evidenceId=String(req.body?.evidence_id||'').trim(); if(!evidenceId)return res.status(400).json({error:'evidence_id is required.'});
 const er=await db.query('SELECT * FROM evidence WHERE id=$1 AND case_id=$2 AND user_id=$3',[evidenceId,c.id,req.member.id]); const e=er.rows[0]; if(!e)return res.status(404).json({error:'Evidence not found.'});
 const existing=await db.query('SELECT * FROM evidence_analysis WHERE evidence_id=$1 AND analysis_type=$2',[evidenceId,'document_understanding']); if(existing.rows[0]?.status==='COMPLETED')return res.json(existing.rows[0]);
 await db.query('INSERT INTO evidence_analysis (evidence_id,case_id,analysis_type,status) VALUES ($1,$2,$3,$4) ON CONFLICT (evidence_id,analysis_type) DO UPDATE SET status=$4,updated_at=now()',[evidenceId,c.id,'document_understanding','RUNNING']);
 try{
  const file=await storage.get(e.storage_key); if(!file?.buffer)throw Error('Evidence bytes are unavailable.');
  const prompt=`Analyze this payment evidence for RecoverIT. Extract only visible facts. Return JSON with: document_type, merchant, amount, currency, transaction_reference, date, payment_method, status, names_or_accounts_masked, extracted_text, authenticity_signals. Authenticity signals must be cautious: never claim authenticity solely from visual appearance. Identify edits, inconsistent fonts, impossible dates, mismatched totals, missing transaction identifiers, metadata limitations, and any conflict with the case. Do not invent values.`;
  const out=await googleVisionDocument({mimeType:e.content_type,bytes:file.buffer,prompt}); if(!out.configured)return res.status(503).json(out); if(!out.ok)throw Error('Document model request failed.');
  let parsed={};try{parsed=JSON.parse(extractGeminiText(out.data).replace(/^```json\s*/i,'').replace(/```$/,'').trim())}catch(_){parsed={extracted_text:extractGeminiText(out.data)}}
  const authenticity=Array.isArray(parsed.authenticity_signals)?parsed.authenticity_signals:[];
  await db.query('UPDATE evidence_analysis SET status=$1,extracted_text=$2,structured_data=$3,authenticity_signals=$4,confidence=$5,model=$6,updated_at=now() WHERE evidence_id=$7 AND analysis_type=$8',['COMPLETED',String(parsed.extracted_text||''),parsed,authenticity,Number.isFinite(Number(parsed.confidence))?Number(parsed.confidence):null,process.env.RECOVERIT_GEMINI_MODEL||'gemini-2.5-flash',evidenceId,'document_understanding']);
  res.json({ok:true,analysis:parsed,authenticity_signals:authenticity});
 }catch(error){await db.query('UPDATE evidence_analysis SET status=$1,error=$2,updated_at=now() WHERE evidence_id=$3 AND analysis_type=$4',['FAILED',String(error.message||error),evidenceId,'document_understanding']);res.status(500).json({error:'Evidence analysis failed.',detail:String(error.message||error)})}
}