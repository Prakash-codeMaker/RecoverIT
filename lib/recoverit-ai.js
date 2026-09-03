import { ai, config } from 'hatchable';

const PROVIDERS = [
  { name: 'openrouter', kind: 'openrouter', model: 'openrouter/free' },
  { name: 'groq', kind: 'groq', model: 'qwen/qwen3.6-27b' },
  { name: 'gemini', kind: 'managed', model: 'gemini-3.7-flash' },
  { name: 'managed_sonnet', kind: 'managed', model: 'sonnet' },
];
const RETRYABLE = /429|quota|resource_exhausted|rate.?limit|too many|503|502|504|timeout|temporarily unavailable|unavailable|failed to retrieve media|empty response/i;
async function secret(name){try{return await config.get(name)}catch(_){return ''}}
function compact(text,max=12000){return String(text||'').slice(0,max)}
function extractJson(text){const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();try{return JSON.parse(raw)}catch(_){}const s=raw.indexOf('{'),e=raw.lastIndexOf('}');if(s>=0&&e>s){try{return JSON.parse(raw.slice(s,e+1))}catch(_2){}}return null}
function textFromOpenAIStyle(data){return data?.choices?.[0]?.message?.content??data?.choices?.[0]?.text??''}
function textFromGeminiStyle(data){return data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||''}
async function callManaged(provider,prompt,options={}){const out=await ai.generateText({model:provider.model,purpose:options.purpose||'recoverit-ai',prompt,maxTokens:options.maxTokens||900,userId:options.userId});return {provider:provider.name,model:provider.model,text:String(out.text||'')}}
async function callOpenRouter(prompt,options={}){const key=await secret('OPENROUTER_API_KEY');if(!key)throw new Error('OpenRouter key is not configured.');const body={model:options.model||'openrouter/free',messages:[{role:'user',content:prompt}],temperature:0,max_tokens:options.maxTokens||900};if(options.json)body.response_format={type:'json_object'};const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','HTTP-Referer':'https://recoverit.hatchable.site','X-Title':'RecoverIT'},body:JSON.stringify(body),timeout_ms:options.timeoutMs||30000});const text=await r.text();let data={};try{data=JSON.parse(text)}catch(_){data={raw:text}}if(!r.ok)throw new Error(`OpenRouter ${r.status}: ${compact(data?.error?.message||text,500)}`);return {provider:'openrouter',model:body.model,text:textFromOpenAIStyle(data)}}
async function callGroq(prompt,options={}){const key=await secret('GROQ_API_KEY');if(!key)throw new Error('Groq key is not configured.');const body={model:options.model||'openai/gpt-oss-120b',messages:[{role:'user',content:prompt}],temperature:0,max_completion_tokens:options.maxTokens||900};if(options.json)body.response_format={type:'json_object'};const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),timeout_ms:options.timeoutMs||12000});const text=await r.text();let data={};try{data=JSON.parse(text)}catch(_){data={raw:text}}if(!r.ok)throw new Error(`Groq ${r.status}: ${compact(data?.error?.message||text,500)}`);return {provider:'groq',model:body.model,text:textFromOpenAIStyle(data)}}
async function callProvider(provider,prompt,options={}){if(provider.kind==='managed')return callManaged(provider,prompt,options);if(provider.kind==='openrouter')return callOpenRouter(prompt,options);if(provider.kind==='groq')return callGroq(prompt,options);throw new Error(`Unsupported AI provider: ${provider.name}`)}
export async function generateText(prompt,options={}){const ordered=Array.isArray(options.providers)&&options.providers.length?PROVIDERS.filter(p=>options.providers.includes(p.name)):PROVIDERS;const errors=[];for(const provider of ordered){try{const result=await callProvider(provider,prompt,options);if(!result.text.trim())throw new Error('Provider returned an empty response.');return result}catch(error){const message=String(error?.message||error);errors.push({provider:provider.name,error:message});continue}}const err=new Error('All RecoverIT AI providers are currently unavailable.');err.providers=errors;throw err}
export async function generateJSON(prompt,options={}){const result=await generateText(`${prompt}\n\nReturn ONLY valid JSON.`,{...options,json:true});const parsed=extractJson(result.text);if(!parsed){const err=new Error(`Provider ${result.provider} returned non-JSON output.`);err.provider=result.provider;throw err}return {...result,data:parsed,parsed}}

