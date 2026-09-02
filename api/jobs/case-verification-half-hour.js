import { db } from 'hatchable';
import { verifyCaseEvidence } from 'lib/case-verification.js';
export const access='scheduler';
export const methods=['POST'];
export const schedule='30 * * * *';

const BATCH_SIZE=100;
const CONCURRENCY=2;

export default async function(req,res){
 const cases=(await db.query(`SELECT c.id,c.user_id
   FROM recovery_cases c
   WHERE c.status NOT IN ('CLOSED','RESOLVED')
     AND EXISTS (SELECT 1 FROM evidence e WHERE e.case_id=c.id)
     AND (
       c.verification_last_checked_at IS NULL
       OR c.verification_last_checked_at < now() - interval '30 minutes'
       OR c.updated_at > COALESCE(c.verification_last_checked_at,'epoch'::timestamptz)
       OR c.verification_state IS NULL
       OR c.verification_state IN ('UNVERIFIED','REVIEWED','REVIEW')
     )
   ORDER BY COALESCE(c.verification_last_checked_at,'epoch'::timestamptz) ASC, c.updated_at ASC
   LIMIT ${BATCH_SIZE}`)).rows;
 const results=[];
 for(let i=0;i<cases.length;i+=CONCURRENCY){
  const batch=cases.slice(i,i+CONCURRENCY);
  results.push(...await Promise.all(batch.map(async c=>{
   try{return {case_id:c.id,...await verifyCaseEvidence(c.id,c.user_id,'scheduled_global_half_hour')};}
   catch(error){return {case_id:c.id,ok:false,error:String(error?.message||error)};}
  })));
 }
 res.json({ok:true,scope:'all_users_all_active_cases',checked:cases.length,concurrency:CONCURRENCY,batch_size:BATCH_SIZE,results});
}