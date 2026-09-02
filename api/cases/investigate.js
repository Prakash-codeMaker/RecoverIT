import { db, scheduler } from 'hatchable';
import { getCase, addEvent } from 'lib/case.js';
export const access='user'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.user.id); if(!c)return res.status(404).json({error:'Case not found.'});
 await db.query('UPDATE recovery_cases SET status=$1,updated_at=now() WHERE id=$2',['INVESTIGATING',c.id]);
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['RUNNING','Reading your story and identifying the payment facts.',c.id,'payment']);
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['QUEUED','Waiting for the evidence review.',c.id,'timeline']);
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['QUEUED','Waiting for the provider check.',c.id,'provider']);
 await db.query('UPDATE investigation_steps SET status=$1,detail=$2,completed_at=NULL WHERE case_id=$3 AND step_key=$4',['QUEUED','Waiting for the recovery plan.',c.id,'safe_path']);
 await addEvent(c.id,'Investigation started','RecoverIT is now working through your story, proof and available provider evidence. You can stay on this page; progress will update automatically.','INVESTIGATING','RecoverIT');
 await scheduler.now('/api/cases/investigate-worker',{case_id:c.id,user_id:req.user.id,interactive:true});
 res.status(202).json({ok:true,status:'INVESTIGATING',message:'Investigation started. Progress will update automatically.'});
}