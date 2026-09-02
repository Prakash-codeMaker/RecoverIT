import { db } from 'hatchable';
import { razorpayRequest } from 'lib/integrations.js';
export const access='admin'; export const methods=['GET'];
async function env(name){return Boolean(String(process.env[name]||'').trim())}
export default async function(req,res){
 const providers={
  google_document:{configured:await env('GOOGLE_API_KEY'),mode:'multimodal_document_analysis'},
  razorpay:{configured:(await env('RAZORPAY_KEY_ID'))&&(await env('RAZORPAY_KEY_SECRET')),mode:'payment_lookup_and_approved_refund'},
  twilio:{configured:(await env('TWILIO_ACCOUNT_SID'))&&(await env('TWILIO_AUTH_TOKEN'))&&((await env('TWILIO_SMS_FROM'))||(await env('TWILIO_WHATSAPP_FROM'))),mode:'sms_and_whatsapp'},
  account_aggregator:{configured:(await env('AA_BASE_URL'))&&(await env('AA_CLIENT_ID'))&&(await env('AA_CLIENT_SECRET')),mode:'consent_based_bank_data'}
 };
 if(providers.razorpay.configured){
  const ping=await razorpayRequest('GET','/payments?count=1');
  providers.razorpay.live_check={ok:Boolean(ping.ok),status:ping.status,reason:ping.ok?'Provider API reachable.':'Provider API rejected the credentials/request.'};
 }
 const routeCount=(await db.query('SELECT count(*)::int AS n FROM dispute_routes WHERE active=true')).rows[0].n;
 res.json({ok:true,providers,active_dispute_routes:routeCount,rule:'RecoverIT never reports an external complaint, refund, or bank connection as successful without provider evidence.'});
}