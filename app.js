const statusBadge = document.getElementById('status-badge');
const loadAny = (urls, name) => new Promise(async (resolve, reject) => {
  for (const src of urls) {
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
      return resolve();
    } catch (e) {}
  }
  reject(new Error(`${name} 失敗`));
});

(async () => {
  try {
    const jsd = 'https://' + 'cdn.jsdelivr' + '.net', gst = 'https://' + 'www.gstatic' + '.com';
    await loadAny([jsd + '/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js', 'https://' + 'unpkg' + '.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js'], '圖表');
    await loadAny([gst + '/firebasejs/10.12.2/firebase-app-compat.js', jsd + '/npm/firebase@10.12.2/firebase-app-compat.js'], 'Firebase');
    await loadAny([gst + '/firebasejs/10.12.2/firebase-firestore-compat.js', jsd + '/npm/firebase@10.12.2/firebase-firestore-compat.js'], 'Firestore');
    initApp();
  } catch (e) {
    statusBadge.style.color = '#ef5350';
    statusBadge.textContent = `❌ ${e.message}`;
  }
})();

function initApp() {
  firebase.initializeApp({
    apiKey: "AIzaSyCuVx7WNM4P6FA38p7iWHDnY4s1lz7lnRI",
    authDomain: "my-trading-chart" + ".firebaseapp.com",
    projectId: "my-trading-chart",
    storageBucket: "my-trading-chart" + ".firebasestorage.app",
    messagingSenderId: "465125050422",
    appId: "1:465125050422:web:4c2b050ab549c675767097"
  });
  const db = firebase.firestore();
  const chartsWrapper = document.getElementById('charts-wrapper');
  const chartContainer = document.getElementById('chart-container');
  const volumeContainer = document.getElementById('volume-container');
  const subIndicatorContainer = document.getElementById('sub-indicator-container');
  const resizerMainVol = document.getElementById('resizer-main-vol');
  const resizerVolSub = document.getElementById('resizer-vol-sub');
  const drawCanvas = document.getElementById('draw-canvas');
  const drawCtx = drawCanvas.getContext('2d');
  const ohlcLegend = document.getElementById('ohlc-legend');
  const volLegend = document.getElementById('vol-legend');
  const subLegend = document.getElementById('sub-legend');
  const symbolSelect = document.getElementById('symbol-select');
  const intervalSelect = document.getElementById('interval-select'), customInput = document.getElementById('custom-symbol'), searchBtn = document.getElementById('search-btn');
  const favBtn = document.getElementById('fav-btn'), manageFavBtn = document.getElementById('manage-fav-btn');
  const watchlistBackdrop = document.getElementById('watchlist-modal-backdrop');
  const watchlistModal = document.getElementById('watchlist-modal');
  const closeWlBtn = document.getElementById('close-wl-btn');
  const wlNewGroupInput = document.getElementById('wl-new-group-input');
  const wlAddGroupBtn = document.getElementById('wl-add-group-btn');
  const wlAddSymInput = document.getElementById('wl-add-sym-input');
  const wlLookupNameBtn = document.getElementById('wl-lookup-name-btn');
  const wlAddNameInput = document.getElementById('wl-add-name-input');
  const wlTargetGroupSelect = document.getElementById('wl-target-group-select');
  const wlAddItemBtn = document.getElementById('wl-add-item-btn');
  const wlLookupHint = document.getElementById('wl-lookup-hint');
  const wlGroupsContainer = document.getElementById('watchlist-groups-container');

  const colorSelect = document.getElementById('color-select'), customColorInput = document.getElementById('custom-color');
  const lineWidthSelect = document.getElementById('line-width-select');
  const drawToolSelect = document.getElementById('draw-tool-select'), drawBtn = document.getElementById('draw-btn');
  const rectRatiosInput = document.getElementById('rect-ratios');
  const deleteSelectedBtn = document.getElementById('delete-selected-btn'), manageListBtn = document.getElementById('manage-list-btn'), clearBtn = document.getElementById('clear-lines-btn');
  const drawingsPanel = document.getElementById('drawings-panel'), closePanelBtn = document.getElementById('close-panel-btn');
  const drawingsListEl = document.getElementById('drawings-list'), delCheckedBtn = document.getElementById('del-checked-btn');
  const toggleMa = document.getElementById('toggle-ma'), toggleBb = document.getElementById('toggle-bb'), toggleDeduct = document.getElementById('toggle-deduct');
  const textModalBackdrop = document.getElementById('text-modal-backdrop');
  const textModalTitle = document.getElementById('text-modal-title');
  const noteTextarea = document.getElementById('note-textarea');
  const noteCancelBtn = document.getElementById('note-cancel-btn');
  const noteConfirmBtn = document.getElementById('note-confirm-btn');

  // ===== 自訂分類族群、排序、命名自選名單 =====
  const DEFAULT_WATCHLIST_GROUPS = [
    {
      id: 'grp_us_giants',
      name: '🇺🇸 美國巨頭',
      items: [
        { symbol: 'MSFT', label: '微軟 Microsoft' },
        { symbol: 'AAPL', label: '蘋果 Apple' },
        { symbol: 'NVDA', label: '輝達 NVIDIA' },
        { symbol: 'GOOGL', label: 'Google Alphabet' },
        { symbol: 'AMZN', label: '亞馬遜 Amazon' },
        { symbol: 'META', label: 'Meta Platforms' },
        { symbol: 'ORCL', label: '甲骨文 Oracle' },
        { symbol: 'INTC', label: '英特爾 Intel' },
        { symbol: 'TSLA', label: '特斯拉 Tesla' },
        { symbol: 'SPCX', label: 'SpaceX' },
        { symbol: 'TSM', label: '台積電 ADR' },
        { symbol: 'MU', label: '美光 Micron' },
        { symbol: 'AMD', label: '超微 AMD' },
        { symbol: 'ANT', label: 'Anthropic' }
      ]
    }
  ];
  const WL_LOCAL_KEY = 'market_watchlist_groups_v1';
  let watchlistGroups = [];
  let watchlistInitialized = false;
  let lookupSeq = 0;

  const cloneDefaultWatchlist = () => JSON.parse(JSON.stringify(DEFAULT_WATCHLIST_GROUPS));
  const normalizeSymbolCode = raw => {
    let s = String(raw || '').trim().toUpperCase();
    if (/^\d{4,6}$/.test(s)) s += '.TW';
    return s;
  };

  async function autoPreviewSymbolName(forceRefresh = false) {
    if (!wlAddSymInput || !wlAddNameInput) return '';
    const raw = wlAddSymInput.value.trim();
    if (!raw) {
      if (wlLookupHint) wlLookupHint.textContent = '';
      return '';
    }
    const seq = ++lookupSeq;
    const normSym = normalizeSymbolCode(raw);
    if (forceRefresh) {
      delete window.MarketAPI.nameCache[normSym];
      delete window.MarketAPI.nameCache[raw.toUpperCase()];
    }
    if (wlLookupHint) wlLookupHint.textContent = `⏳ 正在查詢 ${normSym} 名稱...`;

    const foundName = await window.MarketAPI.lookupSymbolName(raw, symbolSelect, favMap);
    if (seq !== lookupSeq) return foundName;

    if (foundName) {
      wlAddNameInput.value = foundName;
      if (wlLookupHint) {
        wlLookupHint.textContent = `✅ 查詢結果：${foundName}（${normSym}）— 不改名可直接按「加入自選」，或自行修改上方名稱後再加入`;
      }
    } else {
      if (wlLookupHint) {
        wlLookupHint.textContent = `⚠️ 查無「${normSym}」名稱，可手動輸入顯示名稱後再按「加入自選」`;
      }
    }
    return foundName;
  }

  function getFlatFavMap() {
    const map = {};
    watchlistGroups.forEach(g => {
      (g.items || []).forEach(it => {
        if (it.symbol) map[it.symbol] = it.label || it.symbol;
      });
    });
    return map;
  }

  function findWatchlistItem(symbol) {
    const target = normalizeSymbolCode(symbol);
    for (let gIdx = 0; gIdx < watchlistGroups.length; gIdx++) {
      const items = watchlistGroups[gIdx].items || [];
      const iIdx = items.findIndex(it => normalizeSymbolCode(it.symbol) === target);
      if (iIdx !== -1) {
        return { gIdx, iIdx, group: watchlistGroups[gIdx], item: items[iIdx] };
      }
    }
    return null;
  }

  function saveLocalWatchlist() {
    try {
      localStorage.setItem(WL_LOCAL_KEY, JSON.stringify(watchlistGroups));
    } catch (e) {}
  }

  async function saveWatchlistGroups() {
    favMap = getFlatFavMap();
    saveLocalWatchlist();
    renderWatchlistDropdown();
    if (watchlistBackdrop?.classList.contains('open')) {
      renderWatchlistManagerModal();
    }
    try {
      await db.collection('user_settings').doc('watchlist_groups_v1').set({
        groups: watchlistGroups,
        updatedAt: Date.now()
      }, { merge: true });
    } catch (e) {
      console.warn('同步自選分類失敗:', e);
    }
  }

  function updateFavButtonState() {
    if (!favBtn) return;
    const found = findWatchlistItem(currentSymbol);
    if (found) {
      favBtn.classList.add('active');
      favBtn.textContent = '★ 已自選';
    } else {
      favBtn.classList.remove('active');
      favBtn.textContent = '⭐ 自選';
    }
  }

  function renderWatchlistDropdown() {
    const prevVal = symbolSelect.value;
    const legacyFavGroup = document.getElementById('fav-group');
    if (legacyFavGroup) legacyFavGroup.remove();

    symbolSelect.querySelectorAll('optgroup[data-custom-wl="1"]').forEach(el => el.remove());

    const firstGroup = symbolSelect.querySelector('optgroup');
    watchlistGroups.forEach(grp => {
      const og = document.createElement('optgroup');
      og.label = `⭐ ${grp.name}`;
      og.dataset.customWl = '1';
      (grp.items || []).forEach(it => {
        const opt = document.createElement('option');
        opt.value = it.symbol;
        opt.textContent = it.label ? `${it.label} (${it.symbol})` : it.symbol;
        og.appendChild(opt);
      });
      if (firstGroup) symbolSelect.insertBefore(og, firstGroup);
      else symbolSelect.appendChild(og);
    });

    if (prevVal) symbolSelect.value = prevVal;
    updateFavButtonState();
  }

  function renderWatchlistManagerModal() {
    if (!wlGroupsContainer || !wlTargetGroupSelect) return;
    const prevScrollTop = watchlistModal ? watchlistModal.scrollTop : 0;
    const prevTarget = wlTargetGroupSelect.value;
    wlTargetGroupSelect.innerHTML = '';
    watchlistGroups.forEach(grp => {
      const opt = document.createElement('option');
      opt.value = grp.id;
      opt.textContent = grp.name;
      wlTargetGroupSelect.appendChild(opt);
    });
    if (prevTarget && watchlistGroups.some(g => g.id === prevTarget)) {
      wlTargetGroupSelect.value = prevTarget;
    }

    wlGroupsContainer.innerHTML = '';
    watchlistGroups.forEach((grp, gIdx) => {
      const card = document.createElement('div');
      card.className = 'wl-group-card';

      const head = document.createElement('div');
      head.className = 'wl-group-head';

      const titleBox = document.createElement('div');
      titleBox.className = 'wl-group-title';
      titleBox.textContent = `${grp.name}（${(grp.items || []).length}）`;

      const actions = document.createElement('div');
      actions.className = 'wl-group-actions';

      const btnUpGrp = document.createElement('button');
      btnUpGrp.className = 'wl-mini-btn';
      btnUpGrp.textContent = '↑ 族群上移';
      btnUpGrp.disabled = gIdx === 0;
      btnUpGrp.onclick = async () => {
        [watchlistGroups[gIdx - 1], watchlistGroups[gIdx]] = [watchlistGroups[gIdx], watchlistGroups[gIdx - 1]];
        await saveWatchlistGroups();
      };

      const btnDownGrp = document.createElement('button');
      btnDownGrp.className = 'wl-mini-btn';
      btnDownGrp.textContent = '↓ 族群下移';
      btnDownGrp.disabled = gIdx === watchlistGroups.length - 1;
      btnDownGrp.onclick = async () => {
        [watchlistGroups[gIdx + 1], watchlistGroups[gIdx]] = [watchlistGroups[gIdx], watchlistGroups[gIdx + 1]];
        await saveWatchlistGroups();
      };

      const btnRenameGrp = document.createElement('button');
      btnRenameGrp.className = 'wl-mini-btn';
      btnRenameGrp.textContent = '✏️ 改族群名';
      btnRenameGrp.onclick = async () => {
        const nextName = prompt('請輸入新的族群名稱：', grp.name);
        if (!nextName || !nextName.trim()) return;
        grp.name = nextName.trim();
        await saveWatchlistGroups();
      };

      const btnDelGrp = document.createElement('button');
      btnDelGrp.className = 'wl-mini-btn danger';
      btnDelGrp.textContent = '🗑️ 刪族群';
      btnDelGrp.onclick = async () => {
        if (!confirm(`確定要刪除整個「${grp.name}」族群及其內部清單嗎？`)) return;
        watchlistGroups.splice(gIdx, 1);
        if (watchlistGroups.length === 0) {
          watchlistGroups.push({ id: 'grp_' + Date.now(), name: '預設自選', items: [] });
        }
        await saveWatchlistGroups();
      };

      actions.append(btnUpGrp, btnDownGrp, btnRenameGrp, btnDelGrp);
      head.append(titleBox, actions);
      card.appendChild(head);

      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'wl-items';

      if (!grp.items || grp.items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'wl-empty-tip';
        empty.textContent = '此族群目前尚無股票，可從上方輸入代號查詢後加入，或由其他族群移動過來。';
        itemsWrap.appendChild(empty);
      } else {
        grp.items.forEach((it, iIdx) => {
          const row = document.createElement('div');
          row.className = 'wl-item-row';

          const left = document.createElement('div');
          left.className = 'wl-item-left';

          const badge = document.createElement('span');
          badge.className = 'wl-sym-badge';
          badge.textContent = it.symbol;
          badge.title = '點擊立即切換看盤到此標的';
          badge.onclick = () => {
            watchlistBackdrop.classList.remove('open');
            switchSymbol(it.symbol);
          };

          const nameSpan = document.createElement('span');
          nameSpan.className = 'wl-name-text';
          nameSpan.textContent = it.label || it.symbol;
          nameSpan.title = '點擊修改顯示名稱';
          nameSpan.onclick = async () => {
            const nextLabel = prompt(`修改 ${it.symbol} 的顯示名稱：`, it.label || it.symbol);
            if (nextLabel === null) return;
            it.label = nextLabel.trim() || it.symbol;
            if (normalizeSymbolCode(currentSymbol) === normalizeSymbolCode(it.symbol)) {
              currentName = it.label;
              if (lastCandles.length) updateLegends(lastCandles.at(-1));
              updateStatusText();
            }
            await saveWatchlistGroups();
          };

          left.append(badge, nameSpan);

          const btns = document.createElement('div');
          btns.className = 'wl-item-btns';

          const btnUp = document.createElement('button');
          btnUp.className = 'wl-mini-btn';
          btnUp.textContent = '↑';
          btnUp.title = '上移';
          btnUp.disabled = iIdx === 0;
          btnUp.onclick = async () => {
            [grp.items[iIdx - 1], grp.items[iIdx]] = [grp.items[iIdx], grp.items[iIdx - 1]];
            await saveWatchlistGroups();
          };

          const btnDown = document.createElement('button');
          btnDown.className = 'wl-mini-btn';
          btnDown.textContent = '↓';
          btnDown.title = '下移';
          btnDown.disabled = iIdx === grp.items.length - 1;
          btnDown.onclick = async () => {
            [grp.items[iIdx + 1], grp.items[iIdx]] = [grp.items[iIdx], grp.items[iIdx + 1]];
            await saveWatchlistGroups();
          };

          const btnRename = document.createElement('button');
          btnRename.className = 'wl-mini-btn';
          btnRename.textContent = '改名';
          btnRename.onclick = async () => {
            const nextLabel = prompt(`修改 ${it.symbol} 的顯示名稱：`, it.label || it.symbol);
            if (nextLabel === null) return;
            it.label = nextLabel.trim() || it.symbol;
            if (normalizeSymbolCode(currentSymbol) === normalizeSymbolCode(it.symbol)) {
              currentName = it.label;
              if (lastCandles.length) updateLegends(lastCandles.at(-1));
              updateStatusText();
            }
            await saveWatchlistGroups();
          };

          if (watchlistGroups.length > 1) {
            const moveSelect = document.createElement('select');
            moveSelect.className = 'wl-mini-btn';
            moveSelect.title = '移動到其他族群';
            watchlistGroups.forEach(targetG => {
              const opt = document.createElement('option');
              opt.value = targetG.id;
              opt.textContent = `移至: ${targetG.name}`;
              if (targetG.id === grp.id) opt.selected = true;
              moveSelect.appendChild(opt);
            });
            moveSelect.onchange = async () => {
              const dest = watchlistGroups.find(g => g.id === moveSelect.value);
              if (!dest || dest.id === grp.id) return;
              const [moved] = grp.items.splice(iIdx, 1);
              dest.items.push(moved);
              await saveWatchlistGroups();
            };
            btns.appendChild(moveSelect);
          }

          const btnDel = document.createElement('button');
          btnDel.className = 'wl-mini-btn danger';
          btnDel.textContent = '移除';
          btnDel.onclick = async () => {
            grp.items.splice(iIdx, 1);
            await saveWatchlistGroups();
          };

          btns.append(btnUp, btnDown, btnRename, btnDel);
          row.append(left, btns);
          itemsWrap.appendChild(row);
        });
      }

      card.appendChild(itemsWrap);
      wlGroupsContainer.appendChild(card);
    });

    if (watchlistModal) watchlistModal.scrollTop = prevScrollTop;
  }

  let isDrawMode = false, pendingPoint = null, hoverPoint = null;
  let noteModalState = null;
  let priceLines = [], cloudLines = [], cloudShapes = [];
  let selectedTarget = null;
  let hoveredTarget = null;
  let dragState = null;
  let suppressNextClick = false;
  let currentSymbol = symbolSelect.value, currentName = '台積電', currentInterval = intervalSelect.value;
  let unsub = null, liveTimer = null, favMap = {}, lastCandles = [], syncingCross = false, indicators = null;
  let subDataMap = new Map();
  let keyboardBarIndex = -1;
  let isPaneResizing = false;
  let customPaneHeights = null;

  try {
    const cached = JSON.parse(localStorage.getItem(WL_LOCAL_KEY) || 'null');
    watchlistGroups = (Array.isArray(cached) && cached.length) ? cached : cloneDefaultWatchlist();
  } catch (e) {
    watchlistGroups = cloneDefaultWatchlist();
  }
  favMap = getFlatFavMap();
  renderWatchlistDropdown();

  const isMobile = () => window.innerWidth <= 768;
  const getPriceScaleWidth = () => (isMobile() ? 58 : 80);

  function getActiveLineWidth() {
    const w = Number(lineWidthSelect?.value);
    return (!Number.isNaN(w) && w >= 1 && w <= 10) ? w : 2;
  }

  function calcStartToTargetStats(p1, p2) {
    const startVal = Number(p1?.price);
    const targetVal = Number(p2?.price);
    const diff = Number((startVal - targetVal).toFixed(4));
    const diffDisplay = Number(diff.toFixed(2));
    const pct = startVal !== 0 ? ((startVal - targetVal) / startVal) * 100 : null;
    const pctDisplay = pct !== null ? `${pct >= 0 ? '+' : ''}${Number(pct.toFixed(2))}%` : 'X';
    return {
      diff: diffDisplay,
      diffStr: `${diffDisplay >= 0 ? '+' : ''}${diffDisplay}`,
      pctDisplay
    };
  }

  function getMeasureLabelPoint(shape) {
    if (shape.labelPos && shape.labelPos.price != null) {
      return shape.labelPos;
    }
    const midLogical = ((shape.p1?.logical ?? 0) + (shape.p2?.logical ?? 0)) / 2;
    const midPrice = (((shape.p1?.price ?? 0) + (shape.p2?.price ?? 0)) / 2);
    return {
      logical: Number(midLogical.toFixed(3)),
      time: logicalToTime(midLogical),
      price: Number(midPrice.toFixed(2))
    };
  }

  function getMeasureLabelBoxRect(shape) {
    const lp = pointToPixel(getMeasureLabelPoint(shape));
    if (!lp) return null;
    const stats = calcStartToTargetStats(shape.p1, shape.p2);
    const summaryLabel = `${stats.pctDisplay} | 差 ${stats.diffStr}`;
    drawCtx.save();
    drawCtx.font = isMobile() ? 'bold 10px sans-serif' : 'bold 11px sans-serif';
    const padX = 6, h = 17;
    const w = drawCtx.measureText(summaryLabel).width + padX * 2;
    drawCtx.restore();
    return {
      x: lp.x - w / 2,
      y: lp.y - h / 2,
      w,
      h,
      centerX: lp.x,
      centerY: lp.y,
      text: summaryLabel
    };
  }

  function openCreateNoteModal(p1, p2) {
    noteModalState = { mode: 'create', p1, p2 };
    textModalTitle.textContent = '💬 新增文字 / 數字註記';
    noteConfirmBtn.textContent = '確定加入';
    noteTextarea.value = '';
    textModalBackdrop.classList.add('open');
    setTimeout(() => noteTextarea.focus(), 20);
  }

  function openEditNoteModal(shapeIndex) {
    const shape = cloudShapes[shapeIndex];
    if (!shape || shape.type !== 'textBox') return;
    noteModalState = { mode: 'edit', shapeIndex };
    textModalTitle.textContent = '✏️ 編輯文字 / 數字註記';
    noteConfirmBtn.textContent = '儲存修改';
    noteTextarea.value = shape.text ?? '';
    textModalBackdrop.classList.add('open');
    setTimeout(() => {
      noteTextarea.focus();
      noteTextarea.select();
    }, 20);
  }

  function closeNoteModal() {
    textModalBackdrop.classList.remove('open');
    noteModalState = null;
  }

  noteCancelBtn.onclick = () => closeNoteModal();

  noteConfirmBtn.onclick = async () => {
    if (!noteModalState) return;
    const text = noteTextarea.value.trim();
    const state = { ...noteModalState };
    closeNoteModal();

    const docRef = db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol));

    if (state.mode === 'create') {
      if (!text) return;
      const color = getActiveColor();
      const lineWidth = getActiveLineWidth();
      await docRef.set({
        shapes: firebase.firestore.FieldValue.arrayUnion({
          id: Date.now(),
          type: 'textBox',
          p1: state.p1,
          p2: state.p2,
          text,
          color,
          lineWidth
        })
      }, { merge: true });
      updateStatusText();
    } else if (state.mode === 'edit') {
      const targetShape = cloudShapes[state.shapeIndex];
      if (!targetShape) return;
      if (!text) {
        const nextShapes = cloudShapes.filter((_, i) => i !== state.shapeIndex);
        if (selectedTarget?.kind === 'shape' && selectedTarget.index === state.shapeIndex) {
          selectedTarget = null;
          deleteSelectedBtn.disabled = true;
        }
        await docRef.set({ shapes: nextShapes }, { merge: true });
      } else {
        const nextShapes = cloudShapes.map((s, i) =>
          i === state.shapeIndex ? { ...s, text } : s
        );
        cloudShapes = nextShapes;
        renderDrawings();
        renderDrawingsList();
        await docRef.set({ shapes: nextShapes }, { merge: true });
      }
      updateStatusText();
    }
  };

  noteTextarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      noteConfirmBtn.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeNoteModal();
    }
  });

  const baseOpts = {
    autoSize: false,
    layout: { background: { color: '#131722' }, textColor: '#d1d4dc', fontSize: isMobile() ? 10 : 12 },
    grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
    rightPriceScale: { borderColor: '#2a2e39', minimumWidth: getPriceScaleWidth() },
    crosshair: { mode: 1 }
  };
  const chart = LightweightCharts.createChart(chartContainer, {
    ...baseOpts,
    rightPriceScale: {
      borderColor: '#2a2e39',
      minimumWidth: getPriceScaleWidth(),
      scaleMargins: { top: 0.14, bottom: 0.08 }
    },
    timeScale: { visible: false }
  });
  const volChart = LightweightCharts.createChart(volumeContainer, {
    ...baseOpts,
    timeScale: { visible: false }
  });
  const subChart = LightweightCharts.createChart(subIndicatorContainer, {
    ...baseOpts,
    timeScale: { borderColor: '#2a2e39', timeVisible: true }
  });

  function syncAllChartSizes() {
    const w = Math.max(1, chartsWrapper.clientWidth);
    const hasSub = subIndicatorContainer.style.display !== 'none';

    if (customPaneHeights) {
      const mH = Math.max(70, Math.round(customPaneHeights.main));
      const vH = Math.max(45, Math.round(customPaneHeights.vol));
      const sH = hasSub ? Math.max(45, Math.round(customPaneHeights.sub)) : 0;

      chartContainer.style.flex = `0 0 ${mH}px`;
      chartContainer.style.height = `${mH}px`;
      volumeContainer.style.flex = `0 0 ${vH}px`;
      volumeContainer.style.height = `${vH}px`;

      if (hasSub) {
        subIndicatorContainer.style.flex = `0 0 ${sH}px`;
        subIndicatorContainer.style.height = `${sH}px`;
      } else {
        subIndicatorContainer.style.flex = '0 0 0px';
        subIndicatorContainer.style.height = '0px';
      }

      chart.resize(w, mH);
      volChart.resize(w, vH);
      if (hasSub) subChart.resize(w, sH);
    } else {
      chartContainer.style.flex = '3.4 1 0';
      chartContainer.style.height = '';
      volumeContainer.style.flex = '1 1 0';
      volumeContainer.style.height = '';
      if (hasSub) {
        subIndicatorContainer.style.flex = '1.25 1 0';
        subIndicatorContainer.style.height = '';
      } else {
        subIndicatorContainer.style.flex = '0 0 0px';
        subIndicatorContainer.style.height = '0px';
      }

      requestAnimationFrame(() => {
        const mH = Math.max(70, Math.floor(chartContainer.clientHeight));
        const vH = Math.max(45, Math.floor(volumeContainer.clientHeight));
        const sH = hasSub ? Math.max(45, Math.floor(subIndicatorContainer.clientHeight)) : 0;
        chart.resize(w, mH);
        volChart.resize(w, vH);
        if (hasSub) subChart.resize(w, sH);
        resizeCanvas();
      });
      return;
    }

    resizeCanvas();
  }

  function setupPaneResizer(resizerEl, topPane, bottomPane) {
    let active = false;
    let startY = 0;
    let startTopH = 0;
    let startBottomH = 0;

    const getPaneKey = el => {
      if (el === chartContainer) return 'main';
      if (el === volumeContainer) return 'vol';
      return 'sub';
    };

    const onStart = clientY => {
      if (bottomPane.style.display === 'none') return;
      const hasSub = subIndicatorContainer.style.display !== 'none';
      customPaneHeights = {
        main: Math.max(70, chartContainer.getBoundingClientRect().height),
        vol: Math.max(45, volumeContainer.getBoundingClientRect().height),
        sub: hasSub ? Math.max(45, subIndicatorContainer.getBoundingClientRect().height) : 0
      };
      active = true;
      isPaneResizing = true;
      startY = clientY;
      startTopH = customPaneHeights[getPaneKey(topPane)];
      startBottomH = customPaneHeights[getPaneKey(bottomPane)];
      resizerEl.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ns-resize';
      [chart, volChart, subChart].forEach(c => c.applyOptions({ handleScroll: false, handleScale: false }));
    };

    const onMove = clientY => {
      if (!active || !customPaneHeights) return;
      const dy = clientY - startY;
      const minTop = getPaneKey(topPane) === 'main' ? 70 : 45;
      const minBottom = getPaneKey(bottomPane) === 'main' ? 70 : 45;
      const totalH = startTopH + startBottomH;

      const newTopH = Math.max(minTop, Math.min(totalH - minBottom, startTopH + dy));
      const newBottomH = totalH - newTopH;

      customPaneHeights[getPaneKey(topPane)] = newTopH;
      customPaneHeights[getPaneKey(bottomPane)] = newBottomH;
      syncAllChartSizes();
    };

    const onEnd = () => {
      if (!active) return;
      active = false;
      isPaneResizing = false;
      resizerEl.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      [chart, volChart, subChart].forEach(c => c.applyOptions({ handleScroll: true, handleScale: true }));
      syncAllChartSizes();
    };

    resizerEl.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      onStart(e.clientY);
    });
    window.addEventListener('mousemove', e => onMove(e.clientY));
    window.addEventListener('mouseup', onEnd);

    resizerEl.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      onStart(e.touches[0].clientY);
    }, { passive: false });
    window.addEventListener('touchmove', e => {
      if (!active || e.touches.length !== 1) return;
      e.preventDefault();
      onMove(e.touches[0].clientY);
    }, { passive: false });
    window.addEventListener('touchend', onEnd);
  }

  setupPaneResizer(resizerMainVol, chartContainer, volumeContainer);
  setupPaneResizer(resizerVolSub, volumeContainer, subIndicatorContainer);

  function applyResponsiveChartOpts() {
    const mw = getPriceScaleWidth();
    const fs = isMobile() ? 10 : 12;
    [chart, volChart, subChart].forEach(c => {
      c.applyOptions({
        layout: { fontSize: fs },
        rightPriceScale: { minimumWidth: mw }
      });
    });
    syncAllChartSizes();
  }
  window.addEventListener('resize', applyResponsiveChartOpts);

  const candleSeries = chart.addCandlestickSeries({
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
    lastValueVisible: false
  });

  const volumeSeries = volChart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    lastValueVisible: false
  });

  const kdKSeries = subChart.addLineSeries({ color: '#ffeb3b', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
  const kdDSeries = subChart.addLineSeries({ color: '#00e5ff', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });

  const bias18Series = subChart.addLineSeries({ color: '#ff9800', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
  const bias6Series = subChart.addLineSeries({ color: '#69f0ae', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });

  const macdDifSeries = subChart.addLineSeries({ color: '#ffffff', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
  const macdDeaSeries = subChart.addLineSeries({ color: '#ffeb3b', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
  const macdHistSeries = subChart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });

  const zeroRefSeries = subChart.addLineSeries({
    color: 'rgba(149, 152, 161, 0.45)',
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false
  });

  const deductSeries = chart.addLineSeries({
    priceScaleId: 'deduct-scale',
    color: 'rgba(0,0,0,0)',
    lineWidth: 0,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false
  });
  chart.priceScale('deduct-scale').applyOptions({
    visible: false,
    scaleMargins: { top: 0.94, bottom: 0 }
  });

  const MA_CONFIG = [
    { period: 3,   color: '#ffffff', label: 'MA3' },
    { period: 6,   color: '#ffeb3b', label: 'MA6' },
    { period: 18,  color: '#00e5ff', label: 'MA18' },
    { period: 60,  color: '#69f0ae', label: 'MA60' },
    { period: 120, color: '#ff9800', label: 'MA120' },
    { period: 240, color: '#e040fb', label: 'MA240' }
  ];
  const maLineSeries = {};
  MA_CONFIG.forEach(cfg => {
    maLineSeries[cfg.period] = chart.addLineSeries({
      color: cfg.color,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
  });

  const bbOpts = {
    color: '#2962ff',
    lineWidth: 1.5,
    lineStyle: LightweightCharts.LineStyle.Solid,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false
  };
  const bbUpperSeries = chart.addLineSeries(bbOpts);
  const bbMidSeries = chart.addLineSeries({
    ...bbOpts,
    color: '#ef5350',
    lineWidth: 1.5
  });
  const bbLowerSeries = chart.addLineSeries(bbOpts);

  const VOL_MA_CONFIG = [
    { period: 5,  color: '#ffeb3b', label: 'MA5' },
    { period: 10, color: '#e040fb', label: 'MA10' }
  ];
  const volMaLineSeries = {};
  VOL_MA_CONFIG.forEach(cfg => {
    volMaLineSeries[cfg.period] = volChart.addLineSeries({
      color: cfg.color,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
  });

  function calcCandleMetrics(bar) {
    const o = Number(bar.open);
    const h = Number(bar.high);
    const l = Number(bar.low);
    const c = Number(bar.close);
    const fmtDec = (n, digits) => Number(n.toFixed(digits)).toFixed(digits);
    const fmtPct = n => `${Number((n * 100).toFixed(2))}%`;

    const bodyPct = o !== 0 ? fmtPct((c - o) / o) : 'X';

    let shadowRatio = 'X';
    const diffCO = c - o;
    const rangeHL = h - l;
    if (diffCO > 0 && rangeHL !== 0) {
      shadowRatio = fmtDec(((h - c) + (o - l)) / rangeHL, 2);
    } else if (diffCO < 0 && rangeHL !== 0) {
      shadowRatio = fmtDec(((h - o) + (c - l)) / rangeHL, 2);
    }

    const rangePct = o !== 0 ? fmtPct((h - l) / o) : 'X';

    let upperLowerShadowRatio = 'X';
    if (diffCO > 0) {
      const a = h - c;
      const b = o - l;
      if (a > b) {
        upperLowerShadowRatio = b !== 0 ? fmtDec(a / b, 1) : 'X';
      } else {
        upperLowerShadowRatio = a !== 0 ? fmtDec(b / a, 1) : 'X';
      }
    } else {
      const a = h - o;
      const b = c - l;
      if (a > b) {
        upperLowerShadowRatio = b !== 0 ? fmtDec(a / b, 1) : 'X';
      } else {
        upperLowerShadowRatio = a !== 0 ? fmtDec(b / a, 1) : 'X';
      }
    }

    return { bodyPct, shadowRatio, rangePct, upperLowerShadowRatio };
  }

  function calcEMA(values, period) {
    const k = 2 / (period + 1);
    const out = new Array(values.length).fill(null);
    let ema = null;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || Number.isNaN(v)) continue;
      if (ema === null) ema = v;
      else ema = v * k + ema * (1 - k);
      out[i] = ema;
    }
    return out;
  }

  function calcSMA(values, period) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function computeSubIndicators(candles, interval) {
    subDataMap = new Map();
    const isMonth = interval === '1mo';
    const isWeek = interval === '1wk';
    const isDay = interval === '1d';

    kdKSeries.setData([]);
    kdDSeries.setData([]);
    bias18Series.setData([]);
    bias6Series.setData([]);
    macdDifSeries.setData([]);
    macdDeaSeries.setData([]);
    macdHistSeries.setData([]);
    zeroRefSeries.setData([]);

    if (!isMonth && !isWeek && !isDay) {
      subIndicatorContainer.style.display = 'none';
      resizerVolSub.style.display = 'none';
      volChart.applyOptions({ timeScale: { visible: true, borderColor: '#2a2e39', timeVisible: true } });
      syncAllChartSizes();
      return;
    }

    subIndicatorContainer.style.display = 'block';
    resizerVolSub.style.display = 'block';
    volChart.applyOptions({ timeScale: { visible: false } });
    subChart.applyOptions({ timeScale: { visible: true, borderColor: '#2a2e39', timeVisible: true } });
    syncAllChartSizes();

    if (!candles.length) {
      subLegend.textContent = '附圖指標：無資料';
      return;
    }

    const r2 = n => Number(n.toFixed(2));

    if (isMonth) {
      const kData = [], dData = [];
      let prevK = 50, prevD = 50;
      for (let i = 0; i < candles.length; i++) {
        const start = Math.max(0, i - 8);
        let lowMin = Infinity, highMax = -Infinity;
        for (let j = start; j <= i; j++) {
          if (candles[j].low < lowMin) lowMin = candles[j].low;
          if (candles[j].high > highMax) highMax = candles[j].high;
        }
        const range = highMax - lowMin;
        const rsv = range === 0 ? 50 : ((candles[i].close - lowMin) / range) * 100;
        const kVal = (2 / 3) * prevK + (1 / 3) * rsv;
        const dVal = (2 / 3) * prevD + (1 / 3) * kVal;
        prevK = kVal;
        prevD = dVal;

        const t = candles[i].time;
        kData.push({ time: t, value: r2(kVal) });
        dData.push({ time: t, value: r2(dVal) });
        subDataMap.set(t, { mode: 'kd', k: r2(kVal), d: r2(dVal), anchor: r2(kVal) });
      }
      kdKSeries.setData(kData);
      kdDSeries.setData(dData);
    } else if (isWeek) {
      const closes = candles.map(c => c.close);
      const ma18 = calcSMA(closes, 18);
      const ma6 = calcSMA(closes, 6);
      const b18Data = [], b6Data = [], zeroData = [];

      for (let i = 0; i < candles.length; i++) {
        const t = candles[i].time;
        const c = closes[i];
        const v18 = ma18[i] ? r2(((c - ma18[i]) / ma18[i]) * 100) : null;
        const v6 = ma6[i] ? r2(((c - ma6[i]) / ma6[i]) * 100) : null;
        if (v18 !== null) b18Data.push({ time: t, value: v18 });
        if (v6 !== null) b6Data.push({ time: t, value: v6 });
        zeroData.push({ time: t, value: 0 });
        subDataMap.set(t, { mode: 'bias', bias18: v18, bias6: v6, anchor: v6 ?? v18 ?? 0 });
      }
      bias18Series.setData(b18Data);
      bias6Series.setData(b6Data);
      zeroRefSeries.setData(zeroData);
    } else if (isDay) {
      const closes = candles.map(c => c.close);
      const ema12 = calcEMA(closes, 12);
      const ema26 = calcEMA(closes, 26);
      const difArr = closes.map((_, i) => (ema12[i] !== null && ema26[i] !== null) ? ema12[i] - ema26[i] : null);
      const deaArr = calcEMA(difArr, 9);

      const difData = [], deaData = [], histData = [], zeroData = [];
      for (let i = 0; i < candles.length; i++) {
        const t = candles[i].time;
        const dif = difArr[i];
        const dea = deaArr[i];
        const osc = (dif !== null && dea !== null) ? (dif - dea) : null;
        if (dif !== null) difData.push({ time: t, value: r2(dif) });
        if (dea !== null) deaData.push({ time: t, value: r2(dea) });
        if (osc !== null) {
          histData.push({
            time: t,
            value: r2(osc),
            color: osc >= 0 ? 'rgba(38, 166, 154, 0.75)' : 'rgba(239, 83, 80, 0.75)'
          });
        }
        zeroData.push({ time: t, value: 0 });
        subDataMap.set(t, {
          mode: 'macd',
          dif: dif !== null ? r2(dif) : null,
          dea: dea !== null ? r2(dea) : null,
          osc: osc !== null ? r2(osc) : null,
          anchor: dif !== null ? r2(dif) : 0
        });
      }
      macdDifSeries.setData(difData);
      macdDeaSeries.setData(deaData);
      macdHistSeries.setData(histData);
      zeroRefSeries.setData(zeroData);
    }

    if (candles.length) {
      updateSubLegend(candles.at(-1).time);
    }
  }

  function updateSubLegend(time) {
    const info = subDataMap.get(time);
    if (!info) {
      subLegend.textContent = '附圖指標';
      return;
    }
    if (info.mode === 'kd') {
      subLegend.innerHTML =
        `<strong style="color:#fff">KD(9,3,3)</strong>  ` +
        `<span style="color:#ffeb3b">K:${info.k}</span>  ` +
        `<span style="color:#00e5ff">D:${info.d}</span>`;
    } else if (info.mode === 'bias') {
      subLegend.innerHTML =
        `<strong style="color:#fff">18-6乖離(18,6)</strong>  ` +
        `<span style="color:#ff9800">乖離18:${info.bias18 !== null ? info.bias18 + '%' : '--'}</span>  ` +
        `<span style="color:#69f0ae">乖離6:${info.bias6 !== null ? info.bias6 + '%' : '--'}</span>`;
    } else if (info.mode === 'macd') {
      const oscColor = (info.osc ?? 0) >= 0 ? '#26a69a' : '#ef5350';
      subLegend.innerHTML =
        `<strong style="color:#fff">MACD(12,26,9)</strong>  ` +
        `<span style="color:#ffffff">DIF:${info.dif ?? '--'}</span>  ` +
        `<span style="color:#ffeb3b">MACD:${info.dea ?? '--'}</span>  ` +
        `<span style="color:${oscColor}">OSC:${info.osc ?? '--'}</span>`;
    }
  }

  function moveCrosshairToBarClose(idx) {
    if (!lastCandles.length) return;
    const clamped = Math.max(0, Math.min(lastCandles.length - 1, idx));
    keyboardBarIndex = clamped;
    const bar = lastCandles[clamped];

    const logicalRange = chart.timeScale().getVisibleLogicalRange();
    if (logicalRange) {
      if (clamped < logicalRange.from + 1) {
        const span = logicalRange.to - logicalRange.from;
        const newFrom = Math.max(0, clamped - 1);
        chart.timeScale().setVisibleLogicalRange({ from: newFrom, to: newFrom + span });
      } else if (clamped > logicalRange.to - 1) {
        const span = logicalRange.to - logicalRange.from;
        const newTo = Math.min(lastCandles.length - 1, clamped + 1);
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, newTo - span), to: newTo });
      }
    }

    syncingCross = true;
    chart.setCrosshairPosition(bar.close, bar.time, candleSeries);
    volChart.setCrosshairPosition(bar.volume, bar.time, volumeSeries);
    if (subIndicatorContainer.style.display !== 'none') {
      const subInfo = subDataMap.get(bar.time);
      const anchorSeries = currentInterval === '1mo' ? kdKSeries : (currentInterval === '1wk' ? bias6Series : macdDifSeries);
      subChart.setCrosshairPosition(subInfo ? subInfo.anchor : 0, bar.time, anchorSeries);
    }
    syncingCross = false;

    updateLegends(bar);
    updateSubLegend(bar.time);
    if (isDrawMode && pendingPoint) {
      hoverPoint = { logical: clamped, time: bar.time, price: bar.close };
      renderDrawings();
    }
  }

  function getActiveColor() {
    return customColorInput.value || colorSelect.value || '#2962ff';
  }

  function getRatios() {
    const parsed = rectRatiosInput.value
      .split(/[,，\s]+/)
      .map(s => Number(s.trim()))
      .filter(n => !isNaN(n));
    return parsed.length ? parsed : [0.333, 0.5, 0.6667];
  }

  function resizeCanvas() {
    const rect = chartContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (drawCanvas.width !== w * dpr || drawCanvas.height !== h * dpr) {
      drawCanvas.width = w * dpr;
      drawCanvas.height = h * dpr;
    }
    drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderDrawings();
  }
  new ResizeObserver(() => {
    if (!isPaneResizing) syncAllChartSizes();
  }).observe(chartsWrapper);

  function logicalToTime(logical) {
    if (!lastCandles.length || logical == null) return null;
    const idx = Math.max(0, Math.min(lastCandles.length - 1, Math.round(logical)));
    return lastCandles[idx]?.time ?? null;
  }

  function pointToPixel(pt) {
    if (!pt || !lastCandles.length) return null;
    const ts = chart.timeScale();
    let x = null;
    if (pt.time != null) {
      const idx = lastCandles.findIndex(c => c.time === pt.time);
      if (idx !== -1) x = ts.logicalToCoordinate(idx);
    }
    if (x === null && pt.logical != null) {
      x = ts.logicalToCoordinate(pt.logical);
    }
    const y = candleSeries.priceToCoordinate(pt.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  function pixelToPoint(x, y) {
    const ts = chart.timeScale();
    const logical = ts.coordinateToLogical(x);
    const price = candleSeries.coordinateToPrice(y);
    if (logical === null || price === null) return null;
    const roundedIdx = Math.round(logical);
    const bar = (roundedIdx >= 0 && roundedIdx < lastCandles.length) ? lastCandles[roundedIdx] : null;
    return {
      logical: Number(logical.toFixed(3)),
      time: bar ? bar.time : null,
      price: Number(price.toFixed(2))
    };
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function hitTestWithDragMode(mx, my) {
    const handleTol = isMobile() ? 14 : 9;
    const lineTol = isMobile() ? 12 : 8;
    const plotW = chartContainer.clientWidth - getPriceScaleWidth();
    if (mx < 0 || mx > plotW) return null;

    for (let i = cloudShapes.length - 1; i >= 0; i--) {
      const s = cloudShapes[i];
      if (s.type === 'measure') {
        const box = getMeasureLabelBoxRect(s);
        if (box && mx >= box.x - 4 && mx <= box.x + box.w + 4 && my >= box.y - 4 && my <= box.y + box.h + 4) {
          return { target: { kind: 'shape', index: i }, mode: 'label' };
        }
      }
    }

    if (selectedTarget?.kind === 'shape') {
      const idx = selectedTarget.index;
      const s = cloudShapes[idx];
      if (s) {
        if (s.type === 'trend' || s.type === 'ray' || s.type === 'ellipse' || s.type === 'measure') {
          const p1 = pointToPixel(s.p1), p2 = pointToPixel(s.p2);
          if (p1 && Math.hypot(mx - p1.x, my - p1.y) <= handleTol) return { target: selectedTarget, mode: 'p1' };
          if (p2 && Math.hypot(mx - p2.x, my - p2.y) <= handleTol) return { target: selectedTarget, mode: 'p2' };
        }
        if (s.type === 'rect' || s.type === 'textBox') {
          const p1 = pointToPixel(s.p1), p2 = pointToPixel(s.p2);
          if (p1 && Math.hypot(mx - p1.x, my - p1.y) <= handleTol) return { target: selectedTarget, mode: 'p1' };
          if (p2 && Math.hypot(mx - p2.x, my - p2.y) <= handleTol) return { target: selectedTarget, mode: 'p2' };
          if (p1 && p2) {
            const left = Math.min(p1.x, p2.x), right = Math.max(p1.x, p2.x);
            const top = Math.min(p1.y, p2.y), bottom = Math.max(p1.y, p2.y);
            if (Math.abs(my - top) <= lineTol && mx >= left && mx <= right) return { target: selectedTarget, mode: 'top' };
            if (Math.abs(my - bottom) <= lineTol && mx >= left && mx <= right) return { target: selectedTarget, mode: 'bottom' };
            if (Math.abs(mx - left) <= lineTol && my >= top && my <= bottom) return { target: selectedTarget, mode: 'left' };
            if (Math.abs(mx - right) <= lineTol && my >= top && my <= bottom) return { target: selectedTarget, mode: 'right' };
          }
        }
      }
    }

    for (let i = cloudShapes.length - 1; i >= 0; i--) {
      const s = cloudShapes[i];
      if (s.type === 'vline') {
        const p1 = pointToPixel(s.p1);
        if (p1 && Math.abs(mx - p1.x) <= lineTol) return { target: { kind: 'shape', index: i }, mode: 'move' };
      } else if (s.type === 'trend' || s.type === 'ray' || s.type === 'measure') {
        const p1 = pointToPixel(s.p1), p2 = pointToPixel(s.p2);
        if (p1 && p2) {
          let segStartX = p1.x, segStartY = p1.y, segEndX = p2.x, segEndY = p2.y;
          if (s.type === 'ray' && (Math.abs(p2.x - p1.x) > 0.5 || Math.abs(p2.y - p1.y) > 0.5)) {
            if (Math.abs(p2.x - p1.x) > 0.5) {
              const slope = (p2.y - p1.y) / (p2.x - p1.x);
              segStartX = 0;
              segStartY = p1.y + slope * (0 - p1.x);
              segEndX = plotW;
              segEndY = p1.y + slope * (plotW - p1.x);
            } else {
              const h = chartContainer.clientHeight;
              segStartX = p1.x;
              segStartY = 0;
              segEndX = p1.x;
              segEndY = h;
            }
          }
          if (distToSegment(mx, my, segStartX, segStartY, segEndX, segEndY) <= lineTol) {
            return { target: { kind: 'shape', index: i }, mode: 'move' };
          }
        }
      } else if (s.type === 'ellipse') {
        const p1 = pointToPixel(s.p1), p2 = pointToPixel(s.p2);
        if (p1 && p2) {
          const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
          const rx = Math.max(4, Math.abs(p2.x - p1.x) / 2);
          const ry = Math.max(4, Math.abs(p2.y - p1.y) / 2);
          const norm = ((mx - cx) ** 2) / (rx ** 2) + ((my - cy) ** 2) / (ry ** 2);
          if (norm <= 1.25) return { target: { kind: 'shape', index: i }, mode: 'move' };
        }
      } else if (s.type === 'rect' || s.type === 'textBox') {
        const p1 = pointToPixel(s.p1), p2 = pointToPixel(s.p2);
        if (p1 && p2) {
          const left = Math.min(p1.x, p2.x), right = Math.max(p1.x, p2.x);
          const top = Math.min(p1.y, p2.y), bottom = Math.max(p1.y, p2.y);
          if (mx >= left - lineTol && mx <= right + lineTol && my >= top - lineTol && my <= bottom + lineTol) {
            return { target: { kind: 'shape', index: i }, mode: 'move' };
          }
        }
      }
    }

    for (let i = cloudLines.length - 1; i >= 0; i--) {
      const ly = candleSeries.priceToCoordinate(cloudLines[i].price);
      if (ly !== null && Math.abs(my - ly) <= lineTol) {
        return { target: { kind: 'line', index: i }, mode: 'move' };
      }
    }

    return null;
  }

  function isSameTarget(a, b) {
    return a && b && a.kind === b.kind && a.index === b.index;
  }

  function drawTag(text, x, y, color, align = 'left', isMovableBadge = false, isHighlighted = false) {
    drawCtx.save();
    drawCtx.font = isMobile() ? 'bold 10px sans-serif' : 'bold 11px sans-serif';
    const padX = isMovableBadge ? 6 : 5;
    const h = isMovableBadge ? 17 : 15;
    const w = drawCtx.measureText(text).width + padX * 2;
    const drawX = align === 'right' ? x - w : (align === 'center' ? x - w / 2 : x);
    drawCtx.fillStyle = isMovableBadge ? 'rgba(24, 30, 46, 0.96)' : 'rgba(19, 23, 34, 0.9)';
    drawCtx.fillRect(drawX, y - h / 2, w, h);
    drawCtx.strokeStyle = color;
    drawCtx.lineWidth = isHighlighted ? 1.8 : 1;
    drawCtx.strokeRect(drawX, y - h / 2, w, h);
    drawCtx.fillStyle = isMovableBadge ? '#ffffff' : color;
    drawCtx.textBaseline = 'middle';
    drawCtx.fillText(text, drawX + padX, y);
    drawCtx.restore();
  }

  function drawHandle(pt, color) {
    if (!pt) return;
    drawCtx.save();
    drawCtx.beginPath();
    drawCtx.arc(pt.x, pt.y, isMobile() ? 6.5 : 5.5, 0, Math.PI * 2);
    drawCtx.fillStyle = '#ffffff';
    drawCtx.fill();
    drawCtx.lineWidth = 2.2;
    drawCtx.strokeStyle = color;
    drawCtx.stroke();
    drawCtx.restore();
  }

  function drawSingleShape(shape, isPreview = false, isHighlighted = false) {
    const color = shape.color || '#2962ff';
    const baseWidth = Number(shape.lineWidth) || 2;
    const w = chartContainer.clientWidth - getPriceScaleWidth();
    const h = chartContainer.clientHeight;
    drawCtx.save();
    drawCtx.beginPath();
    drawCtx.rect(0, 0, Math.max(0, w), h);
    drawCtx.clip();

    drawCtx.strokeStyle = color;
    drawCtx.lineWidth = isHighlighted ? baseWidth + 1.5 : baseWidth;
    if (isHighlighted) {
      drawCtx.shadowColor = color;
      drawCtx.shadowBlur = 8;
    }
    drawCtx.setLineDash(isPreview ? [5, 4] : []);

    if (shape.type === 'vline') {
      const p1 = pointToPixel(shape.p1);
      if (p1) {
        drawCtx.beginPath();
        drawCtx.moveTo(p1.x, 0);
        drawCtx.lineTo(p1.x, h);
        drawCtx.stroke();
        drawCtx.setLineDash([]);
        drawCtx.shadowBlur = 0;
        const label = shape.p1.time ? fmtTime(shape.p1.time) : `idx:${Math.round(shape.p1.logical)}`;
        drawTag(label, p1.x + 4, h - 18, color, 'left');
        if (isHighlighted) drawHandle({ x: p1.x, y: h / 2 }, color);
      }
    } else if (shape.type === 'trend' || shape.type === 'ray') {
      const p1 = pointToPixel(shape.p1);
      const p2 = pointToPixel(shape.p2);
      if (p1 && p2) {
        let startX = p1.x, startY = p1.y, endX = p2.x, endY = p2.y;
        if (shape.type === 'ray' && (Math.abs(p2.x - p1.x) > 0.5 || Math.abs(p2.y - p1.y) > 0.5)) {
          if (Math.abs(p2.x - p1.x) > 0.5) {
            const slope = (p2.y - p1.y) / (p2.x - p1.x);
            startX = 0;
            startY = p1.y + slope * (0 - p1.x);
            endX = w;
            endY = p1.y + slope * (w - p1.x);
          } else {
            startX = p1.x;
            startY = 0;
            endX = p1.x;
            endY = h;
          }
        }
        drawCtx.beginPath();
        drawCtx.moveTo(startX, startY);
        drawCtx.lineTo(endX, endY);
        drawCtx.stroke();

        drawCtx.setLineDash([]);
        drawCtx.shadowBlur = 0;
        [p1, p2].forEach(pt => {
          drawCtx.beginPath();
          drawCtx.arc(pt.x, pt.y, isHighlighted ? 5.5 : Math.max(3.5, baseWidth + 1.5), 0, Math.PI * 2);
          drawCtx.fillStyle = isHighlighted ? '#fff' : color;
          drawCtx.fill();
          if (isHighlighted) {
            drawCtx.strokeStyle = color;
            drawCtx.lineWidth = 2.2;
            drawCtx.stroke();
          }
        });
        drawTag(`${shape.p1.price}`, p1.x + 6, p1.y - 10, color);
        drawTag(`${shape.p2.price}`, p2.x + 6, p2.y - 10, color);
      }
    } else if (shape.type === 'measure') {
      const p1 = pointToPixel(shape.p1);
      const p2 = pointToPixel(shape.p2);
      if (p1 && p2) {
        drawCtx.save();
        drawCtx.setLineDash(isPreview ? [5, 4] : [6, 3]);
        drawCtx.beginPath();
        drawCtx.moveTo(p1.x, p1.y);
        drawCtx.lineTo(p2.x, p2.y);
        drawCtx.stroke();
        drawCtx.restore();

        drawCtx.setLineDash([]);
        drawCtx.shadowBlur = 0;
        [p1, p2].forEach(pt => {
          drawCtx.beginPath();
          drawCtx.arc(pt.x, pt.y, isHighlighted ? 5.5 : Math.max(3.5, baseWidth + 1.5), 0, Math.PI * 2);
          drawCtx.fillStyle = isHighlighted ? '#fff' : color;
          drawCtx.fill();
          if (isHighlighted) {
            drawCtx.strokeStyle = color;
            drawCtx.lineWidth = 2.2;
            drawCtx.stroke();
          }
        });

        const stats = calcStartToTargetStats(shape.p1, shape.p2);
        const summaryLabel = `${stats.pctDisplay} | 差 ${stats.diffStr}`;
        const labelPt = pointToPixel(getMeasureLabelPoint(shape));
        if (labelPt) {
          drawTag(summaryLabel, labelPt.x, labelPt.y, color, 'center', true, isHighlighted);
        }
        drawTag(`起 ${shape.p1.price}`, p1.x + 6, p1.y + 11, color);
        drawTag(`終 ${shape.p2.price}`, p2.x + 6, p2.y + 11, color);

        if (isHighlighted) {
          drawHandle(p1, color);
          drawHandle(p2, color);
        }
      }
    } else if (shape.type === 'ellipse') {
      const p1 = pointToPixel(shape.p1);
      const p2 = pointToPixel(shape.p2);
      if (p1 && p2) {
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        const rx = Math.max(1, Math.abs(p2.x - p1.x) / 2);
        const ry = Math.max(1, Math.abs(p2.y - p1.y) / 2);
        drawCtx.beginPath();
        drawCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        drawCtx.fillStyle = color + (isHighlighted ? '38' : '22');
        drawCtx.fill();
        drawCtx.stroke();
        drawCtx.shadowBlur = 0;
        if (isHighlighted) {
          drawHandle(p1, color);
          drawHandle(p2, color);
        }
      }
    } else if (shape.type === 'rect') {
      const p1 = pointToPixel(shape.p1);
      const p2 = pointToPixel(shape.p2);
      if (p1 && p2) {
        const left = Math.min(p1.x, p2.x);
        const right = Math.max(p1.x, p2.x);
        const top = Math.min(p1.y, p2.y);
        const bottom = Math.max(p1.y, p2.y);

        drawCtx.fillStyle = color + (isHighlighted ? '30' : '18');
        drawCtx.fillRect(left, top, right - left, bottom - top);
        drawCtx.strokeRect(left, top, right - left, bottom - top);

        drawCtx.setLineDash([]);
        drawCtx.shadowBlur = 0;
        drawTag(`起 ${shape.p1.price}`, left + 4, p1.y - 9, color);
        drawTag(`終 ${shape.p2.price}`, left + 4, p2.y + 9, color);

        const ratios = Array.isArray(shape.ratios) && shape.ratios.length ? shape.ratios : getRatios();
        const diff = shape.p2.price - shape.p1.price;
        ratios.forEach(r => {
          const targetPrice = Number((shape.p1.price + diff * r).toFixed(2));
          const py = candleSeries.priceToCoordinate(targetPrice);
          if (py !== null) {
            drawCtx.save();
            drawCtx.beginPath();
            drawCtx.setLineDash([4, 3]);
            drawCtx.strokeStyle = color;
            drawCtx.lineWidth = isHighlighted ? 1.8 : 1.2;
            drawCtx.moveTo(left, py);
            drawCtx.lineTo(right, py);
            drawCtx.stroke();
            drawCtx.restore();

            drawTag(`${r}x : ${targetPrice}`, right - 4, py, color, 'right');
          }
        });
        if (isHighlighted) {
          drawHandle(p1, color);
          drawHandle(p2, color);
        }
      }
    } else if (shape.type === 'textBox') {
      const p1 = pointToPixel(shape.p1);
      const p2 = pointToPixel(shape.p2);
      if (p1 && p2) {
        const left = Math.min(p1.x, p2.x);
        const right = Math.max(p1.x, p2.x);
        const top = Math.min(p1.y, p2.y);
        const bottom = Math.max(p1.y, p2.y);
        const boxW = Math.max(24, right - left);
        const boxH = Math.max(20, bottom - top);

        drawCtx.fillStyle = isPreview ? 'rgba(19, 23, 34, 0.72)' : 'rgba(19, 23, 34, 0.88)';
        drawCtx.fillRect(left, top, boxW, boxH);
        drawCtx.strokeRect(left, top, boxW, boxH);

        drawCtx.setLineDash([]);
        drawCtx.shadowBlur = 0;

        const rawText = shape.text ?? (isPreview ? '文字 / 數字註記' : '');
        if (rawText) {
          const fontSize = isMobile() ? 12 : 13;
          const lineHeight = fontSize * 1.35;
          drawCtx.font = `bold ${fontSize}px "Microsoft JhengHei", "PingFang TC", sans-serif`;
          drawCtx.fillStyle = '#ffffff';
          drawCtx.textBaseline = 'top';

          const pad = 7;
          const maxTextW = Math.max(12, boxW - pad * 2);
          const wrappedLines = [];

          rawText.split('\n').forEach(para => {
            let currentLine = '';
            for (const ch of para) {
              const testLine = currentLine + ch;
              if (drawCtx.measureText(testLine).width > maxTextW && currentLine.length > 0) {
                wrappedLines.push(currentLine);
                currentLine = ch;
              } else {
                currentLine = testLine;
              }
            }
            wrappedLines.push(currentLine);
          });

          const maxLines = Math.max(1, Math.floor((boxH - pad * 2) / lineHeight));
          wrappedLines.slice(0, maxLines).forEach((line, idx) => {
            drawCtx.fillText(line, left + pad, top + pad + idx * lineHeight);
          });
        }

        if (isHighlighted) {
          drawHandle(p1, color);
          drawHandle(p2, color);
        }
      }
    }
    drawCtx.restore();
  }

  function drawCandlePriceMarkers() {
    if (!lastCandles.length) return;
    const plotW = chartContainer.clientWidth - getPriceScaleWidth();
    const plotH = chartContainer.clientHeight;
    const ts = chart.timeScale();
    const range = ts.getVisibleLogicalRange();

    let startIdx = 0;
    let endIdx = lastCandles.length - 1;
    if (range) {
      startIdx = Math.max(0, Math.floor(range.from));
      endIdx = Math.min(lastCandles.length - 1, Math.ceil(range.to));
    }

    let maxBar = null, maxIdx = -1;
    let minBar = null, minIdx = -1;

    for (let i = startIdx; i <= endIdx; i++) {
      const b = lastCandles[i];
      if (!b) continue;
      if (!maxBar || b.high > maxBar.high) {
        maxBar = b;
        maxIdx = i;
      }
      if (!minBar || b.low < minBar.low) {
        minBar = b;
        minIdx = i;
      }
    }

    drawCtx.save();
    drawCtx.beginPath();
    drawCtx.rect(0, 0, Math.max(0, plotW), plotH);
    drawCtx.clip();

    if (maxBar && maxIdx >= 0) {
      const hx = ts.logicalToCoordinate(maxIdx);
      const hy = candleSeries.priceToCoordinate(maxBar.high);
      if (hx !== null && hy !== null) {
        const clampedX = Math.max(45, Math.min(plotW - 45, hx));
        drawTag(`▲ ${maxBar.high}`, clampedX, Math.max(14, hy - 12), '#ef5350', 'center');
      }
    }

    if (minBar && minIdx >= 0) {
      const lx = ts.logicalToCoordinate(minIdx);
      const ly = candleSeries.priceToCoordinate(minBar.low);
      if (lx !== null && ly !== null) {
        const clampedX = Math.max(45, Math.min(plotW - 45, lx));
        drawTag(`▼ ${minBar.low}`, clampedX, Math.min(plotH - 12, ly + 12), '#26a69a', 'center');
      }
    }

    const lastIdx = lastCandles.length - 1;
    const lastBar = lastCandles[lastIdx];
    const cx = ts.logicalToCoordinate(lastIdx);
    const cy = candleSeries.priceToCoordinate(lastBar.close);
    if (cx !== null && cy !== null) {
      const clr = lastBar.close >= lastBar.open ? '#26a69a' : '#ef5350';
      drawCtx.beginPath();
      drawCtx.arc(cx, cy, 4, 0, Math.PI * 2);
      drawCtx.fillStyle = clr;
      drawCtx.fill();
      const align = cx > plotW - 90 ? 'right' : 'left';
      const offsetX = align === 'right' ? -7 : 7;
      const clampedY = Math.max(14, Math.min(plotH - 12, cy));
      drawTag(`今 ${lastBar.close}`, cx + offsetX, clampedY, clr, align);
    }

    drawCtx.restore();
  }

  function renderDrawings() {
    const w = chartContainer.clientWidth;
    const h = chartContainer.clientHeight;
    drawCtx.clearRect(0, 0, w, h);

    drawCandlePriceMarkers();

    cloudShapes.forEach((s, idx) => {
      const target = { kind: 'shape', index: idx };
      const isHighlighted = isSameTarget(selectedTarget, target) || isSameTarget(hoveredTarget, target);
      drawSingleShape(s, false, isHighlighted);
    });

    if (isDrawMode && pendingPoint && hoverPoint) {
      const tool = drawToolSelect.value;
      if (tool !== 'hline' && tool !== 'vline') {
        drawSingleShape({
          type: tool,
          p1: pendingPoint,
          p2: hoverPoint,
          color: getActiveColor(),
          lineWidth: getActiveLineWidth(),
          ratios: getRatios()
        }, true, false);
      }
    }
  }

  function syncPriceLinesStyle() {
    priceLines.forEach((pl, idx) => {
      const item = cloudLines[idx];
      if (!item) return;
      const target = { kind: 'line', index: idx };
      const isHighlighted = isSameTarget(selectedTarget, target) || isSameTarget(hoveredTarget, target);
      const baseWidth = Number(item.lineWidth) || 2;
      pl.applyOptions({
        price: item.price,
        color: item.color || '#2962ff',
        lineWidth: isHighlighted ? Math.min(4, baseWidth + 1.5) : Math.min(4, baseWidth),
        title: isHighlighted ? '★已選取' : '雲端線'
      });
    });
  }

  function setSelectedTarget(target) {
    selectedTarget = target;
    deleteSelectedBtn.disabled = !selectedTarget;

    if (selectedTarget?.kind === 'line') {
      const l = cloudLines[selectedTarget.index];
      if (l?.lineWidth) lineWidthSelect.value = String(l.lineWidth);
    } else if (selectedTarget?.kind === 'shape') {
      const s = cloudShapes[selectedTarget.index];
      if (s?.lineWidth) lineWidthSelect.value = String(s.lineWidth);
      if (s?.type === 'rect' && Array.isArray(s.ratios)) {
        rectRatiosInput.value = s.ratios.join(', ');
      }
    }

    syncPriceLinesStyle();
    renderDrawings();
    renderDrawingsList();
    updateStatusText();
  }

  function applyDragAtPixel(mx, my) {
    if (!dragState) return;
    const pt = pixelToPoint(mx, my);
    if (!pt) return;

    const { target, mode, startPt, origItem } = dragState;
    const dLogical = pt.logical - startPt.logical;
    const dPrice = pt.price - startPt.price;

    if (target.kind === 'line') {
      const newPrice = Number((origItem.price + dPrice).toFixed(2));
      cloudLines[target.index] = { ...origItem, price: newPrice };
      syncPriceLinesStyle();
    } else if (target.kind === 'shape') {
      const s = JSON.parse(JSON.stringify(origItem));
      if (mode === 'label') {
        s.labelPos = { logical: pt.logical, time: pt.time, price: pt.price };
      } else if (mode === 'move') {
        if (s.p1) {
          const nl = Number((s.p1.logical + dLogical).toFixed(3));
          s.p1 = { ...s.p1, logical: nl, time: logicalToTime(nl), price: Number((s.p1.price + dPrice).toFixed(2)) };
        }
        if (s.p2) {
          const nl2 = Number((s.p2.logical + dLogical).toFixed(3));
          s.p2 = { ...s.p2, logical: nl2, time: logicalToTime(nl2), price: Number((s.p2.price + dPrice).toFixed(2)) };
        }
        if (s.labelPos) {
          const nl3 = Number((s.labelPos.logical + dLogical).toFixed(3));
          s.labelPos = { ...s.labelPos, logical: nl3, time: logicalToTime(nl3), price: Number((s.labelPos.price + dPrice).toFixed(2)) };
        }
      } else if (mode === 'p1') {
        s.p1 = { logical: pt.logical, time: pt.time, price: pt.price };
      } else if (mode === 'p2') {
        s.p2 = { logical: pt.logical, time: pt.time, price: pt.price };
      } else if (mode === 'top') {
        if (s.p1.price >= s.p2.price) s.p1.price = pt.price;
        else s.p2.price = pt.price;
      } else if (mode === 'bottom') {
        if (s.p1.price < s.p2.price) s.p1.price = pt.price;
        else s.p2.price = pt.price;
      } else if (mode === 'left') {
        if (s.p1.logical <= s.p2.logical) {
          s.p1.logical = pt.logical;
          s.p1.time = pt.time;
        } else {
          s.p2.logical = pt.logical;
          s.p2.time = pt.time;
        }
      } else if (mode === 'right') {
        if (s.p1.logical > s.p2.logical) {
          s.p1.logical = pt.logical;
          s.p1.time = pt.time;
        } else {
          s.p2.logical = pt.logical;
          s.p2.time = pt.time;
        }
      }
      cloudShapes[target.index] = s;
      renderDrawings();
    }
  }

  chartContainer.addEventListener('mousedown', e => {
    if (e.button !== 0 || isDrawMode) return;
    const rect = chartContainer.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = hitTestWithDragMode(mx, my);
    if (!hit) return;

    const startPt = pixelToPoint(mx, my);
    if (!startPt) return;

    setSelectedTarget(hit.target);
    const origItem = hit.target.kind === 'line'
      ? { ...cloudLines[hit.target.index] }
      : JSON.parse(JSON.stringify(cloudShapes[hit.target.index]));

    dragState = {
      target: hit.target,
      mode: hit.mode,
      startPt,
      origItem,
      moved: false
    };

    [chart, volChart, subChart].forEach(c => c.applyOptions({ handleScroll: false, handleScale: false }));
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!dragState) return;
    const rect = chartContainer.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    dragState.moved = true;
    applyDragAtPixel(mx, my);
  });

  window.addEventListener('mouseup', async () => {
    if (!dragState) return;
    const wasMoved = dragState.moved;
    dragState = null;

    [chart, volChart, subChart].forEach(c => c.applyOptions({ handleScroll: true, handleScale: true }));

    if (wasMoved) {
      suppressNextClick = true;
      setTimeout(() => { suppressNextClick = false; }, 60);
      renderDrawingsList();
      updateStatusText();
      const docRef = db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol));
      await docRef.set({ lines: cloudLines, shapes: cloudShapes }, { merge: true });
    }
  });

  chartContainer.addEventListener('dblclick', e => {
    if (isDrawMode) return;
    const rect = chartContainer.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = hitTestWithDragMode(mx, my);
    if (hit?.target?.kind === 'shape') {
      const shape = cloudShapes[hit.target.index];
      if (shape?.type === 'textBox') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedTarget(hit.target);
        openEditNoteModal(hit.target.index);
      }
    }
  });

  async function deleteTarget(target) {
    if (!target) return;
    const docRef = db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol));
    if (target.kind === 'line') {
      const nextLines = cloudLines.filter((_, i) => i !== target.index);
      selectedTarget = null;
      hoveredTarget = null;
      await docRef.set({ lines: nextLines }, { merge: true });
    } else if (target.kind === 'shape') {
      const nextShapes = cloudShapes.filter((_, i) => i !== target.index);
      selectedTarget = null;
      hoveredTarget = null;
      await docRef.set({ shapes: nextShapes }, { merge: true });
    }
  }

  const SHAPE_LABELS = {
    vline: '垂直切線',
    trend: '兩點切線',
    ray: '兩點雙向延長切線',
    ellipse: '橢圓形',
    rect: '四方形(倍數)',
    measure: '起終點量測',
    textBox: '註記框'
  };

  function describeItem(kind, item) {
    if (kind === 'line') {
      return `水平切線 @ ${item.price} (${item.lineWidth || 2}px)`;
    }
    const name = SHAPE_LABELS[item.type] || item.type;
    if (item.type === 'vline') {
      const tStr = item.p1?.time ? fmtTime(item.p1.time) : `idx:${Math.round(item.p1?.logical || 0)}`;
      return `${name} (${tStr})`;
    }
    if (item.type === 'measure') {
      const st = calcStartToTargetStats(item.p1, item.p2);
      return `${name} ${st.pctDisplay} (差${st.diffStr})`;
    }
    if (item.type === 'textBox') {
      const preview = (item.text || '').replace(/\n+/g, ' ').slice(0, 14);
      return `${name}「${preview}」`;
    }
    return `${name} (${item.p1?.price} → ${item.p2?.price})`;
  }

  function renderDrawingsList() {
    const items = [
      ...cloudLines.map((item, index) => ({ kind: 'line', index, item })),
      ...cloudShapes.map((item, index) => ({ kind: 'shape', index, item }))
    ];

    if (!items.length) {
      drawingsListEl.innerHTML = '<div style="color:#9598a1; font-size:12px; padding:12px; text-align:center;">目前無任何雲端繪圖</div>';
      return;
    }

    drawingsListEl.innerHTML = items.map(({ kind, index, item }) => {
      const isSel = selectedTarget && selectedTarget.kind === kind && selectedTarget.index === index;
      const color = item.color || '#2962ff';
      return `
        <div class="draw-item ${isSel ? 'selected' : ''}" data-kind="${kind}" data-index="${index}">
          <div class="draw-item-info">
            <input type="checkbox" class="batch-chk" data-kind="${kind}" data-index="${index}" />
            <span class="color-dot" style="background:${color}"></span>
            <span title="${describeItem(kind, item)}">${describeItem(kind, item)}</span>
          </div>
          <button class="item-del-btn" data-kind="${kind}" data-index="${index}">刪除</button>
        </div>
      `;
    }).join('');

    drawingsListEl.querySelectorAll('.draw-item').forEach(row => {
      row.onclick = e => {
        if (e.target.classList.contains('batch-chk') || e.target.classList.contains('item-del-btn')) return;
        setSelectedTarget({ kind: row.dataset.kind, index: Number(row.dataset.index) });
      };
      row.ondblclick = e => {
        if (e.target.classList.contains('batch-chk') || e.target.classList.contains('item-del-btn')) return;
        const kind = row.dataset.kind;
        const idx = Number(row.dataset.index);
        if (kind === 'shape' && cloudShapes[idx]?.type === 'textBox') {
          setSelectedTarget({ kind, index: idx });
          openEditNoteModal(idx);
        }
      };
    });

    drawingsListEl.querySelectorAll('.item-del-btn').forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        await deleteTarget({ kind: btn.dataset.kind, index: Number(btn.dataset.index) });
      };
    });
  }

  delCheckedBtn.onclick = async () => {
    const checked = [...drawingsListEl.querySelectorAll('.batch-chk:checked')];
    if (!checked.length) return;
    const lineDelSet = new Set(checked.filter(c => c.dataset.kind === 'line').map(c => Number(c.dataset.index)));
    const shapeDelSet = new Set(checked.filter(c => c.dataset.kind === 'shape').map(c => Number(c.dataset.index)));
    const nextLines = cloudLines.filter((_, i) => !lineDelSet.has(i));
    const nextShapes = cloudShapes.filter((_, i) => !shapeDelSet.has(i));
    selectedTarget = null;
    hoveredTarget = null;
    await db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol)).set({
      lines: nextLines,
      shapes: nextShapes
    }, { merge: true });
  };

  chart.timeScale().subscribeVisibleLogicalRangeChange(r => {
    if (!r) return;
    volChart.timeScale().setVisibleLogicalRange(r);
    if (subIndicatorContainer.style.display !== 'none') subChart.timeScale().setVisibleLogicalRange(r);
    renderDrawings();
  });
  volChart.timeScale().subscribeVisibleLogicalRangeChange(r => {
    if (!r) return;
    chart.timeScale().setVisibleLogicalRange(r);
    if (subIndicatorContainer.style.display !== 'none') subChart.timeScale().setVisibleLogicalRange(r);
    renderDrawings();
  });
  subChart.timeScale().subscribeVisibleLogicalRangeChange(r => {
    if (!r) return;
    chart.timeScale().setVisibleLogicalRange(r);
    volChart.timeScale().setVisibleLogicalRange(r);
    renderDrawings();
  });

  const fmtTime = t => {
    const d = new Date(t * 1000);
    return currentInterval === '60m'
      ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:00`
      : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  const fmtVol = v => (currentSymbol.endsWith('.TW') || currentSymbol.endsWith('.TWO'))
    ? `${Math.round(v / 1000).toLocaleString()} 張`
    : Math.round(v).toLocaleString();

  function updateDeductionMarkers() {
    if (!toggleDeduct.checked || !lastCandles.length) {
      deductSeries.setMarkers([]);
      return;
    }
    const len = lastCandles.length;
    const grouped = new Map();

    const deductPeriods = [
      ...MA_CONFIG,
      { period: 20, color: '#ef5350', label: 'BB20' }
    ];

    deductPeriods.forEach(cfg => {
      const idx = len - cfg.period;
      if (idx >= 0) {
        const t = lastCandles[idx].time;
        if (!grouped.has(t)) grouped.set(t, []);
        grouped.get(t).push(cfg);
      }
    });

    const markers = Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, cfgs]) => {
        const has20 = cfgs.some(c => c.period === 20);
        return {
          time,
          position: 'belowBar',
          color: has20 ? '#ef5350' : cfgs.at(-1).color,
          shape: 'arrowUp',
          text: cfgs.map(c => `${c.period}扣`).join('/')
        };
      });

    deductSeries.setMarkers(markers);
  }

  function applyVisibility() {
    const showMa = toggleMa.checked;
    const showBb = toggleBb.checked;
    MA_CONFIG.forEach(cfg => maLineSeries[cfg.period].applyOptions({ visible: showMa }));
    VOL_MA_CONFIG.forEach(cfg => volMaLineSeries[cfg.period].applyOptions({ visible: showMa }));
    bbUpperSeries.applyOptions({ visible: showBb });
    bbMidSeries.applyOptions({ visible: showBb });
    bbLowerSeries.applyOptions({ visible: showBb });
    updateDeductionMarkers();
  }

  function updateLegends(bar) {
    if (!bar) return;
    const clr = bar.close >= bar.open ? '#26a69a' : '#ef5350';
    const ind = indicators?.byTime?.get(bar.time);
    const m = calcCandleMetrics(bar);

    let maHtml = '';
    if (ind && toggleMa.checked) {
      const items = MA_CONFIG
        .filter(c => ind.ma[c.period] !== undefined)
        .map(c => `<span style="color:${c.color}">${c.label}:${ind.ma[c.period]}</span>`);
      if (items.length) maHtml = `<br/>${items.join('  ')}`;
    }

    let bbHtml = '';
    if (ind?.bb && toggleBb.checked) {
      bbHtml = `  |  <span style="color:#90caf9">BB(20,2) 上:${ind.bb.up} <span style="color:#ef5350">中:${ind.bb.mid}</span> 下:${ind.bb.low}</span>`;
    }

    const metricsHtml =
      `<br/>` +
      `<span style="color:#ffd54f">實體K%:${m.bodyPct}</span>  ` +
      `<span style="color:#81d4fa">影線占比:${m.shadowRatio}</span>  ` +
      `<span style="color:#ce93d8">高低差%:${m.rangePct}</span>  ` +
      `<span style="color:#a5d6a7">上下影線比:${m.upperLowerShadowRatio}</span>`;

    ohlcLegend.innerHTML =
      `<strong style="color:#fff">${currentName} (${currentSymbol})</strong>  時間: ${fmtTime(bar.time)}  ` +
      `開:<span style="color:${clr}">${bar.open}</span>  高:<span style="color:${clr}">${bar.high}</span>  ` +
      `低:<span style="color:${clr}">${bar.low}</span>  收:<span style="color:${clr}">${bar.close}</span>` +
      metricsHtml + maHtml + bbHtml;

    let volMaHtml = '';
    if (ind && toggleMa.checked) {
      const vItems = VOL_MA_CONFIG
        .filter(c => ind.volMa[c.period] !== undefined)
        .map(c => `<span style="color:${c.color}">${c.label}:${fmtVol(ind.volMa[c.period])}</span>`);
      if (vItems.length) volMaHtml = `  |  ${vItems.join('  ')}`;
    }

    volLegend.innerHTML = `時間: ${fmtTime(bar.time)}  |  成交量: <strong style="color:${clr}">${fmtVol(bar.volume)}</strong>${volMaHtml}`;
  }

  function renderAllSeries(candles, fitView = false) {
    indicators = window.MarketAPI.computeIndicators(candles);

    candleSeries.setData(candles);
    deductSeries.setData(candles.map(d => ({ time: d.time, value: 0 })));
    volumeSeries.setData(candles.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? '#26a69a' : '#ef5350'
    })));

    MA_CONFIG.forEach(cfg => maLineSeries[cfg.period].setData(indicators.maSeries[cfg.period]));
    VOL_MA_CONFIG.forEach(cfg => volMaLineSeries[cfg.period].setData(indicators.volMaSeries[cfg.period]));
    bbUpperSeries.setData(indicators.bbUpper);
    bbMidSeries.setData(indicators.bbMid);
    bbLowerSeries.setData(indicators.bbLower);

    computeSubIndicators(candles, currentInterval);
    applyVisibility();

    if (candles.length) {
      keyboardBarIndex = candles.length - 1;
      updateLegends(candles.at(-1));
      updateSubLegend(candles.at(-1).time);
    }
    if (fitView) {
      chart.timeScale().fitContent();
      volChart.timeScale().fitContent();
      if (subIndicatorContainer.style.display !== 'none') {
        subChart.timeScale().fitContent();
      }
    }
    syncAllChartSizes();
    requestAnimationFrame(renderDrawings);
  }

  chart.subscribeCrosshairMove(p => {
    if (p.time && lastCandles.length) {
      const idx = lastCandles.findIndex(c => c.time === p.time);
      if (idx !== -1) keyboardBarIndex = idx;
    }
    if (p.point && !dragState) {
      if (isDrawMode && pendingPoint) {
        hoverPoint = pixelToPoint(p.point.x, p.point.y);
        renderDrawings();
      } else if (!isDrawMode) {
        const hitInfo = hitTestWithDragMode(p.point.x, p.point.y);
        const hit = hitInfo ? hitInfo.target : null;
        if (!isSameTarget(hit, hoveredTarget)) {
          hoveredTarget = hit;
          if (!hitInfo) chartContainer.style.cursor = '';
          else if (hitInfo.mode === 'label') chartContainer.style.cursor = 'move';
          else if (hitInfo.mode === 'p1' || hitInfo.mode === 'p2') chartContainer.style.cursor = 'nwse-resize';
          else if (hitInfo.mode === 'top' || hitInfo.mode === 'bottom') chartContainer.style.cursor = 'ns-resize';
          else if (hitInfo.mode === 'left' || hitInfo.mode === 'right') chartContainer.style.cursor = 'ew-resize';
          else chartContainer.style.cursor = 'grab';
          syncPriceLinesStyle();
          renderDrawings();
        }
      }
    }
    if (syncingCross) return;
    syncingCross = true;
    const bar = p.time ? lastCandles.find(c => c.time === p.time) : null;
    if (bar) {
      updateLegends(bar);
      updateSubLegend(bar.time);
      volChart.setCrosshairPosition(bar.volume, p.time, volumeSeries);
      if (subIndicatorContainer.style.display !== 'none') {
        const subInfo = subDataMap.get(bar.time);
        const anchorSeries = currentInterval === '1mo' ? kdKSeries : (currentInterval === '1wk' ? bias6Series : macdDifSeries);
        subChart.setCrosshairPosition(subInfo ? subInfo.anchor : 0, p.time, anchorSeries);
      }
    } else {
      volChart.clearCrosshairPosition();
      subChart.clearCrosshairPosition();
      if (lastCandles.length) {
        updateLegends(lastCandles.at(-1));
        updateSubLegend(lastCandles.at(-1).time);
      }
    }
    syncingCross = false;
  });

  volChart.subscribeCrosshairMove(p => {
    if (p.time && lastCandles.length) {
      const idx = lastCandles.findIndex(c => c.time === p.time);
      if (idx !== -1) keyboardBarIndex = idx;
    }
    if (syncingCross) return;
    syncingCross = true;
    const bar = p.time ? lastCandles.find(c => c.time === p.time) : null;
    if (bar) {
      updateLegends(bar);
      updateSubLegend(bar.time);
      chart.setCrosshairPosition(bar.close, p.time, candleSeries);
    } else {
      chart.clearCrosshairPosition();
      if (lastCandles.length) {
        updateLegends(lastCandles.at(-1));
        updateSubLegend(lastCandles.at(-1).time);
      }
    }
    syncingCross = false;
  });

  subChart.subscribeCrosshairMove(p => {
    if (p.time && lastCandles.length) {
      const idx = lastCandles.findIndex(c => c.time === p.time);
      if (idx !== -1) keyboardBarIndex = idx;
    }
    if (syncingCross) return;
    syncingCross = true;
    const bar = p.time ? lastCandles.find(c => c.time === p.time) : null;
    if (bar) {
      updateLegends(bar);
      updateSubLegend(bar.time);
      chart.setCrosshairPosition(bar.close, p.time, candleSeries);
      volChart.setCrosshairPosition(bar.volume, p.time, volumeSeries);
    } else {
      chart.clearCrosshairPosition();
      volChart.clearCrosshairPosition();
      if (lastCandles.length) {
        updateLegends(lastCandles.at(-1));
        updateSubLegend(lastCandles.at(-1).time);
      }
    }
    syncingCross = false;
  });

  db.collection('user_settings').doc('watchlist_groups_v1').onSnapshot(async doc => {
    if (doc.exists && Array.isArray(doc.data().groups) && doc.data().groups.length > 0) {
      watchlistGroups = doc.data().groups;
      favMap = getFlatFavMap();
      saveLocalWatchlist();
      renderWatchlistDropdown();
      if (watchlistBackdrop?.classList.contains('open')) {
        renderWatchlistManagerModal();
      }
      watchlistInitialized = true;
    } else if (!watchlistInitialized) {
      watchlistInitialized = true;
      try {
        const legacySnap = await db.collection('user_settings').doc('watchlist_v2').get();
        if (legacySnap.exists && legacySnap.data().items) {
          const legacyItems = legacySnap.data().items;
          const extraEntries = Object.entries(legacyItems).filter(([sym]) => !findWatchlistItem(sym));
          if (extraEntries.length > 0) {
            watchlistGroups.push({
              id: 'grp_legacy_migrated',
              name: '我的自選股',
              items: extraEntries.map(([symbol, label]) => ({ symbol, label }))
            });
          }
        }
      } catch (e) {}
      await saveWatchlistGroups();
    }
  });

  function updateStatusText() {
    if (isDrawMode) {
      const toolName = drawToolSelect.options[drawToolSelect.selectedIndex].text;
      statusBadge.style.color = '#ffeb3b';
      statusBadge.textContent = pendingPoint ? `🟢 ${toolName}：點目標點` : `🟢 ${toolName}：點起始點`;
    } else if (selectedTarget) {
      const item = selectedTarget.kind === 'line' ? cloudLines[selectedTarget.index] : cloudShapes[selectedTarget.index];
      statusBadge.style.color = '#ffeb3b';
      statusBadge.textContent = item ? `🎯 已選取：${describeItem(selectedTarget.kind, item)}` : `☁️ ${currentName}`;
    } else {
      statusBadge.style.color = '#4caf50';
      const total = cloudLines.length + cloudShapes.length;
      statusBadge.textContent = `☁️ ${currentName} (${currentSymbol}) | ${total}圖`;
    }
  }

  function subscribeCloud(sym) {
    if (unsub) unsub();
    unsub = db.collection('chart_drawings').doc(encodeURIComponent(sym)).onSnapshot(doc => {
      if (dragState) return;
      priceLines.forEach(l => candleSeries.removePriceLine(l));
      priceLines = [];
      const data = doc.exists ? doc.data() : {};
      cloudLines = data.lines || [];
      cloudShapes = data.shapes || [];

      cloudLines.forEach(item => priceLines.push(candleSeries.createPriceLine({
        price: item.price,
        color: item.color || '#2962ff',
        lineWidth: Math.min(4, Number(item.lineWidth) || 2),
        axisLabelVisible: true,
        title: '雲端線'
      })));

      if (selectedTarget) {
        const list = selectedTarget.kind === 'line' ? cloudLines : cloudShapes;
        if (!list[selectedTarget.index]) selectedTarget = null;
      }
      deleteSelectedBtn.disabled = !selectedTarget;

      syncPriceLinesStyle();
      renderDrawings();
      renderDrawingsList();
      updateStatusText();
    });
  }

  async function loadData(sym, intv, silent = false) {
    if (!silent) {
      statusBadge.style.color = '#ffeb3b';
      statusBadge.textContent = `⏳ 搜尋 ${sym}...`;
    }
    try {
      const res = await window.MarketAPI.fetchCandles(sym, intv, silent);
      if (!silent) {
        currentSymbol = res.sym;
        lastCandles = res.data;
        const customMatch = findWatchlistItem(currentSymbol);
        currentName = customMatch?.item?.label || await window.MarketAPI.fetchChineseName(currentSymbol, symbolSelect, favMap);
        if (symbolSelect.querySelector(`option[value="${currentSymbol}"]`)) {
          symbolSelect.value = currentSymbol;
        }
        updateFavButtonState();
        renderAllSeries(lastCandles, true);
        subscribeCloud(currentSymbol);
      } else if (res.data.length && lastCandles.length) {
        const map = new Map(lastCandles.map(c => [c.time, c]));
        res.data.forEach(bar => map.set(bar.time, bar));
        lastCandles = Array.from(map.values()).sort((a, b) => a.time - b.time);
        renderAllSeries(lastCandles, false);
      }
    } catch (err) {
      if (!silent) {
        statusBadge.style.color = '#ef5350';
        statusBadge.textContent = `❌ ${err.message}`;
      }
    }
  }

  function switchSymbol(s) {
    const clean = s.trim().toUpperCase();
    if (!clean) return;
    if (liveTimer) clearInterval(liveTimer);
    isDrawMode = false;
    pendingPoint = null;
    hoverPoint = null;
    selectedTarget = null;
    hoveredTarget = null;
    dragState = null;
    deleteSelectedBtn.disabled = true;
    drawBtn.classList.remove('active');
    loadData(clean, currentInterval, false);
    liveTimer = setInterval(() => loadData(currentSymbol, currentInterval, true), 15000);
  }

  async function applyColorChange(newColor) {
    renderDrawings();
    if (!selectedTarget) return;
    const docRef = db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol));
    if (selectedTarget.kind === 'line') {
      const nextLines = cloudLines.map((l, i) => i === selectedTarget.index ? { ...l, color: newColor } : l);
      await docRef.set({ lines: nextLines }, { merge: true });
    } else {
      const nextShapes = cloudShapes.map((s, i) => i === selectedTarget.index ? { ...s, color: newColor } : s);
      await docRef.set({ shapes: nextShapes }, { merge: true });
    }
  }

  async function applyLineWidthChange(newWidth) {
    renderDrawings();
    if (!selectedTarget) return;
    const docRef = db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol));
    if (selectedTarget.kind === 'line') {
      const nextLines = cloudLines.map((l, i) => i === selectedTarget.index ? { ...l, lineWidth: newWidth } : l);
      await docRef.set({ lines: nextLines }, { merge: true });
    } else {
      const nextShapes = cloudShapes.map((s, i) => i === selectedTarget.index ? { ...s, lineWidth: newWidth } : s);
      await docRef.set({ shapes: nextShapes }, { merge: true });
    }
  }

  colorSelect.onchange = async () => {
    customColorInput.value = colorSelect.value;
    await applyColorChange(colorSelect.value);
  };
  customColorInput.onchange = async () => {
    await applyColorChange(customColorInput.value);
  };
  customColorInput.oninput = () => renderDrawings();

  lineWidthSelect.onchange = async () => {
    await applyLineWidthChange(getActiveLineWidth());
  };

  async function applyNewRatiosToRects() {
    const ratios = getRatios();
    renderDrawings();
    const docRef = db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol));
    if (selectedTarget?.kind === 'shape' && cloudShapes[selectedTarget.index]?.type === 'rect') {
      const updated = cloudShapes.map((s, i) => i === selectedTarget.index ? { ...s, ratios } : s);
      await docRef.set({ shapes: updated }, { merge: true });
    } else if (cloudShapes.some(s => s.type === 'rect')) {
      const updated = cloudShapes.map(s => s.type === 'rect' ? { ...s, ratios } : s);
      await docRef.set({ shapes: updated }, { merge: true });
    }
  }
  rectRatiosInput.onchange = applyNewRatiosToRects;
  rectRatiosInput.onkeydown = e => { if (e.key === 'Enter') applyNewRatiosToRects(); };

  drawBtn.onclick = () => {
    isDrawMode = !isDrawMode;
    pendingPoint = null;
    hoverPoint = null;
    if (isDrawMode) setSelectedTarget(null);
    drawBtn.classList.toggle('active', isDrawMode);
    renderDrawings();
    updateStatusText();
  };

  drawToolSelect.onchange = () => {
    pendingPoint = null;
    hoverPoint = null;
    renderDrawings();
    updateStatusText();
  };

  deleteSelectedBtn.onclick = async () => {
    if (selectedTarget) await deleteTarget(selectedTarget);
  };

  manageListBtn.onclick = () => {
    drawingsPanel.classList.toggle('open');
    renderDrawingsList();
  };
  closePanelBtn.onclick = () => drawingsPanel.classList.remove('open');

  clearBtn.onclick = () => {
    pendingPoint = null;
    hoverPoint = null;
    selectedTarget = null;
    hoveredTarget = null;
    deleteSelectedBtn.disabled = true;
    db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol)).set({ lines: [], shapes: [] });
  };

  window.addEventListener('keydown', async e => {
    if (textModalBackdrop.classList.contains('open') || watchlistBackdrop?.classList.contains('open')) return;
    if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const startIdx = keyboardBarIndex >= 0 ? keyboardBarIndex : lastCandles.length - 1;
      moveCrosshairToBarClose(startIdx - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const startIdx = keyboardBarIndex >= 0 ? keyboardBarIndex : lastCandles.length - 1;
      moveCrosshairToBarClose(startIdx + 1);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTarget) {
      e.preventDefault();
      await deleteTarget(selectedTarget);
    } else if (e.key === 'Escape') {
      isDrawMode = false;
      pendingPoint = null;
      hoverPoint = null;
      drawBtn.classList.remove('active');
      setSelectedTarget(null);
    }
  });

  chartContainer.addEventListener('contextmenu', async e => {
    const rect = chartContainer.getBoundingClientRect();
    const hitInfo = hitTestWithDragMode(e.clientX - rect.left, e.clientY - rect.top);
    if (hitInfo) {
      e.preventDefault();
      await deleteTarget(hitInfo.target);
    }
  });

  chart.subscribeClick(async p => {
    if (suppressNextClick || !p.point) return;

    if (!isDrawMode) {
      const hitInfo = hitTestWithDragMode(p.point.x, p.point.y);
      setSelectedTarget(hitInfo ? hitInfo.target : null);
      return;
    }

    const tool = drawToolSelect.value;
    const color = getActiveColor();
    const lineWidth = getActiveLineWidth();
    const docRef = db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol));

    if (tool === 'hline') {
      const price = candleSeries.coordinateToPrice(p.point.y);
      if (price !== null) {
        isDrawMode = false;
        drawBtn.classList.remove('active');
        await docRef.set({
          lines: firebase.firestore.FieldValue.arrayUnion({
            price: Number(price.toFixed(2)),
            color,
            lineWidth
          })
        }, { merge: true });
        updateStatusText();
      }
      return;
    }

    const pt = pixelToPoint(p.point.x, p.point.y);
    if (!pt) return;

    if (tool === 'vline') {
      isDrawMode = false;
      drawBtn.classList.remove('active');
      await docRef.set({
        shapes: firebase.firestore.FieldValue.arrayUnion({
          id: Date.now(),
          type: 'vline',
          p1: pt,
          color,
          lineWidth
        })
      }, { merge: true });
      updateStatusText();
      return;
    }

    if (!pendingPoint) {
      pendingPoint = pt;
      hoverPoint = pt;
      updateStatusText();
    } else {
      const p1 = pendingPoint;
      const p2 = pt;
      isDrawMode = false;
      pendingPoint = null;
      hoverPoint = null;
      drawBtn.classList.remove('active');
      renderDrawings();
      updateStatusText();

      if (tool === 'textBox') {
        openCreateNoteModal(p1, p2);
        return;
      }

      const shape = {
        id: Date.now(),
        type: tool,
        p1,
        p2,
        color,
        lineWidth
      };
      if (tool === 'rect') {
        shape.ratios = getRatios();
      }
      if (tool === 'measure') {
        const midLogical = (p1.logical + p2.logical) / 2;
        const midPrice = (p1.price + p2.price) / 2;
        shape.labelPos = {
          logical: Number(midLogical.toFixed(3)),
          time: logicalToTime(midLogical),
          price: Number(midPrice.toFixed(2))
        };
      }
      await docRef.set({
        shapes: firebase.firestore.FieldValue.arrayUnion(shape)
      }, { merge: true });
    }
  });

  chartContainer.addEventListener('wheel', () => requestAnimationFrame(renderDrawings), { passive: true });
  chartContainer.addEventListener('pointermove', () => { if (cloudShapes.length || pendingPoint) requestAnimationFrame(renderDrawings); });

  [toggleMa, toggleBb, toggleDeduct].forEach(el => {
    el.onchange = () => {
      applyVisibility();
      if (lastCandles.length) updateLegends(lastCandles.at(-1));
    };
  });

  favBtn.onclick = async () => {
    const existing = findWatchlistItem(currentSymbol);
    if (existing) {
      existing.group.items.splice(existing.iIdx, 1);
      statusBadge.textContent = `已移除自選 ${currentName}`;
      await saveWatchlistGroups();
    } else {
      if (watchlistGroups.length === 0) {
        watchlistGroups.push({ id: 'grp_default', name: '預設自選', items: [] });
      }
      const customLabel = prompt(`加入「${currentSymbol}」到「${watchlistGroups[0].name}」，請確認顯示名稱：`, currentName);
      if (customLabel === null) return;
      const finalLabel = customLabel.trim() || currentName;
      watchlistGroups[0].items.push({ symbol: currentSymbol, label: finalLabel });
      currentName = finalLabel;
      if (lastCandles.length) updateLegends(lastCandles.at(-1));
      statusBadge.textContent = `⭐ 已收藏 ${finalLabel} (${currentSymbol})`;
      await saveWatchlistGroups();
    }
  };

  if (manageFavBtn && watchlistBackdrop) {
    manageFavBtn.onclick = () => {
      renderWatchlistManagerModal();
      watchlistBackdrop.classList.add('open');
      if (watchlistModal) watchlistModal.scrollTop = 0;
    };
  }
  if (closeWlBtn && watchlistBackdrop) {
    closeWlBtn.onclick = () => watchlistBackdrop.classList.remove('open');
  }
  if (watchlistBackdrop) {
    watchlistBackdrop.addEventListener('click', e => {
      if (e.target === watchlistBackdrop) watchlistBackdrop.classList.remove('open');
    });
    watchlistBackdrop.addEventListener('wheel', e => {
      if (!watchlistModal) return;
      const delta = e.deltaY;
      watchlistModal.scrollTop += delta;
      e.stopPropagation();
    }, { passive: true });
  }
  if (wlAddSymInput) {
    let symInputTimer = null;
    wlAddSymInput.addEventListener('input', () => {
      clearTimeout(symInputTimer);
      symInputTimer = setTimeout(() => autoPreviewSymbolName(false), 350);
    });
    wlAddSymInput.addEventListener('change', () => {
      clearTimeout(symInputTimer);
      autoPreviewSymbolName(false);
    });
    wlAddSymInput.addEventListener('keydown', async e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(symInputTimer);
        await autoPreviewSymbolName(false);
        wlAddNameInput?.focus();
      }
    });
  }
  if (wlLookupNameBtn) {
    wlLookupNameBtn.onclick = () => autoPreviewSymbolName(true);
  }
  if (wlAddGroupBtn && wlNewGroupInput) {
    wlAddGroupBtn.onclick = async () => {
      const name = wlNewGroupInput.value.trim();
      if (!name) return;
      watchlistGroups.push({ id: 'grp_' + Date.now(), name, items: [] });
      wlNewGroupInput.value = '';
      await saveWatchlistGroups();
    };
  }
  if (wlAddItemBtn && wlAddSymInput && wlTargetGroupSelect) {
    wlAddItemBtn.onclick = async () => {
      const sym = normalizeSymbolCode(wlAddSymInput.value);
      if (!sym) return;
      let label = wlAddNameInput ? wlAddNameInput.value.trim() : '';
      if (!label) {
        label = await window.MarketAPI.lookupSymbolName(wlAddSymInput.value, symbolSelect, favMap) || sym;
      }
      const targetGrp = watchlistGroups.find(g => g.id === wlTargetGroupSelect.value) || watchlistGroups[0];
      if (!targetGrp) return;

      const dup = findWatchlistItem(sym);
      if (dup) {
        alert(`${sym} 已存在於「${dup.group.name}」中，如需移動請在下方列表切換族群。`);
        return;
      }
      targetGrp.items.push({ symbol: sym, label });
      wlAddSymInput.value = '';
      if (wlAddNameInput) wlAddNameInput.value = '';
      if (wlLookupHint) wlLookupHint.textContent = `✅ 已將「${label} (${sym})」加入「${targetGrp.name}」`;
      await saveWatchlistGroups();
    };
  }

  symbolSelect.onchange = e => switchSymbol(e.target.value);
  intervalSelect.onchange = e => {
    currentInterval = e.target.value;
    switchSymbol(currentSymbol);
  };
  searchBtn.onclick = () => switchSymbol(customInput.value);
  customInput.onkeydown = e => { if (e.key === 'Enter') switchSymbol(customInput.value); };
  switchSymbol(currentSymbol);
}
