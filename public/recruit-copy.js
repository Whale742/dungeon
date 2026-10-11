(function(global) {
  'use strict';
  // Shared by the game and the Studio catalog; CMS values are rendered as plain text.
  const fields = [
    ['subtitle', '公會英文抬頭', "ADVENTURER'S GUILD BULLETIN", '.recruit-sub-title'],
    ['title', '招募令標題', '深淵討伐招募令', '.recruit-main-title'],
    ['codeLabel', '懸賞代號標籤', '懸賞代號：', '[data-recruit-code-label]'],
    ['badge', '公會檄文副標', '王立公會最高檄文', '.recruit-badge-text'],
    ['highlight', '招募檄文', '「致所有身懷絕技之勇者：地城深淵封印震盪，古神惡靈逼近前哨要塞。公會現動員各大戰職勇士，凡揭下此令並簽署誓約者，將獲准進駐冒險大廳，組建討伐小隊！」', '.recruit-body-highlight'],
    ['description', '獎勵與備案說明', '深淵所獲稀世寶物、傳奇武器與王國賞金，皆由隊員依戰功平分。請在此以羽毛筆簽署尊名，完成公會備案。', '.recruit-body-desc'],
    ['nameLabel', '冒險者名稱欄位標籤', '請以羽毛筆簽署尊名 / 冒險者代號：', '[data-recruit-name-label]'],
    ['namePlaceholder', '名稱輸入提示', '請輸入稱號 (例: 破曉守望者)', '#inputPlayerName', 'placeholder'],
    ['avatarTip', '頭像按鈕提示', '點擊選擇或更換個人頭貼', '#btnEntryAvatar', 'title'],
    ['avatarBadgeTip', '更換頭像圖示提示', '更換頭貼', '.entry-avatar-badge', 'title'],
    ['submit', '簽署誓約按鈕', '簽署誓約 • 進入冒險大廳', '#btnSubmitRecruit span']
  ].map(([id,label,body,selector,attribute]) => ({id,label,body,selector,attribute,key:'entry.recruit.'+id}));
  let playerId = null;
  function render() {
    for (const field of fields) {
      const node = document.querySelector('#screenRecruit '+field.selector);
      if (!node) continue;
      const value = global.StudioContent?.find('story_copies',field.key)?.body ?? field.body;
      if (field.attribute) node.setAttribute(field.attribute,value);
      else node.textContent = value;
    }
    const code = document.querySelector('#screenRecruit .recruit-code');
    if (code) code.textContent = playerId || '連線中…';
  }
  global.RecruitCopy = {fields,render,setPlayerId(id) { playerId = id; render(); }};
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded',render);
    global.addEventListener('studio:content-ready',render);
  }
})(typeof window !== 'undefined' ? window : globalThis);
