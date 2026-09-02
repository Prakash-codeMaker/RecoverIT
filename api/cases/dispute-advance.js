import { db } from 'hatchable';
import { getCase } from 'lib/case.js';
import { prepareNextRoute } from 'lib/dispute.js';
export const access='user'; export const methods=['POST'];
export default async function(req,res){
 const c=await getCase(req.body?.case_id,req.user.id);if(!c)return res.status(404).json({error:'Case not found.'});
 const next=await prepareNextRoute(c,req.user.id);
 if(!next)return res.status(404).json({error:'No higher verified escalation route is available for this case.'});
 res.json({ok:true,attempt_id:next.attempt_id,route:{organization:next.route.organization,level:next.route.level,channel:next.route.channel,destination:next.route.destination,official_url:next.route.official_url,required_documents:next.route.required_documents},message:`Next escalation prepared for ${next.route.organization}.`});
}