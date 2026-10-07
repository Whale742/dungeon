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
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
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
      const preserved = log.scrollTop;
      log.scrollTop = log.scrollHeight;
      window.testLogs.push({id:'test-41',time:'12:32',text:'最新日誌'});
      renderRecentBattleLogs(log, window.testLogs);
      return {top:rect.top,bottom:rect.bottom,viewport:innerHeight,count:log.children.length,contentHeight:log.clientHeight,scrollHeight:log.scrollHeight,bottomGap,preserved,newBottomGap:log.scrollHeight-log.clientHeight-log.scrollTop,overflow:style.overflowY,clamp:lineStyle.webkitLineClamp,firstOpacity:getComputedStyle(log.firstElementChild).opacity,latestOpacities:Array.from(log.children).slice(-4).map(n=>n.style.getPropertyValue('--log-opacity'))};
    });
    assert.equal(result.top,10); assert.equal(result.bottom,viewport.height-10);
    assert.equal(result.count,42); assert(result.contentHeight>viewport.height-130);
    assert(result.scrollHeight>result.contentHeight); assert(result.bottomGap<2); assert.equal(result.preserved,80);
    assert(result.newBottomGap<2); assert.equal(result.overflow,'auto'); assert.equal(result.clamp,'none'); assert.equal(result.firstOpacity,'0.15');
    assert.deepEqual(result.latestOpacities,['0.8','1','1','1']);
    await page.screenshot({path:`${output}/${viewport.width}.png`});
    report.push({viewport,...result}); await page.close();
  }
  console.log(JSON.stringify(report,null,2));
} finally {
  fs.writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
  await browser.close();
}
