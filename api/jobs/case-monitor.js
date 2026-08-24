import { db, scheduler, email } from 'hatchable';

export const access='scheduler';
export const methods=['POST'];
export const schedule='0 * * * *';

const BATCH=20;

async function notifyUser(row,title,description,sendEmail=true){
  const recent=await db.query('SELECT id FROM notifications WHERE user_id=$1 AND case_id=$2 AND title=$3 AND created_at>now()-interval \'6 hours\' LIMIT 1',[row.user_id,row.id,title]);
  if(recent.rows[0])return;
  await db.query('INSERT INTO notifications (user_id,case_id,type,title,description) VALUES ($1,$2,$3,$4,$5)',[row.user_id,row.id,'case_update',title,description]);
  if(sendEmail && row.email){
    try{await email.send({to:row.email,subject:`RecoverIT · ${title}`,html:`<div style="font-family:Arial,sans-serif;max-width:620px"><h2>${title}</h2><p>${description}</p><p><a href="https://recoverit.hatchable.site/case.html?case_id=${encodeURIComponent(row.id)}">Open your RecoverIT case</a></p></div>`});}catch(_){/* account feed remains authoritative */}
  }
}

export default async function(req,res){
  const cursorTime=String(req.body?.cursor_time||'1970-01-01T00:00:00.000Z');
  const cursorId=String(req.body?.cursor_id||'00000000-0000-0000-0000-000000000000');
  const active=await db.query(`SELECT c.id,c.user_id,c.case_number,c.status,c.identity_status,c.transaction_reference,c.ai_status,c.ai_last_run_at,c.updated_at,u.email
    FROM recovery_cases c LEFT JOIN users u ON u.id=c.user_id
    WHERE c.status IN ('INVESTIGATING','REPORTED','WAITING_FOR_USER') AND (c.updated_at>$1 OR (c.updated_at=$1 AND c.id>$2))
    ORDER BY c.updated_at ASC,c.id ASC LIMIT $3`,[cursorTime,cursorId,BATCH]);
  let queued=0;
  for(const row of active.rows){
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