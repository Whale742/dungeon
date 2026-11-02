/* Extracted from the approved HTML prototype: Variant B V2 only.
 * Sage momentum V2 — bounded, seekable 3D meshes, rendered in battlefield pixels.
 * No sprites, simulation accumulators, extra clocks, or gameplay authority.
 */
'use strict';
function createSageMomentumV2({ctx,rotate3,line,strokePoints,dot,glow,source,target}) {
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a+(b-a)*t;
  const ramp=(t,a,b)=>clamp((t-a)/(b-a));
  const ease=(t,a,b)=>{const p=ramp(t,a,b);return p*p*(3-2*p);};
  const lerp3=(a,b,t)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),z:mix(a.z||0,b.z||0,t)});
  const gold=(a=1)=>`rgba(229,186,98,${clamp(a)})`;
  const bright=(a=1)=>`rgba(255,235,185,${clamp(a)})`;
  const project=p=>{const s=1000/(1000-p.z);return {x:720+(p.x-720)*s,y:405+(p.y-405)*s,z:p.z,s};};
  const polygon=(ps,fill,edge,width=1)=>{
    ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    ctx.fillStyle=fill;ctx.fill();if(edge){ctx.strokeStyle=edge;ctx.lineWidth=width;ctx.stroke();}
  };
  // 12 large cubic cells: 3 × 4 × 3 shared vertices, not a 2D grid.
  const idx=(x,y,z)=>(y*3+z)*3+x;
  const nodes=[],edges=[],cells=[];
  for(let y=0;y<4;y++)for(let z=0;z<3;z++)for(let x=0;x<3;x++){
    nodes.push({id:idx(x,y,z),x,y,z,position:{x:(x-1)*125,y:170-y*118,z:(z-1)*92},birth:.04+y*.25+(x+z)*.035});
  }
  for(const n of nodes)for(const axis of ['x','y','z']){
    const next={x:n.x,y:n.y,z:n.z};next[axis]++;
    if(next.x<3&&next.y<4&&next.z<3)edges.push({a:n.id,b:idx(next.x,next.y,next.z)});
  }
  // Wavefronts use actual graph distance, including backward branches at junctions.
  function graphDistances(root){
    const distances=nodes.map(()=>Infinity),queue=[root];distances[root]=0;
    for(let i=0;i<queue.length;i++)for(const e of edges){
      const other=e.a===queue[i]?e.b:e.b===queue[i]?e.a:-1;
      if(other>=0&&distances[other]===Infinity){distances[other]=distances[queue[i]]+1;queue.push(other);}
    }
    return distances;
  }
  const energyDistance=graphDistances(idx(1,0,1)),failureDistance=graphDistances(idx(1,3,2));
  for(let y=0;y<3;y++)for(let z=0;z<2;z++)for(let x=0;x<2;x++){
    const ids=[idx(x,y,z),idx(x+1,y,z),idx(x+1,y+1,z),idx(x,y+1,z),idx(x,y,z+1),idx(x+1,y,z+1),idx(x+1,y+1,z+1),idx(x,y+1,z+1)];
    cells.push({ids,x,y,z,id:cells.length,breakAt:1.79+(2-y)*.045+z*.025+x*.013});
  }
  const cellFaces=[[0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[0,3,7,4],[1,2,6,5]];
  const cubeEdges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  function latticeFrame(t){
    const strain=ease(t,1.44,1.85),collapse=ease(t,1.98,2.18);
    const ps=nodes.map(n=>{
      const local=n.position,focus=Math.exp(-((n.x-1)**2+(3-n.y)**2+(2-n.z)**2)*.65);
      // Local strain first; neighboring vertices stay behind, visibly stretching bonds.
      let p={x:local.x+strain*(focus*56+Math.sin(n.id*2.2)*9),
        y:local.y+strain*focus*55,z:local.z+strain*focus*44};
      p=rotate3(p,.20+Math.sin(t*1.3)*.045,-.39+ease(t,.45,1.43)*.12,.025);
      const world={x:720+p.x,y:420+p.y,z:p.z};
      return {...lerp3(world,{...target,z:0},collapse*.985),birth:ease(t,n.birth,n.birth+.16)};
    });
    return ps;
  }
  const latticeRest=latticeFrame(1.78);
  // One directional light comes from the Sage side, forward of the lattice.
  const lightDir=(()=>{const x=source.x-target.x,y=source.y-target.y,z=300;
    const length=Math.hypot(x,y,z);return {x:x/length,y:y/length,z:z/length};})();
  function latticeFaceMaterial(world,alpha,energy,depth,cellCenter){
    const [a,b,c]=world;
    const u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
    const normal={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};
    const faceCenter=world.reduce((acc,p)=>({x:acc.x+p.x/world.length,y:acc.y+p.y/world.length,z:acc.z+p.z/world.length}),{x:0,y:0,z:0});
    if(normal.x*(faceCenter.x-cellCenter.x)+normal.y*(faceCenter.y-cellCenter.y)+normal.z*(faceCenter.z-cellCenter.z)<0){normal.x*=-1;normal.y*=-1;normal.z*=-1;}
    const len=Math.hypot(normal.x,normal.y,normal.z)||1;
    const facing=(normal.x*lightDir.x+normal.y*lightDir.y+normal.z*lightDir.z)/len;
    const lit=clamp(.30+.52*facing),rim=(1-Math.abs(facing))*.22;
    const points=world.map(project);
    // Project the same light direction into each face's own surface plane.
    const center=world.reduce((acc,p)=>({x:acc.x+p.x/world.length,y:acc.y+p.y/world.length,z:acc.z+p.z/world.length}),{x:0,y:0,z:0});
    const projectedLight={x:lightDir.x-facing*normal.x/len,y:lightDir.y-facing*normal.y/len,z:lightDir.z-facing*normal.z/len};
    const h=project({x:center.x+projectedLight.x*90,y:center.y+projectedLight.y*90,z:center.z+projectedLight.z*90});
    const l=project({x:center.x-projectedLight.x*90,y:center.y-projectedLight.y*90,z:center.z-projectedLight.z*90});
    const start=Math.hypot(h.x-l.x,h.y-l.y)<.01?{x:h.x+1,y:h.y}:h;
    const gradient=ctx.createLinearGradient(start.x,start.y,l.x,l.y);
    const opacity=alpha*(.35+.65*depth);
    gradient.addColorStop(0,`rgba(255,226,153,${clamp(opacity*(.10+lit*.30+rim+energy*.24))})`);
    gradient.addColorStop(.48,`rgba(229,186,98,${clamp(opacity*(.08+lit*.16+energy*.10))})`);
    gradient.addColorStop(1,'rgba(180,130,54,0)');
    polygon(points,gradient,gold(opacity*(.10+lit*.22+rim*.3)),.8+depth*.5);
  }
  // Every detached face and bond uses the same bay pivot and shrink/rebound
  // as its parent lattice. Nothing escapes ahead of the 2.18s collision.
  let debrisTime;const debrisPoses=new Map();
  function latticeDebrisPose(t,cell){
    if(debrisTime!==t){debrisTime=t;debrisPoses.clear();}
    const key=cell.y*2+cell.x;if(debrisPoses.has(key))return debrisPoses.get(key);
    const bay=cells.find(c=>c.x===cell.x&&c.y===cell.y&&c.z===1);
    const d=ease(t,bay.breakAt,bay.breakAt+.16),fall=ease(t,1.98,2.18),eject=1-(1-ramp(t,2.18,4.18))**3;
    const ids=[idx(cell.x,cell.y,0),idx(cell.x+1,cell.y,0),idx(cell.x+1,cell.y+1,0),idx(cell.x,cell.y+1,0),
      idx(cell.x,cell.y,2),idx(cell.x+1,cell.y,2),idx(cell.x+1,cell.y+1,2),idx(cell.x,cell.y+1,2)];
    const center=ids.reduce((p,id)=>({x:p.x+latticeRest[id].x/8,y:p.y+latticeRest[id].y/8,z:p.z+latticeRest[id].z/8}),{x:0,y:0,z:0});
    const centroid=lerp3(center,{...target,z:0},fall),angle=bay.id*2.399,throwDistance=eject*2*(55+bay.id%3*22);
    centroid.x+=Math.cos(angle)*throwDistance;centroid.y+=Math.sin(angle)*throwDistance*.58;
    const size=((1-fall*.96)*(1-eject)+eject*.12)*(1+eject)*(1+1.5*eject);
    const transform=p=>{
      const v=rotate3({x:p.x-center.x,y:p.y-center.y,z:p.z-center.z},d*(cell.x?1:-1)*.65+eject*(cell.x?.65:-.65),d*(cell.x?-.55:.55)+eject*(cell.x?-.55:.55),d*(cell.y-1)*.42+eject*(.25+cell.y*.15));
      return {x:centroid.x+v.x*size,y:centroid.y+v.y*size,z:centroid.z+v.z*size};
    };
    const pose={ids,transform,centroid,d,eject,size};debrisPoses.set(key,pose);return pose;
  }
  function drawLatticeShards(t){
    const fade=1-ease(t,3.88,4.18);
    if(t<1.83||fade<=0)return;
    const pieces=[];
    for(const cell of cells){
      if(cell.id%2)continue;
      for(let f=0;f<cellFaces.length;f++){
        if((cell.id*7+f*5)%3!==0)continue;
        const face=cellFaces[f].map(i=>latticeRest[cell.ids[i]]);
        const centroid=face.reduce((p,v)=>({x:p.x+v.x/4,y:p.y+v.y/4,z:p.z+v.z/4}),{x:0,y:0,z:0});
        const tris=[[face[0],face[1],centroid],[face[1],face[2],centroid],[face[2],face[3],face[0]]];
        for(let i=0;i<tris.length;i++){
          const start=cell.breakAt+.07+i*.025,split=ease(t,start,start+.20);
          if(split<=0)continue;
          const pose=latticeDebrisPose(t,cell),vertices=tris[i].map(pose.transform);
          pieces.push({world:vertices,alpha:split*fade,center:pose.centroid,z:vertices.reduce((n,v)=>n+v.z/3,0)});
        }
      }
    }
    pieces.sort((a,b)=>a.z-b.z);
    for(const p of pieces)latticeFaceMaterial(p.world,p.alpha*.8,0,clamp((p.z+200)/400),p.center);
    // Broken bonds follow their original axis, with a smaller outward stress drift.
    for(let i=0;i<edges.length;i+=4){
      const e=edges[i],a=latticeRest[e.a],b=latticeRest[e.b],start=1.90+Math.min(failureDistance[e.a],failureDistance[e.b])*.025;
      const breakage=ease(t,start,start+.12);if(breakage<=0)continue;
      const mid=lerp3(a,b,.5);
      const cell=cells.find(c=>c.x===Math.min(1,nodes[e.a].x)&&c.y===Math.min(2,nodes[e.a].y)&&c.z===1);
      const pose=latticeDebrisPose(t,cell);
      const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
      for(const side of [-1,1]){
        const segment=u=>project(pose.transform({x:mid.x+dx*u,y:mid.y+dy*u,z:mid.z+dz*u}));
        const p=segment(side*.08),q=segment(side*.30);
        line(p.x,p.y,q.x,q.y,bright(.8),1.6,breakage*fade);
      }
      if(i%12===0){const p=project(pose.transform(mid));dot(p.x,p.y,2.5,bright(.9),breakage*fade,4);}
    }
  }
  function drawB(t){
    const world=latticeFrame(t),ps=world.map(project),fade=1-ease(t,2.17,2.35);
    const surfaces=[];
    for(const cell of cells){
      const detach=ease(t,cell.breakAt,cell.breakAt+.16);
      const alpha=Math.min(...cell.ids.map(i=>world[i].birth))*(1-detach)*fade;
      const cellCenter=cell.ids.reduce((p,i)=>({x:p.x+world[i].x/8,y:p.y+world[i].y/8,z:p.z+world[i].z/8}),{x:0,y:0,z:0});
      for(let faceIndex=0;faceIndex<cellFaces.length;faceIndex++){
        // About one third of faces carry a film, leaving the interior legible.
        if((cell.id*7+faceIndex*5)%3!==0)continue;
        const ids=cellFaces[faceIndex],vertices=ids.map(i=>world[cell.ids[i]]);
        const distance=Math.min(...ids.map(i=>energyDistance[cell.ids[i]]));
        const energy=Math.max(0,1-Math.abs(t-(1.02+distance*.073))/.16);
        surfaces.push({world:vertices,alpha,energy,cellCenter,z:vertices.reduce((sum,v)=>sum+v.z,0)/4});
      }
    }
    surfaces.sort((a,b)=>a.z-b.z);
    for(const face of surfaces)latticeFaceMaterial(face.world,face.alpha,face.energy,clamp((face.z+200)/400),face.cellCenter);
    const ordered=edges.map((e,i)=>({...e,i,z:(world[e.a].z+world[e.b].z)/2})).sort((a,b)=>a.z-b.z);
    for(const e of ordered){
      const a=ps[e.a],b=ps[e.b],depth=clamp((e.z+155)/310);
      const alpha=Math.min(world[e.a].birth,world[e.b].birth)*fade;
      const failAt=1.65+Math.min(failureDistance[e.a],failureDistance[e.b])*.044+(e.i%3)*.009;
      const cut=ease(t,failAt,failAt+.085),end=1-ease(t,failAt+.07,failAt+.23);
      if(alpha>.001&&end>.001){
        const mid=lerp3(a,b,.5),left=lerp3(mid,a,cut*.62),right=lerp3(mid,b,cut*.62);
        const bend=Math.sin(t*72+e.i)*ease(t,1.46,1.64)*3*(1-cut);
        const p={x:left.x+bend,y:left.y-bend},q={x:right.x-bend,y:right.y+bend};
        line(a.x,a.y,p.x,p.y,gold(.24),4,alpha*end);
        line(a.x,a.y,p.x,p.y,bright(.35+.62*depth),1.1+depth*1.5,alpha*end);
        line(q.x,q.y,b.x,b.y,bright(.35+.62*depth),1.1+depth*1.5,alpha*end);
        if(cut>0&&cut<1){
          const flash=Math.sin(Math.PI*cut)*alpha*end;
          dot(p.x,p.y,3.4,bright(1),flash,8);dot(q.x,q.y,3.4,bright(1),flash,8);
          line(p.x-5,p.y+7,p.x+5,p.y-7,bright(.9),1.8,flash);
        }
        const da=energyDistance[e.a],db=energyDistance[e.b],from=da<=db?a:b,to=da<=db?b:a;
        const pulse=ramp(t,1.02+Math.min(da,db)*.073,1.02+(Math.min(da,db)+1)*.073);
        if(pulse>0&&pulse<1){
          const tip=lerp3(from,to,pulse),tail=lerp3(from,to,Math.max(0,pulse-.43));
          line(from.x,from.y,to.x,to.y,gold(.36),4,alpha*Math.sin(Math.PI*pulse));
          line(tail.x,tail.y,tip.x,tip.y,bright(1),4,alpha);
          dot(tip.x,tip.y,4.2,bright(1),alpha,8);
        }
      }
    }
    for(const n of nodes){
      const p=ps[n.id],depth=clamp((p.z+155)/310);
      const focus=Math.max(0,1-Math.abs(t-(1.02+energyDistance[n.id]*.073))/.09);
      const gone=1-ease(t,1.72+failureDistance[n.id]*.044,1.94+failureDistance[n.id]*.044);
      dot(p.x,p.y,2.4+depth*2.6+focus*2,bright(.50+.5*depth),world[n.id].birth*fade*gone,focus*8);
    }
    // Entire cells detach and rotate about their own 3D centroid before falling in.
    const fragments=[];
    for(const cell of cells){
      // Adjacent depth cells stay joined as six falling structural bays. This
      // preserves recognizable large volumes instead of 12 overlapping cages.
      if(cell.z!==1)continue;
      const d=ease(t,cell.breakAt,cell.breakAt+.16);if(d<=0)continue;
      const pose=latticeDebrisPose(t,cell),alpha=d*(1-ease(t,3.88,4.18));
      const vertices=pose.ids.map(id=>pose.transform(latticeRest[id]));
      fragments.push({vertices,alpha,z:pose.centroid.z});
    }
    fragments.sort((a,b)=>a.z-b.z);
    for(const f of fragments){
      polygon(cellFaces[1].map(i=>project(f.vertices[i])),gold(.10*f.alpha));
      for(const [a,b] of cubeEdges){
        const p=project(f.vertices[a]),q=project(f.vertices[b]),depth=clamp(((p.z+q.z)/2+155)/310);
        line(p.x,p.y,q.x,q.y,bright(.35+.55*depth),1+depth*.8,f.alpha);
      }
    }
    // Residual broken bond segments remain briefly after the central impact.
    const residual=ease(t,2.18,2.28)*(1-ease(t,2.45,2.72));
    if(residual>0)for(let i=0;i<9;i++){
      const angle=i*2.399,r=55+i*10;
      const x=target.x+Math.cos(angle)*r,y=target.y+Math.sin(angle)*r*.62;
      line(x,y,x+Math.cos(angle+.65)*24,y+Math.sin(angle+.65)*24,bright(.7),1.4,residual);
    }
    drawLatticeShards(t);
    drawFracture(t);
  }

  function drawFracture(t){
    const pre=ease(t,2.04,2.16),fade=1-ease(t,2.28,2.72);
    if(pre*fade<=0)return;
    // A planar, broken seam and a brief transverse impact. No expanding sphere/rings.
    const kick=ease(t,2.18,2.21)*(1-ease(t,2.22,2.36));
    if(kick>0){
      const x=target.x,y=target.y;
      polygon([{x:x-184*kick,y:y-5},{x:x+30,y:y-2},{x:x+184*kick,y:y+5},{x:x-30,y:y+2}],bright(.8*kick));
      line(x-48*kick,y+41*kick,x+51*kick,y-45*kick,bright(1),3,kick);
      glow(x,y,52,kick*.65);
    }
  }
  function drawSampler(t,samples){
    const alpha=ease(t,2.66,2.90)*(1-ease(t,4.34,4.55));if(alpha<=0)return;
    const sample=samples.find(s=>s.age>=0&&s.age<.64),age=sample?.age??-1;
    const pulse=age<0?0:Math.sin(Math.PI*ramp(age,0,.64));

    const points=[],worldPoints=[];
    for(let z=0;z<2;z++)for(let y=0;y<3;y++)for(let x=0;x<3;x++){
      const influence=Math.exp(-((x-2)**2+y*y)*.8),v=rotate3({x:(x-1)*44-pulse*influence*30,y:(y-1)*44+Math.sin(age*65+x+y)*pulse*influence*7,z:(z-.5)*49},.24,-.38,.05);
      const world={x:source.x+v.x,y:source.y-24+v.y,z:v.z};
      worldPoints.push(world);points.push(project(world));
    }
    const id=(x,y,z)=>(z*3+y)*3+x;
    for(const [x,y,z] of [[0,0,0],[1,1,1]]){
      const face=[worldPoints[id(x,y,z)],worldPoints[id(x+1,y,z)],worldPoints[id(x+1,y+1,z)],worldPoints[id(x,y+1,z)]];
      const center={x:source.x,y:source.y-24,z:0};
      latticeFaceMaterial(face,alpha*.38,pulse*.25,z?.7:.3,center);
    }
    for(let z=0;z<2;z++)for(let y=0;y<3;y++)for(let x=0;x<3;x++){
      const a=points[id(x,y,z)],neighbors=[];
      if(x<2)neighbors.push(id(x+1,y,z));if(y<2)neighbors.push(id(x,y+1,z));if(z<1)neighbors.push(id(x,y,z+1));
      for(const index of neighbors){const b=points[index];line(a.x,a.y,b.x,b.y,gold(z?.85:.38),z?1.5:1,alpha);}
      const focus=age<0?0:Math.max(0,1-Math.abs(age-((2-x)+y+z)*.065)/.10);
      dot(a.x,a.y,2+z+focus*2,bright(.8),alpha,focus*5);
    }
    // Return sampled energy toward the Sage; this never creates an extra hit.
    if(age>=0){
      const p=ramp(age,.17,.63),x=mix(source.x+65,source.x,p),y=mix(source.y-77,source.y-4,p);
      line(x+10*(1-p),y-12*(1-p),x,y,bright(.9),2,alpha*pulse);dot(x,y,3,bright(1),alpha*pulse,5);
    }
  }
  return Object.freeze({
    draw(t,samples=[],hypothesis=false){ctx.save();if(t<4.18)drawB(t);if(hypothesis)drawSampler(t-.38,samples);ctx.restore();},
    // Real battle status owns lifetime; omit the prototype's simulated round end.
    sampling(samples=[]){ctx.save();drawSampler(3,samples);ctx.restore();}
  });
}
