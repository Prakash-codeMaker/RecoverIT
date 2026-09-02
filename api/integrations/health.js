import { config } from 'hatchable';
import { razorpayRequest } from 'lib/integrations.js';
export const access='public'; export const methods=['GET'];
export default async function(req,res){
 const rp=await razorpayRequest('GET','/payments?count=1');
 const twReady=Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&(process.env.TWILIO_SMS_FROM||process.env.TWILIO_WHATSAPP_FROM));
 const disputeWebhook=Boolean(await config.get('recoverit_dispute_webhook_secret'));
 const razorpayWebhook=Boolean(await config.get('razorpay_webhook_secret'));
 res.json({ok:true,providers:{razorpay:{configured:rp.configured,live_check:rp.configured?{ok:rp.ok,status:rp.status}:null},twilio:{configured:twReady,sms_ready:Boolean(process.env.TWILIO_SMS_FROM),whatsapp_ready:Boolean(process.env.TWILIO_WHATSAPP_FROM)},dispute_webhook:{configured:disputeWebhook},razorpay_webhook:{configured:razorpayWebhook}},rule:'External actions remain approval-gated and are only reported successful after provider evidence.'});
}