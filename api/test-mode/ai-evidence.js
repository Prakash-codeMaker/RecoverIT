import { analyzeDocument } from 'lib/recoverit-ai.js';
import { db } from 'hatchable';
export const access='scheduler'; export const methods=['POST'];
export default async function(req,res){
 const b64='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGP8//8/AymAiSTVoxpGNQwpDQBVbQMdPVIhQwAAAABJRU5ErkJggg==';
 const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
 const prompt='Return ONLY JSON with keys document_type, relevance, verdict, summary, extracted, matches, contradictions, authenticity_signals, missing_for_verification, confidence. Analyze this image only and do not invent payment facts.';
 const runId=crypto.randomUUID();
 try{
  const out=await analyzeDocument({mimeType:'image/png',bytes,prompt,options:{maxTokens:300,openRouterTimeoutMs:12000,groqVisionTimeoutMs:5000,geminiTimeoutMs:15000}});
  await db.query('INSERT INTO ai_failover_test_runs (id,mime_type,ok,provider,model,verdict,attempts) VALUES ($1,$2,$3,$4,$5,$6,$7)',[runId,'image/png',true,out.provider||null,out.model||null,out.parsed?.verdict||out.data?.verdict||null,JSON.stringify(out.failover_from||[])]);
  return res.json({ok:true,run_id:runId,available:true,provider:out.provider||null,model:out.model||null,verdict:out.parsed?.verdict||out.data?.verdict||null,attempts:out.failover_from||[]});
 }catch(error){
  await db.query('INSERT INTO ai_failover_test_runs (id,mime_type,ok,attempts,error) VALUES ($1,$2,$3,$4,$5)',[runId,'image/png',false,JSON.stringify(error.providers||[]),String(error.message||error)]);
  return res.status(502).json({ok:false,run_id:runId,error:String(error.message||error),providers:error.providers||[]});
 }
}