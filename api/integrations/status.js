import { db } from 'hatchable';
export const access='user'; export const methods=['GET'];
export default async function(req,res){
 const {rows}=await db.query('SELECT provider,display_name,connector_type,environment,enabled,capabilities,updated_at FROM provider_connectors ORDER BY display_name');
 res.json({connectors:rows,production_rule:'External money movement remains approval-gated and provider-authoritative. Connector readiness is determined by the provider adapter when invoked.'});
}