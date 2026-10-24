// Phase 2 owner. Uses the existing Presentation Root and cancellable story helpers.
const EXPLORATION_TIMING = Object.freeze({
  floorEnter: 600, floorHold: 1400, floorExit: 600,
  sectionEnter: 600, narrativeDelay: 400, narrativeHold: 1100,
  promptEnter: 250, choiceEnter: 350, choiceStagger: 90,
  character: 35, comma: 140, sentence: 280, newline: 380, paragraph: 600
});

function routePresentationKey() {
  return roomState ? 'ROUTE_' + roomState.routePresentationId : null;
}

function setRouteChoicesHidden(hidden) {
  for (const element of [elements.routeStatusText, elements.hexMapContainer, elements.routeOptionsGrid,
    elements.routeVotersStatusList, elements.routeTimerBar, document.getElementById('routeDiffPercent')?.closest('.buff-highlight')].filter(Boolean)) {
    if (hidden) element.classList.add('hidden');
    else element.classList.remove('hidden');
  }
}

async function playExplorationPresentation(presentationId, floor, paragraphs) {
  if (typeof window !== 'undefined' && typeof window.forceCloseAllModals === 'function') {
    window.forceCloseAllModals();
  }
  const controller = new AbortController();
  controller.presentationId = presentationId;
  routePresentationController = controller;
  const { signal } = controller;
  const view = elements.views.route;
  const overlay = elements.floorIntroOverlay;
  const app = document.getElementById('app');
  const previousInert = app.inert;
  const chat = elements.floatingChatContainer;
  const previousChatInert = chat.inert;
  let completed = false;
  let cleanedUp = false;

  const handleFloorClick = () => {
    const isLeader = roomState?.leaderId ? roomState.leaderId === myId : true;
    if (!isLeader) return;
    if (typeof socket !== 'undefined' && socket && typeof socket.emit === 'function') {
      socket.emit('narrative:accelerate');
    }
    if (typeof accelerateNarrative === 'function') accelerateNarrative();
  };
  if (overlay) overlay.addEventListener('click', handleFloorClick);

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.classList.remove('exit');
      overlay.removeEventListener('click', handleFloorClick);
    }
    document.body.classList.remove('presentation-floor-active');
    view.classList.remove('exploration-enter', 'is-narrating', 'is-settling');
    elements.routeOptionsGrid.classList.remove('exploration-choices-enter');
    elements.routeStatusText.classList.remove('exploration-prompt-enter');
    app.inert = previousInert;
    chat.inert = previousChatInert;
    if (!completed) {
      gateDestinationView('route');
      setRouteChoicesHidden(true);
      elements.routeAtmosphereText.replaceChildren();
    }
    if (routePresentationController === controller) {
      routePresentationController = null;
      presentationManager.setBlocking(false);
    }
  };
  signal.addEventListener('abort', cleanup, { once: true });

  try {
    if (!paragraphs.length) throw new Error('Missing exploration narrative');
    presentationManager.setBlocking(true);
    app.inert = true;
    chat.inert = true;
    gateDestinationView('route');
    setRouteChoicesHidden(true);
    elements.routeAtmosphereText.replaceChildren();
    elements.floorIntroNumber.textContent = '第 ' + floor + ' 層';
    elements.floorIntroTitle.textContent = '迷霧分歧點';
    document.body.classList.add('presentation-floor-active');
    overlay.classList.remove('exit', 'hidden');
    playSound('walk',{signal,instance:'floor-walk-'+presentationId});
    await waitForPrologue(EXPLORATION_TIMING.floorEnter + EXPLORATION_TIMING.floorHold, signal);
    overlay.classList.add('exit');
    await waitForPrologue(EXPLORATION_TIMING.floorExit, signal);
    overlay.classList.add('hidden');
    document.body.classList.remove('presentation-floor-active');

    if (roomState.floorRevival?.results?.length) {
      await playFloorRevivalPresentation(roomState.floorRevival, { signal });
      // Floor revival exits before exploration enters; keep the same route owner.
      presentationManager.setBlocking(true);
      app.inert = true; chat.inert = true;
    }
    view.classList.add('exploration-enter', 'is-narrating');
    revealDestinationView('route');
    await waitForPrologue(EXPLORATION_TIMING.sectionEnter, signal);
    await waitForPrologue(EXPLORATION_TIMING.narrativeDelay, signal);
    await typePrologueParagraphs(elements.routeAtmosphereText, paragraphs, signal, EXPLORATION_TIMING);
    await waitForPrologue(EXPLORATION_TIMING.narrativeHold, signal);

    view.classList.remove('is-narrating');
    view.classList.add('is-settling');
    await waitForPrologue(450, signal);
    elements.routeStatusText.classList.add('exploration-prompt-enter');
    elements.routeStatusText.classList.remove('hidden');
    document.getElementById('routeDiffPercent')?.closest('.buff-highlight')?.classList.remove('hidden');
    await waitForPrologue(EXPLORATION_TIMING.promptEnter, signal);
    if (elements.hexMapContainer) {
      elements.hexMapContainer.classList.remove('hidden');
      const canvas = elements.hexMapContainer.querySelector('.abyss-map-canvas');
      if (canvas) {
        updateHexMapCamera(canvas, roomState?.currentHex?.col ?? 0, true);
      }
    }
    elements.routeOptionsGrid.classList.add('exploration-choices-enter');
    elements.routeOptionsGrid.classList.remove('hidden');
    const count = (roomState.currentRoutes || []).length;
    await waitForPrologue(EXPLORATION_TIMING.choiceEnter + Math.max(0, count - 1) * EXPLORATION_TIMING.choiceStagger, signal);
    elements.routeVotersStatusList.classList.remove('hidden');
    elements.routeTimerBar.classList.remove('hidden');
    completed = true;
    routeInteractionReadyKey = 'ROUTE_' + presentationId;
  } catch (error) {
    if (error.name !== 'AbortError') console.error('[Presentation:exploration]', error);
  } finally {
    signal.removeEventListener('abort', cleanup);
    cleanup();
  }
  if (completed && !signal.aborted && roomState.state === 'CHOOSING_ROUTE' &&
      roomState.routePresentationId === presentationId) {
    // One ACK covers cinematic exit, narrative reading and choice entry.
    socket.emit('route:interaction_ready', { presentationId });
  }
}

