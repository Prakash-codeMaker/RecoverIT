import { db } from 'hatchable';
export const access = 'public';
export const methods = ['POST'];
export default async function(req,res){
  const b=req.body||{};
  const visitor=String(b.visitor_key||'').slice(0,128), session=String(b.session_key||'').slice(0,128), path=String(b.path||'/').slice(0,500), event=String(b.event_name||'page_view').slice(0,80);
  if(!visitor||!session) return res.status(400).json({error:'visitor_key and session_key required'});
  const existing=await db.query('SELECT id FROM visitor_sessions WHERE visitor_id=$1 AND session_id=$2 LIMIT 1',[visitor,session]);
  if(existing.rows.length) await db.query('UPDATE visitor_sessions SET last_seen_at=now(),last_path=$1 WHERE id=$2',[path,existing.rows[0].id]);
  else await db.query('INSERT INTO visitor_sessions(visitor_id,session_id,first_path,last_path) VALUES($1,$2,$3,$3)',[visitor,session,path]);
  await db.query('INSERT INTO analytics_events(visitor_key,session_key,event_name,path,metadata) VALUES($1,$2,$3,$4,$5)',[visitor,session,event,path,b.metadata||null]);
  res.json({ok:true});
}