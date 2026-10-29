/**
 * Unified Dark-Gold Fantasy GUI Skin System (gui-skin.js)
 * Provides:
 * - Runtime Nine-Slice + Fixed-Ratio 4-Edge Diamond Ornament upgrades for main panels
 * - Interactive 4-State Button, Checkbox, Radio, Toggle, Tab & HUD primitives
 * - Full GUI Skin Verification & Asset Atlas Showcase (?guiSkinPreview=1 or toggle button)
 */
(function initGuiSkinSystem() {
  const MANIFEST_URL = '/assets/ui/gui-skin/manifest.json';

  function enhanceMainPanels() {
    const selectors = [
      '.kraft-paper',
      '.recruit-card',
      '.lobby-menu-card',
      '.server-list-card',
      '.team-card',
      '.role-command-panel',
      '.lobby-panel',
      '.modal-card',
      '.map-story',
      '.map-side',
      '.event-card:not(.is-borderless-event)',
      '.abyss-dialogue-card',
      '.checkpoint-card',
      '.end-card',
      '.player-action-card',
      '.battle-log-card',
      '.gui-skin-panel',
      '.floating-item-tooltip.visible',
      '.floating-status-tooltip.visible',
      '.battle-skill-tooltip.visible'
    ].join(', ');
    const panels = document.querySelectorAll(selectors);
    panels.forEach((panel) => {
      if (!panel.querySelector(':scope > .gui-skin-panel-rail-gems')) {
        const railGems = document.createElement('div');
        railGems.className = 'gui-skin-panel-rail-gems';
        railGems.setAttribute('aria-hidden', 'true');
        panel.appendChild(railGems);
      }
    });
  }

  function buildShowcaseHTML() {
    return `
      <div class="gui-showcase-container">
        <header class="gui-showcase-header">
          <div>
            <h1>暗金幻想 GUI 皮肤系统 · 全量切图与九宫格验收台</h1>
            <p>基于 temp/ 下全部 9 张源图精确切分 · 177 个独立透明 PNG 资产 · 零边缘拉伸九宫格 · 四态按钮矩阵</p>
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <button type="button" class="gui-skin-btn gui-skin-btn--gold" id="guiSkinCloseBtn">返回游戏主界面</button>
          </div>
        </header>

        <!-- 1. Nine-Slice Multi-Ratio Verification -->
        <section class="gui-skin-panel gui-showcase-section">
          <div class="gui-skin-panel-rail-gems" aria-hidden="true"></div>
          <h2 class="gui-showcase-section-title">
            <span>1. 九宫格主面板（Nine-Slice）多宽高比零变形检验</span>
            <small style="color:#d4b475;">四角金属雕花 + 上下左右四枚中心菱形宝石均保持 1:1 原始比例</small>
          </h2>
          <div class="gui-nineslice-demo-grid">
            <div class="gui-skin-panel gui-nineslice-box gui-nineslice-box--sm">
              <div class="gui-skin-panel-rail-gems" aria-hidden="true"></div>
              <h3 style="margin:0 0 8px 0;">小尺寸弹窗 (320×185)</h3>
              <p style="margin:0;font-size:0.88rem;line-height:1.45;">
                四角尖刺雕花与四边中心菱形纹饰完全不随容器缩小而挤压变形，内容位于安全内边距内。
              </p>
              <div style="margin-top:12px;display:flex;justify-content:flex-end;">
                <button type="button" class="gui-skin-btn gui-skin-btn--gold" style="min-height:38px;padding:6px 18px!important;font-size:0.82rem;">确认</button>
              </div>
            </div>

            <div class="gui-skin-panel gui-nineslice-box gui-nineslice-box--md">
              <div class="gui-skin-panel-rail-gems" aria-hidden="true"></div>
              <h3 style="margin:0 0 8px 0;">中尺寸详情面板 (560×250)</h3>
              <p style="margin:0;font-size:0.9rem;line-height:1.5;">
                通过将 <code>main-panel-9slice.png</code> 的直轨与 <code>main-panel-gem-top/bottom/left/right.png</code> 分离合成，彻底解决了传统直接做 CSS border-image 会把上下左右中心宝石拉宽拉扁的问题。
              </p>
              <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
                <button type="button" class="gui-skin-btn">装备详情</button>
                <button type="button" class="gui-skin-btn gui-skin-btn--slate">取消返回</button>
              </div>
            </div>

            <div class="gui-skin-panel gui-nineslice-box gui-nineslice-box--lg">
              <div class="gui-skin-panel-rail-gems" aria-hidden="true"></div>
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                <h3 style="margin:0;">大尺寸主窗口容器 (100% 宽 × 290)</h3>
                <img src="/assets/ui/gui-skin/decorative/plaque-brass-nameplate.png" alt="Brass Nameplate" style="height:48px;object-fit:contain;" />
              </div>
              <img src="/assets/ui/gui-skin/ornaments/ornament-divider-slim-diamond.png" alt="Divider" style="width:100%;max-height:24px;object-fit:contain;margin:10px 0;" />
              <p style="margin:0;font-size:0.94rem;line-height:1.6;">
                在超宽横向拉伸场景下，仅平滑延展四边直轨与暗金石板内胆纹理，四角星芒支架与四边中心菱形宝石锚定在 <code>50%</code> 中点且严守 <code>1:1</code> 比例。
              </p>
              <div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
                <button type="button" class="gui-skin-btn gui-skin-btn--gold">进入深渊探索</button>
                <button type="button" class="gui-skin-btn">队伍编成</button>
                <button type="button" class="gui-skin-btn gui-skin-btn--danger">解散房间</button>
                <button type="button" class="gui-skin-btn" disabled>未解锁章节 (Disabled)</button>
              </div>
            </div>
          </div>
        </section>

        <!-- 2. 4x4 Button Matrix Verification -->
        <section class="gui-skin-panel gui-showcase-section">
          <div class="gui-skin-panel-rail-gems" aria-hidden="true"></div>
          <h2 class="gui-showcase-section-title">
            <span>2. 四色 × 四态按钮矩阵（gui-core-buttons.png · 16 切图全状态）</span>
            <small style="color:#d4b475;">Normal / Hover (保留柔和外发光) / Pressed (下沉 1px) / Disabled (禁用态)</small>
          </h2>
          <div class="gui-btn-matrix">
            <button type="button" class="gui-skin-btn">苍蓝主按钮 · Normal</button>
            <button type="button" class="gui-skin-btn force-hover">苍蓝主按钮 · Hover</button>
            <button type="button" class="gui-skin-btn force-pressed">苍蓝主按钮 · Pressed</button>
            <button type="button" class="gui-skin-btn" disabled>苍蓝主按钮 · Disabled</button>

            <button type="button" class="gui-skin-btn gui-skin-btn--gold">暗金核心按钮 · Normal</button>
            <button type="button" class="gui-skin-btn gui-skin-btn--gold force-hover">暗金核心按钮 · Hover</button>
            <button type="button" class="gui-skin-btn gui-skin-btn--gold force-pressed">暗金核心按钮 · Pressed</button>
            <button type="button" class="gui-skin-btn gui-skin-btn--gold" disabled>暗金核心按钮 · Disabled</button>

            <button type="button" class="gui-skin-btn gui-skin-btn--danger">猩红危险按钮 · Normal</button>
            <button type="button" class="gui-skin-btn gui-skin-btn--danger force-hover">猩红危险按钮 · Hover</button>
            <button type="button" class="gui-skin-btn gui-skin-btn--danger force-pressed">猩红危险按钮 · Pressed</button>
            <button type="button" class="gui-skin-btn gui-skin-btn--danger" disabled>猩红危险按钮 · Disabled</button>

            <button type="button" class="gui-skin-btn gui-skin-btn--slate">石板次按钮 · Normal</button>
            <button type="button" class="gui-skin-btn gui-skin-btn--slate force-hover">石板次按钮 · Hover</button>
            <button type="button" class="gui-skin-btn gui-skin-btn--slate force-pressed">石板次按钮 · Pressed</button>
            <button type="button" class="gui-skin-btn gui-skin-btn--slate" disabled>石板次按钮 · Disabled</button>
          </div>
        </section>

        <!-- 3. Form Controls & Navigation Controls -->
        <section class="gui-skin-panel gui-showcase-section">
          <div class="gui-skin-panel-rail-gems" aria-hidden="true"></div>
          <h2 class="gui-showcase-section-title">
            <span>3. 输入框、搜索框、下拉选择、页签、复选/单选/开关与滑块组件</span>
            <small style="color:#d4b475;">源自 gui-core-input-controls.png 与 gui-core-navigation-controls.png</small>
          </h2>
          <div class="gui-controls-grid">
            <div>
              <label style="display:block;margin-bottom:6px;font-size:0.85rem;">标准输入框 & 聚焦态输入框</label>
              <input type="text" class="gui-skin-input" value="深渊旅者 · 阿尔托莉雅" style="width:100%;margin-bottom:10px;" />
              <input type="search" class="gui-skin-input gui-skin-search" placeholder="搜索战利品、符文或房间号..." style="width:100%;" />
            </div>
            <div>
              <label style="display:block;margin-bottom:6px;font-size:0.85rem;">下拉选择器 & 导航页签</label>
              <select class="gui-skin-select" style="width:100%;margin-bottom:10px;">
                <option>难度：深渊回响 (噩梦 III)</option>
                <option>难度：古堡巡礼 (普通)</option>
              </select>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="gui-skin-tab is-active">角色属性</button>
                <button type="button" class="gui-skin-tab">天赋命座</button>
                <button type="button" class="gui-skin-tab">圣遗物</button>
              </div>
            </div>
            <div>
              <label style="display:block;margin-bottom:8px;font-size:0.85rem;">四态复选框 / 单选框 / 拨动开关 / 进度滑块</label>
              <div class="gui-toggle-row" style="margin-bottom:10px;">
                <img class="gui-sprite-icon" src="/assets/ui/gui-skin/inputs/checkbox-unchecked.png" alt="Unchecked" style="height:34px;" />
                <img class="gui-sprite-icon" src="/assets/ui/gui-skin/inputs/checkbox-checked-gold.png" alt="Checked Gold" style="height:34px;" />
                <img class="gui-sprite-icon" src="/assets/ui/gui-skin/inputs/checkbox-disabled.png" alt="Disabled" style="height:34px;" />
                <img class="gui-sprite-icon" src="/assets/ui/gui-skin/inputs/radio-unselected.png" alt="Radio Off" style="height:34px;" />
                <img class="gui-sprite-icon" src="/assets/ui/gui-skin/inputs/radio-selected-gold.png" alt="Radio On" style="height:34px;" />
                <img class="gui-sprite-icon" src="/assets/ui/gui-skin/inputs/toggle-off-normal.png" alt="Toggle Off" style="height:34px;" />
                <img class="gui-sprite-icon" src="/assets/ui/gui-skin/inputs/toggle-on-gold.png" alt="Toggle On" style="height:34px;" />
              </div>
              <img src="/assets/ui/gui-skin/navigation/nav-slider-gold-65.png" alt="Gold Slider" style="width:100%;max-height:36px;object-fit:contain;" />
            </div>
          </div>
        </section>

        <!-- 4. Lobby Character Stage, Attribute Radar & Party Slot Cards -->
        <section class="gui-skin-panel gui-showcase-section">
          <div class="gui-skin-panel-rail-gems" aria-hidden="true"></div>
          <h2 class="gui-showcase-section-title">
            <span>4. 大厅角色展示台、六维属性面板、职业六角徽章与队伍槽位（gui-lobby-character-panels.png）</span>
            <small style="color:#d4b475;">完整保留哥特立柱展台、石质底座与准备状态条</small>
          </h2>
          <div class="gui-lobby-showcase-grid">
            <div class="gui-asset-card">
              <img src="/assets/ui/gui-skin/lobby/lobby-stage-archway.png" alt="Lobby Character Stage Archway" style="max-height:320px;" />
              <span>角色哥特拱门展示台 (lobby-stage-archway)</span>
            </div>
            <div class="gui-asset-card">
              <img src="/assets/ui/gui-skin/lobby/lobby-attributes-panel.png" alt="Lobby Attribute Radar Panel" style="max-height:320px;" />
              <span>角色属性与六维雷达面板 (lobby-attributes-panel)</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:14px;justify-content:space-between;">
              <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                <img src="/assets/ui/gui-skin/lobby/role-badge-warrior-sword.png" alt="Warrior" style="height:64px;" />
                <img src="/assets/ui/gui-skin/lobby/role-badge-mage-book.png" alt="Mage" style="height:64px;" />
                <img src="/assets/ui/gui-skin/lobby/role-badge-rogue-moon.png" alt="Rogue" style="height:64px;" />
                <img src="/assets/ui/gui-skin/lobby/role-badge-druid-leaf.png" alt="Druid" style="height:64px;" />
                <img src="/assets/ui/gui-skin/lobby/role-badge-augur-star.png" alt="Augur" style="height:64px;" />
                <img src="/assets/ui/gui-skin/lobby/role-badge-pyro-flame.png" alt="Pyro" style="height:64px;" />
              </div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
                <img src="/assets/ui/gui-skin/lobby/lobby-slot-card-leader.png" alt="Leader Slot" style="width:100%;max-height:150px;object-fit:contain;" />
                <img src="/assets/ui/gui-skin/lobby/lobby-slot-card-banner.png" alt="Banner Slot" style="width:100%;max-height:150px;object-fit:contain;" />
                <img src="/assets/ui/gui-skin/lobby/lobby-slot-card-standard.png" alt="Standard Slot" style="width:100%;max-height:150px;object-fit:contain;" />
                <img src="/assets/ui/gui-skin/lobby/lobby-slot-card-locked.png" alt="Locked Slot" style="width:100%;max-height:150px;object-fit:contain;" />
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                <img src="/assets/ui/gui-skin/lobby/lobby-ready-bar-leader.png" alt="Leader Ready Bar" style="height:48px;" />
                <img src="/assets/ui/gui-skin/lobby/lobby-ready-bar-checked.png" alt="Checked Ready Bar" style="height:48px;" />
                <img src="/assets/ui/gui-skin/lobby/lobby-badge-check-shield.png" alt="Ready Shield" style="height:52px;" />
                <img src="/assets/ui/gui-skin/lobby/lobby-badge-lock-shield.png" alt="Lock Shield" style="height:52px;" />
              </div>
            </div>
          </div>
        </section>

        <!-- 5. Combat HUD Vitals, Portraits & 5-State Skill Slots -->
        <section class="gui-skin-panel gui-showcase-section">
          <div class="gui-skin-panel-rail-gems" aria-hidden="true"></div>
          <h2 class="gui-showcase-section-title">
            <span>5. 战斗 HUD 血条/蓝条、头像框与五态技能槽（gui-combat-hud.png）</span>
            <small style="color:#d4b475;">修复内部透明孔洞 · 分离粘连血蓝条与技能槽</small>
          </h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;align-items:center;">
            <div style="display:flex;flex-direction:column;gap:10px;">
              <img src="/assets/ui/gui-skin/combat/hud-bar-hp-red.png" alt="HP Bar" style="width:100%;max-height:54px;object-fit:contain;" />
              <img src="/assets/ui/gui-skin/combat/hud-bar-mp-blue.png" alt="MP Bar" style="width:100%;max-height:54px;object-fit:contain;" />
              <img src="/assets/ui/gui-skin/combat/hud-bar-pips-3-top.png" alt="3 Pips Bar" style="height:36px;object-fit:contain;align-self:flex-start;" />
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
              <img src="/assets/ui/gui-skin/combat/hud-skill-slot-normal.png" alt="Skill Normal" style="height:84px;" title="Normal" />
              <img src="/assets/ui/gui-skin/combat/hud-skill-slot-active.png" alt="Skill Active" style="height:84px;" title="Hover / Active" />
              <img src="/assets/ui/gui-skin/combat/hud-skill-slot-cooldown.png" alt="Skill Cooldown" style="height:84px;" title="Cooldown" />
              <img src="/assets/ui/gui-skin/combat/hud-skill-slot-disabled.png" alt="Skill Disabled" style="height:84px;" title="Disabled" />
              <img src="/assets/ui/gui-skin/combat/hud-skill-slot-locked.png" alt="Skill Locked" style="height:84px;" title="Locked (Chained)" />
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
              <img src="/assets/ui/gui-skin/combat/hud-portrait-crest-heavy.png" alt="Heavy Crest Portrait" style="height:96px;" />
              <img src="/assets/ui/gui-skin/combat/hud-portrait-circle-winged.png" alt="Winged Portrait" style="height:96px;" />
              <img src="/assets/ui/gui-skin/combat/hud-portrait-shield-horned.png" alt="Horned Portrait" style="height:96px;" />
            </div>
          </div>
        </section>

        <!-- 6. Exploration Hex Map Tiles, Event Nodes & Special Decorative Banners -->
        <section class="gui-skin-panel gui-showcase-section">
          <div class="gui-skin-panel-rail-gems" aria-hidden="true"></div>
          <h2 class="gui-showcase-section-title">
            <span>6. 六角探索地图地块、10 类事件节点图标与特殊装饰横幅（gui-exploration-hex-tiles.png & gui-special-decorative-panels.png）</span>
            <small style="color:#d4b475;">包含迷雾/已探索/当前定位/高亮可达/圣殿罗盘/锁链封印 6 大状态</small>
          </h2>
          <div class="gui-hex-showcase-row" style="margin-bottom:20px;">
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/hex-tile-terrain-revealed.png" alt="Locked Dimmed Hex" style="max-height:130px;filter:brightness(0.38) saturate(0.22);opacity:0.78;" /><span>未解锁地块 (明度/饱和度调整)</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/hex-tile-terrain-revealed.png" alt="Revealed Hex" style="max-height:130px;" /><span>已揭示地形地块</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/hex-tile-terrain-current.png" alt="Current Hex" style="max-height:130px;" /><span>当前驻留地块</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/hex-tile-terrain-selectable.png" alt="Selectable Hex" style="max-height:130px;" /><span>高亮可前往地块</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/hex-tile-special-castle.png" alt="Castle Hex" style="max-height:130px;" /><span>要塞罗盘特殊格</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/slots/hex-slot-normal.png" alt="Hex Slot Normal" style="max-height:130px;" /><span>背包/商店六角格 (奇幻六角栏位)</span></div>
          </div>
          <div class="gui-node-showcase-row" style="margin-bottom:20px;">
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/map-node-mountain.png" alt="Mountain" style="height:56px;" /><span>群山</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/map-node-forest.png" alt="Forest" style="height:56px;" /><span>密林</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/map-node-ruined-keep.png" alt="Keep" style="height:56px;" /><span>古堡</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/map-node-dungeon-cave.png" alt="Cave" style="height:56px;" /><span>地牢洞窟</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/map-node-crystal-mine.png" alt="Crystal" style="height:56px;" /><span>晶矿</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/map-node-treasure-chest.png" alt="Chest" style="height:56px;" /><span>秘宝</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/map-node-campfire-rest.png" alt="Campfire" style="height:56px;" /><span>营火休整</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/map-node-boss-skull.png" alt="Boss" style="height:56px;" /><span>首领讨伐</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/map-node-abyss-portal.png" alt="Portal" style="height:56px;" /><span>深渊裂隙</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/exploration/map-node-mystery-event.png" alt="Mystery" style="height:56px;" /><span>未知奇遇</span></div>
          </div>
          <div class="gui-hex-showcase-row">
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/decorative/pedestal-boss-stone-blue.png" alt="Pedestal" style="max-height:110px;" /><span>雄狮战旗石座</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/decorative/medallion-victory-crest.png" alt="Victory Crest" style="max-height:110px;" /><span>凯旋桂冠纹章</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/decorative/emblem-boss-defeat-cracked.png" alt="Cracked Emblem" style="max-height:110px;" /><span>战损残旗纹章</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/decorative/medallion-wax-seal-ribbon.png" alt="Wax Seal" style="max-height:110px;" /><span>皇家火漆绶带章</span></div>
            <div class="gui-asset-card"><img src="/assets/ui/gui-skin/decorative/signboard-hanging-brass.png" alt="Hanging Signboard" style="max-height:110px;" /><span>悬挂式黄铜牌匾</span></div>
          </div>
        </section>
      </div>
    `;
  }

  function setupShowcaseOverlay() {
    if (document.getElementById('guiSkinShowcaseOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'guiSkinShowcaseOverlay';
    overlay.className = 'gui-skin-showcase-overlay';
    overlay.hidden = true;
    overlay.innerHTML = buildShowcaseHTML();
    document.body.appendChild(overlay);

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'guiSkinToggleFab';
    fab.className = 'gui-skin-btn gui-skin-btn--slate gui-skin-preview-fab';
    fab.textContent = 'GUI 皮肤图鉴';
    fab.title = '打开/关闭暗金 GUI 皮肤组件与九宫格验收台';
    document.body.appendChild(fab);

    const setOpen = (open) => {
      overlay.hidden = !open;
      fab.textContent = open ? '关闭皮肤图鉴' : 'GUI 皮肤图鉴';
    };

    fab.addEventListener('click', () => setOpen(overlay.hidden));
    const closeBtn = overlay.querySelector('#guiSkinCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => setOpen(false));
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('guiSkinPreview') === '1') {
      setOpen(true);
    }
  }

  function init() {
    enhanceMainPanels();
    setupShowcaseOverlay();

    // Observe dynamic DOM transitions (e.g. lobby/exploration/combat screen mounts)
    const observer = new MutationObserver(() => {
      enhanceMainPanels();
    });
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.GuiSkinSystem = {
    manifestUrl: MANIFEST_URL,
    refreshPanels: enhanceMainPanels
  };
})();
