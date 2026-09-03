import { connectorStatus, razorpayRequest } from 'lib/integrations.js';
import { db } from 'hatchable';

export const access='public';

export default async function(req,res){
 const rp=await razorpayRequest('GET','/payments?count=1');
 const twReady=Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_SMS_FROM);
 const disputeWebhook=Boolean(process.env.RECOVERIT_DISPUTE_WEBHOOK_SECRET);
 const razorpayWebhook=Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
 res.json({ok:true,providers:{razorpay:{configured:rp.configured,live_check:rp.configured?{ok:rp.ok,status:rp.status}:null},twilio:{configured:twReady,sms_ready:Boolean(process.env.TWILIO_SMS_FROM),whatsapp_ready:false},dispute_webhook:{configured:disputeWebhook},razorpay_webhook:{configured:razorpayWebhook}},rule:'External actions remain approval-gated and are only reported successful after provider evidence.'});
}