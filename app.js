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
  const ohlcLegend = document.getElementById('ohlc-legend'), volLegend = document.getElementById('vol-legend');
  const symbolSelect = document.getElementById('symbol-select'), favGroup = document.getElementById('fav-group');
  const intervalSelect = document.getElementById('interval-select'), customInput = document.getElementById('custom-symbol'), searchBtn = document.getElementById('search-btn');
  const favBtn = document.getElementById('fav-btn'), colorSelect = document.getElementById('color-select'), drawBtn = document.getElementById('draw-hline-btn'), clearBtn = document.getElementById('clear-lines-btn');
  const toggleMa = document.getElementById('toggle-ma'), toggleBb = document.getElementById('toggle-bb'), toggleDeduct = document.getElementById('toggle-deduct');

  let isDrawMode = false, priceLines = [], currentSymbol = symbolSelect.value, currentName = '台積電', currentInterval = intervalSelect.value;
  let unsub = null, liveTimer = null, favMap = {}, lastCandles = [], syncingCross = false, indicators = null;

  const baseOpts = {
    autoSize: true,
    layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
    grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
    rightPriceScale: { borderColor: '#2a2e39', minimumWidth: 80 },
    crosshair: { mode: 1 }
  };
  const chart = LightweightCharts.createChart(chartContainer, { ...baseOpts, timeScale: { visible: false } });
  const volChart = LightweightCharts.createChart(volumeContainer, { ...baseOpts, timeScale: { borderColor: '#2a2e39', timeVisible: true } });

  const candleSeries = chart.addCandlestickSeries({
    upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350'
  });
  const volumeSeries = volChart.addHistogramSeries({ priceFormat: { type: 'volume' } });

  // K線移動平均線設定 (MA3, MA6, MA18, MA60, MA120, MA240)
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

  // 布林通道 (20期, 上下2倍標準差)
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

  // 成交量均線設定 (MA5, MA10)
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

  chart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r) volChart.timeScale().setVisibleLogicalRange(r); });
  volChart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r) chart.timeScale().setVisibleLogicalRange(r); });

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
      candleSeries.setMarkers([]);
      return;
    }
    const len = lastCandles.length;
    const grouped = new Map();

    // 計算每條均線的扣抵位置（第 len - period 根 K 棒，下一根 K 棒形成時會扣抵掉這一根）
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

    candleSeries.setMarkers(markers);
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
  }

  chart.subscribeCrosshairMove(p => {
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

  function subscribeCloud(sym) {
    if (unsub) unsub();
    unsub = db.collection('chart_drawings').doc(encodeURIComponent(sym)).onSnapshot(doc => {
      priceLines.forEach(l => candleSeries.removePriceLine(l));
      priceLines = [];
      (doc.exists ? (doc.data().lines || []) : []).forEach(item => priceLines.push(candleSeries.createPriceLine({
        price: item.price,
        color: item.color || '#2962ff',
        lineWidth: 2,
        axisLabelVisible: true,
        title: '雲端線'
      })));
      statusBadge.style.color = '#4caf50';
      statusBadge.textContent = `☁️ ${currentName} (${sym}) | ${priceLines.length}線`;
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
    loadData(clean, currentInterval, false);
    liveTimer = setInterval(() => loadData(currentSymbol, currentInterval, true), 15000);
  }

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

  drawBtn.onclick = () => {
    isDrawMode = !isDrawMode;
    drawBtn.classList.toggle('active', isDrawMode);
    statusBadge.textContent = isDrawMode ? '🟢 請點圖表價位' : `☁️ ${currentName} (${currentSymbol}) | ${priceLines.length}線`;
  };

  clearBtn.onclick = () => db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol)).set({ lines: [] });

  chart.subscribeClick(async p => {
    if (!isDrawMode || !p.point) return;
    const price = candleSeries.coordinateToPrice(p.point.y);
    if (price !== null) {
      isDrawMode = false;
      drawBtn.classList.remove('active');
      await db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol)).set({
        lines: firebase.firestore.FieldValue.arrayUnion({
          price: Number(price.toFixed(2)),
          color: colorSelect.value
        })
      }, { merge: true });
    }
  });

  symbolSelect.onchange = e => switchSymbol(e.target.value);
  intervalSelect.onchange = e => {
    currentInterval = e.target.value;
    switchSymbol(currentSymbol);
  };
  searchBtn.onclick = () => switchSymbol(customInput.value);
  customInput.onkeydown = e => { if (e.key === 'Enter') switchSymbol(customInput.value); };
  switchSymbol(currentSymbol);
}
