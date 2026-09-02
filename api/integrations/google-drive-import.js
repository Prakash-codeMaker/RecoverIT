import { db, storage, scheduler } from 'hatchable';
import crypto from 'node:crypto';
import { analyzeDocument } from 'lib/recoverit-ai.js';

export const access='user';
export const methods=['POST'];

async function getConnection(userId){
  const q=await db.query('SELECT * FROM oauth_connections WHERE user_id=$1 AND provider=$2 LIMIT 1',[userId,'google_drive']);
  return q.rows[0];
}

async function freshToken(c,userId){
  if(c.expires_at&&new Date(c.expires_at)<=new Date()&&c.refresh_token){
    const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:c.refresh_token,grant_type:'refresh_token'}).toString()});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.access_token)throw Error('Google Drive authorization needs to be renewed.');
    await db.query('UPDATE oauth_connections SET access_token=$1,expires_at=now()+($2 * interval \'1 second\'),updated_at=now() WHERE user_id=$3 AND provider=$4',[d.access_token,Number(d.expires_in||3600),userId,'google_drive']);
    return d.access_token;
  }
  return c.access_token;
}

export default async function(req,res){
  const userId=req.user.id;
  const caseId=String(req.body?.case_id||'').trim();
  const fileId=String(req.body?.file_id||'').trim();
  if(!caseId||!fileId)return res.status(400).json({ok:false,error:'case_id and file_id are required.'});
  const owns=await db.query('SELECT * FROM recovery_cases WHERE id=$1 AND user_id=$2 LIMIT 1',[caseId,userId]);
  const c=owns.rows[0]; if(!c)return res.status(404).json({ok:false,error:'Case not found.'});
  const conn=await getConnection(userId); if(!conn)return res.status(409).json({ok:false,error:'Google Drive is not connected.'});
  let token; try{token=await freshToken(conn,userId)}catch(e){return res.status(401).json({ok:false,error:e.message})}
  const metaR=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId)+'?fields=id,name,mimeType,size', {headers:{Authorization:'Bearer '+token}});
  const meta=await metaR.json().catch(()=>({}));
  if(!metaR.ok)return res.status(metaR.status).json({ok:false,error:'Google Drive file could not be read.'});
  const allowed=new Set(['image/jpeg','image/png','image/webp','application/pdf']);
  if(!allowed.has(meta.mimeType))return res.status(415).json({ok:false,error:'RecoverIT can import PDF, JPG, PNG, or WEBP evidence from Google Drive.'});
  const size=Number(meta.size||0); if(size>10*1024*1024)return res.status(413).json({ok:false,error:'The selected file is larger than RecoverIT\'s 10 MB evidence limit.'});
  const mediaR=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId)+'?alt=media',{headers:{Authorization:'Bearer '+token}});
  if(!mediaR.ok)return res.status(mediaR.status).json({ok:false,error:'Google Drive could not download the selected file.'});
  const buf=Buffer.from(await mediaR.arrayBuffer());
  if(buf.length>10*1024*1024)return res.status(413).json({ok:false,error:'The selected file is larger than RecoverIT\'s 10 MB evidence limit.'});
  const hash=await crypto.subtle.digest('SHA-256',buf); const hex=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
  const safeName=String(meta.name||'google-drive-evidence').replace(/[^a-zA-Z0-9._ -]/g,'_');
  const ext=(safeName.split('.').pop()||'bin').toLowerCase(); const key='evidence/'+userId+'/'+crypto.randomUUID()+'.'+ext;
  await storage.put(key,buf,meta.mimeType);
  const ins=await db.query('INSERT INTO evidence (case_id,user_id,filename,content_type,bytes,storage_key,sha256) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[caseId,userId,safeName,meta.mimeType,buf.length,key,hex]);
  const evidenceId=ins.rows[0].id;
  let verification={status:'PENDING',summary:'Imported and stored; verification has not completed yet.'};
  try{
    const prompt=`Verify this payment evidence against the existing RecoverIT case. CASE STORY: ${String(c.description||'').slice(0,3500)}. Known amount=${c.amount||''} currency=${c.currency||'INR'} merchant=${c.merchant_name||''} reference=${c.transaction_reference||''} method=${c.payment_method||''}. Return ONLY JSON: {"verdict":"VERIFIED|REVIEW|REJECT","summary":"short","extracted":{"merchant":"","amount":"","currency":"","transaction_reference":"","date":"","payment_method":"","payment_status":"","document_type":""},"matches":["short"],"contradictions":["short"],"authenticity_signals":["short"],"confidence":0}. VERIFIED requires material support for the reported payment; REVIEW means relevant but incomplete; REJECT means unrelated, contradictory, or unreadable. Never claim authenticity solely from appearance.`;
    const out=await analyzeDocument({mimeType:meta.mimeType,bytes:buf,prompt});
    if(out.available&&out.parsed){
      const parsed=out.parsed; verification={status:String(parsed.verdict||'REVIEW').toUpperCase(),summary:String(parsed.summary||'').slice(0,1000),parsed,provider:out.provider,failover_from:out.failover_from||[]};
      await db.query('INSERT INTO evidence_analysis (evidence_id,case_id,analysis_type,status,extracted_text,structured_data,authenticity_signals,confidence,model) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (evidence_id,analysis_type) DO UPDATE SET status=$4,extracted_text=$5,structured_data=$6,authenticity_signals=$7,confidence=$8,model=$9,updated_at=now()',[evidenceId,caseId,'document_understanding','COMPLETED',String(parsed.extracted_text||parsed.summary||''),parsed,JSON.stringify(Array.isArray(parsed.authenticity_signals)?parsed.authenticity_signals:[]),Number.isFinite(Number(parsed.confidence))?Number(parsed.confidence):null,`${out.provider||'ai'}${out.failover_from?.length?'-failover':''}`]);
    }
  }catch(_){ }
  await db.query('UPDATE recovery_cases SET status=$1,ai_status=$2,updated_at=now() WHERE id=$3 AND user_id=$4',['INVESTIGATING',verification.status==='VERIFIED'?'EVIDENCE_VERIFIED':verification.status==='REJECT'?'EVIDENCE_REJECTED':'EVIDENCE_REVIEW',caseId,userId]);
  await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[caseId,'EVIDENCE_IMPORTED','Evidence imported from Google Drive','RecoverIT imported '+safeName+' from Google Drive and checked it against the existing case.','INVESTIGATING','Google Drive']);
  try{await scheduler.now('/api/cases/investigate-worker',{case_id:caseId,user_id:userId})}catch(_){ }
  res.status(201).json({ok:true,evidence_id:evidenceId,filename:safeName,verification});
}