import { db } from 'hatchable';
import { syncResolutionState } from 'lib/resolution.js';
import { advanceCaseWorkflow } from 'lib/case-workflow.js';

export const access='user';
export const methods=['GET','POST'];

export default async function(req,res){
  const caseId=req.query?.case_id||req.body?.case_id;
  if(!caseId)return res.status(400).json({error:'Case ID is required.'});
  const own=await db.query('SELECT id FROM recovery_cases WHERE id=$1 AND user_id=$2 LIMIT 1',[caseId,req.user.id]);
  if(!own.rows[0])return res.status(404).json({error:'Case not found.'});
  if(req.method==='POST' && req.body?.action==='mark_resolved'){
    const note=String(req.body?.note||'').trim().slice(0,1200);
    await db.query('UPDATE recovery_cases SET status=$1,resolved_at=now(),updated_at=now() WHERE id=$2 AND user_id=$3',['RESOLVED',caseId,req.user.id]);
    await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[''+caseId,'OUTCOME','Case marked resolved',note||'The user confirmed that the payment problem is resolved.','RESOLVED','User']);
  }
  if(req.method==='POST' && req.body?.action==='reopen'){
    await db.query('UPDATE recovery_cases SET status=$1,resolved_at=NULL,updated_at=now() WHERE id=$2 AND user_id=$3',['INVESTIGATING',caseId,req.user.id]);
    await db.query('INSERT INTO case_events (case_id,event_type,title,detail,state,source) VALUES ($1,$2,$3,$4,$5,$6)',[''+caseId,'OUTCOME','Case reopened','The user reported that the issue is not resolved. RecoverIT will continue monitoring and investigation.','INVESTIGATING','User']);
  }
  const state=await syncResolutionState(caseId);
  let workflow=null;try{workflow=await advanceCaseWorkflow(caseId,req.user.id,req.body?.action||'page_resume')}catch(_){/* workflow projection is retried by heartbeat */}
  const events=await db.query('SELECT title,detail,state,source,created_at FROM case_events WHERE case_id=$1 ORDER BY created_at DESC LIMIT 12',[caseId]);
  const c=(await db.query('SELECT case_number,status,amount,currency,issue_type,merchant_name,transaction_reference,ai_summary,ai_confidence,updated_at,resolved_at FROM recovery_cases WHERE id=$1',[caseId])).rows[0];
  res.json({ok:true,case:c,state,workflow,timeline:events.rows});
}