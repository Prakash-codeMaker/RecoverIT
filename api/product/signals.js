import { db } from 'hatchable';
export const access='user'; export const methods=['POST'];
const ALLOWED=new Set(['page_view','case_open','case_action','case_feedback_prompt','next_step_click','proof_upload_start','proof_upload_complete','voice_start','voice_stop','notification_open','case_refresh']);
export default async function(req,res){
  const b=req.body||{}; const event=String(b.event_name||'');
  if(!ALLOWED.has(event)) return res.status(400).json({error:'Unsupported product signal.'});
  const meta= b.metadata && typeof b.metadata==='object' ? b.metadata : {};
  await db.query('INSERT INTO product_signals (user_id,case_id,event_name,path,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)',[req.user?.id||null,b.case_id||null,event,String(b.path||'').slice(0,300),JSON.stringify(meta).slice(0,4000)]);
  res.status(201).json({ok:true});
}