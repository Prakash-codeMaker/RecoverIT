import { db } from 'hatchable';
export const access='member'; export const methods=['POST'];
export default async function(req,res){const id=req.body?.id;if(!id)return res.status(400).json({error:'Notification id required.'});await db.query('UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2',[id,req.member.id]);res.json({ok:true});}