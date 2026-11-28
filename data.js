window.MarketAPI = {
  worker: 'https://' + 'yahoo-proxy.slaveandpoor' + '.workers.dev/?url=',
  nameCache: {},

  async fetchChineseName(sym, selectEl, favMap) {
    if (this.nameCache[sym]) return this.nameCache[sym];

    const opt = [...selectEl.options].find(o => o.value === sym);
    if (opt) {
      const name = opt.textContent.replace(/^⭐\s*/, '').split(' (')[0].trim();
      this.nameCache[sym] = name;
      return name;
    }

    if (favMap && favMap[sym] && /[\u4e00-\u9fa5]/.test(favMap[sym])) {
      this.nameCache[sym] = favMap[sym];
      return favMap[sym];
    }

    if (sym.endsWith('.TW') || sym.endsWith('.TWO')) {
      try {
        const twUrl = `https://tw.stock.yahoo.com/quote/${encodeURIComponent(sym)}`;
        const res = await fetch(this.worker + encodeURIComponent(twUrl));
        if (res.ok) {
          const html = await res.text();
          const titleMatch = html.match(/<title[^>]*>([^<(（]+)/i);
          if (titleMatch && titleMatch[1]) {
            const cleaned = titleMatch[1].trim();
            if (cleaned && cleaned !== 'Yahoo奇摩股市' && /[\u4e00-\u9fa5]/.test(cleaned)) {
              this.nameCache[sym] = cleaned;
              return cleaned;
            }
          }
        }
      } catch (e) {}
    }

    try {
      const sUrl = 'https://' + 'query1.finance.yahoo' + `.com/v1/finance/search?q=${encodeURIComponent(sym)}&lang=zh-Hant-TW®ion=TW"esCount=1`;
      const res = await fetch(this.worker + encodeURIComponent(sUrl));
      const q = (await res.json()).quotes?.at(0);
      const fallbackName = q?.shortname || q?.longname || sym;
      this.nameCache[sym] = fallbackName;
      return fallbackName;
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

  async queryYahoo(sym, intv, customRange = null) {
    const rangeMap = { '60m': '2y', '1d': '2y', '1wk': 'max', '1mo': 'max' };
    const range = customRange || rangeMap[intv] || '2y';
    const yUrl = 'https://' + 'query1.finance.yahoo' + `.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${intv}&range=${range}`;
    try {
      const res = await fetch(this.worker + encodeURIComponent(yUrl));
      if (res.ok) return this.parseYahoo(await res.text());
    } catch (e) {}
    return null;
  },

  async fetchCandles(rawSym, intv, isIncremental = false) {
    if (rawSym.endsWith('USDT')) {
      const bMap = { '60m': '1h', '1d': '1d', '1wk': '1w', '1mo': '1M' };
      const limit = isIncremental ? 5 : 1000;
      const res = await fetch('https://' + 'api.binance' + `.com/api/v3/klines?symbol=${rawSym}&interval=${bMap[intv] || '1d'}&limit=${limit}`);
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
    const quickRange = isIncremental ? (intv === '60m' ? '5d' : '1mo') : null;

    for (const cSym of candidates) {
      const data = await this.queryYahoo(cSym, intv, quickRange);
      if (data) return { sym: cSym, data };
    }
    throw new Error(`查無 ${rawSym} 或連線逾時`);
  },

  computeIndicators(candles) {
    const maPeriods = [3, 6, 18, 60, 120, 240];
    const volPeriods = [5, 10];
    const maSeries = Object.fromEntries(maPeriods.map(p => [p, []]));
    const volMaSeries = Object.fromEntries(volPeriods.map(p => [p, []]));
    const bbUpper = [], bbMid = [], bbLower = [];
    const byTime = new Map();

    const prefixClose = [0];
    const prefixVol = [0];
    for (let i = 0; i < candles.length; i++) {
      prefixClose.push(prefixClose[i] + candles[i].close);
      prefixVol.push(prefixVol[i] + (candles[i].volume || 0));
    }

    for (let i = 0; i < candles.length; i++) {
      const t = candles[i].time;
      const info = { ma: {}, volMa: {}, bb: null };

      for (const p of maPeriods) {
        if (i >= p - 1) {
          const val = Number(((prefixClose[i + 1] - prefixClose[i + 1 - p]) / p).toFixed(2));
          maSeries[p].push({ time: t, value: val });
          info.ma[p] = val;
        }
      }

      for (const p of volPeriods) {
        if (i >= p - 1) {
          const val = Math.round((prefixVol[i + 1] - prefixVol[i + 1 - p]) / p);
          volMaSeries[p].push({ time: t, value: val });
          info.volMa[p] = val;
        }
      }

      if (i >= 19) {
        const mean = (prefixClose[i + 1] - prefixClose[i - 19]) / 20;
        let sqDiffSum = 0;
        for (let j = i - 19; j <= i; j++) {
          const diff = candles[j].close - mean;
          sqDiffSum += diff * diff;
        }
        const std = Math.sqrt(sqDiffSum / 20);
        const mid = Number(mean.toFixed(2));
        const up = Number((mean + 2 * std).toFixed(2));
        const low = Number((mean - 2 * std).toFixed(2));
        bbMid.push({ time: t, value: mid });
        bbUpper.push({ time: t, value: up });
        bbLower.push({ time: t, value: low });
        info.bb = { up, mid, low };
      }

      byTime.set(t, info);
    }

    return { maSeries, volMaSeries, bbUpper, bbMid, bbLower, byTime };
  }
};
