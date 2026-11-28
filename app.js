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
  let isDrawMode = false, priceLines = [], currentSymbol = symbolSelect.value, currentName = '台積電', currentInterval = intervalSelect.value, unsub = null, liveTimer = null, favMap = {}, lastCandles = [], syncingCross = false;

  const baseOpts = {
    autoSize: true,
    layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
    grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
    rightPriceScale: { borderColor: '#2a2e39', minimumWidth: 80 },
    crosshair: { mode: 1 }
  };
  const chart = LightweightCharts.createChart(chartContainer, { ...baseOpts, timeScale: { visible: false } });
  const volChart = LightweightCharts.createChart(volumeContainer, { ...baseOpts, timeScale: { borderColor: '#2a2e39', timeVisible: true } });
  const candleSeries = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
  const volumeSeries = volChart.addHistogramSeries({ priceFormat: { type: 'volume' } });

  chart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r) volChart.timeScale().setVisibleLogicalRange(r); });
  volChart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r) chart.timeScale().setVisibleLogicalRange(r); });

  const fmtTime = t => {
    const d = new Date(t * 1000);
    return currentInterval === '60m'
      ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:00`
      : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  function updateLegends(bar) {
    if (!bar) return;
    const clr = bar.close >= bar.open ? '#26a69a' : '#ef5350';
    ohlcLegend.innerHTML = `<strong style="color:#fff">${currentName} (${currentSymbol})</strong>  時間: ${fmtTime(bar.time)}  開:<span style="color:${clr}">${bar.open}</span>  高:<span style="color:${clr}">${bar.high}</span>  低:<span style="color:${clr}">${bar.low}</span>  收:<span style="color:${clr}">${bar.close}</span>`;
    const volStr = currentSymbol.endsWith('.TW') || currentSymbol.endsWith('.TWO') ? `${Math.round(bar.volume / 1000).toLocaleString()} 張` : Math.round(bar.volume).toLocaleString();
    volLegend.innerHTML = `時間: ${fmtTime(bar.time)}  |  成交量: <strong style="color:${clr}">${volStr}</strong>`;
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
        candleSeries.setData(lastCandles);
        volumeSeries.setData(lastCandles.map(d => ({
          time: d.time,
          value: d.volume,
          color: d.close >= d.open ? '#26a69a' : '#ef5350'
        })));
        if (lastCandles.length) updateLegends(lastCandles.at(-1));
        chart.timeScale().fitContent();
        volChart.timeScale().fitContent();
        subscribeCloud(currentSymbol);
      } else if (res.data.length && lastCandles.length) {
        // 背景靜默更新時只更新最新的 K 棒，避免重複重繪兩年或全歷史資料
        const map = new Map(lastCandles.map(c => [c.time, c]));
        res.data.forEach(bar => {
          map.set(bar.time, bar);
          if (bar.time >= lastCandles.at(-1).time) {
            candleSeries.update(bar);
            volumeSeries.update({
              time: bar.time,
              value: bar.volume,
              color: bar.close >= bar.open ? '#26a69a' : '#ef5350'
            });
          }
        });
        lastCandles = Array.from(map.values()).sort((a, b) => a.time - b.time);
        updateLegends(lastCandles.at(-1));
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
