import { db } from 'hatchable';
import { notifyUser } from 'lib/user-notifications.js';
export const access='scheduler'; export const methods=['POST']; export const schedule='0 * * * *';
export default async function(req,res){
 const due=await db.query("SELECT s.*,a.organization,a.id AS attempt_id,a.next_follow_up_at,a.status AS attempt_status FROM dispute_state s LEFT JOIN dispute_attempts a ON a.id=s.current_attempt_id WHERE s.resolution_status='OPEN' AND s.next_action_at IS NOT NULL AND s.next_action_at<=now() LIMIT 50");
 let nudged=0;for(const row of due.rows){if(row.waiting_for_user)continue;await notifyUser({userId:row.user_id,caseId:row.case_id,type:'case_attention',title:`Follow-up needed with ${row.organization||'the dispute organization'}`,description:'RecoverIT has not recorded a new response yet. Open your case, review the latest status, and add any acknowledgement or response you received.'});await db.query('UPDATE dispute_state SET next_action_at=now()+interval \'72 hours\',updated_at=now() WHERE case_id=$1',[row.case_id]);nudged++;}
 res.json({ok:true,due:due.rows.length,notified:nudged});
}