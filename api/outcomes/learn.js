import { db } from 'hatchable';
export const access='scheduler'; export const methods=['POST'];
export default async function(req,res){
 const examples=await db.query('SELECT * FROM outcome_training_examples ORDER BY created_at DESC LIMIT 500');
 const aggregate={};
 for(const x of examples.rows){
  const key=String(x.recommended_strategy||'unknown');
  aggregate[key]??={n:0,reward:0,resolved:0};
  aggregate[key].n++;
  aggregate[key].reward+=Number(x.reward||0);
  if(String(x.actual_outcome||'').toUpperCase()==='RESOLVED')aggregate[key].resolved++;
 }
 const strategies=[];
 for(const [strategy,v] of Object.entries(aggregate)){
  const rate=v.n?Number((v.resolved/v.n).toFixed(4)):0;
  strategies.push({strategy,sample_size:v.n,resolution_rate:rate,average_reward:v.n?Number((v.reward/v.n).toFixed(4)):0,recommendation:v.n<3?'Collect more outcomes before optimizing this strategy.':rate>=0.7?'Keep this strategy as a preferred path for similar verified disputes.':'Prefer another proven strategy when the case permits.'});
 }
 res.json({ok:true,sample_size:examples.rows.length,aggregate,insights:{source:'deterministic_aggregate',strategies}});
}