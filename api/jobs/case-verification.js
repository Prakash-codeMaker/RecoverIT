import { db } from 'hatchable';
import { verifyCaseEvidence } from 'lib/case-verification.js';
export const access='scheduler';
export const methods=['POST'];
export const schedule='0 * * * *';
export default async function(req,res){
 const priorityId=String(req.body?.case_id||'').trim();
 const priority=[];
 if(priorityId){const p=(await db.query("SELECT id,user_id FROM recovery_cases WHERE id=$1 AND status NOT IN ('CLOSED','RESOLVED')",[priorityId])).rows[0];if(p)priority.push(p);}
 const candidateSql=priorityId
  ? "SELECT c.id,c.user_id FROM recovery_cases c WHERE c.status NOT IN ('CLOSED','RESOLVED') AND (c.verification_state IS NULL OR c.verification_state IN ('UNVERIFIED','REVIEWED','REVIEW') OR c.verification_last_checked_at IS NULL OR c.updated_at>COALESCE(c.verification_last_checked_at,'epoch'::timestamptz)) AND c.id<>$1 ORDER BY COALESCE(c.verification_last_checked_at,'epoch'::timestamptz) ASC LIMIT 50"
  : "SELECT c.id,c.user_id FROM recovery_cases c WHERE c.status NOT IN ('CLOSED','RESOLVED') AND (c.verification_state IS NULL OR c.verification_state IN ('UNVERIFIED','REVIEWED','REVIEW') OR c.verification_last_checked_at IS NULL OR c.updated_at>COALESCE(c.verification_last_checked_at,'epoch'::timestamptz)) ORDER BY COALESCE(c.verification_last_checked_at,'epoch'::timestamptz) ASC LIMIT 50";
 const candidates=(await db.query(candidateSql,priorityId?[priorityId]:[])).rows;
 const all=[...priority,...candidates];
 const results=[];for(const c of all){try{results.push({case_id:c.id,...await verifyCaseEvidence(c.id,c.user_id,priorityId===String(c.id)?'evidence_uploaded':'scheduled')});}catch(error){results.push({case_id:c.id,ok:false,error:String(error.message||error)});}}
 res.json({ok:true,checked:all.length,results});
}