let pendingHexVoteId = null;
let pendingHexVoteKey = null;
let lastHexMapCameraScrollLeft = null;
let lastHexMapCurrentCol = null;
let hexMapResizeObserver = null;

function updateHexMapCamera(canvas, currentCol, isSmooth = true) {
  if (!canvas) return;
  const board = canvas.querySelector('.hex-grid-board');
  if (!board) return;

  const canvasWidth = canvas.clientWidth;
  const boardWidth = board.scrollWidth;
  const maxScroll = Math.max(0, boardWidth - canvasWidth);
  if (maxScroll <= 0) {
    canvas.scrollLeft = 0;
    lastHexMapCameraScrollLeft = 0;
    return;
  }

  if (currentCol === 0 || (lastHexMapCurrentCol !== null && currentCol < lastHexMapCurrentCol)) {
    canvas.scrollLeft = 0;
    lastHexMapCameraScrollLeft = 0;
    lastHexMapCurrentCol = currentCol;
    return;
  }

  const currentCell = board.querySelector('.hex-cell.hex-current');
  const selectableCells = board.querySelectorAll('.hex-cell.hex-selectable');
  const boardRect = board.getBoundingClientRect();

  let targetFocusX = null;
  if (currentCell && boardRect.width > 0) {
    const curRect = currentCell.getBoundingClientRect();
    const curCenterX = curRect.left - boardRect.left + curRect.width / 2;

    if (selectableCells.length > 0) {
      let maxSelectX = -Infinity;
      selectableCells.forEach(cell => {
        const r = cell.getBoundingClientRect();
        const cx = r.left - boardRect.left + r.width / 2;
        if (cx > maxSelectX) maxSelectX = cx;
      });
      targetFocusX = curCenterX * 0.35 + maxSelectX * 0.65;
    } else {
      targetFocusX = curCenterX;
    }
  }

  if (targetFocusX == null || isNaN(targetFocusX) || targetFocusX <= 0) {
    const hexW = 68;
    const paddingLeft = 24;
    const focusCol = Math.min(9, (currentCol ?? 0) + 0.6);
    targetFocusX = paddingLeft + (focusCol + 0.5) * hexW;
  }

  const desiredScrollLeft = targetFocusX - canvasWidth / 2;
  const targetScroll = Math.max(0, Math.min(maxScroll, Math.round(desiredScrollLeft)));

  if (isSmooth && typeof canvas.scrollTo === 'function') {
    canvas.scrollTo({ left: targetScroll, behavior: 'smooth' });
  } else {
    canvas.scrollLeft = targetScroll;
  }
  lastHexMapCameraScrollLeft = targetScroll;
  lastHexMapCurrentCol = currentCol;
}

