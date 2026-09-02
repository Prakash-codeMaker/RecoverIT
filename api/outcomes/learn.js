import { db, ai } from 'hatchable';
export const access='scheduler'; export const methods=['POST'];
export default async function(req,res){
 const examples=await db.query('SELECT * FROM outcome_training_examples ORDER BY created_at DESC LIMIT 500');
 const aggregate={};for(const x of examples.rows){const key=x.recommended_strategy||'unknown';aggregate[key]??={n:0,reward:0,resolved:0};aggregate[key].n++;aggregate[key].reward+=Number(x.reward||0);if(String(x.actual_outcome||'').toUpperCase()==='RESOLVED')aggregate[key].resolved++}
 let insights={source:'deterministic_aggregate'};
 try{
  const result=await ai.generateText({model:'gemini-flash',purpose:'recoverit-outcome-learning',prompt:`Summarize these anonymized aggregate recovery strategy outcomes. Do not infer user identity. Return JSON with strategy, sample_size, resolution_rate, average_reward, and one conservative recommendation per strategy. Data:${JSON.stringify(aggregate)}`,maxTokens:900});
  try{insights=JSON.parse(String(result.text||'').replace(/^```json\s*/i,'').replace(/```$/,'').trim())}catch(_){insights={source:'ai_text',raw:result.text||''}}
 }catch(error){insights={source:'deterministic_aggregate',ai_unavailable:true,reason:String(error.message||error)} }
 res.json({ok:true,sample_size:examples.rows.length,aggregate,insights});
}