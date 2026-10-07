import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
fs.mkdirSync('artifacts/phase81-production',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),cdp=await page.context().newCDPSession(page);
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto(pathToFileURL(process.cwd()+'/public/assets/temp/sage_equation_mock.html').href);
 await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing',transferMode:'ReturnAsStream'});
 await page.click('#equationOnly');await page.waitForTimeout(10500);
 const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await done;
 let trace='';for(;;){const part=await cdp.send('IO.read',{handle:stream});trace+=part.data;if(part.eof)break;}await cdp.send('IO.close',{handle:stream});
 fs.writeFileSync('artifacts/phase81-production/reference-trace.json',trace);
 const events=JSON.parse(trace).traceEvents,summary={};
 for(const name of ['Layout','UpdateLayoutTree','Paint','RasterTask','FunctionCall','TimerFire','FireAnimationFrame','MinorGC','MajorGC','Decode Image']){
  const selected=events.filter(e=>e.name===name&&e.dur);summary[name]={count:selected.length,totalMs:selected.reduce((n,e)=>n+e.dur/1000,0),maxMs:Math.max(0,...selected.map(e=>e.dur/1000))};
 }
 fs.writeFileSync('artifacts/phase81-production/reference-performance.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{await browser.close();}
