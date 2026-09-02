import { rebuildCaseBrain, getCaseBrain } from 'lib/case-brain.js';
import { getCase } from 'lib/case.js';
export const access='user'; export const methods=['GET','POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id||req.query?.case_id,req.user.id); if(!c)return res.status(404).json({error:'Case not found.'});
 const refresh=String(req.body?.refresh||req.query?.refresh||'').toLowerCase()==='true';
 const brain=refresh||!(await getCaseBrain(c.id,req.user.id))?await rebuildCaseBrain(c.id,req.user.id):await getCaseBrain(c.id,req.user.id);
 res.json({ok:true,brain});
}