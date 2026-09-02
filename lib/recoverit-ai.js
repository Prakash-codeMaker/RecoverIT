import { db, ai as managedAI } from 'hatchable';

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const PROVIDERS=[
  {name:'gemini',model:'gemini-3.7-flash',vision:true},
  {name:'openai',model:'gpt-5.6-luna',vision:true},
  {name:'anthropic',model:'sonnet',vision:true},
];

async function health(provider){
  const r=await db.query('SELECT provider,enabled,failure_count,cooldown_until FROM ai_provider_health WHERE provider=$1',[provider]);
  const h=r.rows[0]||{enabled:true};
  if(h.enabled===false)return {available:false,reason:'DISABLED'};
  if(h.cooldown_until && new Date(h.cooldown_until).getTime()>Date.now())return {available:false,reason:'COOLDOWN',cooldown_until:h.cooldown_until};
  return {available:true,health:h};
}

async function record(provider,ok,error){
  if(ok){
    await db.query('UPDATE ai_provider_health SET success_count=success_count+1,failure_count=0,cooldown_until=NULL,last_error=NULL,last_success_at=now(),updated_at=now() WHERE provider=$1',[provider]);
    return;
  }
  const r=await db.query('SELECT failure_count FROM ai_provider_health WHERE provider=$1',[provider]);
  const failures=Number(r.rows[0]?.failure_count||0)+1;
  const cooldown=Math.min(900,Math.max(30,45*Math.pow(2,Math.min(failures-1,4))));
  await db.query('UPDATE ai_provider_health SET failure_count=$1,cooldown_until=now()+($2||\' seconds\')::interval,last_error=$3,last_error_at=now(),updated_at=now() WHERE provider=$4',[failures,cooldown,String(error||'provider_error').slice(0,800),provider]);
}

function parseJSON(text){
  const raw=String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(raw)}catch(_){const a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a>=0&&b>a){try{return JSON.parse(raw.slice(a,b+1))}catch(_2){}}return null}
}

async function callProvider(candidate,request){
  return managedAI.generateText({model:candidate.model,prompt:request.prompt,messages:request.messages,system:request.system,purpose:request.purpose,userId:request.userId,maxTokens:request.maxTokens||1200});
}

export async function generateText({prompt,purpose,userId,maxTokens=1200}){
  const failures=[];
  for(const candidate of PROVIDERS){
    const h=await health(candidate.name);if(!h.available){failures.push(`${candidate.name}:${h.reason}`);continue;}
    try{
      const out=await Promise.race([callProvider(candidate,{prompt,purpose,userId,maxTokens}),sleep(28000).then(()=>{throw Error('timeout')})]);
      const text=String(out?.text||'').trim();if(!text)throw Error('empty response');
      await record(candidate.name,true);
      await db.query('INSERT INTO ai_request_log (purpose,provider,success,failover_from) VALUES ($1,$2,true,$3)',[purpose||'unspecified',candidate.name,JSON.stringify(failures)]);
      return {available:true,text,provider:candidate.name,failover_from:failures};
    }catch(error){
      failures.push(`${candidate.name}:${String(error.message||error).slice(0,300)}`);await record(candidate.name,false,error);
    }
  }
  await db.query('INSERT INTO ai_request_log (purpose,provider,success,failover_from,error_summary) VALUES ($1,$2,false,$3,$4)',[purpose||'unspecified',null,JSON.stringify(failures),'No AI provider was available']);
  return {available:false,text:'',provider:null,failover_from:failures,reason:'No configured AI provider is currently available.'};
}

export async function generateJSON(args){
  const r=await generateText(args);if(!r.available)return r;const parsed=parseJSON(r.text);if(!parsed)return {...r,parsed:null,parse_error:true};return {...r,parsed};
}

export async function analyzeDocument({mimeType,bytes,prompt}){
  const base64=Buffer.from(bytes).toString('base64');
  const dataUrl=`data:${mimeType};base64,${base64}`;
  const failures=[];
  for(const candidate of PROVIDERS){
    const h=await health(candidate.name);if(!h.available){failures.push(`${candidate.name}:${h.reason}`);continue;}
    try{
      const messages=[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:dataUrl}]}];
      // OpenAI's Responses-style multimodal message shape is normalized by the Hatchable AI gateway for supported providers.
      const out=await Promise.race([callProvider(candidate,{messages,purpose:'recoverit-document-analysis',maxTokens:1800}),sleep(30000).then(()=>{throw Error('timeout')})]);
      const text=String(out?.text||'').trim();if(!text)throw Error('empty response');
      const parsed=parseJSON(text);if(!parsed)throw Error('invalid structured output');
      await record(candidate.name,true);
      await db.query('INSERT INTO ai_request_log (purpose,provider,success,failover_from) VALUES ($1,$2,true,$3)',['recoverit-document-analysis',candidate.name,JSON.stringify(failures)]);
      return {available:true,text,provider:candidate.name,parsed,failover_from:failures};
    }catch(error){
      failures.push(`${candidate.name}:${String(error.message||error).slice(0,300)}`);await record(candidate.name,false,error);
    }
  }
  await db.query('INSERT INTO ai_request_log (purpose,provider,success,failover_from,error_summary) VALUES ($1,$2,false,$3,$4)',['recoverit-document-analysis',null,JSON.stringify(failures),'No multimodal AI provider was available']);
  return {available:false,text:'',provider:null,parsed:null,failover_from:failures,reason:'No configured multimodal AI provider is currently available.'};
}