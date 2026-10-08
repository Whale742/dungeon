// One-time reproducible extraction of the approved fixed_v4 source.
import fs from 'node:fs';
import crypto from 'node:crypto';
const sourcePath='public/assets/temp/samurai_skill_prototype_fixed_v4.html';
const html=fs.readFileSync(sourcePath,'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const slice=(a,b)=>script.slice(script.indexOf(a),script.indexOf(b));
const math=slice('const clamp =','const cleanupController');
const drawing=slice('function bladeShape','function hpAt');
const parry=slice('function parryCountAt','function render(t)');
let render=slice('function render(t)','/* Optional synthesized Foley');
render=render.slice(0,render.indexOf(' const soul=soulsAt'))+'\n renderDamage(t);\n}\n';
render=render.replace(' renderDamage(t);',' renderSamuraiVariant(t,p);\n renderDamage(t);');
render=render.replace('bx=0;by=0;br=0;sx=0;sy=0;pr=0;','bx=0;by=0;br=0;sx=0;sy=0;pr=0;bossTravel=0;');
render=render.replace('let echo=0;','let echo=0,bossTravel=0,playerHitX=0,playerHitY=0,playerHitR=0;');
render=render.replace('bx-=lunge*18*scale;br-=lunge*.42;','bossTravel-=lunge*18*scale;br-=lunge*.42;');
render=render.replace('px+=z.x;py+=z.y;pr+=z.r;playerFlare','playerHitX+=z.x;playerHitY+=z.y;playerHitR+=z.r;playerFlare');
render=render.replace('dom.bossVisual.style.transform=',"dom.bossPosition.style.transform=`translateX(${bossTravel.toFixed(2)}px)`;\n dom.playerHit.style.transform=state.shake?`translate(${playerHitX.toFixed(2)}px,${playerHitY.toFixed(2)}px) rotate(${playerHitR.toFixed(2)}deg)`:'none';\n dom.bossVisual.style.transform=");
render=render.replaceAll("'is-burst'","'samurai-is-burst'");
const frames=['portrait.webp','eye-closed.webp','eye-open.webp','zan-full.png','zan-split.png','swallow-title.png'];
const manifest={reference:sourcePath,sha256:crypto.createHash('sha256').update(html).digest('hex'),frames:[]};
fs.mkdirSync('public/assets/samurai-fx',{recursive:true});let i=0;
for(const tag of html.matchAll(/<img[^>]+>/g)){
 const raw=tag[0].match(/src="([^"]+)"/)?.[1];if(!raw?.startsWith('data:'))continue;
 const bytes=Buffer.from(raw.split(',')[1],'base64'),name=frames[i++];if(name==='portrait.webp'||name.startsWith('eye-'))continue;
 fs.writeFileSync('public/assets/samurai-fx/'+name,bytes);
 manifest.frames.push({file:name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),source:name.startsWith('eye')?'samurai-eye.png':name.startsWith('zan')?'samurai-skill1.png':'samurai-skill2.png'});
}
manifest.eye={url:'/assets/samurai-eye.png',closed:'upper half',open:'lower half',sha256:crypto.createHash('sha256').update(fs.readFileSync('public/assets/samurai-eye.png')).digest('hex')};
fs.writeFileSync('public/assets/samurai-fx/manifest.json',JSON.stringify(manifest,null,2)+'\n');
const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
const names=['shadow-silhouette','portrait-flare','guard-tag','guard-sub','floating-gain','scene-dimmer','focus-aura','vfx','damage-layer','damage-number','eye-cutin','eye-art','eye-open','eye-flare','eye-sweep','eye-caption','eye-rule','eye-pupil','swallow-title-icon','screen-flash','screen-slice','zan-overlay','zan-mark','zan-full','zan-split','zan-slash'];
let migrated='/* fixed_v4 FX declarations, scoped to Samurai. */\n';
for(const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
 const selectors=rule[1].trim().split(',').filter(s=>names.some(n=>new RegExp('\\.'+n+'(?![\\w-])').test(s)));if(!selectors.length)continue;
 migrated+=selectors.map(s=>'.samurai-fx-owner '+s.trim().replace(/\.([\w-]+)/g,(_,n)=>'.samurai-'+n)).join(',')+'{'+rule[2]+'}\n';
}
fs.writeFileSync('public/samurai-presentation.css',migrated+fs.readFileSync('scripts/samurai-layout.css','utf8'));
fs.writeFileSync('public/samurai-prototype-fx.js','// Drawing and motion transplanted from fixed_v4; see scripts/migrate-samurai-source.mjs.\nfunction createSamuraiPrototypeRenderer(root,playerCard,bossCard,plan,context){\n'+math+fs.readFileSync('scripts/samurai-renderer-setup.txt','utf8')+drawing+parry+render+'\nreturn {render,measure,reduceFlash(){dom.screenFlash.style.opacity=String(Number(dom.screenFlash.style.opacity)*.25);dom.eyeFlare.style.opacity=String(Number(dom.eyeFlare.style.opacity)*.25);},dispose(){state.disposed=true;ctx.clearRect(0,0,canvas.width,canvas.height);world.remove();},geometry};\n}\n');
