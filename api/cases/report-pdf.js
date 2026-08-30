import { db } from 'hatchable';

export const access = 'user';
export const methods = ['GET'];

function clean(value, fallback='Not provided') {
  const s=String(value ?? '').replace(/\s+/g,' ').trim();
  return s || fallback;
}
function pdfText(value) {
  return clean(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}
function wrap(value, width=92) {
  const text=clean(value,'');
  if(!text)return [''];
  const words=text.split(' '), out=[]; let line='';
  for(const word of words){
    if((line+' '+word).trim().length<=width) line=(line+' '+word).trim();
    else { if(line)out.push(line); line=word.slice(0,width); }
  }
  if(line)out.push(line);
  return out;
}
function makePdf(c,steps,events,evidence) {
  const lines=[];
  const add=(text='',size=10,bold=false,indent=0)=>lines.push({text:clean(text,''),size,bold,indent});
  add('RECOVERIT  /  CASE REPORT',11,true); add('',5); add(c.case_number,22,true); add('Payment recovery case record',10,false); add('',8);
  add('CASE OVERVIEW',12,true); add('Issue: '+clean(c.issue_type),10); add('Status: '+clean(c.status),10); add('Priority: '+clean(c.priority),10); add('Amount: '+(c.amount==null?'Not provided':('INR '+c.amount)),10); add('Payment method: '+clean(c.payment_method),10); add('Merchant / provider: '+clean(c.merchant_name),10); add('Transaction / UTR / RRN: '+clean(c.transaction_reference),10); add('Created: '+clean(c.created_at),10); add('',8);
  add('PROBLEM STATEMENT',12,true); wrap(c.description,100).forEach(x=>add(x,10)); add('',8);
  add('RECOVERIT ASSESSMENT',12,true); wrap(c.ai_summary || 'RecoverIT is continuing to investigate this case.',100).forEach(x=>add(x,10)); add('',8);
  add('INVESTIGATION PROGRESS',12,true);
  steps.forEach((s,i)=>{ add(`${i+1}. ${clean(s.title||s.step_key)}  [${clean(s.status)}]`,10,true); if(s.detail)wrap(s.detail,96).forEach(x=>add(x,9,false,12)); });
  add('',8); add('EVIDENCE INVENTORY',12,true); add('Attached proof files: '+evidence.length,10); evidence.slice(0,30).forEach((e,i)=>add(`${i+1}. ${clean(e.filename)}  ·  ${clean(e.content_type)}  ·  ${e.bytes?Math.ceil(Number(e.bytes)/1024)+' KB':'size unknown'}`,9));
  add('',8); add('CASE TIMELINE',12,true); events.slice(0,30).forEach(e=>{add(clean(e.title||e.event_type),10,true); if(e.created_at)add(clean(e.created_at),8,false); if(e.detail)wrap(e.detail,96).forEach(x=>add(x,9,false,12));});
  add('',8); add('NEXT ACTION',12,true); wrap(c.ai_next_steps && Array.isArray(c.ai_next_steps) && c.ai_next_steps.length ? c.ai_next_steps.join('  ') : 'Follow the next step shown in RecoverIT and provide any requested transaction reference or provider response.',100).forEach(x=>add(x,10));
  add('',10); add('This report is generated from information currently held by RecoverIT. It distinguishes reported information from automated assessment and is not a guarantee of recovery.',8);

  const pageHeight=760, top=790, bottom=54, lineGap=15;
  const pages=[]; let page=[]; let y=top;
  for(const l of lines){
    const h=Math.max(lineGap,l.size+5);
    if(y-h<bottom){pages.push(page);page=[];y=top;}
    page.push({...l,y}); y-=h;
  }
  if(page.length)pages.push(page);

  const objects=[];
  const pageIds=[], contentIds=[];
  let nextId=3;
  for(let i=0;i<pages.length;i++){pageIds.push(nextId++);contentIds.push(nextId++);}
  const fontId=nextId++;
  const kids=pageIds.map(id=>id+' 0 R').join(' ');
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[2]=`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  for(let i=0;i<pages.length;i++){
    const commands=['q','0 0 0 rg'];
    for(const l of pages[i]){
      const font=l.bold?'Helvetica-Bold':'Helvetica';
      commands.push('BT',`/${l.bold?'F2':'F1'} ${l.size} Tf 48 ${l.y.toFixed(1)} Td (${pdfText(l.text)}) Tj`,'ET');
    }
    commands.push('Q');
    const stream=commands.join('\n');
    const pid=pageIds[i], cid=contentIds[i];
    objects[pid]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontId+1} 0 R >> >> /Contents ${cid} 0 R >>`;
    objects[cid]=`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
  }
  objects[fontId]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[fontId+1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  const maxId=fontId+1;
  let pdf='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets=new Array(maxId+1).fill(0);
  for(let id=1;id<=maxId;id++){offsets[id]=new TextEncoder().encode(pdf).length;pdf+=`${id} 0 obj\n${objects[id]}\nendobj\n`;}
  const xrefOffset=new TextEncoder().encode(pdf).length;
  pdf+=`xref\n0 ${maxId+1}\n0000000000 65535 f \n`;
  for(let id=1;id<=maxId;id++)pdf+=String(offsets[id]).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export default async function(req,res){
  const id=String(req.query?.case_id||'').trim();
  if(!id)return res.status(400).json({error:'Case ID is required.'});
  const cRes=await db.query(`SELECT id,case_number,issue_type,description,amount,currency,merchant_name,transaction_reference,payment_method,status,priority,confidence_score,created_at,ai_summary,ai_next_steps FROM recovery_cases WHERE (id::text=$1 OR case_number=$1) AND user_id=$2 LIMIT 1`,[id,req.user.id]);
  const c=cRes.rows[0];
  if(!c)return res.status(404).json({error:'Case not found.'});
  const [sRes,eRes,pRes]=await Promise.all([
    db.query('SELECT step_key,title,status,detail,created_at FROM investigation_steps WHERE case_id=$1 ORDER BY created_at ASC',[c.id]),
    db.query('SELECT title,detail,state,source,created_at FROM case_events WHERE case_id=$1 ORDER BY created_at DESC LIMIT 40',[c.id]),
    db.query('SELECT filename,content_type,bytes,created_at FROM evidence WHERE case_id=$1 ORDER BY created_at ASC',[c.id])
  ]);
  const bytes=makePdf(c,sRes.rows,eRes.rows,pRes.rows);
  const name='recoverit-'+clean(c.case_number,'case').replace(/[^a-z0-9_-]/gi,'_')+'.pdf';
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="${name}"`);
  res.setHeader('Cache-Control','no-store');
  return res.send(bytes);
}