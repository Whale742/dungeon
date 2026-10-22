// Presentation only. All movements share the real unit anchors; the single
// authoritative impact is owned by playEnemyMechanicPresentation.
const ENEMY_CHOREOGRAPHY_TIMING=Object.freeze({
  lava_colossus:{basic:[1160,.52],ultimate:[1820,.57]},
  shadow_alpha:{basic:[900,.43],ultimate:[1380,.46]},
  banshee:{basic:[1080,.49],ultimate:[1740,.58]}
});
// Explicit semantic matches. Missing art returns to the existing effect; no unrelated picture is substituted.
const ENEMY_PAINTED_ART=Object.freeze({
  lava_colossus:['enemies/lava-fist.png','enemies/lava-ground-crack.png','enemies/lava-eruption.png','enemies/lava-debris.png'],
  shadow_alpha:['enemies/shadow-lunge.png','enemies/shadow-claw.png','enemies/shadow-rending-claws.png','enemies/shadow-rend.png'],
  ancient_golem:['enemies/automaton-energy-core.png','enemies/overload-lightning.png'],
  blood_sorcerer:['enemies/blood-ribbon.png','enemies/blood-pierce.png','enemies/blood-moon.png','enemies/blood-energy-stream.png'],
  corrosive_serpent:['enemies/acid-projectile.png','enemies/acid-pool.png'],
  frost_knight:['common/ice-projectile-volley.png','common/frost-slash.png','common/ice-eruption.png'],
  glutton:['enemies/gluttonous-bite.png'],banshee:['enemies/whispering-spirits.png','enemies/banshee-scream.png'],
  crystal_scorpion:['enemies/crystal-pierce.png','enemies/crystal-burst.png'],
  hellstrider:['common/fireball.png','common/meteor-shower.png','common/rock-impact.png'],
  lava_larva:['enemies/lava-debris.png','enemies/lava-eruption.png'],
  shadow_wolf_pup:['enemies/shadow-lunge.png','enemies/shadow-claw.png'],
  ancient_repair_drone:['common/arcane-energy-link.png','enemies/automaton-energy-core.png'],
  blood_moon_acolyte:['enemies/blood-ribbon.png','enemies/blood-energy-stream.png'],
  corrosive_slime:['enemies/acid-projectile.png','enemies/acid-pool.png'],
  frostbone_skeleton:['common/ice-projectile-volley.png','common/frost-slash.png'],
  carrion_crawler:['enemies/parasitic-vortex.png'],whispering_apparition:['enemies/whispering-spirits.png'],
  crystal_beetle:['enemies/crystal-pierce.png','enemies/crystal-burst.png'],hellfire_imp:['common/fireball.png'],
  labyrinth_crossbowman:['archer/magic-arrow.png'],cave_goblin_rogue:['common/slash-texture.png'],
  shady_merchant:['common/gold-coin-burst.png'],treasure_mimic:['enemies/gluttonous-bite.png'],
  abyss_remnant:['enemies/whispering-spirits.png'],
  abyss_warrior:['common/sword-slash.png'],abyss_mage:['mage/arcane-core.png'],abyss_archer:['archer/magic-arrow.png'],
  abyss_assassin:['assassin/shadow-step.png','assassin/fatal-slash.png'],abyss_bard:['bard/pluck-streak.png','bard/melody-ribbon.png'],
  abyss_alchemist:['common/acid-orb.png','common/acid-splash.png'],abyss_druid:['common/vine-strike.png'],
  abyss_paladin:['common/sword-slash.png'],abyss_gladiator:['common/slash-texture.png'],abyss_samurai:['common/sword-slash.png']
});
function enemyPaintedPaths(step,result){
  const id=step.presentation?.mechanicId,art=ENEMY_PAINTED_ART[id];
  if(!art)return null;
  if(result.kind==='damage'||result.kind==='intercept'){
    if(/反射/.test(step.actionId))return id==='crystal_scorpion'?['enemies/crystal-burst.png']:null;
    if(!step.presentation?.isUltimate){
      if(id==='lava_colossus')return [art[0],art[1],art[3]];
      if(id==='shadow_alpha')return art.slice(0,2);
      if(id==='blood_sorcerer')return art.slice(0,2);
      if(id==='hellstrider')return [art[0]];
      if(id==='frost_knight')return ['common/frost-slash.png'];
    }
    return art;
  }
  if(/岩甲失效/.test(step.actionId))return ['enemies/lava-debris.png'];
  if(result.kind==='shield'&&id==='abyss_paladin')return ['paladin/holy-shield.png'];
  if(result.kind==='heal'&&id==='abyss_bard')return ['bard/melody-ribbon.png'];
  if(result.kind==='heal'&&id==='abyss_mage')return ['common/arcane-energy-link.png'];
  if(result.kind==='heal'&&id==='abyss_alchemist')return ['alchemist/transmutation-orb.png'];
  if(result.kind==='shield'&&['ancient_golem','ancient_repair_drone'].includes(id))return ['enemies/automaton-energy-core.png'];
  if(result.kind==='shield'&&['crystal_scorpion','crystal_beetle'].includes(id))return ['enemies/crystal-burst.png'];
  if(result.kind==='heal'&&['blood_sorcerer','blood_moon_acolyte'].includes(id))return ['enemies/blood-energy-stream.png'];
  if(result.kind==='heal'&&id==='glutton')return ['enemies/parasitic-vortex.png'];
  if(result.kind==='status'&&/充能|能源/.test(step.actionId)&&['ancient_golem','ancient_repair_drone'].includes(id))return ['enemies/automaton-energy-core.png'];
  return null;
}
function createEnemyChoreography(step,result,root,{reduced,animations,speed}) {
  const paths=enemyPaintedPaths(step,result);if(!paths)return null;
  const id=step.presentation.mechanicId,ultimate=!!step.presentation.isUltimate;
  const existingDuration=typeof ENEMY_FX_PROFILES!=='undefined'?(ENEMY_FX_PROFILES[step.presentation.family]?.[3]||700):700;
  const timing=ENEMY_CHOREOGRAPHY_TIMING[id]||{basic:[existingDuration,.35],ultimate:[existingDuration,.35]};
  const [baseDuration,baseContact]=timing[ultimate?'ultimate':'basic'];
  const duration=reduced?650:baseDuration,contact=reduced?.35:baseContact;
  const sourceId=step.presentation.visualOriginId||result.sourceId||step.sourceId,targetId=resolvePresentationTarget(result,step);
  const layer=document.createElement('div');layer.className='enemy-choreography enemy-choreography-'+id;layer.dataset.ultimate=String(ultimate);layer.setAttribute('aria-hidden','true');root.appendChild(layer);
  const images=paths.map(path=>{const n=document.createElement('img');n.src='/assets/combat-fx/'+path;n.alt='';n.className='enemy-official-art';n.setAttribute('aria-hidden','true');layer.appendChild(n);return n;});
  const clamp=n=>Math.max(0,Math.min(1,n)),out=n=>1-Math.pow(1-clamp(n),3);
  let actorAnimated=false;
  const render=p=>{
    const source=getBattleEffectAnchor(sourceId),target=getBattleEffectAnchor(targetId);if(!target||(!source&&p<contact)){layer.hidden=true;return;}layer.hidden=false;
    const a=source||target,b=target,dx=b.x-a.x,dy=b.y-a.y;
    const wind=clamp(p/contact),q=clamp((p-contact)/(1-contact));
    layer.dataset.phase=p<contact*.6?'windup':p<contact?'travel':q<.4?'impact':'dissolve';
    if(!actorAnimated&&source){
      actorAnimated=true;const sprite=source.element.querySelector('.enemy-sprite-img');
      if(sprite?.animate&&!reduced){
        const leap=id==='shadow_alpha',x=leap?dx*.76:Math.sign(dx)*(ultimate?18:9),y=leap?dy*.68:-(ultimate?20:10);
        const keys=leap?[{transform:'translate(0,0)'},{transform:'translate('+(-Math.sign(dx)*12)+'px,8px) scale(.94)',offset:contact*.45},{transform:`translate(${x}px,${y}px) rotate(${Math.sign(dx)*-7}deg)`,filter:'drop-shadow(-22px 6px 2px #252032aa) drop-shadow(-40px 10px 7px #51416066)',offset:contact},{transform:`translate(${x*.8}px,${y*.7}px)`,offset:contact+.1},{transform:'translate(0,0)',filter:'none'}]:
          [{transform:'translateY(0)'},{transform:`translate(${x*.2}px,${y}px) rotate(-5deg)`,offset:contact*.65},{transform:`translate(${x}px,6px) rotate(4deg)`,offset:contact},{transform:'translate(0,0)'}];
        const motion=id==='banshee'?[{transform:'translateY(0) scale(1)'},{transform:'translateY(-8px) scale(1.04)',offset:contact},{transform:'translateY(-3px) scale(1.02)',offset:Math.min(.9,contact+.15)},{transform:'translateY(0) scale(1)'}]:keys;
        animations.push(sprite.animate(motion,{duration:duration/speed,easing:'linear',fill:'forwards'}));
      }
    }
    const missed=['damage','intercept'].includes(result.kind)&&!(result.actualDamage>0);
    images.forEach((image,i)=>{
      const path=paths[i],charge=/energy-core|blood-moon/.test(path)&&paths.length>1;
      const link=/energy-stream|energy-link|overload-lightning/.test(path);
      const impactOnly=!charge&&(i>0||paths.length===1),travel=out((wind-.35)/.65),ground=/ground|pool|eruption/.test(path);
      const hitAge=clamp((p-contact-i*.025)/(1-contact)),visible=charge?p<contact:impactOnly?p>=contact+i*.025&&!missed:p<contact||!missed;
      let x=charge?a.x:reduced||impactOnly?b.x:a.x+dx*travel;
      let y=(charge?a.y:reduced||impactOnly?b.y:a.y+dy*travel)+(ground?b.rect.height*.32:0);
      let width=Math.min(ultimate?240:175,Math.max(100,b.rect.width*1.7)),height=width,rotation=reduced?0:i*12;
      if(link&&!reduced){x=(a.x+b.x)/2;y=(a.y+b.y)/2;width=Math.hypot(dx,dy);height=Math.min(110,b.rect.height);rotation=Math.atan2(dy,dx)*180/Math.PI;}
      const alpha=charge?Math.sin(wind*Math.PI):p<contact?Math.sin(wind*Math.PI):1-hitAge;
      Object.assign(image.style,{left:x+'px',top:y+'px',width:width+'px',height:height+'px',opacity:visible?String(alpha*(reduced?.55:1)):'0',transform:`translate(-50%,-50%) scale(${reduced?1:p<contact?.65+travel*.35:1+hitAge*.18}) rotate(${rotation}deg)`});
    });
  };
  return {duration,contact,render,remove:()=>layer.remove(),windupSfx:id==='banshee'?'bard_tone':['lava_colossus','shadow_alpha'].includes(id)?'air_pass':null,impactSfx:id==='shadow_alpha'?'claw_slash':id==='banshee'?'bard_off_key':id==='lava_colossus'?'heavy_impact':null};
}
