(function(global){
  const axes=['輸出','生存','團隊','穩定性','難度'],fields=['radar_output','radar_survival','radar_team','radar_stability','radar_difficulty'];
  const grade=score=>['','D','C','B','A','S'][Math.round(score)]||'D';
  const point=(i,score,radius=76)=>{const angle=-Math.PI/2+i*Math.PI*2/5;return [140+Math.cos(angle)*radius*score/5,116+Math.sin(angle)*radius*score/5];};
  function render(svg,values,label=''){
    if(!svg)return;svg.setAttribute('viewBox','0 0 280 232');svg.setAttribute('role','img');svg.setAttribute('aria-label',label+' '+axes.map((a,i)=>a+' '+grade(values[i])).join('，')+'；難度 S 為最難');
    if(!svg.children.length)svg.innerHTML='<circle class="radar-outer" cx="140" cy="116" r="76"/>'+[.2,.4,.6,.8].map(n=>`<circle class="radar-ring" cx="140" cy="116" r="${76*n}"/>`).join('')+axes.map((a,i)=>{const end=point(i,5),p=point(i,5,104);return `<line class="radar-axis" x1="140" y1="116" x2="${end[0]}" y2="${end[1]}"/><text class="radar-label" x="${p[0]}" y="${p[1]-5}" text-anchor="middle">${a}</text><text class="radar-grade" data-radar-grade="${i}" x="${p[0]}" y="${p[1]+13}" text-anchor="middle"></text>`;}).join('')+'<polygon class="radar-shape"/><g class="radar-vertices">'+axes.map(()=>'<circle r="3"/>').join('')+'</g>';
    const points=values.map((v,i)=>point(i,Math.max(1,Math.min(5,v))));svg.querySelector('.radar-shape').setAttribute('points',points.map(p=>p.join(',')).join(' '));svg.querySelectorAll('[data-radar-grade]').forEach((n,i)=>n.textContent=grade(values[i]));svg.querySelectorAll('.radar-vertices circle').forEach((n,i)=>{n.setAttribute('cx',points[i][0]);n.setAttribute('cy',points[i][1]);});
  }
  global.RadarRenderer={axes,fields,grade,point,render};
})(window);
