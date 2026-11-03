import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { catalog } from './catalog.js';
import { validateDraft } from './validation.js';

test('status copy is editable and published text preserves live status values', () => {
  const row = catalog.story_copies.find(r => r.story_key === 'status.poison');
  assert.equal(row.title, '中毒');
  assert.equal(validateDraft({kind:'story',key:row.story_key,data:{category:'status',title:'劇毒',body:'持續受傷',paragraphs:[]}}).title, '劇毒');
  const source=fs.readFileSync(new URL('../public/js/combat/battle-renderers.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('function formatStatusDisplay('),source.indexOf('\nfunction getBuffIconUrl('));
  const context=vm.createContext({window:{StudioContent:{state:{data:{story_copies:[{story_key:'status.poison',title:'劇毒',body:'持續受傷'}]}}}}});
  const format=vm.runInContext(code+'\nformatStatusDisplay',context);
  assert.equal(format({id:'poison',label:'中毒',isDot:true,damage:5,turns:2}).fullTitle,'劇毒｜每回合 5 傷害｜剩餘 2 回合｜持續受傷');
  assert.equal(format({id:'unknown',label:'原文',value:3}).fullTitle,'原文｜3');
});
