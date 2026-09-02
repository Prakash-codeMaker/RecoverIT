import { db } from 'hatchable';

export const access='user';
export const methods=['GET'];

export default async function(req,res){
  const clientId=process.env.GOOGLE_CLIENT_ID;
  const redirect=process.env.GOOGLE_REDIRECT_URI||'https://recoverit.hatchable.site/api/integrations/google-drive-callback';
  const caseId=String(req.query?.case_id||'').trim();
  if(!clientId)return res.status(503).json({ok:false,error:'Google Drive OAuth is not configured yet.'});
  if(!caseId)return res.status(400).json({ok:false,error:'case_id is required.'});
  const owns=await db.query('SELECT id FROM recovery_cases WHERE id=$1 AND user_id=$2',[caseId,req.user.id]);
  if(!owns.rows[0])return res.status(404).json({ok:false,error:'Case not found.'});
  const state=crypto.randomUUID();
  const returnPath='/case.html?id='+encodeURIComponent(caseId)+'&google_drive=connected';
  await db.query('INSERT INTO oauth_states (state,user_id,provider,redirect_uri,return_path,expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval \'10 minutes\')',[state,req.user.id,'google_drive',redirect,returnPath]);
  const p=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/drive.readonly',access_type:'offline',prompt:'consent',state});
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?'+p.toString());
}