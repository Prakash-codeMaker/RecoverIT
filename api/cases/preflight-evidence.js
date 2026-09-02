import { db } from 'hatchable';
import { analyzeDocument } from 'lib/recoverit-ai.js';
import { hashText } from 'lib/dispute.js';
export const access='user'; export const methods=['POST'];

function parseJson(text){const raw=String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();try{return JSON.parse(raw)}catch(_){const s=raw.indexOf('{'),e=raw.lastIndexOf('}');if(s>=0&&e>s){try{return JSON.parse(raw.slice(s,e+1))}catch(_2){}}return null}}
function clean(v,max=500){return String(v??'').replace(/[\u0000-\u001F]/g,' ').slice(0,max)}

export default async function(req,res){
 const description=String(req.body?.description||'').trim(); const files=req.files||[];
 if(!description)return res.status(400).json({error:'Describe what happened before verifying proof.'});
 if(!files.length)return res.status(400).json({ok:false,required:true,verdict:'NO_PROOF',message:'At least one related payment document is required before RecoverIT can create a dispute case.',next_action:'Upload a payment receipt, UPI/bank transaction proof, refund message, invoice, order record, or relevant merchant communication.'});
 if(files.length>8)return res.status(400).json({error:'Please verify up to 8 proof files at a time.'});
 const allowed=new Set(['image/jpeg','image/png','image/webp','application/pdf']);
 for(const f of files){if(!allowed.has(f.contentType))return res.status(415).json({error:`${f.filename} is not a supported proof type. Use JPG, PNG, WEBP or PDF.`});if(f.buffer.length>10*1024*1024)return res.status(413).json({error:`${f.filename} is larger than 10 MB.`})}
 const results=[];
 for(const f of files){
  const prompt=`You are RecoverIT's pre-case evidence verifier. The user wants to open a payment-recovery case using this file as proof.
USER STORY:\n${clean(description,3500)}

Analyze the attached ${f.contentType} carefully. Determine whether it is actually relevant evidence for the reported payment problem. Extract visible/legible facts and compare them to the story. Do NOT treat appearance alone as proof of authenticity. Explicitly distinguish reported/visible facts from authenticity conclusions.

Return ONLY JSON:
{"document_type":"payment_receipt|bank_statement|upi_screen|merchant_message|refund_message|invoice|order_record|other|unreadable","relevance":"direct|partial|unrelated|unclear","verdict":"VERIFIED|REVIEW|REJECT","summary":"<=240 chars","extracted":{"merchant":"","amount":"","currency":"","transaction_reference":"","date":"","payment_method":"","payment_status":""},"matches":["<=160 char"],"contradictions":["<=160 char"],"authenticity_signals":["<=160 char"],"missing_for_verification":["<=160 char"],"confidence":0}

VERIFIED means the file is clearly relevant and materially supports the story with no material contradiction. REVIEW means it is relevant/possibly relevant but an important fact cannot be established. REJECT means it is unrelated, materially contradicts the story, or is unreadable enough that it cannot function as proof. Never invent values.`;
  try{
   const out=await analyzeDocument({mimeType:f.contentType,bytes:f.buffer,prompt});
   if(!out.available){results.push({filename:f.filename,content_type:f.contentType,bytes:f.buffer.length,document_type:'unverified',relevance:'unclear',verdict:'REVIEW',summary:'Automated verification is temporarily unavailable across configured providers; manual review is required.',extracted:{},matches:[],contradictions:[],authenticity_signals:['No AI provider available'],missing_for_verification:['Independent verification'],confidence:0});continue;}
   const parsed=out.parsed;
   if(!parsed)throw new Error('The evidence verifier returned invalid structured output.');
   results.push({filename:f.filename,content_type:f.contentType,bytes:f.buffer.length,provider:out.provider,failover_from:out.failover_from||[],...parsed});
  }catch(error){return res.status(502).json({error:'Could not verify the uploaded proof. The case was not created.',detail:String(error.message||error)})}
 }
 const verdicts=results.map(x=>String(x.verdict||'REVIEW').toUpperCase());
 const verdict=verdicts.includes('REJECT')?'REJECT':verdicts.includes('REVIEW')?'REVIEW':'VERIFIED';
 const summaries=results.map(x=>({filename:x.filename,verdict:x.verdict,relevance:x.relevance,summary:x.summary,extracted:x.extracted,matches:x.matches,contradictions:x.contradictions,missing_for_verification:x.missing_for_verification,authenticity_signals:x.authenticity_signals,confidence:x.confidence}));
 const message=verdict==='VERIFIED'?'The uploaded proof materially supports the payment story.':verdict==='REVIEW'?'The uploaded proof appears relevant, but some important facts still need manual review.':'The uploaded proof does not currently support the payment story strongly enough to create a verified case.';
 const fileHashes=[];for(const f of files){const hash=await crypto.subtle.digest('SHA-256',f.buffer);fileHashes.push(Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join(''))}
 const pre=await db.query('INSERT INTO case_preflights (user_id,description_hash,verdict,result,file_hashes,expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval \'15 minutes\') RETURNING id,expires_at',[req.user.id,hashText(description),verdict,JSON.stringify({message,files:summaries}),JSON.stringify(fileHashes)]);
 res.json({ok:true,required:true,preflight_id:pre.rows[0].id,expires_at:pre.rows[0].expires_at,verdict,message,files:summaries,verification:{verified:verdict==='VERIFIED',review_required:verdict==='REVIEW',rejected:verdict==='REJECT'},next_action:verdict==='REJECT'?'Upload a clearer or relevant payment proof and try again.':verdict==='REVIEW'?'Review the evidence findings and explicitly approve creation for manual review.':'Create the case; RecoverIT will persist the evidence analysis and continue provider reconciliation.'});
}