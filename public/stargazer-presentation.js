const STARGAZER_ICONS=Object.freeze({
  star:'<path d="M35 120 80 40 145 85 200 35M80 40 115 185 200 150 145 85"/><g fill="white"><circle cx="35" cy="120" r="5"/><circle cx="80" cy="40" r="7"/><circle cx="145" cy="85" r="5"/><circle cx="200" cy="35" r="6"/><circle cx="115" cy="185" r="5"/><circle cx="200" cy="150" r="6"/></g>',
  planet:'<defs><linearGradient id="productionPlanet"><stop stop-color="white"/><stop offset=".5" stop-color="#b6beca"/><stop offset=".51" stop-color="#303844"/><stop offset="1" stop-color="#090f18"/></linearGradient></defs><circle cx="120" cy="120" r="63" fill="url(#productionPlanet)"/><ellipse cx="120" cy="120" rx="107" ry="28" transform="rotate(-28 120 120)" stroke-width="5"/>',
  galaxy:'<path d="M120 120C35 5-20 165 120 185S230 70 120 120M120 120C235 35 75-20 55 120S170 230 120 120" stroke-width="5"/><circle cx="120" cy="120" r="14" fill="white"/><circle cx="45" cy="55" r="4" fill="white"/><circle cx="200" cy="175" r="3" fill="white"/>',
  blackhole:'<circle cx="120" cy="120" r="48" fill="#03050a" stroke-width="3"/><ellipse cx="120" cy="120" rx="105" ry="24" transform="rotate(-20 120 120)" stroke-width="8"/><path d="M52 150C-20 30 205-5 175 120M188 90C260 210 35 245 65 120" stroke-width="3"/>',
  boundary:'<circle cx="120" cy="120" r="95" stroke-width="7"/><circle cx="120" cy="120" r="76" opacity=".6"/><circle cx="120" cy="120" r="55" opacity=".3"/>'
});
async function playStargazerPresentation(step,context) {
  return withSkillPresentationStage(step,context,async s=>{
    const {el,animate,wait,signal}=s,type=step.outcome.type;
    const reveal=el('div','skill-reveal');reveal.textContent=step.outcome.label;
    if(step.actionId==='sg_observe') {
      const reticle=el('div','skill-reticle','<svg viewBox="0 0 310 310"><path d="M10 60V10H60M250 10H300V60M300 250V300H250M60 300H10V250" fill="none" stroke="currentColor" stroke-width="2"/></svg>');
      const star=el('div','skill-white-star','<svg viewBox="0 0 100 100"><path d="M50 0 59 41 100 50 59 59 50 100 41 59 0 50 41 41Z" fill="white"/></svg>');
      const icon=el('div','skill-celestial','<svg viewBox="0 0 240 240" fill="none" stroke="white" stroke-width="2">'+STARGAZER_ICONS[type]+'</svg>');
      animate(reticle,[{opacity:0,transform:'scale(1.2)'},{opacity:1,transform:'scale(1)'}],400);
      animate(star,[{opacity:0,transform:'scale(.1)'},{opacity:1,transform:'scale(1)',offset:.6},{opacity:0,transform:'scale(1.4)'}],800);
      await wait(800);if(signal?.aborted)return;
      if(type==='boundary')reticle.style.visibility='hidden';
      animate(icon,[{opacity:0,transform:'scale(.75)'},{opacity:1,transform:'scale(1)'}],380);
      if(type==='galaxy'||type==='blackhole')animate(icon,[{transform:'rotate(0)'},{transform:'rotate(40deg)'}],1700);
      if(type==='boundary')animate(icon,[{opacity:0,transform:'scale(.6)'},{opacity:1,transform:'scale(1.15)'},{opacity:1,transform:'scale(1)'}],700);
      context.audioScope.play('magic_impact',{noHold:true});animate(reveal,[{opacity:0},{opacity:1}],180);await wait(600);
    } else {
      const rings=Array.from({length:3},(_,i)=>{
        const orbit=el('div','skill-orbit','<svg viewBox="0 0 300 300"><ellipse cx="150" cy="150" rx="140" ry="'+(50+i*22)+'" transform="rotate('+(i*60)+' 150 150)" fill="none" stroke="currentColor" opacity=".45"/><path d="M150 0v12M150 288v12M0 150h12M288 150h12" stroke="currentColor" opacity=".25"/><path class="skill-orbit-trail" fill="none" stroke="currentColor" stroke-width="2" opacity=".8"/></svg>');
        const star=el('i','skill-orbit-star',null,orbit);
        return {orbit,star,trail:orbit.querySelector('.skill-orbit-trail'),direction:i%2?-1:1,tilt:i*Math.PI/3,ry:50+i*22};
      });
      const point=(r,angle)=>{const a=angle*Math.PI/180,x=Math.cos(a)*140,y=Math.sin(a)*r.ry;return {x:x*Math.cos(r.tilt)-y*Math.sin(r.tilt),y:x*Math.sin(r.tilt)+y*Math.cos(r.tilt)};};
      const cache=(phase)=>Array.from({length:121},(_,j)=>rings.map((r,i)=>{
        const p=j/120,end=r.direction*(190+i*60);let angle=phase?end:end*p;
        if(phase&&['accelerate','reset'].includes(type))angle=end-(type==='reset'?360:180)*p;
        if(phase&&type==='overload')angle=end+r.direction*(p<.4?-60*p/.4:-60+(p-.4)/.6*650);
        const pt=point(r,angle),points=Array.from({length:17},(_,k)=>{const q=point(r,angle-r.direction*(16-k)*3);return (k?'L':'M')+(150+q.x).toFixed(1)+' '+(150+q.y).toFixed(1);});
        return {transform:`translate(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px)`,path:points.join(' ')};
      }));
      const first=cache(false),second=cache(true),draw=frames=>p=>{
        const frame=frames[Math.min(120,Math.floor(p*120))];
        for(let i=0;i<3;i++){rings[i].star.style.transform=frame[i].transform;rings[i].trail.setAttribute('d',frame[i].path);}
      };
      const shocks=[el('div','skill-shock'),el('div','skill-shock')];
      await presentationFrame(signal);await presentationFrame(signal);
      await s.tick(900,draw(first));if(signal?.aborted)return;
      if(type==='accelerate'||type==='reset') {
        shocks.slice(0,type==='reset'?2:1).forEach((wave,i)=>animate(wave,[{opacity:.65,transform:'scale(.7)'},{opacity:0,transform:'scale(2.1)'}],700,{delay:i*140/(context.speed||1)}));
        await s.tick(700,draw(second));
      } else if(type==='overload') {
        rings.forEach(({orbit})=>{orbit.style.color='#e7586b';animate(orbit,[{transform:'scale(1)'},{transform:'scale(.78)',offset:.35},{transform:'scale(.8) translateX(4px)',offset:.5},{transform:'scale(1)'}],900);});
        await s.tick(900,draw(second));
      } else {
        rings.forEach(({orbit,star,trail},i)=>{trail.style.opacity='0';animate(star,[{opacity:1,transform:star.style.transform},{opacity:0,transform:star.style.transform+' translateY(200px) scale(.02)'}],500+i*110,{easing:'ease-in'});animate(orbit,[{opacity:1},{opacity:0}],850);});
      }
      animate(reveal,[{opacity:0},{opacity:1}],200);await wait(900);
    }
    context.onTiming?.('outcome_reveal',{step});await s.resolveResults();await wait(300);
  });
}
