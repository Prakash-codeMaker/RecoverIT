import { db, scheduler } from 'hatchable';
import { verifyCaseEvidence } from 'lib/case-verification.js';
export const access='scheduler';
export const methods=['POST'];
export const schedule='0 * * * *';

const BATCH_SIZE=8;
const CONCURRENCY=4;

async function loadCandidates(priorityId){
 const priority=[];
 if(priorityId){
  const p=(await db.query("SELECT id,user_id FROM recovery_cases WHERE id=$1 AND status NOT IN ('CLOSED','RESOLVED')",[priorityId])).rows[0];
  if(p)priority.push(p);
 }
 const seen=priorityId?" AND c.id<>$1":"";
 const params=priorityId?[priorityId]:[];
 const sql=`SELECT c.id,c.user_id
   FROM recovery_cases c
   WHERE c.status NOT IN ('CLOSED','RESOLVED')
     AND EXISTS (SELECT 1 FROM evidence e WHERE e.case_id=c.id AND e.content_type IN ('application/pdf','image/jpeg','image/png','image/webp'))
     AND (
       c.verification_last_checked_at IS NULL
       OR c.updated_at > COALESCE(c.verification_last_checked_at,'epoch'::timestamptz)
       OR c.verification_state IS NULL
       OR c.verification_state IN ('UNVERIFIED','REVIEWED','REVIEW')
     )${seen}
   ORDER BY COALESCE(c.verification_last_checked_at,'epoch'::timestamptz) ASC, c.updated_at ASC
   LIMIT ${BATCH_SIZE}`;
 const candidates=(await db.query(sql,params)).rows;
 return [...priority,...candidates];
}

async function processAll(cases,trigger){
 const results=[];
 for(let i=0;i<cases.length;i+=CONCURRENCY){
  const batch=cases.slice(i,i+CONCURRENCY);
  const out=await Promise.all(batch.map(async c=>{
   try{return {case_id:c.id,...await verifyCaseEvidence(c.id,c.user_id,trigger)};}
   catch(error){return {case_id:c.id,ok:false,error:String(error?.message||error)};}
  }));
  results.push(...out);
 }
 return results;
}

export default async function(req,res){
 const priorityId=String(req.body?.case_id||'').trim();
 const all=await loadCandidates(priorityId);
 const trigger=priorityId?'evidence_uploaded':'scheduled_global';
 const results=await processAll(all,trigger);
 const continued=all.length>=BATCH_SIZE;
 if(continued){try{await scheduler.at(new Date(Date.now()+1200).toISOString(),'/api/jobs/case-verification',{payload:{}})}catch(_){/* hourly schedule remains the safety net */}}
 res.json({ok:true,scope:'all_users_all_active_cases',checked:all.length,concurrency:CONCURRENCY,batch_size:BATCH_SIZE,continued,results});
}