import { advanceCaseWorkflow } from 'lib/case-workflow.js';
export const access='scheduler';
export const methods=['POST'];
export default async function(req,res){
 const caseId=String(req.body?.case_id||'').trim();
 const userId=String(req.body?.user_id||'').trim();
 if(!caseId||!userId)return res.status(400).json({error:'case_id and user_id are required.'});
 try{const workflow=await advanceCaseWorkflow(caseId,userId,String(req.body?.workflow_trigger||'scheduler'));return res.json({ok:true,workflow});}
 catch(error){return res.status(500).json({ok:false,error:String(error?.message||error)});}
}