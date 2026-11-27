window.MarketAPI = {
  worker: 'https://' + 'yahoo-proxy.slaveandpoor' + '.workers.dev/?url=',

  async fetchChineseName(sym, selectEl, favMap) {
    const opt = [...selectEl.options].find(o => o.value === sym);
    if (opt) return opt.textContent.replace(/^⭐\s*/, '').split(' (');
    if (favMap[sym]) return favMap[sym];
    try {
      const sUrl = 'https://' + 'query1.finance.yahoo' + `.com/v1/finance/search?q=${encodeURIComponent(sym)}&lang=zh-Hant-TW&region=TW&quotesCount=1`;
      const res = await fetch(this.worker + encodeURIComponent(sUrl));
      const q = (await res.json()).quotes?.at(0);
      return q?.shortname || q?.longname || sym;
    } catch (e) { return sym; }
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
    const rangeMap = { '60m': '1mo', '1d': '2y', '1wk': '5y', '1mo': '10y' };
    const yUrl = 'https://' + 'query1.finance.yahoo' + `.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${intv}&range=${rangeMap[intv] || '1y'}`;
    try {
      const res = await fetch(this.worker + encodeURIComponent(yUrl));
      if (res.ok) return this.parseYahoo(await res.text());
    } catch (e) {}
    return null;
  },

  async fetchCandles(rawSym, intv) {
    if (rawSym.endsWith('USDT')) {
      const bMap = { '60m': '1h', '1d': '1d', '1wk': '1w', '1mo': '1M' };
      const res = await fetch('https://' + 'api.binance' + `.com/api/v3/klines?symbol=${rawSym}&interval=${bMap[intv] || '1d'}&limit=250`);
      return { sym: rawSym, data: (await res.json()).map(d => ({ time: Number(d.at(0))/1000, open: Number(d.at(1)), high: Number(d.at(2)), low: Number(d.at(3)), close: Number(d.at(4)), volume: Number(d.at(5)) })) };
    }
    const candidates = /^[0-9]{4,6}[A-Z]?$/.test(rawSym) ? [`${rawSym}.TW`, `${rawSym}.TWO`] : [rawSym];
    for (const cSym of candidates) {
      const data = await this.queryYahoo(cSym, intv);
      if (data) return { sym: cSym, data };
    }
    throw new Error(`查無 ${rawSym} 或連線逾時`);
  }
};
