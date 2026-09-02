import { analyzeDocument } from 'lib/recoverit-ai.js';
export const access='scheduler'; export const methods=['POST'];
export default async function(req,res){
 const b64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
 const prompt='Return ONLY JSON with keys document_type, relevance, verdict, summary, extracted, matches, contradictions, authenticity_signals, missing_for_verification, confidence. Analyze this image only and do not invent payment facts.';
 const out=await analyzeDocument({mimeType:'image/png',bytes,prompt,options:{maxTokens:300}});
 res.json({ok:true,available:Boolean(out.available),provider:out.provider||null,model:out.model||null,has_parsed:Boolean(out.parsed||out.data),verdict:out.parsed?.verdict||out.data?.verdict||null});
}