function buildHexRouteArrowHtml(currentCol, currentRow, targetNode, centerRow) {
  if (!targetNode) return '';
  if (targetNode.col === currentCol && targetNode.row === currentRow) return '';

  const hexW = 70;
  const hexH = 80;
  const startDist = Math.abs(currentRow - centerRow);
  const endDist = Math.abs(targetNode.row - centerRow);

  const allMapNodes = [];
  if (Array.isArray(roomState?.hexMap)) {
    for (const c of roomState.hexMap) for (const n of (c || [])) if (n) allMapNodes.push(n);
  }
  const rowNodes1 = allMapNodes.filter(n => n.row === currentRow);
  const k1 = rowNodes1.findIndex(n => n.col === currentCol && n.row === currentRow);
  const cx1 = (startDist * 0.5 + (k1 >= 0 ? k1 : 0) + 0.5) * hexW;
  const cy1 = (0.75 * currentRow + 0.5) * hexH;

  const rowNodes2 = allMapNodes.filter(n => n.row === targetNode.row);
  const k2 = rowNodes2.findIndex(n => n.id === targetNode.id || (n.col === targetNode.col && n.row === targetNode.row));
  const cx2 = (endDist * 0.5 + (k2 >= 0 ? k2 : 0) + 0.5) * hexW;
  const cy2 = (0.75 * targetNode.row + 0.5) * hexH;

  const dxFull = cx2 - cx1;
  const dyFull = cy2 - cy1;
  const x1 = cx1 + dxFull * 0.14;
  const y1 = cy1 + dyFull * 0.14;
  const x2 = cx1 + dxFull * 0.84;
  const y2 = cy1 + dyFull * 0.84;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const chordLen = Math.max(24, Math.hypot(dx, dy));
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  // 若向右平移（同列 row 不變），使用手繪風格直線箭頭
  if (targetNode.row === currentRow) {
    return '<div class="hex-route-arrow-layer">' +
      '<div class="hex-route-arrow hex-arrow-straight" ' +
        'data-from="' + currentCol + ',' + currentRow + '" ' +
        'data-to="' + targetNode.col + ',' + targetNode.row + '" ' +
        'data-direction="straight" ' +
        'style="left:' + x1.toFixed(1) + 'px;top:' + y1.toFixed(1) + 'px;width:' + chordLen.toFixed(1) + 'px;transform:translateY(-50%) rotate(' + angleDeg.toFixed(2) + 'deg);">' +
        '<svg class="hex-straight-arrow-svg" viewBox="0 0 160 48" preserveAspectRatio="none" aria-hidden="true">' +
          '<path class="hex-sketch-stroke-main" d="M 4 24.5 Q 44 22.2, 84 24.3 T 136 23.8" />' +
          '<path class="hex-sketch-stroke-sub" d="M 8 26.2 Q 54 24.6, 96 25.8 T 134 25.4" />' +
          '<path class="hex-sketch-head-fill" d="M 122 10 L 155 24 L 121 38 L 128 24 Z" />' +
          '<path class="hex-sketch-head-outline" d="M 120 12.5 L 156 24.4 L 122 36.5 L 127 24.2 Z" />' +
        '</svg>' +
      '</div>' +
    '</div>';
  }

  // 若向右上或右下移動，使用去背手繪弧線箭頭圖片（向右下時上下翻轉 scaleY(-1)）
  const isFlipDown = targetNode.row > currentRow;
  const direction = isFlipDown ? 'down' : 'up';
  const imgW = chordLen / 0.88;
  const imgH = imgW * (380 / 720);
  const anchorX = 0.06 * imgW;
  const anchorY = 0.88 * imgH;

  return '<div class="hex-route-arrow-layer">' +
    '<div class="hex-route-arrow hex-arrow-curved ' + (isFlipDown ? 'hex-arrow-flip-y' : 'hex-arrow-normal-y') + '" ' +
      'data-from="' + currentCol + ',' + currentRow + '" ' +
      'data-to="' + targetNode.col + ',' + targetNode.row + '" ' +
      'data-direction="' + direction + '" ' +
      'style="left:' + (x1 - anchorX).toFixed(1) + 'px;top:' + (y1 - anchorY).toFixed(1) + 'px;width:' + imgW.toFixed(1) + 'px;height:' + imgH.toFixed(1) + 'px;transform-origin:6% 88%;transform:rotate(' + angleDeg.toFixed(2) + 'deg) scaleY(' + (isFlipDown ? -1 : 1) + ');">' +
      '<img class="hex-curved-arrow-img" src="/assets/ui/exploration/hex-arrow-curved.png" alt="" draggable="false" />' +
    '</div>' +
  '</div>';
}

