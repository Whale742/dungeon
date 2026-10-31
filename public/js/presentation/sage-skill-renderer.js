// Canvas choreography extracted from temp/sage_skill_prototype/app.js V1.1.
// Visuals only: no damage arithmetic, text, DOM UI, timers or battle authority.
// Authored geometry stays in its original coordinates; the host supplies anchors.
function createSageSkillRenderer(canvas) {
  const ctx=canvas.getContext('2d',{alpha:true});
  const TWO_PI=Math.PI*2;
  const TARGET={x:1171,y:384};
  let samples=[];
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

  // Rotation and perspective primitives are shared by orbit and icosahedron FX.
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
  function drawVector(t,solve,releaseCue=true){
    const cx=TARGET.x,cy=TARGET.y;
    const birth=ease(t,0,.18),accel=ease(t,.18,.52),unstable=ease(t,.52,.78),collapse=ease(t,.78,.98);
    const still=t>=.98&&t<1.05;
    const beforeBlast=t<1.05;
    if(beforeBlast){
      const ringAlpha=birth*(1-ease(t,.955,.985));
      const radius=atomRadius(t),instability=unstable*(1-.65*collapse);
      ctx.save();ctx.globalCompositeOperation='screen';
      // Distinct converging photons form the nucleus directly over the Boss.
      if(t<.26){
        const converge=out5(ease(t,0,.19));
        for(let i=0;i<11;i++){
          const a=TWO_PI*i/11+rand(i+9)*.4,d=66*(1-converge)+3;
          const x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d*.70;
          dot(x,y,1.3+rand(i+1),color(C.bright,.9),.7*(1-converge)+.08,7);
        }
      }
      for(let k=0;k<3;k++){
        const appearing=ease(t,k*.042,.14+k*.018)*ringAlpha;
        if(appearing>.005){
          drawAtomOrbit(k,t,radius,appearing,{instability});
          drawAtomElectrons(k,t,radius,appearing,accel,unstable);
        }
      }
      if(t>=.78)drawAtomConvergence(t,collapse);
      const breathe=t<.52?1+.18*Math.sin(t*23):1+.24*Math.sin(t*(23+unstable*49));
      const hold=still?1.48:1;
      const centerAlpha=still?1.0:birth;
      glow(cx,cy,67+20*unstable+50*collapse,centerAlpha*(.40+.44*unstable+.49*collapse));
      ring(cx,cy,(19+3*accel)*(1-.82*collapse),color(C.gold,.5),1.15,centerAlpha,.86,t*.74);
      dot(cx,cy,(5.2+3*unstable)*breathe*(1-.68*collapse)*hold+2.2*collapse,color(C.white,1),centerAlpha,22);
      if(still){
        // Seven hundredths of absolute silence: an intentionally fixed point.
        dot(cx,cy,5.5,color(C.white,1),1,25);
        glow(cx,cy,37,.78);
      }
      ctx.restore();
    }
    if(t>=1.05){
      const age=t-1.05,explosion=between(age,0,.20);
      const fade=(1-ease(age,.20,solve?.37:.41));
      for(let k=0;k<3;k++){
        const stagger=k*.011,local=between(age-stagger,0,.195+k*.015);
        if(age<stagger)continue;
        const radius=10+([222,249,239][k]-10)*out5(local);
        const alpha=fade*(.84-.08*k),tear=ease(age,.105,.33);
        drawAtomOrbit(k,t,radius,alpha,{tear,burst:true,instability:tear*.29});
        if(age<.22)drawAtomElectrons(k,t,radius,alpha*(1-ease(age,.14,.23)),1,tear*.5,true);
      }
      drawAtomicBurst(t);
    }
    if(solve){
      drawAtomicSolveVectors(t);
      drawAtomicResidualCore(t);
    }
    // The hand artwork slot remains empty: only a restrained procedural
    // release cue near Sage is present. Skill remains complete with no hand.
    if(releaseCue)drawSageSnapCue(t,.98,395,401);
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
  const RAW_VERTICES=[
    [-1,PHI,0],[1,PHI,0],[-1,-PHI,0],[1,-PHI,0],
    [0,-1,PHI],[0,1,PHI],[0,-1,-PHI],[0,1,-PHI],
    [PHI,0,-1],[PHI,0,1],[-PHI,0,-1],[-PHI,0,1]
  ];
  const norm=Math.sqrt(1+PHI*PHI);
  const ICO_VERTICES=RAW_VERTICES.map(([x,y,z])=>({x:x/norm,y:y/norm,z:z/norm}));
  const ICO_EDGES=[];
  for(let i=0;i<RAW_VERTICES.length;i++)for(let j=i+1;j<RAW_VERTICES.length;j++){
    const a=RAW_VERTICES[i],b=RAW_VERTICES[j],dist=Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
    if(Math.abs(dist-2)<.00001)ICO_EDGES.push([i,j]);
  }
  // A 20-faced polyhedron is expected to have exactly 30 edges.
  if(ICO_EDGES.length!==30)console.warn('Unexpected icosahedron topology',ICO_EDGES.length);

  function wireframeVertices({cx,cy,scale,time,appear=1,distortion=0,collapse=0,sample=0,velocity=1}){
    const rx=.25+time*.37*velocity,ry=time*.56*velocity,rz=time*.18*velocity;
    const pts=[];
    for(let i=0;i<ICO_VERTICES.length;i++){
      let p={...ICO_VERTICES[i]};
      if(distortion){
        p.x+=Math.sin(i*5.1+time*20)*distortion*.29;
        p.y+=Math.cos(i*3.4+time*14)*distortion*.20;
        p.z+=Math.sin(i*7.3+time*9)*distortion*.23;
      }
      if(sample){
        const facing=clamp((p.x+.30)*.8);
        p.x-=sample*facing*.86; // local indentation toward the attack source
        p.y+=Math.sin(i*2.7)*sample*facing*.09;
      }
      p=rotate3(p,rx,ry,rz);
      p.x*=(1-collapse*.91);p.y*=(1-collapse*.91);p.z*=(1-collapse*.9);
      pts.push(project3(p,cx,cy,scale*appear));
    }
    return pts;
  }
  function drawWireframe(points,{birth=1,alpha=1,reconnection=0,time=0,sample=0,glowStrength=1}){
    if(alpha<=0)return;
    const edgeCount=Math.floor(ICO_EDGES.length*clamp(birth));
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let i=0;i<edgeCount;i++){
      const e=ICO_EDGES[i],a=points[e[0]],b=points[reconnection>.08&&i%6===0?(e[1]+5)%12:e[1]];
      const depth=clamp((a.z+b.z+2.7)/5);
      const brightness=(.38+.6*depth)*alpha;
      if(glowStrength>.2)line(a.x,a.y,b.x,b.y,color(C.gold,.14),3.6,brightness*glowStrength);
      line(a.x,a.y,b.x,b.y,color(C.gold,.79),1.25,brightness);
      if(sample>0){
        const p=(time*2.0+i/30)%1;
        if(p<.65)dot(lerp(a.x,b.x,p/.65),lerp(a.y,b.y,p/.65),1.8,color(C.white,.8),sample*.7*alpha,3);
      }else if(i%4===0){
        const p=(time*.58+i/30)%1;
        dot(lerp(a.x,b.x,p),lerp(a.y,b.y,p),1.5,color(C.bright,.7),alpha*.48,3);
      }
    }
    for(let i=0;i<points.length;i++){
      const p=points[i],reveal=birth>=1?1:ease(birth,(i-1)/12,(i+1)/12);
      const light=(.54+.4*clamp((p.z+1)/2))*alpha*reveal;
      if(light<.01)continue;
      dot(p.x,p.y,2.25,color(C.bright,.9),light,4*glowStrength);
      if(i%3===0)ring(p.x,p.y,3.4,color(C.gold,.5),.7,light*.62);
    }
    ctx.restore();
  }
  function drawSampleWave(points,age,alpha){
    const u=between(age,0,.45),strength=Math.sin(Math.PI*u)*alpha;
    if(strength<=.001)return;
    const sx=483,sy=397;
    for(let k=0;k<5;k++){
      const p=points[k*2%12],dist=lerp(0,1,u);
      line(sx-30+(p.x-sx)*dist,sy+(p.y-sy)*dist,sx+(p.x-sx)*dist,sy+(p.y-sy)*dist,color(C.white,.5),1.1,strength*.6);
      dot(p.x,p.y,5.0,color(C.white,.9),strength,13);
    }
    ring(sx,sy,31+120*u,color(C.gold,.72),1.4,strength*.8,.77,-.3);
    for(let j=0;j<7;j++){
      const start=Math.max(0,Math.min(1,(u-j*.055)/.60));
      const px=lerp(sx+153,sx+8,out3(start));
      const py=sy+(j-3)*13*(1-out3(start));
      dot(px,py,2.5,color(C.bright,.95),strength*(1-.6*start),8);
      if(start>.04)line(px+18*(1-start),py,px,py,color(C.gold,.6),1.1,strength*.7);
    }
    for(let i=0;i<9;i++){
      const angle=TWO_PI*i/9+u*3;
      const px=lerp(590,483,u)+Math.cos(angle)*50*(1-u),py=400+Math.sin(angle)*52*(1-u);
      dot(px,py,2,color(C.bright,.95),strength*.85,7);
    }
  }
  function sampleEffectsFor(){return samples;}
  // A single visual projectile: timing is independent of the hit event.
  function drawMomentumPulse(t,hitAt){
    const start=hitAt-.59, age=t-start;
    if(age<0||t>hitAt+.025)return;
    const birth=ease(age,0,.11), layers=ease(age,.09,.22);
    const travel=ease(age,.20,.56), compress=ease(age,.45,.59);
    const fade=1-ease(t,hitAt-.015,hitAt+.025);
    const sx=568,sy=406,tx=TARGET.x-12,ty=TARGET.y;
    const x=lerp(sx,tx,travel),y=lerp(sy,ty,travel),alpha=birth*fade;
    const pointForm=ease(travel,.05,.9);
    const radius=(31+9*layers)*(1-.88*pointForm);
    ctx.save();ctx.globalCompositeOperation='screen';
    // Trails begin at the source and taper with distance behind the moving core.
    const trail=ease(age,.20,.30)*fade;
    for(let i=0;i<4;i++){
      const offset=(i-1.5)*7*(1-compress*.5),len=(45+i*17)*trail;
      const endX=Math.max(sx,x-len);
      line(endX,y+offset+(sy-ty)*(x-endX)/(tx-sx),x-8,y+offset,color(C.gold,.12),4,trail);
      line(endX,y+offset+(sy-ty)*(x-endX)/(tx-sx),x-8,y+offset,color(C.bright,.55),1,trail);
    }
    glow(x,y,80,alpha*(.32+1.05*pointForm));
    for(let layer=0;layer<2;layer++){
      const size=radius*(layer===0?.67:1.14),spin=age*(layer===0?9:-6)+layer*2;
      const pts=ICO_VERTICES.map(p=>project3(rotate3(p,.55+spin*.35,spin,.25+spin*.3),x,y,size));
      ctx.beginPath();
      for(let i=0;i<ICO_EDGES.length;i++){
        if(layer===1&&i%2)continue;
        const [a,b]=ICO_EDGES[i];ctx.moveTo(pts[a].x,pts[a].y);ctx.lineTo(pts[b].x,pts[b].y);
      }
      ctx.strokeStyle=color(C.gold,.14*alpha*layers*(1-pointForm));ctx.lineWidth=4;ctx.stroke();
      ctx.strokeStyle=color(layer===0?C.bright:C.gold,(layer===0?.8:.48)*alpha*layers*(1-pointForm));ctx.lineWidth=1.1;ctx.stroke();
    }
    dot(x,y,3+35*pointForm,color(C.white,.98),alpha,8+20*pointForm);
    ctx.restore();
  }
  function drawMomentumHyp(t,seg){
    const formation=ease(t,.06,.30),linked=ease(t,.30,.65),activated=ease(t,.65,1.0);
    const x=483,y=401;
    const samples=sampleEffectsFor(seg,seg.start+t);
    const active=samples.find(s=>s.age>=0&&s.age<.5);
    const pulse=active?Math.sin(Math.PI*between(active.age,0,.5))**1.2:0;
    const spin=t<1.5?t:1.5+(t-1.5)*.35;
    const points=wireframeVertices({cx:x,cy:y,scale:142,time:spin,appear:.90,distortion:0,collapse:0,sample:pulse});
    const halo=formation*.65;
    if(halo>.001){
      ctx.save();ctx.globalCompositeOperation='screen';
      glow(x,y,155,halo*.3);
      ring(x,y,152,color(C.gold,.30),.9,formation*.58,.67,-.3);
      for(let axis=0;axis<3;axis++){
        const an=axis*Math.PI/3+t*.15;
        line(x-Math.cos(an)*132,y-Math.sin(an)*132,x+Math.cos(an)*132,y+Math.sin(an)*132,color(C.gold,.12),.7,activated*.5);
      }
      ctx.restore();
      drawWireframe(points,{birth:linked,alpha:formation*.95,reconnection:0,time:spin,sample:activated,glowStrength:.7});
      for(let i=0;i<7;i++){
        const q=(t*.12+i/7)%1;
        const a=i*TWO_PI/7,px=x+Math.cos(a)*155,py=y+Math.sin(a)*125;
        dot(px,py,1.3,color(C.gold,.6),activated*(.3+.3*Math.sin(t*2+i)));
      }
      // Initial cast still delivers its independent basic physical hit.
      drawMomentumPulse(t,1.09);
      for(const s of samples)if(s.age>=0&&s.age<.5)drawSampleWave(points,s.age,1);
    }
    drawImpact(t,1.09,TARGET.x,TARGET.y);
  }
  // Faces share the same topology and projected vertices as the existing wireframe.
  const ICO_FACES=[];
  for(let a=0;a<12;a++)for(let b=a+1;b<12;b++)for(let c=b+1;c<12;c++){
    if([[a,b],[a,c],[b,c]].every(pair=>ICO_EDGES.some(e=>e[0]===pair[0]&&e[1]===pair[1])))ICO_FACES.push([a,b,c]);
  }
  function drawFoldedFaces(points,t,alpha){
    const fold=ease(t,.62,.91),burst=ease(t,1.09,1.28);
    const faces=ICO_FACES.map((ids,i)=>({ids,i,z:ids.reduce((sum,id)=>sum+points[id].z,0)/3})).sort((a,b)=>a.z-b.z);
    ctx.save();ctx.globalCompositeOperation='screen';
    for(const face of faces){
      const a=face.i*2.4,offset=burst*(22+face.i%4*13),shiftX=Math.cos(a)*offset,shiftY=Math.sin(a)*offset;
      const p=face.ids.map(id=>points[id]);
      ctx.beginPath();ctx.moveTo(p[0].x+shiftX,p[0].y+shiftY);
      for(let j=1;j<3;j++)ctx.lineTo(p[j].x+shiftX,p[j].y+shiftY);
      ctx.closePath();
      ctx.fillStyle=color(C.gold,(.025+.075*clamp((face.z+1.5)/3))*alpha*(.4+fold));ctx.fill();
      ctx.strokeStyle=color(C.bright,(.16+.35*fold)*alpha);ctx.lineWidth=1;ctx.stroke();
    }
    ctx.restore();
  }
  function drawDimensionFracture(t,cx,cy){
    const enter=ease(t,1.075,1.13),fade=1-ease(t,1.22,1.43),alpha=enter*fade;
    if(alpha<=0)return;
    ctx.save();ctx.globalCompositeOperation='screen';
    // Four oblique planes with depth-dependent perspective, each crossing once.
    for(let i=0;i<4;i++){
      const travel=between(t,1.075+i*.012,1.25+i*.012);
      const angle=-.85+i*.48, offset=(travel-.5)*180;
      const shape=[{x:-1.05,y:-.045,z:-.8},{x:.975,y:-.095,z:.8},{x:1.05,y:.045,z:.8},{x:-.975,y:.095,z:-.8}];
      const pts=shape.map(p=>project3(rotate3(p,.35+i*.3,.4+i*.37,angle),cx+Math.cos(angle+1.57)*offset,cy+Math.sin(angle+1.57)*offset,200));
      ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let j=1;j<4;j++)ctx.lineTo(pts[j].x,pts[j].y);ctx.closePath();
      ctx.fillStyle=color(C.gold,.12*alpha);ctx.fill();ctx.strokeStyle=color(C.bright,.72*alpha);ctx.lineWidth=2;ctx.stroke();
      line(pts[0].x,pts[0].y,pts[2].x,pts[2].y,color(C.white,.85),1.4,alpha);
    }
    const crackFade=1-ease(t,1.23,1.48);
    for(let i=0;i<12;i++){
      const a=TWO_PI*i/12+.12, r=48+i%3*12, length=65+i%4*20;
      const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;
      const mx=cx+Math.cos(a+.10)* (r+length*.48),my=cy+Math.sin(a+.10)*(r+length*.48);
      const ex=cx+Math.cos(a-.04)*(r+length),ey=cy+Math.sin(a-.04)*(r+length);
      line(x,y,mx,my,color(C.bright,.85),1.5,enter*crackFade);
      line(mx,my,ex,ey,color(C.gold,.7),1,enter*crackFade);
      if(i%2===0)line(mx,my,mx+Math.cos(a+.6)*35,my+Math.sin(a+.6)*35,color(C.gold,.6),1,enter*crackFade);
    }
    ctx.restore();
  }
  function drawMomentumSolve(t){
    const build=ease(t,0,.30),structure=ease(t,.12,.33),rotate=ease(t,.30,.65);
    const distort=ease(t,.60,.91),collapse=ease(t,.90,1.06)*.94;
    const visible=(1-ease(t,1.09,1.36));
    const expansion=1+.24*ease(t,.48,.70)*(1-ease(t,.78,.95));
    const cx=TARGET.x-12,cy=TARGET.y;
    const points=wireframeVertices({cx,cy,scale:210*expansion,time:t<.3?t: .3+(t-.3)*(1+rotate*3.5),appear:1,distortion:distort,collapse,sample:0,velocity:1});
    ctx.save();ctx.globalCompositeOperation='screen';
    glow(cx,cy,194,build*.18*visible);
    ring(cx,cy,194-135*collapse,color(C.gold,.27),1,build*visible,.88,-t);
    if(t>=.65&&t<1.15)for(let k=0;k<10;k++){
      const r=189*(1-collapse*.96),a=TWO_PI*k/10+t*6;
      line(cx+r*Math.cos(a),cy+r*Math.sin(a),cx+(r-15)*Math.cos(a+.2),cy+(r-15)*Math.sin(a+.2),color(C.bright,.74),1.2,distort*visible*.85);
    }
    ctx.restore();
    if(visible>.005){
      drawFoldedFaces(points,t,build*visible);
      drawWireframe(points,{birth:structure,alpha:build*visible,reconnection:distort,time:t*2.8,sample:distort*.3,glowStrength:.9});
      for(let i=0;i<points.length;i++) if(distort>.02){
        const p=points[i],a=t*10+i*1.3;
        dot(p.x+Math.cos(a)*9*distort,p.y+Math.sin(a)*9*distort,1.4,color(C.bright,.75),distort*visible,5);
      }
    }
    if(t>=.91&&t<1.24){
      const c=collapse*(1-ease(t,1.135,1.24));
      glow(cx,cy,103,c*.9);dot(cx,cy,5+8*collapse,color(C.white,1),c,21);
    }
    drawMomentumPulse(t,1.09);
    drawDimensionFracture(t,cx,cy);
    drawImpact(t,1.10,cx,cy,'geometry');
    if(t>=1.13){
      const p=between(t,1.13,1.50),a=1-ease(t,1.42,1.55);
      const toX=lerp(cx,936,out3(p)),toY=lerp(cy,400,out3(p));
      ctx.save();ctx.globalCompositeOperation='lighter';
      for(let i=0;i<30;i++){
        const theta=TWO_PI*i/30+t*2.5,from=lerp(145,60,out5(p)),r=from*(.72+.28*Math.sin(i*3.1)**2);
        const ex=toX+Math.cos(theta)*r,ey=toY+Math.sin(theta)*r*.76;
        const ex2=toX+Math.cos(theta+.12)*r,ey2=toY+Math.sin(theta+.12)*r*.76;
        line(ex,ey,ex2,ey2,color(C.bright,.8),1.2,.76*a);
        if(i%3===0)dot(ex,ey,1.7,color(C.white,.7),a,5);
      }
      glow(toX,toY,86,a*.6);ring(toX,toY,46,color(C.gold,.67),1.25,a,.78,t*1.3);
      ctx.restore();
    }
  }

  function drawEquationHook(t,skill){
    const p=between(t,0,1.40),alpha=(.72+.28*ease(t,0,.14))*(1-ease(t,1.24,1.40));
    const x=skill==='vector'?lerp(TARGET.x,899,ease(t,.05,.35)):899,y=skill==='vector'?lerp(TARGET.y,399,ease(t,.05,.35)):399;
    if(alpha>.001){
      ctx.save();ctx.globalCompositeOperation='screen';
      glow(x,y,113,alpha*.45);
      ring(x,y,54+2*Math.sin(t*8),color(C.gold,.6),1.5,alpha,.72,t*.9);
      ring(x,y,81+4*Math.sin(t*4),color(C.gold,.33),1,alpha,.77,-t*.55);
      for(let i=0;i<26;i++){
        const a=TWO_PI*i/26+t*1.6,r=71+8*Math.sin(i*4+t*3);
        const xx=x+Math.cos(a)*r,yy=y+Math.sin(a)*r*.65;
        if(i%2===0)dot(xx,yy,1.65,color(C.white,.9),alpha*.85,8);
        else line(xx-8,yy,xx+8,yy,color(C.bright,.75),.95,alpha*.8);
      }
      dot(x,y,5,color(C.white,.9),alpha,12);
      ctx.restore();
    }
  }

  function clear(width,height) {
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    ctx.lineCap='round';ctx.lineJoin='round';ctx.globalCompositeOperation='source-over';
  }
  function render(skill,t,_phase,source,target,geometry={}) {
    // Same authored left-to-right curves, rotated onto the live lower-party to
    // upper-enemy axis. A similarity transform preserves the 3D projection.
    const dx=target.x-source.x,dy=target.y-source.y;
    const bx=TARGET.x-483,by=TARGET.y-401,den=bx*bx+by*by;
    const a=(dx*bx+dy*by)/den,b=(dy*bx-dx*by)/den;
    const axisScale=Math.max(.0001,Math.hypot(a,b));
    ctx.save();ctx.translate(source.x,source.y);ctx.transform(a,b,-b,a,0,0);ctx.translate(-483,-401);
    samples=[];
    if(skill==='basic')drawBasic(t,false);
    else if(skill==='vector'){
      // Fit the unscaled model to enemy artwork, then enlarge the WHOLE atom
      // 1.4x: nucleus, orbits, electrons, trails, collapse and burst fragments.
      // Reserve the largest fragment radius so viewport edges cannot cut rings.
      const atomMultiplier=1.4;
      const enemyScale=geometry.targetWidth?geometry.targetWidth*.35/119:axisScale;
      const fitScale=geometry.edgeRoom?Math.min(enemyScale,geometry.edgeRoom/(285*atomMultiplier)):enemyScale;
      const atomScale=fitScale*atomMultiplier/axisScale;
      ctx.save();ctx.translate(TARGET.x,TARGET.y);ctx.scale(atomScale,atomScale);ctx.translate(-TARGET.x,-TARGET.y);
      drawVector(t,false,false);ctx.restore();
      // The release cue belongs near Sage, not inside the enlarged atom.
      drawSageSnapCue(t,.98,395,401);
    }else{
      // Reuse the existing attack's rotating/folding target geometry and pulse
      // in both phases. Hypothesis sampling is a separate status-owned model.
      drawMomentumSolve(t);
    }
    ctx.restore();
  }
  function sampling(time,anchor,radius,ages=[]) {
    ctx.save();ctx.translate(anchor.x,anchor.y);ctx.scale(radius/142,radius/142);ctx.translate(-483,-401);
    samples=ages.filter(age=>age>=0&&age<.5).map(age=>({age}));
    // Same idle, indentation, travelling gold wave, lit nodes and inward photons.
    // Use the original idle section; its initial attack has already completed.
    drawMomentumHyp(1.5+time,{start:0});ctx.restore();samples=[];
  }
  return {clear,render,sampling};
}
