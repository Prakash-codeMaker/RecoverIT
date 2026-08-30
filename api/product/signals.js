import { db } from 'hatchable';

export const access='public';
export const methods=['POST'];

const ALLOWED=new Set([
  'page_view','case_open','case_action','case_created','case_feedback_prompt',
  'next_step_click','proof_upload_start','proof_upload_complete','voice_start',
  'voice_stop','notification_open','case_refresh','signup_complete'
]);

const clean=(v,max=160)=>String(v||'').trim().slice(0,max)||null;

export default async function(req,res){
  const b=req.body||{};
  const event=clean(b.event_name,80);
  if(!ALLOWED.has(event)) return res.status(400).json({error:'Unsupported product signal.'});

  const visitorId=clean(b.visitor_id,120);
  const sessionId=clean(b.session_id,120);
  if(!visitorId || !sessionId) return res.status(400).json({error:'Visitor and session identifiers are required.'});

  const meta=b.metadata && typeof b.metadata==='object' ? b.metadata : {};
  // Product analytics is intentionally non-sensitive and may be emitted anonymously.
  // Keep public writes detached from account/case ownership so table RLS cannot turn
  // harmless landing-page telemetry into a 500 response.
  const userId=null;
  const caseId=null;
  const path=clean(b.path,300);
  const referrer=clean(b.referrer,500);
  const utmSource=clean(b.utm_source,120);
  const utmMedium=clean(b.utm_medium,120);
  const utmCampaign=clean(b.utm_campaign,160);
  const utmContent=clean(b.utm_content,160);
  const utmTerm=clean(b.utm_term,160);

  if(referrer) meta.referrer=referrer;

  await db.query(
    'INSERT INTO product_signals (user_id,case_id,event_name,path,metadata,visitor_id,session_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12)',
    [userId,caseId,event,path,JSON.stringify(meta).slice(0,4000),visitorId,sessionId,utmSource,utmMedium,utmCampaign,utmContent,utmTerm]
  );

  res.status(201).json({ok:true});
}