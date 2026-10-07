import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = [], output = 'artifacts/battle-log';
fs.mkdirSync(output, { recursive:true });
try {
  for (const viewport of [{width:1440,height:900},{width:1280,height:720},{width:390,height:844}]) {
    const page = await browser.newPage({ viewport });
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({body:'',contentType:'text/css'}));
    await page.goto('http://localhost:3011/');
    await page.waitForFunction(() => typeof renderRecentBattleLogs === 'function');
    await page.evaluate(() => {
      document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));
      document.getElementById('viewBattle').classList.add('active');
      const card = document.getElementById('battleLogCard');
      card.classList.add('is-open'); card.style.display = '';
      window.testLogs = Array.from({length:40}, (_,i) => ({id:'test-'+i,time:'12:30',type:i%2?'damage':'combat',text:`第 ${i+1} 筆完整戰鬥日誌：`+'這段技能敘述會完整換行顯示，不再限制兩行。'.repeat(4)}));
      renderRecentBattleLogs(document.getElementById('combatLogWindow'), window.testLogs);
    });
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => {
      const card = document.getElementById('battleLogCard'), log = document.getElementById('combatLogWindow');
      const rect = card.getBoundingClientRect(), style = getComputedStyle(log), lineStyle = getComputedStyle(log.firstElementChild);
      const bottomGap = log.scrollHeight - log.clientHeight - log.scrollTop;
      log.scrollTop = 80;
      window.testLogs.push({id:'test-40',time:'12:31',text:'新增日誌'});
      renderRecentBattleLogs(log, window.testLogs);
      const forcedBottomGap = log.scrollHeight-log.clientHeight-log.scrollTop;
      log.scrollTop = log.scrollHeight;
      window.testLogs.push({id:'test-41',time:'12:32',text:'最新日誌'});
      renderRecentBattleLogs(log, window.testLogs);
      return {top:rect.top,bottom:rect.bottom,viewport:innerHeight,count:log.children.length,contentHeight:log.clientHeight,scrollHeight:log.scrollHeight,bottomGap,forcedBottomGap,newBottomGap:log.scrollHeight-log.clientHeight-log.scrollTop,overflow:style.overflowY,clamp:lineStyle.webkitLineClamp,firstOpacity:Number(log.firstElementChild.style.getPropertyValue('--log-opacity')),latestOpacities:Array.from(log.children).slice(-4).map(n=>Number(n.style.getPropertyValue('--log-opacity'))),latestBlur:Array.from(log.children).slice(-3).map(n=>n.style.getPropertyValue('--log-blur'))};
    });
    assert.equal(result.top,10); assert.equal(result.bottom,viewport.height-10);
    assert.equal(result.count,42); assert(result.contentHeight>viewport.height-130);
    assert(result.scrollHeight>result.contentHeight); assert(result.bottomGap<2); assert(result.forcedBottomGap<2);
    assert(result.newBottomGap<2); assert.equal(result.overflow,'auto'); assert.equal(result.clamp,'none'); assert(result.firstOpacity<.02);
    assert(result.latestOpacities[0]<1);assert.deepEqual(result.latestOpacities.slice(-3),[1,1,1]);assert.deepEqual(result.latestBlur,['0.00px','0.00px','0.00px']);
    await page.waitForTimeout(300);
    await page.screenshot({path:`${output}/${viewport.width}.png`});
    result.sparse=[];
    for(const count of [1,3]){
      const sparse=await page.evaluate(count=>{
        const log=document.getElementById('combatLogWindow');
        renderRecentBattleLogs(log,Array.from({length:count},(_,i)=>({id:'sparse-'+i,time:'12:00',text:'短日誌 '+i})));
        const rect=log.getBoundingClientRect(),last=log.lastElementChild.getBoundingClientRect();
        return {count:log.children.length,bottomInset:rect.bottom-last.bottom,firstY:log.firstElementChild.getBoundingClientRect().top-rect.top,height:rect.height,overflow:log.scrollHeight>log.clientHeight};
      },count);
      assert.equal(sparse.count,count);assert(sparse.bottomInset<20);assert(sparse.firstY>sparse.height*.75);assert(!sparse.overflow);result.sparse.push(sparse);
    }
    result.fadeBand=await page.evaluate(()=>{
      const log=document.getElementById('combatLogWindow');renderRecentBattleLogs(log,Array.from({length:60},(_,i)=>({id:'band-'+i,time:'12:00',text:'漸層測試 '+i})));
      const rect=log.getBoundingClientRect();
      return Array.from(log.children).map(n=>({y:(n.getBoundingClientRect().top-rect.top+n.offsetHeight/2)/rect.height,opacity:Number(n.style.getPropertyValue('--log-opacity')),blur:parseFloat(n.style.getPropertyValue('--log-blur'))})).filter(n=>n.y>=0&&n.y<=1);
    });
    assert(result.fadeBand.filter(n=>n.y<=.4).every(n=>n.opacity<.02&&n.blur>=2.9));
    await page.waitForTimeout(300);await page.screenshot({path:`${output}/${viewport.width}-fade.png`});
    report.push({viewport,...result}); await page.close();
  }
  const lab=await browser.newPage({viewport:{width:1440,height:900}});
  await lab.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await lab.goto('http://localhost:3011/presentation-lab.html');await lab.waitForFunction(()=>window.labInitialized);
  await lab.evaluate(()=>playScene('p8_logs_3'));
  const labSparse=await lab.evaluate(()=>{const log=document.getElementById('p8LabLog'),bounds=log.getBoundingClientRect(),last=log.lastElementChild.getBoundingClientRect();return {count:log.children.length,bottomInset:bounds.bottom-last.bottom,mask:getComputedStyle(log,'::before').maskImage};});
  assert.equal(labSparse.count,3);assert(labSparse.bottomInset<25);assert(labSparse.mask.includes('60%'));report.push({labSparse});await lab.close();
  console.log(JSON.stringify(report.map(({fadeBand,...result})=>result),null,2));
} finally {
  fs.writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
  await browser.close();
}