function renderHexGridMap(me, enabled, myVoteId) {
  const container = elements.hexMapContainer;
  if (!container) return;
  const hexMap = roomState?.hexMap;
  if (!Array.isArray(hexMap) || !hexMap.length) return;

  const key = routePresentationKey();
  if (pendingHexVoteKey !== key) {
    pendingHexVoteKey = key;
    pendingHexVoteId = myVoteId || null;
  } else if (!pendingHexVoteId && myVoteId) {
    pendingHexVoteId = myVoteId;
  }

  const allNodes = [];
  for (let c = 0; c < hexMap.length; c++) {
    for (const n of (hexMap[c] || [])) {
      if (n) allNodes.push(n);
    }
  }
  const maxRow = allNodes.reduce((m, n) => Math.max(m, Number(n.row) || 0), 6);
  const centerRow = maxRow >= 3 ? 3 : 1;

  const canVote = enabled && me && me.hp > 0;
  const currentCol = roomState?.currentHex?.col ?? 0;
  const currentRow = roomState?.currentHex?.row ?? centerRow;

  const activeTargetId = pendingHexVoteId || myVoteId || null;
  const selectedTargetNode = activeTargetId
    ? allNodes.find(n => n.id === activeTargetId && n.isSelectable)
    : null;

  let html = '<div class="abyss-hex-frame">' +
    '<div class="abyss-map-canvas">' +
      '<div class="hex-grid-board">';

  // 向上下延展至最高 7 層（row = 0..6，中央為 row = 3），尖頂六角形無縫交錯貼合
  for (let row = 0; row <= maxRow; row++) {
    const rowDist = Math.abs(row - centerRow);
    const isOuterRow = rowDist > 0;
    html += '<div class="hex-row' + (isOuterRow ? ' hex-row-outer' : ' hex-row-middle') + '" data-row="' + row + '" data-row-dist="' + rowDist + '" style="--row-dist:' + rowDist + ';">';

    for (let col = 0; col < hexMap.length; col++) {
      const colNodes = hexMap[col] || [];
      const node = colNodes.find(n => n.row === row);
      if (!node) continue;

      const isSelectable = Boolean(node.isSelectable);
      const isMyVote = myVoteId === node.id;
      const isPendingSelect = pendingHexVoteId === node.id;
      const votes = roomState.routeVoteCounts?.[node.id] ?? node.voteCount ?? 0;
      const colDelta = node.col - currentCol;
      const rowDelta = Math.abs(node.row - currentRow);
      const inVision = node.inVision !== undefined
        ? Boolean(node.inVision)
        : Boolean(
            node.isVisited ||
            node.isRevealed ||
            node.isCurrent ||
            isSelectable ||
            (colDelta >= 1 && colDelta <= 2 && ((node.col === 9 && colDelta === 1) || rowDelta <= colDelta))
          );

      let fogDepthClass = '';
      let fogStyle = '';
      if (!isSelectable && !node.isCurrent && !node.isVisited) {
        fogDepthClass = 'hex-fog-gradient';
        const depth = Math.max(1, colDelta >= 1 ? colDelta : 1);
        const fogOpacity = Math.max(0.06, (0.55 - (depth - 1) * 0.075)).toFixed(2);
        const fogBrightness = Math.max(0.20, (0.80 - (depth - 1) * 0.09)).toFixed(2);
        const fogBlur = Math.min(3.5, ((depth - 1) * 0.45)).toFixed(1);
        fogStyle = 'style="--col-delta:' + colDelta + '; --fog-depth:' + depth + '; --fog-opacity:' + fogOpacity + '; --fog-brightness:' + fogBrightness + '; --fog-blur:' + fogBlur + 'px;" ';
      }

      const classes = [
        'hex-cell',
        inVision ? 'hex-in-vision' : 'hex-out-of-vision',
        inVision && colDelta === 1 ? 'hex-vision-step1' : '',
        inVision && colDelta === 2 ? 'hex-vision-step2' : '',
        node.isCurrent ? 'hex-current' : '',
        node.isVisited ? 'hex-visited' : '',
        inVision && node.isRevealed ? 'hex-revealed' : 'hex-fog',
        fogDepthClass,
        inVision && node.isScouted ? 'hex-scouted' : '',
        inVision && node.col === 9 ? 'hex-end-boss' : '',
        isSelectable ? 'hex-selectable' : '',
        isPendingSelect ? 'hex-pending-select' : '',
        isMyVote ? 'my-vote' : ''
      ].filter(Boolean).join(' ');

      // 已走過的節點顯示遇到的事件圖示（全面 SVG 向量化，嚴禁使用 Emoji）
      let centerContentHtml = '';
      if (node.isVisited) {
        const iconName = (
          node.type === 'START' ? 'camp' :
          node.type === 'SHOP' ? 'shop' :
          node.type === 'CHEST' ? 'chest' :
          (node.type === 'END_ELITE' || node.type === 'BOSS' || node.type === 'ELITE') ? 'death' :
          node.type === 'EVENT' ? 'scroll' :
          'sword'
        );
        const eventSvg = '<svg class="ui-icon ui-icon--md hex-visited-svg" aria-hidden="true"><use href="#icon-' + iconName + '"></use></svg>';
        centerContentHtml = '<span class="hex-node-icon hex-visited-icon" title="已完成事件">' + eventSvg + '</span>';
      } else if (inVision && votes > 0) {
        centerContentHtml = '<span class="hex-center-vote">' + votes + '</span>';
      } else if (node.isCurrent) {
        centerContentHtml = '<span class="hex-node-icon hex-current-icon" title="當前位置"><svg class="ui-icon ui-icon--md hex-current-svg" aria-hidden="true"><use href="#icon-camp"></use></svg></span>';
      } else if (inVision && (node.isScouted || node.col === 9 || node.type === 'START')) {
        const scoutIcon = (
          node.type === 'START' ? 'camp' :
          node.col === 9 || node.type === 'BOSS' || node.type === 'END_ELITE' ? 'death' :
          node.type === 'SHOP' ? 'shop' :
          node.type === 'CHEST' ? 'chest' :
          node.type === 'EVENT' ? 'scroll' :
          node.type === 'ELITE' ? 'death' :
          ''
        );
        if (scoutIcon) {
          centerContentHtml = '<span class="hex-node-icon hex-scouted-icon" title="探索標記"><svg class="ui-icon ui-icon--md hex-scouted-svg" aria-hidden="true"><use href="#icon-' + scoutIcon + '"></use></svg></span>';
        }
      }

      html += '<button type="button" class="' + classes + '" ' + fogStyle + 'data-hex-id="' + escapeHtml(node.id) + '" ' +
        (isSelectable && canVote ? '' : 'disabled ') + '>' +
        '<svg class="hex-tile-svg" viewBox="0 0 86.6 100" preserveAspectRatio="none" aria-hidden="true">' +
          '<polygon class="hex-poly" points="43.3,1.2 85.4,25 85.4,75 43.3,98.8 1.2,75 1.2,25" />' +
        '</svg>' +
        '<span class="hex-cell-inner">' +
          centerContentHtml +
        '</span>' +
      '</button>';
    }
    html += '</div>';
  }

  // 選擇道路時顯示從所在點到所選點的箭頭提示（右上／右下使用去背弧線箭頭並支援上下翻轉，向右平移使用手繪直線箭頭）
  html += buildHexRouteArrowHtml(currentCol, currentRow, selectedTargetNode, centerRow);

  html += '</div></div>';

  // 下方確認投票控制列（先點選六角格，再按「確定投票」才算正式送出投票，不顯示幾之幾座標）
  const isAlreadyVotedSame = Boolean(myVoteId && pendingHexVoteId === myVoteId);
  const canConfirm = Boolean(canVote && pendingHexVoteId && !isAlreadyVotedSame);
  const confirmLabel = isAlreadyVotedSame
    ? '已確認投票'
    : pendingHexVoteId
      ? '確定投票 ›'
      : '請點選相鄰節點';

  html += '<div class="hex-confirm-bar">' +
    '<button type="button" id="btnConfirmHexVote" class="btn-confirm-hex-vote' + (isAlreadyVotedSame ? ' confirmed' : '') + '" ' +
      (canConfirm ? '' : 'disabled') + '>' +
      escapeHtml(confirmLabel) +
    '</button>' +
  '</div>';

  html += '</div>';
  const prevCanvas = container.querySelector('.abyss-map-canvas');
  const prevScroll = prevCanvas ? prevCanvas.scrollLeft : lastHexMapCameraScrollLeft;

  container.innerHTML = html;

  const canvas = container.querySelector('.abyss-map-canvas');
  if (canvas) {
    if (prevScroll !== null && prevScroll !== undefined) {
      canvas.scrollLeft = prevScroll;
    }

    const isColAdvance = lastHexMapCurrentCol !== null && lastHexMapCurrentCol !== currentCol;
    const shouldSmooth = isColAdvance || (lastHexMapCameraScrollLeft === null && currentCol > 0);

    requestAnimationFrame(() => {
      updateHexMapCamera(canvas, currentCol, shouldSmooth);
    });

    setTimeout(() => {
      updateHexMapCamera(canvas, currentCol, shouldSmooth);
    }, 120);

    if (typeof ResizeObserver !== 'undefined') {
      if (hexMapResizeObserver) {
        hexMapResizeObserver.disconnect();
      }
      hexMapResizeObserver = new ResizeObserver(() => {
        if (canvas.clientWidth > 40) {
          updateHexMapCamera(canvas, currentCol, false);
        }
      });
      hexMapResizeObserver.observe(canvas);
    }
  }

  if (typeof container.querySelectorAll === 'function') {
    container.querySelectorAll('.hex-cell.hex-selectable').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled || presentationManager.isBlocking || roomState.isNarrating) return;
        const hexId = btn.dataset.hexId;
        if (!hexId) return;
        playSound('select');
        pendingHexVoteId = hexId;
        renderHexGridMap(me, enabled, myVoteId);
      });
    });
    const confirmBtn = container.querySelector('#btnConfirmHexVote');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (confirmBtn.disabled || !pendingHexVoteId || presentationManager.isBlocking || roomState.isNarrating) return;
        playSound('select');
        socket.emit('route:vote', { routeId: pendingHexVoteId });
      });
    }
  }
}

