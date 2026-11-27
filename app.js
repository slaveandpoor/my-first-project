const statusBadge = document.getElementById('status-badge');
const loadAny = (urls, name) => new Promise(async (resolve, reject) => {
  for (const src of urls) {
    try { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); return resolve(); } catch (e) {}
  }
  reject(new Error(`${name} 失敗`));
});

(async () => {
  try {
    const jsd = 'https://' + 'cdn.jsdelivr' + '.net';
    const gst = 'https://' + 'www.gstatic' + '.com';
    await loadAny([jsd + '/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js', 'https://' + 'unpkg' + '.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js'], '圖表');
    await loadAny([gst + '/firebasejs/10.12.2/firebase-app-compat.js', jsd + '/npm/firebase@10.12.2/firebase-app-compat.js'], 'Firebase');
    await loadAny([gst + '/firebasejs/10.12.2/firebase-firestore-compat.js', jsd + '/npm/firebase@10.12.2/firebase-firestore-compat.js'], 'Firestore');
    initApp();
  } catch (e) { statusBadge.style.color = '#ef5350'; statusBadge.textContent = `❌ ${e.message}`; }
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
  const chartContainer = document.getElementById('chart-container'), symbolSelect = document.getElementById('symbol-select'), intervalSelect = document.getElementById('interval-select');
  const customInput = document.getElementById('custom-symbol'), searchBtn = document.getElementById('search-btn'), colorSelect = document.getElementById('color-select'), drawBtn = document.getElementById('draw-hline-btn'), clearBtn = document.getElementById('clear-lines-btn');
  let isDrawMode = false, priceLines = [], currentSymbol = symbolSelect.value, currentInterval = intervalSelect.value, unsub = null, liveTimer = null;

  const chart = LightweightCharts.createChart(chartContainer, { width: chartContainer.clientWidth || window.innerWidth, height: chartContainer.clientHeight || (window.innerHeight - 52), layout: { background: { color: '#131722' }, textColor: '#d1d4dc' }, grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } }, rightPriceScale: { borderColor: '#2a2e39' }, timeScale: { borderColor: '#2a2e39', timeVisible: true } });
  const candleSeries = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });

  function subscribeCloud(sym) {
    if (unsub) unsub();
    unsub = db.collection('chart_drawings').doc(encodeURIComponent(sym)).onSnapshot((doc) => {
      priceLines.forEach(l => candleSeries.removePriceLine(l)); priceLines = [];
      (doc.exists ? (doc.data().lines || []) : []).forEach(item => priceLines.push(candleSeries.createPriceLine({ price: item.price, color: item.color || '#2962ff', lineWidth: 2, axisLabelVisible: true, title: '雲端線' })));
      statusBadge.style.color = '#4caf50'; statusBadge.textContent = `☁️ ${sym} | ${priceLines.length}線 (10s更新)`;
    });
  }

  async function fetchCandles(sym, intv) {
    if (sym.endsWith('USDT')) {
      const res = await fetch('https://' + 'api.binance' + `.com/api/v3/klines?symbol=${sym}&interval=${intv}&limit=200`);
      return (await res.json()).map(d => ({ time: Number(d.at(0))/1000, open: Number(d.at(1)), high: Number(d.at(2)), low: Number(d.at(3)), close: Number(d.at(4)) }));
    }
    const range = intv === '1d' ? '1y' : (intv === '1h' ? '1mo' : '5d');
    const yUrl = 'https://' + 'query2.finance.yahoo' + `.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${intv}&range=${range}`;
    const proxies = [
      'https://' + 'api.codetabs' + `.com/v1/proxy?quest=${encodeURIComponent(yUrl)}`,
      'https://' + 'thingproxy.freeboard' + `.io/fetch/${yUrl}`,
      'https://' + 'api.allorigins' + `.win/get?url=${encodeURIComponent(yUrl)}`
    ];
    for (const pUrl of proxies) {
      try {
        const res = await fetch(pUrl); if (!res.ok) continue;
        let json = await res.json();
        if (json.contents) json = JSON.parse(json.contents);
        const r = json.chart.result.at(0), q = r.indicators.quote.at(0);
        return r.timestamp.map((t, i) => ({ time: t, open: q.open.at(i), high: q.high.at(i), low: q.low.at(i), close: q.close.at(i) })).filter(c => c.open !== null && c.close !== null);
      } catch (e) {}
    }
    throw new Error('Proxy 連線逾時，請稍後重試');
  }

  async function loadData(sym, intv, silent = false) {
    if (!silent) { statusBadge.style.color = '#ffeb3b'; statusBadge.textContent = `⏳ 讀取 ${sym}...`; }
    try { candleSeries.setData(await fetchCandles(sym, intv)); if (!silent) { chart.timeScale().fitContent(); subscribeCloud(sym); } }
    catch (err) { if (!silent) { statusBadge.style.color = '#ef5350'; statusBadge.textContent = `❌ ${err.message}`; } }
  }

  function switchSymbol(s) {
    currentSymbol = s.trim().toUpperCase(); if (!currentSymbol) return;
    if (liveTimer) clearInterval(liveTimer);
    loadData(currentSymbol, currentInterval, false);
    liveTimer = setInterval(() => loadData(currentSymbol, currentInterval, true), 10000);
  }

  drawBtn.onclick = () => { isDrawMode = !isDrawMode; drawBtn.classList.toggle('active', isDrawMode); statusBadge.textContent = isDrawMode ? '🟢 請點圖表價位' : `☁️ ${currentSymbol} | ${priceLines.length}線`; };
  clearBtn.onclick = () => db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol)).set({ lines: [] });
  chart.subscribeClick(async (p) => {
    if (!isDrawMode || !p.point) return;
    const price = candleSeries.coordinateToPrice(p.point.y);
    if (price !== null) {
      isDrawMode = false; drawBtn.classList.remove('active');
      await db.collection('chart_drawings').doc(encodeURIComponent(currentSymbol)).set({ lines: firebase.firestore.FieldValue.arrayUnion({ price: Number(price.toFixed(2)), color: colorSelect.value }) }, { merge: true });
    }
  });
  symbolSelect.onchange = e => switchSymbol(e.target.value);
  intervalSelect.onchange = e => { currentInterval = e.target.value; switchSymbol(currentSymbol); };
  searchBtn.onclick = () => switchSymbol(customInput.value);
  customInput.onkeydown = e => { if (e.key === 'Enter') switchSymbol(customInput.value); };
  window.onresize = () => chart.applyOptions({ width: chartContainer.clientWidth, height: chartContainer.clientHeight });
  switchSymbol(currentSymbol);
}
