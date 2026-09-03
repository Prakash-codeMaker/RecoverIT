(function(){
  const DB='recoverit_drafts_v2', STORE='case_files', KEY='current';
  function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('draft storage unavailable'))})}
  async function saveFiles(){
    const db=await openDb();
    await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),s=tx.objectStore(STORE);s.put((window.__recoveritDraftFiles||[]),'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('could not save evidence'))});
    db.close();
  }
  async function loadFiles(){
    const db=await openDb();
    const records=await new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get('current');r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});
    db.close(); return records;
  }
  async function clearFiles(){try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete('current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(_){}
    try{localStorage.removeItem('recoverit_case_draft')}catch(_){}
  }
  function renderProofs(){
    const el=document.getElementById('proofList'); if(!el)return;
    el.innerHTML=(window.__recoveritDraftFiles||[]).map((f,i)=>'<div class="proof"><span>'+String(f.name).replace(/[&<>"']/g,'')+'</span><span class="muted">'+Math.round(Number(f.size||0)/1024)+' KB</span></div>').join('');
  }
  window.RecoverITDraft={saveFiles,loadFiles,clearFiles};
  document.addEventListener('DOMContentLoaded',async()=>{
    const button=document.getElementById('create');
    if(button){
      button.addEventListener('click',async function(e){
        try{
          const session=await window.hatchable.auth.getSession();
          if(session&&session.user)return;
          e.preventDefault();e.stopImmediatePropagation();
          button.disabled=true;button.textContent='Saving your case draft…';
          window.__recoveritDraftFiles=[];
          for(const f of (typeof files!=='undefined'?files:[])){
            if(f.size>10*1024*1024)throw new Error(f.name+' is larger than 10 MB.');
            window.__recoveritDraftFiles.push({name:f.name,type:f.type,size:f.size,lastModified:f.lastModified,blob:f});
          }
          await saveFiles();
          localStorage.setItem('recoverit_case_draft',JSON.stringify({description:typeof desc!=='undefined'?desc:'',createdAt:Date.now(),hasFiles:true}));
          location.href='/login?next='+encodeURIComponent('/report.html?resume=1');
        }catch(err){button.disabled=false;button.textContent='Save case & continue →';if(typeof showProofMessage==='function')showProofMessage('We could not save your draft',err.message||'Please try again.','Try again','error')}
      },true);
    }
    if(new URLSearchParams(location.search).get('resume')!=='1')return;
    try{
      const records=await loadFiles();
      window.__recoveritDraftFiles=records.map(r=>new File([r.blob],r.name,{type:r.type||'application/octet-stream',lastModified:r.lastModified||Date.now()}));
      if(window.__recoveritDraftFiles.length){
        if(typeof files!=='undefined')files=window.__recoveritDraftFiles.slice();
        const d=document.getElementById('desc'); if(d&&typeof desc!=='undefined'){d.value=desc;d.dispatchEvent(new Event('input',{bubbles:true}))}
        renderProofs();
        if(typeof show==='function')show('s2');
        const message=document.getElementById('proofMessage');
        if(message){message.className='proof-message review show';message.hidden=false;message.innerHTML='<strong>Your draft is restored.</strong><span>Your story and '+window.__recoveritDraftFiles.length+' evidence document'+(window.__recoveritDraftFiles.length===1?'':'s')+' are ready. You do not need to upload them again.</span>'}
      }
    }catch(_){}
  });
})();