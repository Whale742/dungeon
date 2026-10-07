import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report={errors:[]};
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await page.goto('http://localhost:3011/presentation-lab.html');await page.waitForFunction(()=>window.labInitialized);
  report.basics=await page.evaluate(()=>Array.from(document.querySelectorAll('#labSceneSelect option[value^="basic_"]')).map(o=>({id:o.value,label:o.textContent,group:o.parentElement.label,first:o.parentElement.firstElementChild===o})));
  assert.equal(report.basics.length,12);assert.equal(new Set(report.basics.map(o=>o.group)).size,12);
  assert(report.basics.every(o=>o.first&&o.label.startsWith('普攻・')));
  assert(report.basics.some(o=>o.id==='basic_stargazer'&&o.group==='觀星者'&&o.label==='普攻・星光引導'));
  report.dreamLabels=await page.evaluate(()=>Array.from(document.querySelectorAll('#labSceneSelect option[value^="p8_false_"],#labSceneSelect option[value^="p8_butterfly_"]')).map(o=>({label:o.textContent,group:o.parentElement.label})));
  assert(report.dreamLabels.every(o=>o.group==='織夢術士'&&!o.label.includes('虛構歷史')&&!o.label.includes('惡夢真傷')));
  assert(report.dreamLabels.some(o=>o.label==='偽造殘夢｜深淵墜夢'));
  assert(report.dreamLabels.some(o=>o.label==='清醒夢・薛丁格之蝶｜美夢化生'));
  await page.evaluate(()=>{labState.speed=2;});
  await page.selectOption('#labSceneSelect','basic_stargazer');
  await page.waitForSelector('#stargazerBasicAim');
  await page.screenshot({path:'artifacts/stargazer-transplant/basic-menu.png'});
  await page.waitForFunction(()=>!document.querySelector('.skill-production-stage'));
  assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{fs.mkdirSync('artifacts/lab-menu',{recursive:true});fs.writeFileSync('artifacts/lab-menu/report.json',JSON.stringify(report,null,2));await browser.close();}
