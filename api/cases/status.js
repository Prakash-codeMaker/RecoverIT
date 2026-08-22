import { db } from 'hatchable';
import { getCase } from 'lib/case.js';
export const access='member'; export const methods=['GET'];
export default async function(req,res){
 const c=await getCase(req.query?.case_id,req.member.id); if(!c)return res.status(404).json({error:'Case not found.'});
 const [ev,steps,evidence]=await Promise.all([
  db.query('SELECT id,title,detail,state,source,confidence,created_at FROM case_events WHERE case_id=$1 ORDER BY created_at ASC',[c.id]),
  db.query('SELECT step_key,title,status,detail,created_at,completed_at FROM investigation_steps WHERE case_id=$1 ORDER BY created_at ASC',[c.id]),
  db.query('SELECT id,filename,content_type,bytes,sha256,created_at FROM evidence WHERE case_id=$1 ORDER BY created_at ASC',[c.id])
 ]);
 res.json({case:c,events:ev.rows,steps:steps.rows,evidence:evidence.rows});
}