function renderRouteChoice(me) {
  const key = routePresentationKey();

  if (!roomState.isNarrating) {
    routeNarrativeDoneKey = key;
    routeInteractionReadyKey = key;
    revealDestinationView('route');
    setRouteChoicesHidden(false);
    presentationManager.setBlocking(false);
    const app = document.getElementById('app');
    if (app) app.inert = false;
    const chat = elements.floatingChatContainer;
    if (chat) chat.inert = false;
    if (routePresentationController) {
      routePresentationController.abort();
      routePresentationController = null;
    }
    if (elements.floorIntroOverlay) {
      elements.floorIntroOverlay.classList.add('hidden');
      elements.floorIntroOverlay.classList.remove('exit');
    }
    document.body.classList.remove('presentation-floor-active');
    if (elements.routeAtmosphereText && !elements.routeAtmosphereText.textContent.trim()) {
      elements.routeAtmosphereText.replaceChildren();
      (roomState.routeNarrative || []).forEach(pText => {
        const p = document.createElement('p');
        p.textContent = pText;
        elements.routeAtmosphereText.appendChild(p);
      });
    }
  } else if (routeNarrativeDoneKey !== key) {
    routeNarrativeDoneKey = key;
    routeInteractionReadyKey = null;
    void playExplorationPresentation(roomState.routePresentationId, roomState.floor, roomState.routeNarrative || []);
  }

  elements.routeFloorNum.textContent = roomState.floor;
  elements.routeMainTitle.textContent = '迷霧分歧點';
  const eyebrowEl = document.getElementById('routeEyebrow');
  if (eyebrowEl) {
    eyebrowEl.textContent = `FLOOR 0${roomState.floor} / THE ANCIENT PASSAGE`;
  }
  elements.routeDiffPercent.textContent = roomState.floorDifficultyPercent ?? 0;
  const myVoteId = roomState.routeVotes?.[myId];
  const locallyReady = routeInteractionReadyKey === key;
  const enabled = locallyReady && !roomState.isNarrating && !roomState.isPaused && !presentationManager.isBlocking;
  elements.routeStatusText.textContent = myVoteId ? '你已完成投票，等待隊友抉擇。'
    : me?.hp <= 0 ? '你已陣亡，請觀看隊友抉擇。'
    : locallyReady && roomState.isNarrating ? '等待全體隊員閱讀完畢。'
    : '請在蜂巢地圖點選相鄰格，並按下「確定投票」！';
  if (elements.routeTimerText) elements.routeTimerText.textContent = '';

  renderHexGridMap(me, enabled, myVoteId);

  // 下方路線按鈕已移除顯示，僅保留空容器供舊演出流程相容
  if (elements.routeOptionsGrid) {
    elements.routeOptionsGrid.replaceChildren();
  }
  elements.routeVotersStatusList.innerHTML = (roomState.players || []).filter(p => p.hp > 0).map(p => {
    const voted = Boolean(roomState.routeVotes?.[p.id]);
    return '<span class="route-voter-pill ' + (voted ? 'voted' : 'thinking') + '">' +
      escapeHtml(p.name) + '：' + (voted ? '已投票' : '思考中') + '</span>';
  }).join('');
}
