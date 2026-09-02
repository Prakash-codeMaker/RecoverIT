import { db } from 'hatchable';
import { verifyCaseEvidence } from 'lib/case-verification.js';
export const access='scheduler';
export const methods=['POST'];
export const schedule='0 * * * *';
export default async function(req,res){
 const candidates=(await db.query("SELECT c.id,c.user_id FROM recovery_cases c WHERE c.status NOT IN ('CLOSED','RESOLVED') AND (c.verification_state IS NULL OR c.verification_state IN ('UNVERIFIED','REVIEWED','REVIEW') OR c.verification_last_checked_at IS NULL OR c.updated_at>COALESCE(c.verification_last_checked_at,'epoch'::timestamptz)) ORDER BY COALESCE(c.verification_last_checked_at,'epoch'::timestamptz) ASC LIMIT 15")).rows;
 const results=[];for(const c of candidates){try{results.push({case_id:c.id,...await verifyCaseEvidence(c.id,c.user_id,'scheduled')});}catch(error){results.push({case_id:c.id,ok:false,error:String(error.message||error)});}}
 res.json({ok:true,checked:candidates.length,results});
}