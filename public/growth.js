(function(){
  const key='recoverit_growth_session';
  let s=localStorage.getItem(key); if(!s)s=Math.random().toString(36).slice(2)+Date.now().toString(36),localStorage.setItem(key,s);
  const visitor=localStorage.getItem('recoverit_visitor')||(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2));
  localStorage.setItem('recoverit_visitor',visitor);
  const q=new URLSearchParams(location.search);
  const base={visitor_id:visitor,session_id:s,path:location.pathname,referrer:document.referrer||null,utm_source:q.get('utm_source'),utm_medium:q.get('utm_medium'),utm_campaign:q.get('utm_campaign'),utm_content:q.get('utm_content'),utm_term:q.get('utm_term')};
  const send=(event,metadata)=>{try{navigator.sendBeacon('/api/product/signals',new Blob([JSON.stringify({...base,event_name:event,metadata:metadata||{}})],{type:'application/json'}))}catch(e){fetch('/api/product/signals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...base,event_name:event,metadata:metadata||{}}),keepalive:true}).catch(()=>{})}};
  send('page_view');
  window.RecoverITGrowth={track:send,visitor,session:s};
  document.addEventListener('click',e=>{const a=e.target.closest('a,button');if(!a)return;const text=(a.textContent||'').trim().slice(0,100);if(/start|check|case|get started|dashboard/i.test(text))send('next_step_click',{label:text})});
})();