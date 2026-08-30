import { db } from 'hatchable';
export const access='public';
export const methods=['POST'];
export default async function(req,res){
 const b=req.body||{}; const v=String(b.visitor_id||'').slice(0,120), s=String(b.session_id||'').slice(0,120);
 if(!v||!s) return res.status(400).json({error:'visitor_id and session_id required'});
 await db.query(`INSERT INTO visitor_sessions (visitor_id,session_id,first_path,last_path,referrer,utm_source,utm_medium,utm_campaign) VALUES ($1,$2,$3,$3,$4,$5,$6,$7) ON CONFLICT (visitor_id,session_id) DO UPDATE SET last_seen_at=now(),last_path=EXCLUDED.last_path`,[v,s,String(b.path||'/').slice(0,300),String(b.referrer||'').slice(0,500)||null,String(b.utm_source||'').slice(0,120)||null,String(b.utm_medium||'').slice(0,120)||null,String(b.utm_campaign||'').slice(0,120)||null]);
 res.json({ok:true});
}