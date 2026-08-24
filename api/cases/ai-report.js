import { db } from 'hatchable';

export const access='user';
export const methods=['GET'];

export default async function(req,res){
  const id=req.query?.case_id;
  if(!id)return res.status(400).json({error:'Case ID is required.'});
  const r=await db.query(`SELECT id,case_number,status,ai_summary,ai_findings,ai_next_steps,ai_confidence,ai_last_run_at FROM recovery_cases WHERE id=$1 AND user_id=$2 LIMIT 1`,[id,req.user.id]);
  if(!r.rows[0])return res.status(404).json({error:'Case not found.'});
  const c=r.rows[0];
  res.json({
    ready:Boolean(c.ai_summary),
    summary:c.ai_summary||null,
    findings:Array.isArray(c.ai_findings)?c.ai_findings:[],
    next_steps:Array.isArray(c.ai_next_steps)?c.ai_next_steps:[],
    confidence:c.ai_confidence==null?null:Number(c.ai_confidence),
    last_run_at:c.ai_last_run_at,
    status:c.status,
    case_number:c.case_number
  });
}