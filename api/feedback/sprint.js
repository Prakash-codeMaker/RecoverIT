import { db } from 'hatchable';
export const access='public'; export const methods=['POST'];
const clean=v=>String(v??'').trim().slice(0,1000);
export default async function(req,res){
  const b=req.body||{}; const sprint='2026-08-recoverit-1000';
  if(clean(b.website)) return res.status(400).json({error:'Invalid submission.'});
  const token=clean(b.session_token); const rating=Number(b.rating), clarity=Number(b.clarity), trust=Number(b.trust), usefulness=Number(b.usefulness);
  if(!token||![rating,clarity,trust,usefulness].every(n=>Number.isInteger(n)&&n>=1&&n<=5)) return res.status(400).json({error:'Please complete the four ratings.'});
  try{
    const r=await db.query('INSERT INTO feedback_sprint_responses (sprint_key,session_token,source,scenario,rating,clarity,trust,usefulness,comment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (sprint_key,session_token) DO NOTHING RETURNING id',[sprint,token,clean(b.source).slice(0,80)||'direct',clean(b.scenario).slice(0,120)||null,rating,clarity,trust,usefulness,clean(b.comment)||null]);
    const count=await db.query('SELECT count(*)::int AS total FROM feedback_sprint_responses WHERE sprint_key=$1',[sprint]);
    res.status(201).json({ok:true,created:Boolean(r.rows[0]),total:count.rows[0].total,target:1000});
  }catch(e){res.status(500).json({error:'Could not save feedback.'});}
}