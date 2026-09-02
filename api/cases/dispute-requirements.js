import { db } from 'hatchable';
import { getCase } from 'lib/case.js';
export const access='user'; export const methods=['GET'];
export default async function(req,res){
 const c=await getCase(req.query?.case_id,req.user.id);if(!c)return res.status(404).json({error:'Case not found.'});
 const state=(await db.query('SELECT * FROM dispute_state WHERE case_id=$1',[c.id])).rows[0]||null;
 const attempts=(await db.query('SELECT id,level,organization,channel,destination,status,external_reference,sent_at,next_follow_up_at,last_response_at FROM dispute_attempts WHERE case_id=$1 AND user_id=$2 ORDER BY created_at DESC',[c.id,req.user.id])).rows;
 const requirements=(await db.query('SELECT id,attempt_id,requirement,reason,status,response_evidence_id,created_at,satisfied_at FROM dispute_requirements WHERE case_id=$1 AND user_id=$2 ORDER BY created_at DESC',[c.id,req.user.id])).rows;
 res.json({state,attempts,requirements});
}