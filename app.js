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
  const chartContainer = document.getElementById('chart-container'), volumeContainer = document.getElementById('volume-container');
  const drawCanvas = document.getElementById('draw-canvas');
  const drawCtx = drawCanvas.getContext('2d');
  const ohlcLegend = document.getElementById('ohlc-legend'), volLegend = document.getElementById('vol-legend');
  const symbolSelect = document.getElementById('symbol-select'), favGroup = document.getElementById('fav-group');
  const intervalSelect = document.getElementById('interval-select'), customInput = document.getElementById('custom-symbol'), searchBtn = document.getElementById('search-btn');
  const favBtn = document.getElementById('fav-btn'), colorSelect = document.getElementById('color-select'), customColorInput = document.getElementById('custom-color');
  const drawToolSelect = document.getElementById('draw-tool-select'), drawBtn = document.getElementById('draw-btn');
  const rectRatiosInput = document.getElementById('rect-ratios'), undoDrawBtn = document.getElementById('undo-draw-btn'), clearBtn = document.getElementById('clear-lines-btn');
  const toggleMa = document.getElementById('toggle-ma'), toggleBb = document.getElementById('toggle-bb'), toggleDeduct = document.getElementById('toggle-deduct');

  let isDrawMode = false, pendingPoint = null, hoverPoint = null;
  let priceLines = [], cloudShapes = [], currentSymbol = symbolSelect.value, currentName = '台積電', currentInterval = intervalSelect.value;
  let unsub = null, liveTimer = null, favMap = {}, lastCandles = [], syncingCross = false, indicators = null;

  const baseOpts = {
    autoSize: true,
    layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
    grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
    rightPriceScale: { borderColor: '#2a2e39', minimumWidth: 80 },
    crosshair: { mode: 1 }
  };
  const chart = LightweightCharts.createChart(chartContainer, {
    ...baseOpts,
    rightPriceScale: {
      borderColor: '#2a2e39',
      minimumWidth: 80,
      scaleMargins: { top: 0.14, bottom: 0.08 }
    },
    timeScale: { visible: false }
  });
  const volChart = LightweightCharts.createChart(volumeContainer, { ...baseOpts, timeScale: { borderColor: '#2a2e39', timeVisible: true } });

  const candleSeries = chart.addCandlestickSeries({
    upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350'
  });
  const volumeSeries = volChart.addHistogramSeries({ priceFormat: { type: 'volume' } });

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
    color: 'rgba(144, 202, 249, 0.65)',
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false
  };
  const bbUpperSeries = chart.addLineSeries(bbOpts);
  const bbMidSeries = chart.addLineSeries({ ...bbOpts, color: 'rgba(144, 202, 249, 0.45)', lineStyle: LightweightCharts.LineStyle.Dotted });
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

  // ========== 畫布與座標換算工具 ==========
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
  new ResizeObserver(resizeCanvas).observe(chartContainer);

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

  function drawTag(text, x, y, color, align = 'left') {
    drawCtx.font = 'bold 11px sans-serif';
    const padX = 5, h = 16;
    const w = drawCtx.measureText(text).width + padX * 2;
    const drawX = align === 'right' ? x - w : x;
    drawCtx.fillStyle = 'rgba(19, 23, 34, 0.86)';
    drawCtx.fillRect(drawX, y - h / 2, w, h);
    drawCtx.strokeStyle = color;
    drawCtx.lineWidth = 1;
    drawCtx.strokeRect(drawX, y - h / 2, w, h);
    drawCtx.fillStyle = color;
    drawCtx.textBaseline = 'middle';
    drawCtx.fillText(text, drawX + padX, y);
  }

  function drawSingleShape(shape, isPreview = false) {
    const color = shape.color || '#2962ff';
    const w = chartContainer.clientWidth - 80; // 扣除右側價格軸寬度
    const h = chartContainer.clientHeight;
    drawCtx.save();
    drawCtx.beginPath();
    drawCtx.rect(0, 0, Math.max(0, w), h);
    drawCtx.clip();

    drawCtx.strokeStyle = color;
    drawCtx.lineWidth = 1.8;
    drawCtx.setLineDash(isPreview ? [5, 4] : []);

    if (shape.type === 'vline') {
      const p1 = pointToPixel(shape.p1);
      if (p1) {
        drawCtx.beginPath();
        drawCtx.moveTo(p1.x, 0);
        drawCtx.lineTo(p1.x, h);
        drawCtx.stroke();
        drawCtx.setLineDash([]);
        const label = shape.p1.time ? fmtTime(shape.p1.time) : `idx:${Math.round(shape.p1.logical)}`;
        drawTag(label, p1.x + 4, h - 18, color, 'left');
      }
    } else if (shape.type === 'trend' || shape.type === 'ray') {
      const p1 = pointToPixel(shape.p1);
      const p2 = pointToPixel(shape.p2);
      if (p1 && p2) {
        let endX = p2.x, endY = p2.y;
        if (shape.type === 'ray' && Math.abs(p2.x - p1.x) > 0.5) {
          const slope = (p2.y - p1.y) / (p2.x - p1.x);
          endX = p2.x >= p1.x ? w : 0;
          endY = p1.y + slope * (endX - p1.x);
        }
        drawCtx.beginPath();
        drawCtx.moveTo(p1.x, p1.y);
        drawCtx.lineTo(endX, endY);
        drawCtx.stroke();

        // 起終點小圓點
        drawCtx.setLineDash([]);
        [p1, p2].forEach(pt => {
          drawCtx.beginPath();
          drawCtx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
          drawCtx.fillStyle = color;
          drawCtx.fill();
        });
        drawTag(`${shape.p1.price}`, p1.x + 6, p1.y - 10, color);
        drawTag(`${shape.p2.price}`, p2.x + 6, p2.y - 10, color);
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
        drawCtx.fillStyle = color + '22';
        drawCtx.fill();
        drawCtx.stroke();
      }
    } else if (shape.type === 'rect') {
      const p1 = pointToPixel(shape.p1);
      const p2 = pointToPixel(shape.p2);
      if (p1 && p2) {
        const left = Math.min(p1.x, p2.x);
        const right = Math.max(p1.x, p2.x);
        const top = Math.min(p1.y, p2.y);
        const bottom = Math.max(p1.y, p2.y);

        // 外框與淡色底
        drawCtx.fillStyle = color + '18';
        drawCtx.fillRect(left, top, right - left, bottom - top);
        drawCtx.strokeRect(left, top, right - left, bottom - top);

        // 起點與終點標價
        drawCtx.setLineDash([]);
        drawTag(`起 ${shape.p1.price}`, left + 4, p1.y - 9, color);
        drawTag(`終 ${shape.p2.price}`, left + 4, p2.y + 9, color);

        // 由起點算起的倍數水平線與標價
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
            drawCtx.lineWidth = 1.2;
            drawCtx.moveTo(left, py);
            drawCtx.lineTo(right, py);
            drawCtx.stroke();
            drawCtx.restore();

            drawTag(`${r}x : ${targetPrice}`, right - 4, py, color, 'right');
          }
        });
      }
    }
    drawCtx.restore();
  }

  function renderDrawings() {
    const w = chartContainer.clientWidth;
    const h = chartContainer.clientHeight;
    drawCtx.clearRect(0, 0, w, h);

    cloudShapes.forEach(s => drawSingleShape(s, false));

    // 繪製滑鼠移動時的即時預覽線
    if (isDrawMode && pendingPoint && hoverPoint) {
      const tool = drawToolSelect.value;
      if (tool !== 'hline' && tool !== 'vline') {
        drawSingleShape({
          type: tool,
          p1: pendingPoint,
          p2: hoverPoint,
          color: getActiveColor(),
          ratios: getRatios()
        }, true);
      }
    }
  }

  chart.timeScale().subscribeVisibleLogicalRangeChange(r => {
    if (r) volChart.timeScale().setVisibleLogicalRange(r);
    renderDrawings();
  });
  volChart.timeScale().subscribeVisibleLogicalRangeChange(r => {
    if (r) chart.timeScale().setVisibleLogicalRange(r);
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

    MA_CONFIG.forEach(cfg => {
      const idx = len - cfg.period;
      if (idx >= 0) {
        const t = lastCandles[idx].time;
        if (!grouped.has(t)) grouped.set(t, []);
        grouped.get(t).push(cfg);
      }
    });

    const markers = Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, cfgs]) => ({
        time,
        position: 'belowBar',
        color: cfgs.at(-1).color,
        shape: 'arrowUp',
        text: cfgs.map(c => `${c.period}扣`).join('/')
      }));

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

    let maHtml = '';
    if (ind && toggleMa.checked) {
      const items = MA_CONFIG
        .filter(c => ind.ma[c.period] !== undefined)
        .map(c => `<span style="color:${c.color}">${c.label}:${ind.ma[c.period]}</span>`);
      if (items.length) maHtml = `<br/>${items.join('  ')}`;
    }

    let bbHtml = '';
    if (ind?.bb && toggleBb.checked) {
      bbHtml = `  |  <span style="color:#90caf9">BB(20,2) 上:${ind.bb.up} 中:${ind.bb.mid} 下:${ind.bb.low}</span>`;
    }

    ohlcLegend.innerHTML =
      `<strong style="color:#fff">${currentName} (${currentSymbol})</strong>  時間: ${fmtTime(bar.time)}  ` +
      `開:<span style="color:${clr}">${bar.open}</span>  高:<span style="color:${clr}">${bar.high}</span>  ` +
      `低:<span style="color:${clr}">${bar.low}</span>  收:<span style="color:${clr}">${bar.close}</span>` +
      maHtml + bbHtml;

    let volMaHtml = '';
    if (ind && toggleMa.checked) {
      const vItems = VOL_MA_CONFIG
        .filter(c => ind.volMa[c.period] !== undefined)
        .map(c => `<span style="color:${c.color}">${c.label}:${fmtVol(ind.volMa[c.period])}</span>`);
      if (vItems.length) volMaHtml = `  |  ${vItems.join('  ')}`;
    }

    volLegend.innerHTML = `時間: ${fmtTime(bar.time)}  |  成交量: <strong style="color:${clr}">${fmtVol(bar.volume)}</strong>${volMaHtml}`;
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

    applyVisibility();
    if (candles.length) updateLegends(candles.at(-1));
    if (fitView) {
      chart.timeScale().fitContent();
      volChart.timeScale().fitContent();
    }
    requestAnimationFrame(renderDrawings);
  }

  chart.subscribeCrosshairMove(p => {
    if (p.point && isDrawMode && pendingPoint) {
      hoverPoint = pixelToPoint(p.point.x, p.point.y);
      renderDrawings();
    }
    if (syncingCross) return;
    syncingCross = true;
    const bar = p.time ? lastCandles.find(c => c.time === p.time) : null;
    if (bar) {
      updateLegends(bar);
      volChart.setCrosshairPosition(bar.volume, p.time, volumeSeries);
    } else {
      volChart.clearCrosshairPosition();
      if (lastCandles.length) updateLegends(lastCandles.at(-1));
    }
    syncingCross = false;
  });

  volChart.subscribeCrosshairMove(p => {
    if (syncingCross) return;
    syncingCross = true;
    const bar = p.time ? lastCandles.find(c => c.time === p.time) : null;
    if (bar) {
      updateLegends(bar);
      chart.setCrosshairPosition(bar.close, p.time, candleSeries);
    } else {
      chart.clearCrosshairPosition();
      if (lastCandles.length) updateLegends(lastCandles.at(-1));
    }
    syncingCross = false;
  });

  db.collection('user_settings').doc('watchlist_v2').onSnapshot(doc => {
    favMap = doc.exists ? (doc.data().items || {}) : {};
    favGroup.innerHTML = Object.entries(favMap).map(([sym, name]) => `<option value="${sym}">⭐ ${name} (${sym})</option>`).join('');
  });

  function updateStatusText() {
    if (isDrawMode) {
      const toolName = drawToolSelect.options[drawToolSelect.selectedIndex].text;
      statusBadge.style.color = '#ffeb3b';
      statusBadge.textContent = pendingPoint ? `🟢 ${toolName}：請點第 2 點` : `🟢 ${toolName}：請點圖表位置`;
    } else {
      statusBadge.style.color = '#4caf50';
      const total = priceLines.length + cloudShapes.length;
      statusBadge.textContent = `☁️ ${currentName} (${currentSymbol}) | ${total}圖`;
    }
  }

  function subscribeCloud(sym) {
    if (unsub) unsub();
    unsub = db.collection('chart_drawings').doc(encodeURIComponent(sym)).onSnapshot(doc => {
      priceLines.forEach(l => candleSeries.removePriceLine(l));
      priceLines = [];
      const data = doc.exists ? doc.data() : {};
      (data.lines || []).forEach(item => priceLines.push(candleSeries.createPriceLine({
        price: item.price,
        color: item.color || '#2962ff',
        lineWidth: 2,
        axisLabelVisible: true,
        title: '雲端線'
      })));
      cloudShapes = data.shapes || [];
      renderDrawings();
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
        currentName = await window.MarketAPI.fetchChineseName(currentSymbol, symbolSelect, favMap);
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
    drawBtn.classList.remove('active');
    loadData(clean, currentInterval, false);
    liveTimer = setInterval(() => loadData(currentSymbol, currentInterval, true), 15000);
  }

  // 顏色選擇器同步
  colorSelect.onchange = () => {
    customColorInput.value = colorSelect.value;
    renderDrawings();
  };
  customColorInput.oninput = () => renderDrawings();

  // 修改四方形倍數時，即時套用到目前商品所有四方形並同步至雲端
  async function applyNewRatiosToRects() {
    const ratios = getRatios();
    renderDrawings();
    const hasRect = cloudShapes.some(s => s.type === 'rect');
    if (hasRect) {
      const updated = cloudShapes.map(s => s.type === 'rect' ? { ...s, ratios } : s);
      await db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol)).set({ shapes: updated }, { merge: true });
    }
  }
  rectRatiosInput.onchange = applyNewRatiosToRects;
  rectRatiosInput.onkeydown = e => { if (e.key === 'Enter') applyNewRatiosToRects(); };

  drawBtn.onclick = () => {
    isDrawMode = !isDrawMode;
    pendingPoint = null;
    hoverPoint = null;
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

  undoDrawBtn.onclick = async () => {
    const docRef = db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol));
    if (cloudShapes.length > 0) {
      const nextShapes = cloudShapes.slice(0, -1);
      await docRef.set({ shapes: nextShapes }, { merge: true });
    } else if (priceLines.length > 0) {
      const snap = await docRef.get();
      const lines = snap.exists ? (snap.data().lines || []) : [];
      if (lines.length) {
        await docRef.set({ lines: lines.slice(0, -1) }, { merge: true });
      }
    }
  };

  clearBtn.onclick = () => {
    pendingPoint = null;
    hoverPoint = null;
    db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol)).set({ lines: [], shapes: [] });
  };

  chart.subscribeClick(async p => {
    if (!isDrawMode || !p.point) return;
    const tool = drawToolSelect.value;
    const color = getActiveColor();
    const docRef = db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol));

    if (tool === 'hline') {
      const price = candleSeries.coordinateToPrice(p.point.y);
      if (price !== null) {
        isDrawMode = false;
        drawBtn.classList.remove('active');
        await docRef.set({
          lines: firebase.firestore.FieldValue.arrayUnion({
            price: Number(price.toFixed(2)),
            color
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
          color
        })
      }, { merge: true });
      updateStatusText();
      return;
    }

    // 兩點式繪圖：兩點切線、兩點延長切線、橢圓形、四方形
    if (!pendingPoint) {
      pendingPoint = pt;
      hoverPoint = pt;
      updateStatusText();
    } else {
      const shape = {
        id: Date.now(),
        type: tool,
        p1: pendingPoint,
        p2: pt,
        color
      };
      if (tool === 'rect') {
        shape.ratios = getRatios();
      }
      isDrawMode = false;
      pendingPoint = null;
      hoverPoint = null;
      drawBtn.classList.remove('active');
      await docRef.set({
        shapes: firebase.firestore.FieldValue.arrayUnion(shape)
      }, { merge: true });
      updateStatusText();
    }
  });

  // 滑鼠在圖表縮放或拖曳時持續重繪 Canvas 圖形
  chartContainer.addEventListener('wheel', () => requestAnimationFrame(renderDrawings), { passive: true });
  chartContainer.addEventListener('pointermove', () => { if (cloudShapes.length || pendingPoint) requestAnimationFrame(renderDrawings); });

  [toggleMa, toggleBb, toggleDeduct].forEach(el => {
    el.onchange = () => {
      applyVisibility();
      if (lastCandles.length) updateLegends(lastCandles.at(-1));
    };
  });

  favBtn.onclick = async () => {
    const docRef = db.collection('user_settings').doc('watchlist_v2');
    const next = { ...favMap };
    if (next[currentSymbol]) {
      delete next[currentSymbol];
      statusBadge.textContent = `已移除自選 ${currentName}`;
    } else {
      next[currentSymbol] = currentName;
      statusBadge.textContent = `⭐ 已收藏 ${currentName} (${currentSymbol})`;
    }
    await docRef.set({ items: next });
  };

  symbolSelect.onchange = e => switchSymbol(e.target.value);
  intervalSelect.onchange = e => {
    currentInterval = e.target.value;
    switchSymbol(currentSymbol);
  };
  searchBtn.onclick = () => switchSymbol(customInput.value);
  customInput.onkeydown = e => { if (e.key === 'Enter') switchSymbol(customInput.value); };
  switchSymbol(currentSymbol);
}
