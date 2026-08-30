import { db } from 'hatchable';

export const access='public';
export const methods=['POST'];

const clean=(v,max=120)=>String(v||'').trim().slice(0,max)||null;

export default async function(req,res){
  const b=req.body||{};
  const visitorId=clean(b.visitor_id);
  const sessionId=clean(b.session_id);
  const ref=clean(b.referral_code,40);
  if(!visitorId||!sessionId) return res.status(400).json({error:'Visitor and session identifiers are required.'});
  await db.query('INSERT INTO product_signals (user_id,event_name,path,metadata,visitor_id,session_id) VALUES ($1,$2,$3,$4::jsonb,$5,$6)',[req.member?.id||req.user?.id||null,'referral_capture','/',JSON.stringify({referral_code:ref}),visitorId,sessionId]);
  res.json({ok:true});
}