import { db } from 'hatchable';

export const access='user';
export const methods=['GET'];

export default async function(req,res){
  const clientId=process.env.GOOGLE_CLIENT_ID;
  const redirect=process.env.GOOGLE_REDIRECT_URI||'https://recoverit.hatchable.site/api/integrations/google-drive-callback';
  if(!clientId)return res.status(503).json({ok:false,error:'Google Drive OAuth is not configured yet. Add GOOGLE_CLIENT_ID in Hatchable Setup.'});
  const state=crypto.randomUUID();
  await db.query('INSERT INTO oauth_states (state,user_id,provider,redirect_uri,expires_at) VALUES ($1,$2,$3,$4,now()+interval \'10 minutes\')',[state,req.user.id,'google_drive',redirect]);
  const p=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/drive.readonly',access_type:'offline',prompt:'consent',state});
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?'+p.toString());
}