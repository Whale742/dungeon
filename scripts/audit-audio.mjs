import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage(); await page.goto('http://localhost:3011/');
const files=fs.readdirSync('public/sound').filter(n=>n.endsWith('.mp3'));
const results=await page.evaluate(async files=>{
 const ctx=new AudioContext(); const results=[];
 for(const name of files){const res=await fetch('/sound/'+name);const buffer=await ctx.decodeAudioData(await res.arrayBuffer());const pcm=buffer.getChannelData(0),sr=buffer.sampleRate, bins=[];
 for(let i=0;i<pcm.length;i+=Math.round(sr*.05)){let sum=0,peak=0;const end=Math.min(pcm.length,i+Math.round(sr*.05));for(let j=i;j<end;j++){sum+=pcm[j]*pcm[j];peak=Math.max(peak,Math.abs(pcm[j]));}bins.push({t:+(i/sr).toFixed(2),rms:+Math.sqrt(sum/(end-i)).toFixed(5),peak:+peak.toFixed(4)});}
 const max=Math.max(...bins.map(b=>b.rms)); const active=bins.filter(b=>b.rms>max*.1); results.push({name,duration:+buffer.duration.toFixed(3),audibleStart:active[0]?.t,audibleEnd:active.at(-1)?.t,peaks:bins.toSorted((a,b)=>b.rms-a.rms).slice(0,8),bins});}
 await ctx.close();return results;
},files);
fs.mkdirSync('artifacts/audio',{recursive:true});fs.writeFileSync(process.env.AUDIO_AUDIT_OUTPUT || 'artifacts/audio/current-audit.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(({bins,...r})=>r),null,2));await browser.close();
