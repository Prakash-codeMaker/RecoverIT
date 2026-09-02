import { advanceCaseWorkflow, getWorkflowState } from 'lib/case-workflow.js';
export const access='user';
export const methods=['GET','POST'];
export default async function(req,res){
 const caseId=String(req.query?.case_id||req.body?.case_id||'').trim();
 if(!caseId)return res.status(400).json({error:'Case ID is required.'});
 const current=await getWorkflowState(caseId,req.user.id);
 if(!current)return res.status(404).json({error:'Case not found.'});
 const workflow=await advanceCaseWorkflow(caseId,req.user.id,req.body?.force?'force':'page_resume');
 res.json({ok:true,workflow:workflow||current});
}