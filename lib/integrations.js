import { db } from 'hatchable';

function env(name){return String(process.env[name]||'').trim()}
function jsonHeaders(){return {'content-type':'application/json','accept':'application/json'}}

export async function connectorStatus(provider){
  const {rows}=await db.query('SELECT provider,display_name,connector_type,environment,enabled,capabilities,configuration,updated_at FROM provider_connectors WHERE provider=$1',[provider]);
  return rows[0]||null;
}

export async function razorpayRequest(method,path,body){
  const key=env('RAZORPAY_KEY_ID'), secret=env('RAZORPAY_KEY_SECRET');
  if(!key||!secret) return {configured:false,error:'Razorpay live credentials are not configured.'};
  const auth=btoa(`${key}:${secret}`);
  const r=await fetch(`https://api.razorpay.com/v1${path}`,{method,headers:{...jsonHeaders(),authorization:`Basic ${auth}`},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();let data={};try{data=JSON.parse(text)}catch(_){data={raw:text}}
  return {configured:true,ok:r.ok,status:r.status,data};
}

export async function sendTwilio(channel,to,body){
  const sid=env('TWILIO_ACCOUNT_SID'), token=env('TWILIO_AUTH_TOKEN');
  if(!sid||!token)return {configured:false,error:'Twilio credentials are not configured.'};
  const from=channel==='whatsapp'?env('TWILIO_WHATSAPP_FROM'):env('TWILIO_SMS_FROM');
  if(!from)return {configured:false,error:`Twilio ${channel} sender is not configured.`};
  const form=new URLSearchParams();form.set('To',channel==='whatsapp'&&!to.startsWith('whatsapp:')?`whatsapp:${to}`:to);form.set('From',from);form.set('Body',body);
  const auth=btoa(`${sid}:${token}`);
  const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:'POST',headers:{authorization:`Basic ${auth}`,'content-type':'application/x-www-form-urlencoded'},body:form.toString()});
  const text=await r.text();let data={};try{data=JSON.parse(text)}catch(_){data={raw:text}}
  return {configured:true,ok:r.ok,status:r.status,data};
}

export async function googleVisionDocument({mimeType,bytes,prompt}){
  const key=env('GOOGLE_API_KEY');
  if(!key)return {configured:false,error:'GOOGLE_API_KEY is not exposed to the server runtime.'};
  const b64=Buffer.from(bytes).toString('base64');
  const model=env('RECOVERIT_GEMINI_MODEL')||'gemini-2.5-flash';
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:jsonHeaders(),body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:mimeType,data:b64}}]}],generationConfig:{temperature:0,responseMimeType:'application/json'}})});
  const text=await r.text();let data={};try{data=JSON.parse(text)}catch(_){data={raw:text}}
  return {configured:true,ok:r.ok,status:r.status,data};
}

export function extractGeminiText(data){return data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||''}

export function canonicalPaymentState(value){const s=String(value||'').toLowerCase();if(['captured','paid','success','successful','completed'].includes(s))return 'SUCCESS';if(['authorized','pending','processing'].includes(s))return 'PENDING';if(['failed','failure','declined'].includes(s))return 'FAILED';if(['refunded','refund_processed','reversed'].includes(s))return 'REFUNDED';return 'UNKNOWN'}