async function callOpenRouterMultimodal({mimeType,b64,prompt,model='xiaomi/mimo-v2.5',timeoutMs=18000}){
 const key=await secret('OPENROUTER_API_KEY'); if(!key) throw new Error('OpenRouter key is not configured.');
 const content=[{type:'text',text:`${prompt}\n\nReturn ONLY valid JSON. Do not wrap it in markdown fences.`}];
 if(mimeType==='application/pdf') content.push({type:'file',file:{filename:'recoverit-evidence.pdf',file_data:`data:application/pdf;base64,${b64}`}});
 else content.push({type:'image_url',image_url:{url:`data:${mimeType};base64,${b64}`}});
 // MiMo-V2.5 supports images/PDFs but does not support OpenAI response_format,
 // so JSON is enforced by the prompt and validated after the response.
 const body={model,messages:[{role:'user',content}],temperature:0,max_tokens:1600};
 const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','HTTP-Referer':'https://recoverit.hatchable.site','X-Title':'RecoverIT'},body:JSON.stringify(body),timeout_ms:timeoutMs});
 const text=await r.text();let data={};try{data=JSON.parse(text)}catch(_){data={raw:text}};
 if(!r.ok)throw new Error(`OpenRouter ${r.status}: ${compact(data?.error?.message||text,500)}`);
 const out=textFromOpenAIStyle(data), parsed=extractJson(out); if(!parsed)throw new Error('OpenRouter returned non-JSON document analysis.');
 return {provider:'openrouter',model,data:parsed,parsed,text:out};
}

async function callGroqMultimodal({mimeType,b64,prompt,model='qwen/qwen3.6-27b',timeoutMs=12000}){
 if(mimeType==='application/pdf') throw new Error('Groq multimodal fallback supports images, not PDFs.');
 const key=await secret('GROQ_API_KEY'); if(!key) throw new Error('Groq key is not configured.');
 const content=[{type:'text',text:`${prompt}\n\nReturn ONLY valid JSON.`},{type:'image_url',image_url:{url:`data:${mimeType};base64,${b64}`}}];
 const body={model,messages:[{role:'user',content}],temperature:0,max_completion_tokens:1600,reasoning_effort:'none',response_format:{type:'json_object'}};
 const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),timeout_ms:timeoutMs});
 const text=await r.text();let data={};try{data=JSON.parse(text)}catch(_){data={raw:text}};
 if(!r.ok)throw new Error(`Groq ${r.status}: ${compact(data?.error?.message||text,500)}`);
 const out=textFromOpenAIStyle(data), parsed=extractJson(out); if(!parsed)throw new Error('Groq returned non-JSON document analysis.');
 return {provider:'groq',model,data:parsed,parsed,text:out};
}

async function callGeminiMultimodal({mimeType,b64,prompt,model='gemini-3.7-flash',timeoutMs=25000}){
 const body={contents:[{parts:[{text:`${prompt}\n\nReturn ONLY valid JSON.`},{inline_data:{mime_type:mimeType,data:b64}}]}],generationConfig:{temperature:0,responseMimeType:'application/json',maxOutputTokens:1600}};
 const r=await ai.fetch({provider:'google',path:`/v1beta/models/${encodeURIComponent(model)}:generateContent`,body,purpose:'recoverit-document-analysis',timeoutMs});
 if(!r.ok)throw new Error(`Gemini ${r.status}: ${compact(r.error||'provider unavailable',500)}`);
 const data=await r.json();const out=textFromGeminiStyle(data),parsed=extractJson(out);if(!parsed)throw new Error('Gemini returned non-JSON document analysis.');
 return {provider:'gemini',model,data:parsed,parsed,text:out};
}

export async function analyzeDocument({mimeType,bytes,prompt,options={}}){
 const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif','application/pdf']);if(!allowed.has(mimeType))throw new Error(`Unsupported document type: ${mimeType}`);
 const b64=Buffer.from(bytes).toString('base64'); const attempts=[];
 const multimodalOrder=mimeType==='application/pdf'?['gemini','openrouter']:['gemini','groq','openrouter'];
 for(const name of multimodalOrder){try{let result;if(name==='openrouter')result=await callOpenRouterMultimodal({mimeType,b64,prompt,model:options.openRouterModel||'xiaomi/mimo-v2.5',timeoutMs:options.openRouterTimeoutMs||18000});else if(name==='groq')result=await callGroqMultimodal({mimeType,b64,prompt,model:options.groqVisionModel||'qwen/qwen3.6-27b',timeoutMs:options.groqVisionTimeoutMs||12000});else result=await callGeminiMultimodal({mimeType,b64,prompt,model:options.geminiModel||'gemini-3.7-flash',timeoutMs:options.geminiTimeoutMs||25000});return {...result,available:true,failover_from:attempts}}catch(error){attempts.push({provider:name,error:String(error?.message||error)});}}
 const err=new Error('No available multimodal AI provider can analyze this document right now.');err.providers=attempts;err.available=false;throw err;
}
export function providerSummary(){return PROVIDERS.map(p=>({name:p.name,kind:p.kind,model:p.model}))}