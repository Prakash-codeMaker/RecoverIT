import { db } from 'hatchable';

export const access='public';
export const methods=['GET'];

export default async function(req,res){
  const code=req.query?.code; const state=req.query?.state; const err=req.query?.error;
  if(err)return res.redirect('/app.html?google_drive=denied');
  if(!code||!state)return res.status(400).send('Missing Google OAuth response.');
  const q=await db.query('SELECT * FROM oauth_states WHERE state=$1 AND provider=$2 AND expires_at>now() LIMIT 1',[state,'google_drive']);
  const row=q.rows[0]; if(!row)return res.status(400).send('Google authorization expired. Please try again.');
  const clientId=process.env.GOOGLE_CLIENT_ID; const clientSecret=process.env.GOOGLE_CLIENT_SECRET; const redirect=process.env.GOOGLE_REDIRECT_URI||row.redirect_uri;
  if(!clientId||!clientSecret)return res.status(503).send('Google Drive OAuth is not configured.');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirect,grant_type:'authorization_code'}).toString()});
  const data=await r.json().catch(()=>({})); if(!r.ok)return res.status(502).send('Google authorization could not be completed.');
  const expires=Number(data.expires_in||3600); const accessToken=data.access_token; const refreshToken=data.refresh_token||null;
  await db.query('INSERT INTO oauth_connections (user_id,provider,access_token,refresh_token,expires_at,scope) VALUES ($1,$2,$3,$4,now()+($5 * interval \'1 second\'),$6) ON CONFLICT (user_id,provider) DO UPDATE SET access_token=$3,refresh_token=COALESCE($4,oauth_connections.refresh_token),expires_at=now()+($5 * interval \'1 second\'),scope=$6,updated_at=now()',[row.user_id,'google_drive',accessToken,refreshToken,expires,data.scope||'']);
  await db.query('DELETE FROM oauth_states WHERE state=$1',[state]);
  const dest=row.return_path||'/app.html?google_drive=connected';
  res.redirect(dest);
}