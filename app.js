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
  const chartContainer = document.getElementById('chart-container'), symbolSelect = document.getElementById('symbol-select'), favGroup = document.getElementById('fav-group');
  const intervalSelect = document.getElementById('interval-select'), customInput = document.getElementById('custom-symbol'), searchBtn = document.getElementById('search-btn');
  const favBtn = document.getElementById('fav-btn'), colorSelect = document.getElementById('color-select'), drawBtn = document.getElementById('draw-hline-btn'), clearBtn = document.getElementById('clear-lines-btn');
  let isDrawMode = false, priceLines = [], currentSymbol = symbolSelect.value, currentInterval = intervalSelect.value, unsub = null, liveTimer = null, favList = [];

  const chart = LightweightCharts.createChart(chartContainer, { width: chartContainer.clientWidth || window.innerWidth, height: chartContainer.clientHeight || (window.innerHeight - 52), layout: { background: { color: '#131722' }, textColor: '#d1d4dc' }, grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } }, rightPriceScale: { borderColor: '#2a2e39' }, timeScale: { borderColor: '#2a2e39', timeVisible: true } });
  const candleSeries = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });

  db.collection('user_settings').doc('watchlist').onSnapshot((doc) => {
    favList = doc.exists ? (doc.data().symbols || []) : [];
    favGroup.innerHTML = favList.map(s => `<option value="${s}">⭐ ${s}</option>`).join('');
  });

  function subscribeCloud(sym) {
    if (unsub) unsub();
    unsub = db.collection('chart_drawings').doc(encodeURIComponent(sym)).onSnapshot((doc) => {
      priceLines.forEach(l => candleSeries.removePriceLine(l)); priceLines = [];
      (doc.exists ? (doc.data().lines || []) : []).forEach(item => priceLines.push(candleSeries.createPriceLine({ price: item.price, color: item.color || '#2962ff', lineWidth: 2, axisLabelVisible: true, title: '雲端線' })));
      statusBadge.style.color = '#4caf50'; statusBadge.textContent = `☁️ ${sym} | ${priceLines.length}線 (10s更新)`;
    });
  }

  function parseYahoo(raw) {
    const json = typeof raw === 'string' ? JSON.parse(raw) : (raw.contents ? JSON.parse(raw.contents) : raw);
    const r = json.chart.result.at(0), q = r.indicators.quote.at(0);
    const list = r.timestamp.map((t, i) => ({ time: t, open: q.open.at(i), high: q.high.at(i), low: q.low.at(i), close: q.close.at(i) })).filter(c => c.open !== null && c.close !== null);
    if (!list.length) throw new Error('empty');
    return list;
  }

  async function queryYahooFast(sym, intv) {
    const range = intv === '1d' ? '1y' : (intv === '1h' ? '1mo' : '5d');
    const y1 = 'https://' + 'query1.finance.yahoo' + `.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${intv}&range=${range}`;
    const y2 = 'https://' + 'query2.finance.yahoo' + `.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${intv}&range=${range}`;
    const urls = [
      'https://' + 'api.codetabs' + `.com/v1/proxy?quest=${encodeURIComponent(y1)}`,
      'https://' + 'api.allorigins' + `.win/raw?url=${encodeURIComponent(y2)}`,
      'https://' + 'corsproxy' + `.io/?${encodeURIComponent(y1)}`,
      'https://' + 'thingproxy.freeboard' + `.io/fetch/${y2}`
    ];
    try {
      return await Promise.any(urls.map(u => fetch(u).then(r => { if (!r.ok) throw new Error(); return r.text(); }).then(parseYahoo)));
    } catch (e) { return null; }
  }

  async function fetchCandles(rawSym, intv) {
    if (rawSym.endsWith('USDT')) {
      const res = await fetch('https://' + 'api.binance' + `.com/api/v3/klines?symbol=${rawSym}&interval=${intv}&limit=200`);
      return { sym: rawSym, data: (await res.json()).map(d => ({ time: Number(d.at(0))/1000, open: Number(d.at(1)), high: Number(d.at(2)), low: Number(d.at(3)), close: Number(d.at(4)) })) };
    }
    const candidates = /^[0-9]{4,6}[A-Z]?$/.test(rawSym) ? [`${rawSym}.TW`, `${rawSym}.TWO`] : [rawSym];
    for (const cSym of candidates) {
      const data = await queryYahooFast(cSym, intv);
      if (data) return { sym: cSym, data };
    }
    throw new Error(`查無 ${rawSym} 或連線逾時`);
  }

  async function loadData(sym, intv, silent = false) {
    if (!silent) { statusBadge.style.color = '#ffeb3b'; statusBadge.textContent = `⏳ 搜尋 ${sym}...`; }
    try {
      const res = await fetchCandles(sym, intv);
      currentSymbol = res.sym;
      candleSeries.setData(res.data);
      if (!silent) { chart.timeScale().fitContent(); subscribeCloud(currentSymbol); }
    } catch (err) { if (!silent) { statusBadge.style.color = '#ef5350'; statusBadge.textContent = `❌ ${err.message}`; } }
  }

  function switchSymbol(s) {
    const clean = s.trim().toUpperCase(); if (!clean) return;
    if (liveTimer) clearInterval(liveTimer);
    loadData(clean, currentInterval, false);
    liveTimer = setInterval(() => loadData(currentSymbol, currentInterval, true), 10000);
  }

  favBtn.onclick = async () => {
    const exists = favList.includes(currentSymbol);
    await db.collection('user_settings').doc('watchlist').set({ symbols: exists ? firebase.firestore.FieldValue.arrayRemove(currentSymbol) : firebase.firestore.FieldValue.arrayUnion(currentSymbol) }, { merge: true });
    statusBadge.textContent = exists ? `已移除自選 ${currentSymbol}` : `⭐ 已加入雲端自選 ${currentSymbol}`;
  };
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
