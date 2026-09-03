(function(){
  const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pageEnter=()=>{
    document.documentElement.classList.add('motion-ready');
    if(reduce){document.documentElement.classList.add('motion-reduced');return}
    requestAnimationFrame(()=>document.documentElement.classList.add('page-in'));
  };
  pageEnter();

  // RecoverIT product learning: anonymous visitor/session IDs are random browser-local IDs.
  // No payment secrets or sensitive form values are captured.
  const storageGet=(store,key)=>{try{return store.getItem(key)}catch(_){return null}};
  const storageSet=(store,key,value)=>{try{store.setItem(key,value);return true}catch(_){return false}};
  const makeId=()=>{try{return crypto.randomUUID()}catch(_){return 'v_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,14)}};

  let visitorId=storageGet(localStorage,'recoverit_visitor_id');
  if(!visitorId){visitorId=makeId();storageSet(localStorage,'recoverit_visitor_id',visitorId)}
  let sessionId=storageGet(sessionStorage,'recoverit_session_id');
  if(!sessionId){sessionId=makeId();storageSet(sessionStorage,'recoverit_session_id',sessionId)}

  const params=new URLSearchParams(location.search);
  const campaignKeys=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  const campaign={};
  campaignKeys.forEach(k=>{
    const incoming=params.get(k);
    const saved=storageGet(localStorage,'recoverit_'+k);
    const value=(incoming||saved||'').trim().slice(0,160);
    if(value){campaign[k]=value;if(incoming)storageSet(localStorage,'recoverit_'+k,value)}
  });

  const activeCaseId=params.get('case_id')||params.get('id')||null;
  const signal=(event_name,metadata={},case_id=activeCaseId)=>{
    try{
      const body={
        event_name,metadata,case_id,path:location.pathname,
        visitor_id:visitorId,session_id:sessionId,
        referrer:document.referrer||null,
        ...campaign
      };
      fetch('/api/product/signals',{
        method:'POST',credentials:'include',headers:{'content-type':'application/json'},
        keepalive:true,body:JSON.stringify(body)
      }).catch(()=>{});
    }catch(_){}
  };

  signal('page_view',{referrer_path:(()=>{try{return document.referrer?new URL(document.referrer).pathname:null}catch(_){return null}})()});
  if(activeCaseId) signal('case_open',{case_id:activeCaseId},activeCaseId);

  // Case creation is tracked only after the app confirms the case exists.
  // Preserve the lightweight analytics API installed by analytics.js so pages
  // can safely call RecoverITAnalytics.event(...) after motion.js loads.
  const existingAnalytics=window.RecoverITAnalytics||{};
  window.RecoverITAnalytics={...existingAnalytics,signal,event:existingAnalytics.event||signal,visitorId,sessionId};
  window.addEventListener('recoverit:case-created',e=>{
    const id=e.detail?.case_id||e.detail?.id||null;
    signal('case_created',{source:'client_confirmation'},id);
  });
  window.addEventListener('recoverit:signup-complete',()=>signal('signup_complete',{source:'account'}));

  document.addEventListener('click',e=>{
    const el=e.target.closest('a,button');if(!el)return;
    const label=(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,100);
    if(!label)return;
    const href=el.getAttribute('href')||el.id||null;
    signal('case_action',{label,target:href});
  },{passive:true});

  const decorate=()=>{
    const selectors='.card,.stat,.story-card,.journey-item,.ledger,.case-row,.recovery-map,.invest-visual,.next-card,.loginbox,.card2,.orb,.panel,.success,.test-banner,.modalbox,.case-visual,.case-proof-card';
    document.querySelectorAll(selectors).forEach((el,i)=>{
      if(!el.classList.contains('reveal')){
        el.classList.add('reveal');el.classList.add('motion-auto');
        if(i%4===1)el.classList.add('delay1');
        if(i%4===2)el.classList.add('delay2');
        if(i%4===3)el.classList.add('delay3');
      }
    });
  };
  decorate();

  const reveal=()=>{
    const els=[...document.querySelectorAll('.reveal')];
    if(!els.length)return;
    if(reduce||!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in'));return}
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{
      if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}
    }),{threshold:.08,rootMargin:'0px 0px -8% 0px'});
    els.filter(e=>!e.classList.contains('in')).forEach(e=>io.observe(e));
  };
  reveal();

  const parallax=[...document.querySelectorAll('[data-parallax]')];
  if(parallax.length&&!reduce){let ticking=false;const run=()=>{const y=scrollY;parallax.forEach(el=>{const r=el.getBoundingClientRect();const speed=Number(el.dataset.parallax||.05);const offset=(r.top+r.height/2-innerHeight/2)*speed;el.style.transform='translate3d(0,'+(-offset)+'px,0) scale(1.04)'});ticking=false};addEventListener('scroll',()=>{if(!ticking){requestAnimationFrame(run);ticking=true}},{passive:true});run()}

  if(!reduce){
    const onMove=e=>document.documentElement.style.setProperty('--mx',(e.clientX/innerWidth*100).toFixed(2)+'%');
    addEventListener('pointermove',onMove,{passive:true});
    document.addEventListener('click',e=>{
      const a=e.target.closest('a[href]');
      if(!a||a.target==='_blank'||a.origin!==location.origin||a.getAttribute('href').startsWith('#'))return;
      const href=a.getAttribute('href');
      if(href.startsWith('javascript:')||href.includes('download'))return;
      document.documentElement.classList.add('page-out');
    });
  }

  const mo=new MutationObserver(()=>{decorate();reveal()});
  mo.observe(document.body,{childList:true,subtree:true});
})();