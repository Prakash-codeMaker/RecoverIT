(function(){
  const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pageEnter=()=>{
    document.documentElement.classList.add('motion-ready');
    if(reduce){document.documentElement.classList.add('motion-reduced');return}
    requestAnimationFrame(()=>document.documentElement.classList.add('page-in'));
  };
  pageEnter();

  // Lightweight product learning: capture navigation and meaningful interaction signals, never payment secrets.
  const activeCaseId=new URLSearchParams(location.search).get('case_id')||new URLSearchParams(location.search).get('id')||null;
  const signal=(event_name,metadata={},case_id=activeCaseId)=>{try{fetch('/api/product/signals',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},keepalive:true,body:JSON.stringify({event_name,metadata,case_id,path:location.pathname})}).catch(()=>{})}catch(_){}};
  signal('page_view',{referrer:document.referrer?new URL(document.referrer).pathname:null});
  document.addEventListener('click',e=>{const el=e.target.closest('a,button');if(!el)return;const label=(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,100);if(!label)return;signal('case_action',{label,target:el.getAttribute('href')||el.id||null})},{passive:true});

  const decorate=()=>{
    const selectors='.card,.stat,.story-card,.journey-item,.ledger,.case-row,.recovery-map,.invest-visual,.next-card,.loginbox,.card2,.orb,.panel,.success,.test-banner,.modalbox,.case-visual,.case-proof-card';
    document.querySelectorAll(selectors).forEach((el,i)=>{
      if(!el.classList.contains('reveal')){
        el.classList.add('reveal');
        el.classList.add('motion-auto');
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