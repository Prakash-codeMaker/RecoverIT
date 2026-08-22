import { db } from 'hatchable';
export const access='user'; export const methods=['GET'];
export default async function(req,res){const r=await db.query('SELECT id,case_id,type,title,description,read,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[req.user.id]);res.json({notifications:r.rows});}