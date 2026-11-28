window.MarketAPI = {
  worker: 'https://' + 'yahoo-proxy.slaveandpoor' + '.workers.dev/?url=',
  twNameCache: null,
  twLoadPromise: null,

  async loadTwStockNames() {
    if (this.twNameCache) return this.twNameCache;

    // 1. 優先讀取 localStorage 快取（有效期 24 小時）
    try {
      const saved = JSON.parse(localStorage.getItem('tw_stock_names_v1') || 'null');
      if (saved && Date.now() - saved.ts < 86400000 && Object.keys(saved.map).length > 1000) {
        this.twNameCache = saved.map;
        return this.twNameCache;
      }
    } catch (e) {}

    // 2. 避免重複併發請求
    if (this.twLoadPromise) return this.twLoadPromise;

    this.twLoadPromise = (async () => {
      const map = {};
      const fetchJson = async (url) => {
        try {
          const r = await fetch(url);
          if (r.ok) return await r.json();
        } catch (e) {}
        // 若遇跨域限制則改走 Cloudflare Worker 代理
        const r2 = await fetch(this.worker + encodeURIComponent(url));
        return r2.ok ? await r2.json() : [];
      };

      try {
        const [twseList, tpexList] = await Promise.all([
          fetchJson('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),
          fetchJson('https://tpex.org.tw')
        ]);

        if (Array.isArray(twseList)) {
          twseList.forEach(item => {
            if (item.Code && item.Name) map[`${item.Code.trim()}.TW`] = item.Name.trim();
          });
        }
        if (Array.isArray(tpexList)) {
          tpexList.forEach(item => {
            if (item.SecuritiesCompanyCode && item.CompanyName) {
              map[`${item.SecuritiesCompanyCode.trim()}.TWO`] = item.CompanyName.trim();
            }
          });
        }

        if (Object.keys(map).length > 1000) {
          this.twNameCache = map;
          try {
            localStorage.setItem('tw_stock_names_v1', JSON.stringify({ ts: Date.now(), map }));
          } catch (e) {}
        }
      } catch (e) {}

      this.twLoadPromise = null;
      return map;
    })();

    return this.twLoadPromise;
  },

  async fetchChineseName(sym, selectEl, favMap) {
    // 1. 優先比對預設下拉選單與雲端自選清單
    const opt = [...selectEl.options].find(o => o.value === sym);
    if (opt) return opt.textContent.replace(/^⭐\s*/, '').split(' (')[0];
    if (favMap[sym]) return favMap[sym];

    // 2. 若為台股 (.TW / .TWO)，查詢證交所與櫃買中心中文對照表
    if (sym.endsWith('.TW') || sym.endsWith('.TWO')) {
      const twMap = await this.loadTwStockNames();
      if (twMap[sym]) return twMap[sym];
    }

    // 3. 其餘市場（美股、指數等）走 Yahoo Finance 搜尋
    try {
      const sUrl = 'https://' + 'query1.finance.yahoo' + `.com/v1/finance/search?q=${encodeURIComponent(sym)}&lang=zh-Hant-TW&region=TW&quotesCount=1`;
      const res = await fetch(this.worker + encodeURIComponent(sUrl));
      const q = (await res.json()).quotes?.at(0);
      return q?.shortname || q?.longname || sym;
    } catch (e) {
      return sym;
    }
  },

  parseYahoo(raw) {
    const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const r = json.chart.result.at(0), q = r.indicators.quote.at(0);
    const list = r.timestamp.map((t, i) => ({
      time: t,
      open: Number(q.open.at(i)?.toFixed(2)),
      high: Number(q.high.at(i)?.toFixed(2)),
      low: Number(q.low.at(i)?.toFixed(2)),
      close: Number(q.close.at(i)?.toFixed(2)),
      volume: q.volume ? (q.volume.at(i) || 0) : 0
    })).filter(c => !isNaN(c.open) && !isNaN(c.close));
    if (!list.length) throw new Error('empty');
    return list;
  },

  async queryYahoo(sym, intv) {
    // 60分線與日線設為 2年 (2y)，週線與月線設為極大化 (max)
    const rangeMap = {
      '60m': '2y',
      '1d': '2y',
      '1wk': 'max',
      '1mo': 'max'
    };
    const yUrl = 'https://' + 'query1.finance.yahoo' + `.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${intv}&range=${rangeMap[intv] || '2y'}`;
    try {
      const res = await fetch(this.worker + encodeURIComponent(yUrl));
      if (res.ok) return this.parseYahoo(await res.text());
    } catch (e) {}
    return null;
  },

  async fetchCandles(rawSym, intv) {
    if (rawSym.endsWith('USDT')) {
      const bMap = { '60m': '1h', '1d': '1d', '1wk': '1w', '1mo': '1M' };
      const res = await fetch('https://' + 'api.binance' + `.com/api/v3/klines?symbol=${rawSym}&interval=${bMap[intv] || '1d'}&limit=1000`);
      return {
        sym: rawSym,
        data: (await res.json()).map(d => ({
          time: Number(d.at(0)) / 1000,
          open: Number(d.at(1)),
          high: Number(d.at(2)),
          low: Number(d.at(3)),
          close: Number(d.at(4)),
          volume: Number(d.at(5))
        }))
      };
    }
    const candidates = /^[0-9]{4,6}[A-Z]?$/.test(rawSym) ? [`${rawSym}.TW`, `${rawSym}.TWO`] : [rawSym];
    for (const cSym of candidates) {
      const data = await this.queryYahoo(cSym, intv);
      if (data) return { sym: cSym, data };
    }
    throw new Error(`查無 ${rawSym} 或連線逾時`);
  }
};
