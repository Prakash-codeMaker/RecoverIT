import { db } from 'hatchable';
export const access='user'; export const methods=['GET'];
export default async function(req,res){ const r=await db.query('SELECT id,case_number,issue_type,amount,currency,merchant_name,status,priority,created_at,updated_at FROM recovery_cases WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[req.user.id]); res.json({cases:r.rows}); }