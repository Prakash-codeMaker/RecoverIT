import { db, scheduler } from 'hatchable';
import { advanceCaseWorkflow } from 'lib/case-workflow.js';
export const access='scheduler';
export const methods=['POST'];
export const schedule='0 * * * *';
export default async function(req,res){
 const rows=(await db.query("SELECT id,user_id FROM recovery_cases WHERE status NOT IN ('CLOSED','RESOLVED') ORDER BY workflow_updated_at ASC,updated_at ASC LIMIT 25")).rows;
 const results=[];
 for(const c of rows){try{results.push(await advanceCaseWorkflow(c.id,c.user_id,'heartbeat'));}catch(error){results.push({case_id:c.id,ok:false,error:String(error?.message||error)});}}
 if(rows.length===25){try{await scheduler.at(new Date(Date.now()+1200).toISOString(),'/api/jobs/workflow-heartbeat',{payload:{}})}catch(_){}}
 res.json({ok:true,scope:'all_users_all_active_cases',processed:rows.length,continued:rows.length===25,results});
}