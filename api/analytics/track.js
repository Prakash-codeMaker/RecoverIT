import { db } from 'hatchable';
export const access = 'public';
export const methods = ['POST'];
export default async function(req,res){
  const b=req.body||{};
  const visitor=String(b.visitor_key||'').slice(0,128), session=String(b.session_key||'').slice(0,128), path=String(b.path||'/').slice(0,500), event=String(b.event_name||'page_view').slice(0,80);
  if(!visitor||!session) return res.status(400).json({error:'visitor_key and session_key required'});
  await db.query(`INSERT INTO visitor_sessions(visitor_key,session_key,path) VALUES($1,$2,$3) ON CONFLICT(visitor_key,session_key) DO UPDATE SET last_seen_at=now(),page_views=visitor_sessions.page_views+1,path=EXCLUDED.path`,[visitor,session,path]);
  await db.query(`INSERT INTO analytics_events(visitor_key,session_key,event_name,path,metadata) VALUES($1,$2,$3,$4,$5)`,[visitor,session,event,path,b.metadata||null]);
  if(['engaged','case_created','signup_completed'].includes(event)) await db.query(`UPDATE visitor_sessions SET engaged=true,last_seen_at=now() WHERE visitor_key=$1 AND session_key=$2`,[visitor,session]);
  res.json({ok:true});
}