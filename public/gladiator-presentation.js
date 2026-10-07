async function playGladiatorChallengePresentation(step,context) {
  return withSkillPresentationStage(step,context,async s=>{
    const target=s.anchors.get('monster'),landing={x:target.x-90-35,y:target.y+90};
    s.debug('Gladius landing',landing);
    // The blade is clipped geometrically at ground level, never covered by a black block.
    const svg=s.el('div','skill-gladius-scene','<svg viewBox="0 0 1440 810" width="1440" height="810"><defs><clipPath id="productionGladiusGround"><rect x="0" y="0" width="1440" height="'+landing.y+'"/></clipPath></defs><g clip-path="url(#productionGladiusGround)"><g class="skill-gladius-motion"><g transform="scale(1.2) translate(-50,-50)"><circle cx="15" cy="85" r="7.5" fill="#9c7a4a" stroke="#e5c378" stroke-width="1.8"/>         <polygon points="19,81 27,73 23,69 15,77" fill="#1b120c" stroke="#9c7a4a" stroke-width="1.6"/>         <path d="M 23,70 C 23,58 35,46 45,58 L 32,71 Z" fill="#9c7a4a" stroke="#e5c378" stroke-width="1.8"/>         <path d="M 36,54 C 48,42 62,28 78,14 C 92,6 96,8 96,8 C 96,8 94,22 86,36 C 72,52 58,66 46,74 Z"                fill="#e2e8f0" stroke="#9c7a4a" stroke-width="2.2"/>         <path d="M 38,57 L 96,8" stroke="#718096" stroke-width="1.6"/></g></g></g><g class="skill-gladius-cracks" transform="translate('+landing.x+' '+landing.y+')"><path d="M0 0-25 8-38 4m13 4-3 11M0 0 28 6 42 0M0 0 7 17-4 24M0 0-16-9-32-6"/><ellipse rx="35" ry="5" fill="#2c1515" stroke="none"/></g></svg>');
    const sword=svg.querySelector('.skill-gladius-motion'),cracks=svg.querySelector('.skill-gladius-cracks');
    const start={x:SKILL_STAGE.actor.x+35,y:SKILL_STAGE.actor.y-10};
    const keys=Array.from({length:43},(_,i)=>{const p=i/42;return {transform:`translate(${start.x+(landing.x-start.x)*p}px,${start.y+(landing.y-start.y)*p-Math.sin(p*Math.PI)*230}px) rotate(${p*865}deg)`};});
    sword.style.transform=keys[0].transform;
    s.animate(s.actor,[{transform:'translate(-50%,-50%)'},{transform:'translate(-50%,-40%)'},{transform:'translate(-50%,-50%)'}],420);
    await s.wait(300);context.audioScope.play('air_pass',{noHold:true});
    s.animate(sword,keys,850);await s.wait(850);if(s.signal?.aborted)return;
    // 865 degrees resolves to the required 145 degree landing angle.
    s.animate(cracks,[{opacity:0},{opacity:1}],100);
    const reveal=s.el('div','skill-reveal');reveal.textContent=step.outcome.label||'死鬥宣告';s.animate(reveal,[{opacity:0},{opacity:1}],200);
    context.onTiming?.('gladius_landing',{step,landing});
    await s.resolveResults();await s.wait(650);
  });
}
