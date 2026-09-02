import { db } from 'hatchable';
export const access='user'; export const methods=['GET'];
export default async function(req,res){
 const configured=Boolean(process.env.AA_BASE_URL&&process.env.AA_CLIENT_ID&&process.env.AA_CLIENT_SECRET);
 const {rows}=await db.query('SELECT provider,integration_type,status,external_account_id,capabilities,last_checked_at FROM integration_connections WHERE user_id=$1 AND integration_type=$2 ORDER BY updated_at DESC',[req.user.id,'ACCOUNT_AGGREGATOR']);
 res.json({configured,connections:rows,consent_required:true,model:'India Account Aggregator consent-based financial data sharing'});
}