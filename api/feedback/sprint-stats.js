import { db } from 'hatchable';
export const access='public'; export const methods=['GET'];
export default async function(req,res){
  const sprint='2026-08-recoverit-1000';
  const r=await db.query('SELECT count(*)::int AS total, round(avg(rating)::numeric,2) AS rating, round(avg(clarity)::numeric,2) AS clarity, round(avg(trust)::numeric,2) AS trust, round(avg(usefulness)::numeric,2) AS usefulness FROM feedback_sprint_responses WHERE sprint_key=$1',[sprint]);
  const total=Number(r.rows[0]?.total||0); res.json({total,target:1000,percent:Math.min(100,total/10),averages:r.rows[0]||{}});
}