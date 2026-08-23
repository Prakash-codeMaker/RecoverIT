(function(){
  const els=[...document.querySelectorAll('.reveal')];
  if(!els.length)return;
  if(!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in'));return}
  const io=new IntersectionObserver((entries)=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -7% 0px'});
  els.forEach(e=>io.observe(e));
  const parallax=[...document.querySelectorAll('[data-parallax]')];
  if(parallax.length&&!matchMedia('(prefers-reduced-motion: reduce)').matches){let ticking=false;const run=()=>{const y=scrollY;parallax.forEach(el=>{const r=el.getBoundingClientRect();const speed=Number(el.dataset.parallax||.08);const offset=(r.top+r.height/2-innerHeight/2)*speed;el.style.transform='translate3d(0,'+(-offset)+'px,0)'});ticking=false};addEventListener('scroll',()=>{if(!ticking){requestAnimationFrame(run);ticking=true}},{passive:true});run()}
})();