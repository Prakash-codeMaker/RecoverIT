import { db, email } from 'hatchable';

function esc(value){
  return String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
}

export async function notifyUser({userId,caseId=null,type='case_update',title,description,sendEmail=true,subject=null}){
  const cleanTitle=String(title||'').trim();
  const cleanDescription=String(description||'').trim();
  if(!userId || !cleanTitle || !cleanDescription) return {created:false,reason:'invalid'};

  // One meaningful event should produce one in-app notification and at most one
  // email in the quiet window. This prevents polling/workflow retries from
  // turning into notification spam while still surfacing real user actions.
  const recent=await db.query(
    'SELECT id FROM notifications WHERE user_id=$1 AND case_id IS NOT DISTINCT FROM $2 AND title=$3 AND created_at>now()-interval \'12 hours\' LIMIT 1',
    [userId,caseId,cleanTitle]
  );
  if(recent.rows[0]) return {created:false,reason:'deduped'};

  await db.query(
    'INSERT INTO notifications (user_id,case_id,type,title,description) VALUES ($1,$2,$3,$4,$5)',
    [userId,caseId,type,cleanTitle,cleanDescription]
  );

  if(!sendEmail) return {created:true,emailed:false};

  const pref=await db.query('SELECT email FROM notification_preferences WHERE user_id=$1',[userId]);
  if(pref.rows[0] && pref.rows[0].email===false) return {created:true,emailed:false,reason:'email_disabled'};

  const user=await db.query('SELECT email FROM users WHERE id=$1',[userId]);
  const to=String(user.rows[0]?.email||'').trim();
  if(!to) return {created:true,emailed:false,reason:'no_email'};

  const caseLink=caseId
    ? `<p><a href=\"https://recoverit.hatchable.site/case.html?case_id=${encodeURIComponent(caseId)}\" style=\"display:inline-block;padding:11px 16px;border-radius:9px;background:#111;color:#fff;text-decoration:none\">Open your RecoverIT case</a></p>`
    : `<p><a href=\"https://recoverit.hatchable.site\" style=\"display:inline-block;padding:11px 16px;border-radius:9px;background:#111;color:#fff;text-decoration:none\">Open RecoverIT</a></p>`;
  try{
    await email.send({
      to,
      subject:subject||`RecoverIT · ${cleanTitle}`,
      html:`<div style=\"font-family:Arial,sans-serif;max-width:620px;color:#17201b\"><p style=\"letter-spacing:.08em;font-size:12px;color:#718078\">RECOVERIT</p><h2>${esc(cleanTitle)}</h2><p style=\"line-height:1.6\">${esc(cleanDescription)}</p>${caseLink}<p style=\"color:#718078;font-size:12px\">This is a transactional update about your RecoverIT account or case. You are not receiving a marketing message.</p></div>`,
      text:`${cleanTitle}\n\n${cleanDescription}\n\n${caseId?'Open your RecoverIT case: https://recoverit.hatchable.site/case.html?case_id='+encodeURIComponent(caseId):'Open RecoverIT: https://recoverit.hatchable.site'}`
    });
    return {created:true,emailed:true};
  }catch(_){
    // The in-app notification remains authoritative if delivery is unavailable.
    return {created:true,emailed:false,reason:'email_failed'};
  }
}