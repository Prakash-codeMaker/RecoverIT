import { db } from 'hatchable';
export const access='member';
export const methods=['POST'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default async function(req,res){
  const caseId=req.body?.case_id;
  if(!caseId)return res.status(400).json({error:'Case ID is required.'});
  const {rows}=await db.query('SELECT id,case_number,issue_type,description,status,amount,payment_method,created_at,updated_at FROM recovery_cases WHERE id=$1 AND user_id=$2',[caseId,req.member.id]);
  if(!rows.length)return res.status(404).json({error:'Case not found.'});
  const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  try {
    await db.query('INSERT INTO case_shares (case_id,token,created_by,expires_at) VALUES ($1,$2,$3,now()+interval \'30 days\')',[caseId,token,req.member.id]);
  } catch (e) {
    return res.status(500).json({error:'RecoverIT could not create the share link. Please try again.'});
  }
  const url='/share/'+encodeURIComponent(token);
  res.json({ok:true,url,absolute_url:'https://recoverit.hatchable.site'+url,token,expires_in_days:30});
}