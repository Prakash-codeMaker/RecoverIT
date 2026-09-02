import { db, scheduler, email } from 'hatchable';
import { syncResolutionState } from 'lib/resolution.js';
import { prepareFirstDisputeAction } from 'lib/dispute.js';
import { rebuildCaseBrain } from 'lib/case-brain.js';

export const access='scheduler';
export const methods=['POST'];
export const schedule='0 * * * *';

const BATCH=20;

async function sendCaseUpdate(row){
  if(!row.email || !row.updated_at)return;
  const already=row.last_email_update_at && new Date(row.last_email_update_at).getTime() >= new Date(row.updated_at).getTime();
  if(already)return;
  const attention=row.status==='WAITING_FOR_USER';
  const title=attention?'RecoverIT needs your attention':`RecoverIT update · ${row.case_number}`;
  const description=attention
    ? 'Your RecoverIT case needs information from you before the investigation can continue. Open your case to see exactly what is needed.'
    : 'There is a new update on your RecoverIT case. The investigation timeline and next steps are available in your account.';
  try{
    await email.send({to:row.email,subject:`RecoverIT · ${attention?'Action needed':`Case ${row.case_number} updated`}`,html:`<div style="font-family:Arial,sans-serif;max-width:620px"><h2>${title}</h2><p>${description}</p><p><a href="https://recoverit.hatchable.site/case.html?case_id=${encodeURIComponent(row.id)}">Open your case</a></p><p style="color:#718078;font-size:12px">You are receiving this because your RecoverIT case changed.</p></div>`});
    await db.query('UPDATE recovery_cases SET last_email_update_at=$1 WHERE id=$2',[row.updated_at,row.id]);
  }catch(_){/* do not block investigation when email delivery fails */}
}

async function notifyUser(row,title,description,sendEmail=true){
  const recent=await db.query('SELECT id FROM notifications WHERE user_id=$1 AND case_id=$2 AND title=$3 AND created_at>now()-interval \'6 hours\' LIMIT 1',[row.user_id,row.id,title]);
  if(recent.rows[0])return;
  await db.query('INSERT INTO notifications (user_id,case_id,type,title,description) VALUES ($1,$2,$3,$4,$5)',[row.user_id,row.id,'case_update',title,description]);
  if(sendEmail && row.email){
    try{await email.send({to:row.email,subject:`RecoverIT · ${title}`,html:`<div style="font-family:Arial,sans-serif;max-width:620px"><h2>${title}</h2><p>${description}</p><p><a href="https://recoverit.hatchable.site/case.html?case_id=${encodeURIComponent(row.id)}">Open your RecoverIT case</a></p></div>`});}catch(_){/* account feed remains authoritative */}
  }
}

async function sendAttentionEmail(row){
  if(!row.email)return;
  const recent=await db.query('SELECT id FROM notifications WHERE user_id=$1 AND case_id=$2 AND type=$3 AND created_at>now()-interval \'24 hours\' LIMIT 1',[row.user_id,row.id,'case_attention']);
  if(recent.rows[0])return;
  const title='Your RecoverIT case needs attention';
  const description='RecoverIT has reached a point where your case needs information or an action from you. Open the case to see exactly what is required.';
  await db.query('INSERT INTO notifications (user_id,case_id,type,title,description) VALUES ($1,$2,$3,$4,$5)',[row.user_id,row.id,'case_attention',title,description]);
  try{await email.send({to:row.email,subject:`RecoverIT · Action needed for ${row.case_number}`,html:`<div style="font-family:Arial,sans-serif;max-width:620px"><p style="letter-spacing:.08em;font-size:12px;color:#667">RECOVERIT</p><h2>Your case needs attention</h2><p>${description}</p><p><a href="https://recoverit.hatchable.site/case.html?case_id=${encodeURIComponent(row.id)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#111;color:#fff;text-decoration:none">Review case</a></p><p style="color:#667;font-size:12px">Case ${row.case_number}</p></div>`});}catch(_){/* in-account attention notification remains */}
}

export default async function(req,res){
  const cursorTime=String(req.body?.cursor_time||'1970-01-01T00:00:00.000Z');
  const cursorId=String(req.body?.cursor_id||'00000000-0000-0000-0000-000000000000');
  const active=await db.query(`SELECT c.id,c.user_id,c.case_number,c.status,c.identity_status,c.transaction_reference,c.ai_status,c.ai_last_run_at,c.updated_at,c.last_email_update_at,u.email
    FROM recovery_cases c LEFT JOIN users u ON u.id=c.user_id
    WHERE c.status IN ('INVESTIGATING','REPORTED','WAITING_FOR_USER') AND (c.updated_at>$1 OR (c.updated_at=$1 AND c.id>$2))
    ORDER BY c.updated_at ASC,c.id ASC LIMIT $3`,[cursorTime,cursorId,BATCH]);
  let queued=0;
  for(const row of active.rows){
    let resolution=null;try{resolution=await syncResolutionState(row.id)}catch(_){/* resolution state must never block case monitoring */}
    try{await rebuildCaseBrain(row.id,row.user_id)}catch(_){/* case brain is derived state; monitoring continues safely */}
    try{await rebuildCaseBrain(row.id,row.user_id)}catch(_){/* Case Brain refresh is best-effort and never blocks monitoring */}
    if(row.identity_status==='VERIFIED_ACCOUNT'){
      try{
        const vr=await db.query("SELECT * FROM recovery_cases WHERE id=$1 LIMIT 1",[row.id]);
        const fullCase=vr.rows[0];
        if(String(fullCase?.verification_state||'').toUpperCase()==='VERIFIED') await prepareFirstDisputeAction(fullCase,row.user_id);
      }catch(_){/* automatic route preparation is best-effort and never blocks monitoring */}
    }
    await sendCaseUpdate(row);
    if(row.status==='WAITING_FOR_USER') await sendAttentionEmail(row);
    if(row.identity_status!=='VERIFIED_ACCOUNT') continue;
    if(row.status==='WAITING_FOR_USER' && !String(row.transaction_reference||'').trim()) continue;
    if(row.status==='REPORTED' || !row.ai_last_run_at || Date.now()-new Date(row.ai_last_run_at).getTime()>55*60*1000){
      await scheduler.now('/api/cases/investigate-worker',{case_id:row.id,user_id:row.user_id});
      queued++;
    }
  }
  if(active.rows.length===BATCH){
    const last=active.rows[active.rows.length-1];
    await scheduler.at(new Date(Date.now()+1200).toISOString(),'/api/jobs/case-monitor',{payload:{cursor_time:new Date(last.updated_at).toISOString(),cursor_id:last.id}});
  }
  res.json({ok:true,scanned:active.rows.length,queued,continued:active.rows.length===BATCH});
}