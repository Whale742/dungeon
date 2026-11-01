// Canvas choreography extracted from temp/sage_skill_prototype/app.js (latest quantum/orbit revision).
// Visuals only: no damage arithmetic, text, DOM UI, timers or battle authority.
// Authored geometry stays in its original coordinates; the host supplies anchors.
function createSageSkillRenderer(canvas) {
  const ctx=canvas.getContext('2d',{alpha:true});
  const TWO_PI=Math.PI*2;
  const TARGET={x:1171,y:384};
  // Latest prototype defaults: immediate acceleration, doubling every 500ms.
  const quantumOrbit=Object.freeze({delayMs:0,intervalMs:500,base:2});
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
  const out3=t=>1-(1-clamp(t))**3;
  const out5=t=>1-(1-clamp(t))**5;
  const between=(t,a,b)=>clamp((t-a)/(b-a));
  const ease=(t,a,b)=>smooth(between(t,a,b));
  const color=(rgb,a=1)=>`rgba(${rgb},${clamp(a)})`;
  const C = {gold:'229,186,98',white:'255,245,221',bright:'255,229,161',bronze:'180,130,54',purple:'124,98,118',pale:'242,208,151'};
  const rand=n=>{const v=Math.sin(n*127.1+78.233)*43758.5453;return v-Math.floor(v)};
  function line(ax,ay,bx,by,rgba,width=1,alpha=1){
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=rgba;ctx.lineWidth=width;
    ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.restore();
  }
  function strokePoints(points,rgba,width=1,alpha=1,glow=0){
    if(!points.length)return;
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=rgba;ctx.lineWidth=width;
    if(glow){ctx.shadowBlur=glow;ctx.shadowColor=rgba;}
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
    if(width<=2 && glow){ctx.save();ctx.shadowBlur=0;ctx.lineWidth=width+3;ctx.globalAlpha=alpha*.12;ctx.strokeStyle=color(C.gold,.55);ctx.stroke();ctx.restore();}
    ctx.stroke();ctx.restore();
  }
  function dot(x,y,r,rgba,alpha=1,glow=0){
    ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=rgba;if(glow){ctx.shadowBlur=glow;ctx.shadowColor=rgba;}
    ctx.beginPath();ctx.arc(x,y,Math.max(.1,r),0,TWO_PI);ctx.fill();ctx.restore();
  }
  function ring(x,y,r,rgba,width=1,alpha=1,ellipse=1,angle=0){
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=rgba;ctx.lineWidth=width;
    ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.ellipse(0,0,Math.max(.1,r),Math.max(.1,r*ellipse),0,0,TWO_PI);ctx.stroke();ctx.restore();
  }
  function glow(x,y,r,alpha=1,tint='255,220,147'){
    if(alpha<=0)return;
    const grad=ctx.createRadialGradient(x,y,.2,x,y,r);grad.addColorStop(0,color(tint,.36*alpha));grad.addColorStop(.25,color(tint,.11*alpha));grad.addColorStop(1,color(tint,0));
    ctx.save();ctx.fillStyle=grad;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
  }
  function arrow(x1,y1,x2,y2,alpha=1,w=1.1){
    const a=Math.atan2(y2-y1,x2-x1);
    line(x1,y1,x2,y2,color(C.gold,.65),w,alpha);
    line(x2,y2,x2-11*Math.cos(a-.48),y2-11*Math.sin(a-.48),color(C.bright,.85),w,alpha);
    line(x2,y2,x2-11*Math.cos(a+.48),y2-11*Math.sin(a+.48),color(C.bright,.85),w,alpha);
  }
  function drawImpact(t,hitAt,x=TARGET.x,y=TARGET.y,kind='normal'){
    const age=t-hitAt;
    if(age<0||age>.42)return;
    const opacity=1-ease(age,.06,.42);
    ctx.save();ctx.globalCompositeOperation='lighter';
    glow(x,y,kind==='geometry'?130:105,.95*opacity);
    for(let k=0;k<3;k++){
      const q=age-k*.045;if(q<0)continue;
      const p=between(q,0,.29);
      ring(x,y,16+125*out3(p),color(C.bright,1),2.6-k*.55,.53*(1-p)*opacity,.65,.28+k*.15);
    }
    line(x-45*opacity,y,x+48*opacity,y,color(C.white,1),2.4,opacity);
    line(x,y-33*opacity,x,y+33*opacity,color(C.white,1),1.5,opacity);
    for(let i=0;i<15;i++){
      const a=TWO_PI*rand(i+9),v=75+115*rand(i+50),p=age/.42;
      const x1=x+Math.cos(a)*v*out3(p),y1=y+Math.sin(a)*v*out3(p);
      line(x1,y1,x1-Math.cos(a)*10*(1-p),y1-Math.sin(a)*10*(1-p),color(C.bright,.55),.85,opacity*(1-p));
    }
    ctx.restore();
  }
  function drawSageSnapCue(t,at,x,y){
    const age=t-at;
    if(age<0||age>.21)return;
    const o=1-ease(age,.02,.2);
    ring(x,y,9+45*ease(age,0,.18),color(C.white,.70),1.2,o,.88);
    dot(x,y,2.6,color(C.white,1),o,13);
  }

  function drawBasic(t,solve){
    const birth=ease(t,.0,.12),interference=ease(t,.12,.34),converge=ease(t,.35,.53);
    const fade=1-ease(t,.43,.59),waveAlpha=birth*fade;
    if(waveAlpha>.004){
      const left=404,right=878,y=402,span=right-left;
      const a=65*(1-converge*.95),f=1.4+interference*3.9;
      // Actual per-frame sin / cos evaluation with dynamic phase, frequency, envelope.
      const counts=Math.floor(212*birth);
      line(left-30,y,right+24,y,color(C.gold,.24*waveAlpha),1.0);
      for(let mark=0;mark<9;mark++){
        let px=left+span*mark/8;line(px,y-6,px,y+6,color(C.gold,.16*waveAlpha),1);
      }
      for(let which=0;which<2;which++){
        const points=[];
        for(let i=0;i<=counts;i++){
          const u=i/212,env=.45+.55*Math.sin(u*Math.PI),osc=TWO_PI*(f*u-2.7*t)+which*Math.PI/2;
          const yy=(which===0?Math.sin(osc):Math.cos(osc))*a*env;
          const cross=14*Math.sin(TWO_PI*(u*5+t*4))*(which===0?-1:1)*interference*(1-converge);
          points.push({x:left+u*span,y:y+yy+cross});
        }
        if(points.length>1){
          strokePoints(points,color(C.gold,.23),7,waveAlpha,6);
          strokePoints(points,color(which===0?C.gold:C.bright,.93),which===0?1.75:1.15,waveAlpha,2);
          const p=points[Math.floor(points.length*.95)];dot(p.x,p.y,2.4,color(C.white,1),waveAlpha,6);
        }
      }
      glow(415,402,44,waveAlpha*.5);
    }
    const shot=ease(t,.39,.55),shaftFade=(1-ease(t,.56,.72));
    if(shot>0&&shaftFade>.001){
      const from=464,to=TARGET.x-7,lead=lerp(from,to,shot),beamAlpha=shaftFade;
      // The projectile is a moving energy line, not a scaled sprite.
      for(let trail=0;trail<4;trail++){
        const y=402+(trail-1.5)*2.8;
        line(Math.max(from,lead-270+trail*12),y,lead,y+(TARGET.y-402)*shot,color(trail===0?C.white:C.gold,.18+(.6-trail*.08)),trail===0?3.1:1.4,beamAlpha);
      }
      arrow(lead-37,402+(TARGET.y-402)*shot,lead,402+(TARGET.y-402)*shot,beamAlpha,1.3);
      dot(lead,402+(TARGET.y-402)*shot,4.5,color(C.white,.9),beamAlpha,12);
      glow(lead,402+(TARGET.y-402)*shot,62,beamAlpha*.75);
    }
    drawSageSnapCue(t,.355,395,403);
    drawImpact(t,.55);
    if(solve){
      const on=ease(t,.59,.66)*(1-ease(t,.73,.83));
      for(let k=0;k<2;k++){
        const p=ease(t,.64,.76);
        const x=lerp(TARGET.x+(k===0?-65:65),948,p),y=lerp(TARGET.y+(k===0?-48:48),392,p);
        glow(x,y,35,on*.45);ring(x,y,11,color(C.gold,.9),1.4,on);dot(x,y,2.4,color(C.white,1),on,8);
      }
      drawTransitionCore(t,.68,.81,948,392);
    }
  }

  // Rotation and perspective primitives are shared by orbit and lattice FX.
  function rotate3({x,y,z},rx,ry,rz){
    let cy=Math.cos(rx),sy=Math.sin(rx);let Y=y*cy-z*sy,Z=y*sy+z*cy,X=x;
    cy=Math.cos(ry);sy=Math.sin(ry);const nX=X*cy+Z*sy,nY=Y,nZ=-X*sy+Z*cy;
    cy=Math.cos(rz);sy=Math.sin(rz);return {x:nX*cy-nY*sy,y:nX*sy+nY*cy,z:nZ};
  }
  function project3(p,cx,cy,radius=120){const pers=4.8/(4.8-p.z);return {x:cx+p.x*radius*pers,y:cy+p.y*radius*pers,z:p.z,pers};}
  const ORBIT_PLANES=[
    {rx:.78,ry:.20,rz:.18,phase:.34,velocity:1.00},
    {rx:1.55,ry:1.12,rz:-.35,phase:1.70,velocity:1.22},
    {rx:.22,ry:-.94,rz:.47,phase:3.05,velocity:1.40}
  ];

  // All Sage skill-one geometry is centered ON the observed enemy. The rings
  // are actual 3D ellipses that rotate and project every frame, not images or
  // DOM transforms. Absolute time makes pause / scrubbing / restart repeatable.
  function atomPoint(theta,k,t,radius,instability=0){
    const orbit=ORBIT_PLANES[k];
    const wobble=instability*(.065*Math.sin(theta*3+t*38+k*2.3)+.035*Math.cos(theta*5-t*31+k));
    const radial=1+wobble;
    const p=rotate3({x:Math.cos(theta)*radial,y:Math.sin(theta)*.78*(1-wobble*.4),z:0},
      orbit.rx+t*(.18+.04*k)+instability*.22*Math.sin(22*t+k),
      orbit.ry+t*(.48+.15*k)+instability*.14*Math.cos(29*t+k*1.2),
      orbit.rz+t*(.24+.13*k)+instability*.17*Math.sin(27*t-k));
    return project3(p,TARGET.x,TARGET.y,radius);
  }
  function atomRadius(t){
    const formed=ease(t,0,.18),collapse=ease(t,.78,.98);
    return (8+111*out3(formed))*(1-.973*collapse);
  }

  function drawAtomOrbit(k,t,radius,alpha,{instability=0,tear=0,burst=false}={}){
    if(alpha<.003||radius<.1)return;
    const N=160,pts=[];
    for(let i=0;i<=N;i++)pts.push(atomPoint(TWO_PI*i/N,k,t,radius,instability));
    ctx.save();ctx.globalCompositeOperation='screen';
    // The low energy whole ring remains detectable behind the crisp, depth
    // sorted arcs, until blast tension begins tearing it into discrete pieces.
    if(tear<.30){
      strokePoints(pts,color(C.gold,.19),burst?8.5:6.5,alpha*(1-tear/.38),10);
      strokePoints(pts,color(C.bronze,.36),1,alpha*(1-tear),0);
    }
    for(let i=0;i<N;i++){
      const a=pts[i],b=pts[i+1],depth=(a.z+b.z)*.5;
      const section=(i/N*TWO_PI)+(k*1.35)+t*2.8;
      const crack=.56*Math.sin(section*4.0)+.44*Math.sin(section*8.0+k);
      if(tear>.03&&crack<tear*.72-.12)continue;
      const near=clamp(.56+.44*depth,-.04,1);
      const bright=.34+.66*near;
      ctx.strokeStyle=color(burst?C.bright:C.gold,(burst?.93:.82)*alpha*bright);
      ctx.lineWidth=(burst?1.75:1.35)*(.68+.38*near);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    ctx.restore();
  }
  function drawAtomElectrons(k,t,radius,alpha,accel,unstable,blast=0){
    if(alpha<.002)return;
    const orbit=ORBIT_PLANES[k];
    const clock=t*(3.8+accel*7.8+unstable*5.8)*orbit.velocity+orbit.phase;
    ctx.save();ctx.globalCompositeOperation='lighter';
    for(let m=0;m<2;m++){
      const head=clock+m*Math.PI;
      const tailCount=blast?10:16,dt=(blast?.055:.030)*(1+accel*.5+unstable*.6);
      let trail=[];
      for(let j=tailCount;j>=0;j--)trail.push(atomPoint(head-dt*j,k,t,radius,unstable));
      strokePoints(trail,color(C.gold,.25),5.5,alpha*.72,8);
      strokePoints(trail,color(C.bright,.88),1.55,alpha*.92,2);
      const at=trail.at(-1),front=clamp(.67+at.z*.35,.24,1);
      glow(at.x,at.y,blast?17:12,alpha*front*.51);
      dot(at.x,at.y,blast?4.1:3.1,color(C.white,1),alpha*front,10);
      dot(at.x,at.y,blast?8:6.5,color(C.gold,.43),alpha*front,12);
    }
    ctx.restore();
  }
  function drawAtomConvergence(t,compression){
    if(compression<=.002)return;
    const strength=Math.sin(Math.PI*compression)*.78+.18*compression;
    const outer=182-169*out5(compression);
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let i=0;i<20;i++){
      const angle=TWO_PI*i/20+.16+Math.sin(i*2.1)*.035;
      const cs=Math.cos(angle),sn=Math.sin(angle);
      const leading=outer*(.6+.4*rand(i*31+8));
      const back=leading+46*(1-compression)+12;
      line(TARGET.x+cs*back,TARGET.y+sn*back*.83,
        TARGET.x+cs*leading,TARGET.y+sn*leading*.83,
        color(C.gold,.75),i%4===0?1.6:1.05,strength*(.47+.5*rand(i+31)));
      if(i%3===0){
        const x=TARGET.x+cs*leading,y=TARGET.y+sn*leading*.83;
        dot(x,y,2.3,color(C.white,.86),strength,6);
      }
    }
    // Spiral photon streams close inward independently from ring shrinkage.
    for(let j=0;j<9;j++){
      const seed=TWO_PI*j/9,travel=out5(compression),theta=seed+t*6+travel*1.3;
      const radius=lerp(155,7,travel);
      const x=TARGET.x+Math.cos(theta)*radius,y=TARGET.y+Math.sin(theta)*radius*.83;
      const pastR=radius+Math.max(7,30*(1-travel)),pastA=theta-.16;
      line(TARGET.x+Math.cos(pastA)*pastR,TARGET.y+Math.sin(pastA)*pastR*.83,x,y,color(C.bright,.79),1.3,strength*.85);
      dot(x,y,1.9,color(C.white,.9),strength,7);
    }
    ctx.restore();
  }
  function drawAtomicBurst(t){
    const age=t-1.05;
    if(age<0||age>.43)return;
    const expansion=between(age,0,.21),fade=1-ease(age,.17,.43);
    ctx.save();ctx.globalCompositeOperation='lighter';
    if(age<.14){
      const p=between(age,0,.14);
      glow(TARGET.x,TARGET.y,57+92*p,(1-p)*1.15);
      dot(TARGET.x,TARGET.y,5+15*(1-p)**2,color(C.white,1),1-p,23);
    }
    // 3 expanding shock fronts are aligned to the explosion, not a fireball.
    for(let j=0;j<3;j++){
      const v=between(age-j*.015,0,.24);
      if(age<j*.015||v>=1)continue;
      const opacity=(1-v)**1.35*(.48-j*.09);
      ring(TARGET.x,TARGET.y,23+211*out5(v),color(j===0?C.white:C.gold,.92),2.8-j*.60,opacity,.73+j*.07,j*.17);
    }
    if(age<.26){
      const p=between(age,0,.26),spread=out5(p);
      for(let i=0;i<24;i++){
        const theta=TWO_PI*i/24+.14,ax=Math.cos(theta),ay=Math.sin(theta);
        const end=17+194*spread*(.88+.20*rand(i*7+9)),len=8+31*(1-spread);
        line(TARGET.x+ax*(end-len),TARGET.y+ay*(end-len)*.85,
          TARGET.x+ax*end,TARGET.y+ay*end*.85,
          color(i%5===0?C.white:C.gold,.8),i%5===0?1.85:1.1,(1-p)**1.12*.68);
      }
    }
    ctx.restore();
    // Linear fragments behave like snapped orbital wire, never smoke/fire.
    for(let i=0;i<29;i++){
      const delay=.055+rand(i+14)*.065,life=.23+rand(i+80)*.1;
      const f=between(age-delay,0,life);
      if(age<delay||f>=1)continue;
      const angle=TWO_PI*rand(i*13+5),travel=48+214*out3(f)*( .62+.38*rand(i+31));
      const x=TARGET.x+Math.cos(angle)*travel,y=TARGET.y+Math.sin(angle)*travel*.78;
      const alpha=(1-f)**1.6*.77;
      const vx=Math.cos(angle+(.3+.25*rand(i+54))),vy=Math.sin(angle+(.3+.25*rand(i+54)));
      line(x-vx*(8+5*f),y-vy*(8+5*f),x+vx*(11-6*f),y+vy*(11-6*f),color(C.bright,.95),i%4===0?1.6:.88,alpha);
      if(i%7===0)dot(x,y,1.35,color(C.white,.87),alpha,4);
    }
  }
  function drawAtomicSolveVectors(t){
    if(t<1.24||t>1.50)return;
    const fadeIn=ease(t,1.24,1.30),converge=ease(t,1.395,1.49);
    const cx=TARGET.x,cy=TARGET.y;
    ctx.save();ctx.globalCompositeOperation='screen';
    ring(cx,cy,60*(1-converge)+16,color(C.gold,.32),1.15,fadeIn*(1-converge*.9),.76,t*2.4);
    for(let i=0;i<5;i++){
      const appear=ease(t,1.25+i*.028,1.285+i*.028);
      if(appear<.004)continue;
      const a=-Math.PI*.95+i*TWO_PI/5+t*.025;
      const ux=Math.cos(a),uy=Math.sin(a),back=18*(1-converge)+5;
      const front=(26+88*out3(appear))*(1-converge)+7*converge;
      const from={x:cx+ux*back,y:cy+uy*back*.80};
      const to={x:cx+ux*front,y:cy+uy*front*.80};
      line(from.x,from.y,to.x,to.y,color(C.gold,.33),4.7,appear*(1-.64*converge));
      arrow(from.x,from.y,to.x,to.y,appear*(1-.46*converge),i===2?2.3:1.55);
      dot(to.x,to.y,2.8,color(C.white,1),appear*(1-.55*converge),9);
      if(i===4||i===1)glow(to.x,to.y,18,appear*(1-converge)*.48);
    }
    ctx.restore();
  }
  function drawAtomicResidualCore(t){
    const start=1.26,finish=1.5;
    if(t<start)return;
    const build=ease(t,start,1.41),alpha=.92*build;
    const compression=ease(t,1.38,finish),cx=TARGET.x,cy=TARGET.y;
    if(alpha<.002)return;
    ctx.save();ctx.globalCompositeOperation='lighter';
    const r=46-24*compression;
    for(let k=0;k<3;k++)drawAtomOrbit(k,t,r*(.91+.10*Math.sin(t*9+k)),alpha*(.66+.22*compression));
    glow(cx,cy,65-26*compression,alpha*.43);
    ring(cx,cy,33-12*compression,color(C.gold,.57),1.0,alpha,.85,t*1.6);
    dot(cx,cy,3.8,color(C.white,1),alpha,14);
    ctx.restore();
  }
  // Probability amplitudes wrap around the target in three projected planes.
  function drawQuantumField(t,radius,alpha,instability){
    if(alpha<.003)return;
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let k=0;k<3;k++){
      const points=[];
      for(let i=0;i<=128;i++){
        const theta=TWO_PI*i/128;
        const amplitude=1+.16*Math.sin(theta*5-t*(11+k*2)+k*2)*(.45+instability);
        const p=rotate3({x:Math.cos(theta)*amplitude,y:Math.sin(theta)*amplitude,z:.18*Math.sin(theta*3+t*8+k)},
          .55+k*.82+t*.19,k*.8+t*.36,k*.48-t*.22);
        points.push(project3(p,TARGET.x,TARGET.y,radius));
      }
      strokePoints(points,color(C.gold,.12),4,alpha,0);
      strokePoints(points,color(C.bright,.65),1.1,alpha,0);
      // Broken phase marks suggest superposition rather than orbiting particles.
      for(let j=0;j<8;j++){
        const n=(j*16+k*7+Math.floor(t*22))%128;
        const p=points[n],q=points[(n+3)%128];
        line(p.x,p.y,q.x,q.y,color(C.white,.7),1.5,alpha*(.4+.4*clamp((p.z+1)/2)));
      }
    }
    for(let i=0;i<12;i++){
      const a=i*TWO_PI/12+t*.7, r=radius*(.32+.38*rand(i+20));
      const intensity=(.25+.35*(.5+.5*Math.sin(t*17+i*4)))*alpha;
      dot(TARGET.x+Math.cos(a)*r,TARGET.y+Math.sin(a)*r*.72,1.3,color(C.bright,.8),intensity);
    }
    ctx.restore();
  }
  function drawQuantumGlowBall(x,y,r,alpha){
    if(r<=0||alpha<=0)return;
    ctx.save();ctx.globalCompositeOperation='lighter';
    const halo=ctx.createRadialGradient(x,y,r*.45,x,y,r*3.2);
    halo.addColorStop(0,color('255,248,218',.8*alpha));
    halo.addColorStop(.28,color('255,213,72',.55*alpha));
    halo.addColorStop(.55,color('255,230,161',.20*alpha));
    halo.addColorStop(1,color(C.white,0));
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,y,r*3.2,0,TWO_PI);ctx.fill();
    const body=ctx.createRadialGradient(x-r*.3,y-r*.3,r*.03,x,y,r);
    body.addColorStop(0,color('255,250,210',alpha));
    body.addColorStop(.35,color('255,220,91',alpha));
    body.addColorStop(1,color('200,145,24',alpha));
    ctx.fillStyle=body;ctx.beginPath();ctx.arc(x,y,r,0,TWO_PI);ctx.fill();
    ctx.strokeStyle=color(C.white,.9*alpha);ctx.lineWidth=Math.max(1,r*.08);
    ctx.shadowColor='rgba(255,250,225,.95)';ctx.shadowBlur=r*.65;ctx.stroke();
    ctx.restore();
  }
  function quantumFlicker(t){
    const instability=ease(t,1.30,1.42)*(1-ease(t,3.30,3.40));
    const flickerAge=Math.max(0,t-1.30);
    // Each 100 ms adds 0.2 times the initial frequency.
    const phase=flickerAge+flickerAge*flickerAge;
    const pulse=(1+Math.sin(phase*12))*.5;
    return {instability,pulse,opacity:lerp(1,pulse,instability)};
  }
  function drawVector(t,solve,releaseCue=true,screenAngle=-Math.PI/2){
    const cx=TARGET.x,cy=TARGET.y;
    const collapseFrame=-Math.PI/2-screenAngle;
    ctx.save();ctx.translate(cx,cy);ctx.scale(1.65,1.65);ctx.translate(-cx,-cy);
    ctx.globalCompositeOperation='screen';
    if(t<.30){
      // Two opposed points follow a logarithmic spiral with golden-ratio growth.
      const u=ease(t,.005,.25),birth=ease(t,0,.08);
      const angle=(1-u)*Math.PI*2.4, r=145*(Math.pow(PHI,4*(1-u))-1)/(Math.pow(PHI,4)-1);
      for(let i=0;i<2;i++){
        const a=angle+i*Math.PI,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.78;
        const size=(18-5*u)*birth*(1-ease(t,.25,.30));
        const trail=[];
        for(let j=9;j>=0;j--){
          const past=ease(Math.max(0,t-j*.006),.005,.25);
          const pa=(1-past)*Math.PI*2.4+i*Math.PI;
          const pr=145*(Math.pow(PHI,4*(1-past))-1)/(Math.pow(PHI,4)-1);
          trail.push({x:cx+Math.cos(pa)*pr,y:cy+Math.sin(pa)*pr*.78});
        }
        strokePoints(trail,color(C.gold,.20),5,birth*(1-ease(t,.25,.30)),0);
        strokePoints(trail,color(C.bright,.65),1.4,birth*(1-ease(t,.25,.30)),0);
        drawQuantumGlowBall(x,y,size,birth);
      }

    }else{
      const age=t-.30,appear=out5(between(age,0,.065));
      const collapse=ease(t,3.30,3.40), shrink=ease(t,4.23,4.36);
      const scale=appear*.85*(1+.10*between(age,0,3));
      const {instability,pulse,opacity}=quantumFlicker(t);
      const alpha=(1-shrink)*opacity;
      drawAtomicBurst(t+.75);
      // A brief white flash marks the moment of the blast.
      if(age<.14){
        const flash=1-ease(age,0,.14);
        const flare=ctx.createRadialGradient(cx,cy,0,cx,cy,110);
        flare.addColorStop(0,color('255,255,255',.95*flash));
        flare.addColorStop(.28,color('255,250,233',.72*flash));
        flare.addColorStop(1,color('255,245,220',0));
        ctx.fillStyle=flare;ctx.beginPath();ctx.arc(cx,cy,110,0,TWO_PI);ctx.fill();
      }
      if(scale>.002){
        ctx.save();ctx.translate(cx,cy);
        // Compress in screen space, even when the caster/target axis is oblique.
        // Conjugation keeps the orbit orientation unchanged before collapse.
        ctx.rotate(collapseFrame);ctx.scale(scale*(1-.96*collapse),scale*(1-.9*shrink));ctx.rotate(-collapseFrame);
        ctx.translate(-cx,-cy);
        // The canvas is rotated for the battlefield; these become 0, 60 and 120 degrees on screen.
        for(let k=0;k<3;k++){
          const angle=-Math.PI/2+k*Math.PI/3,points=[];
          const position=theta=>{
            const x=Math.cos(theta)*150,y=Math.sin(theta)*150*.48;
            return {x:cx+x*Math.cos(angle)-y*Math.sin(angle),y:cy+x*Math.sin(angle)+y*Math.cos(angle)};
          };
          const segments=96;
          for(let i=0;i<=segments;i++)points.push(position(TWO_PI*i/96));
          const delay=quantumOrbit.delayMs/1000,interval=quantumOrbit.intervalMs/1000;
          const elapsed=Math.max(0,age-delay),logBase=Math.log(quantumOrbit.base);
          const exponent=Math.min(20,elapsed/interval*logBase);
          const speedMultiplier=Math.exp(exponent);
          const fastTrail=ease(speedMultiplier,4,5);
          strokePoints(points,color(C.gold,.12),5,alpha,0);
          strokePoints(points,color(C.white,.72),1.5,alpha,0);
          const extra=logBase<1e-8?elapsed:Math.expm1(exponent)*interval/logBase;
          const spin=3.1*(Math.min(age,delay)+extra);
          const direction=k===1?-1:1;
          const phase=[Math.PI,0,Math.PI][k]+spin*direction;
          if(fastTrail>0){
            // A continuous taper on the same orbit, not a chain of extra balls.
            const length=Math.min(Math.PI*1.5,3.1*speedMultiplier*.045);
            for(let j=0;j<20;j++){
              const from=j/20,to=(j+1)/20;
              const a=position(phase-direction*length*from),b=position(phase-direction*length*to);
              const strength=alpha*fastTrail*(1-to)**1.5;
              line(a.x,a.y,b.x,b.y,color(C.gold,.28),5,strength);
              line(a.x,a.y,b.x,b.y,color(C.white,.85),2,strength);
            }
          }
          const ball=position(phase);
          drawQuantumGlowBall(ball.x,ball.y,7,alpha);
        }
        drawQuantumGlowBall(cx,cy,32,alpha);
        // White light follows the same pulse as the whole structure.
        const pulseLight=instability*pulse*pulse*alpha;
        if(pulseLight>.001){
          const flash=ctx.createRadialGradient(cx,cy,0,cx,cy,105);
          flash.addColorStop(0,color('255,255,255',.65*pulseLight));
          flash.addColorStop(.3,color('255,250,235',.28*pulseLight));
          flash.addColorStop(1,color(C.white,0));
          ctx.fillStyle=flash;ctx.beginPath();ctx.arc(cx,cy,105,0,TWO_PI);ctx.fill();
        }
        ctx.restore();
      }
      // The final pulse blooms into pure white immediately before collapse.
      const finalWhite=ease(t,3.08,3.29)*(1-ease(t,3.30,3.38));
      if(finalWhite>.001){
        const radius=80+160*finalWhite;
        const flash=ctx.createRadialGradient(cx,cy,0,cx,cy,radius);
        flash.addColorStop(0,color('255,255,255',finalWhite));
        flash.addColorStop(.55,color('255,255,255',finalWhite));
        flash.addColorStop(1,color('255,255,255',0));
        ctx.fillStyle=flash;ctx.beginPath();ctx.arc(cx,cy,radius,0,TWO_PI);ctx.fill();
      }
      // Cancel the live attack-axis angle: local Y must be screen-horizontal.
      const beam=collapse*(1-shrink),width=180*(1-shrink);
      const collapseFlash=ease(t,3.30,3.34)*(1-ease(t,3.34,3.46));
      if(collapseFlash>.001){
        const flash=ctx.createRadialGradient(cx,cy,0,cx,cy,95);
        flash.addColorStop(0,color('255,255,255',.9*collapseFlash));
        flash.addColorStop(.3,color('255,250,230',.55*collapseFlash));
        flash.addColorStop(1,color(C.white,0));
        ctx.fillStyle=flash;ctx.beginPath();ctx.arc(cx,cy,95,0,TWO_PI);ctx.fill();
      }
      if(beam>.001){
        ctx.save();ctx.translate(cx,cy);ctx.rotate(collapseFrame);ctx.translate(-cx,-cy);
        line(cx,cy-width,cx,cy+width,color('255,255,255',.22),9,beam);
        line(cx,cy-width,cx,cy+width,color('255,255,255',1),2,beam);
        const star=20*(1-shrink),inner=star*.17;
        ctx.save();ctx.globalAlpha=beam;ctx.fillStyle='rgb(255,255,255)';
        ctx.shadowColor='white';ctx.shadowBlur=12;
        ctx.beginPath();ctx.moveTo(cx,cy-star);ctx.lineTo(cx+inner,cy-inner);
        ctx.lineTo(cx+star,cy);ctx.lineTo(cx+inner,cy+inner);
        ctx.lineTo(cx,cy+star);ctx.lineTo(cx-inner,cy+inner);
        ctx.lineTo(cx-star,cy);ctx.lineTo(cx-inner,cy-inner);ctx.closePath();ctx.fill();ctx.restore();
        ctx.restore();
      }
    }
    ctx.restore();
    if(solve){drawAtomicSolveVectors(t);drawAtomicResidualCore(t-2.33);}
    if(releaseCue)drawSageSnapCue(t,.28,395,401);
  }

  function drawTransitionCore(t,start,finish,x,y){
    const alpha=ease(t,start,start+.06)*(1-ease(t,finish-.07,finish+.10));
    if(alpha<.002)return;
    const p=between(t,start,finish);
    ctx.save();ctx.globalCompositeOperation='lighter';
    glow(x,y,97,alpha*.45);
    ring(x,y,26+16*out3(p),color(C.gold,.55),1.5,alpha,1,p*2.1);
    ring(x,y,45+9*out3(p),color(C.bright,.47),1.2,alpha,.62,-p*2.1);
    for(let i=0;i<16;i++){
      const a=TWO_PI*i/16+p*3,r=53*(1-ease(p,.8,1)) + 36*ease(p,.8,1);
      const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.78;
      const px2=x+Math.cos(a+.075)*r,py2=y+Math.sin(a+.075)*r*.78;
      line(px,py,px2,py2,color(C.bright,.78),1.3,alpha);
    }
    dot(x,y,5,color(C.white,1),alpha,16);
    ctx.restore();
  }

  const PHI=(1+Math.sqrt(5))/2;
  const momentumSource={x:720,y:667.5},momentumTarget={x:711.5,y:204.5};
  let momentum;
  const momentumRenderer=()=>momentum||(momentum=createSageMomentumV2({ctx,rotate3,line,strokePoints,dot,glow,source:momentumSource,target:momentumTarget}));
  function targetPose(t) {
    if(t<1.30||t>=4.36)return null;
    const collapse=ease(t,3.30,3.40);
    return {opacity:quantumFlicker(t).opacity*(1-collapse),
      scaleX:1-.96*collapse,scaleY:1-.98*collapse,origin:'50% 45%'};
  }
  function clear(width,height) {
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    ctx.lineCap='round';ctx.lineJoin='round';ctx.globalCompositeOperation='source-over';
  }
  function render(skill,t,solve,source,target,geometry={}) {
    if(skill==='momentum'){
      // V2 is already authored bottom-to-top. Map both anchors without the
      // old left-to-right rotation, preserving its perspective and mesh motion.
      const bx=momentumTarget.x-momentumSource.x,by=momentumTarget.y-momentumSource.y;
      const dx=target.x-source.x,dy=target.y-source.y,den=bx*bx+by*by;
      const a=(dx*bx+dy*by)/den,b=(dy*bx-dx*by)/den;
      ctx.save();ctx.translate(source.x,source.y);ctx.transform(a,b,-b,a,0,0);ctx.translate(-momentumSource.x,-momentumSource.y);
      momentumRenderer().draw(t,[],!solve);
      if(solve&&t>=2.53){
        ctx.save();ctx.translate(720-401*.5,790);ctx.transform(0,-.5,.5,0,0,0);
        drawTransitionCore(t,2.55,2.80,936,400);ctx.restore();
      }
      ctx.restore();return;
    }
    // Same authored left-to-right curves, rotated onto the live lower-party to
    // upper-enemy axis. A similarity transform preserves the 3D projection.
    const dx=target.x-source.x,dy=target.y-source.y;
    const bx=TARGET.x-483,by=TARGET.y-401,den=bx*bx+by*by;
    const a=(dx*bx+dy*by)/den,b=(dy*bx-dx*by)/den;
    const axisScale=Math.max(.0001,Math.hypot(a,b));
    ctx.save();ctx.translate(source.x,source.y);ctx.transform(a,b,-b,a,0,0);ctx.translate(-483,-401);
    if(skill==='basic')drawBasic(t,false);
    else if(skill==='vector'){
      // Keep the new prototype's internal 1.65x composition. Do not multiply
      // it by the former 1.4x adaptation; only fit its authored extent to the
      // real enemy and available viewport space.
      const enemyScale=geometry.targetWidth?geometry.targetWidth*.35/119:axisScale;
      const fitScale=geometry.edgeRoom?Math.min(enemyScale,geometry.edgeRoom/(285*1.65)):enemyScale;
      const atomScale=fitScale/axisScale;
      ctx.save();ctx.translate(TARGET.x,TARGET.y);ctx.scale(atomScale,atomScale);ctx.translate(-TARGET.x,-TARGET.y);
      drawVector(t,false,false,Math.atan2(b,a));ctx.restore();
      drawSageSnapCue(t,.28,395,401);
    }
    ctx.restore();
  }
  function sampling(time,anchor,radius,ages=[]) {
    ctx.save();ctx.translate(anchor.x,anchor.y);ctx.scale(radius/65,radius/65);
    ctx.translate(-momentumSource.x,-momentumSource.y);
    momentumRenderer().sampling(ages.filter(age=>age>=0&&age<.64).map(age=>({age})));
    ctx.restore();
  }
  return {clear,render,sampling,targetPose};
}
