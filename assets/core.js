/* 台股波動率溫度計核心（純函式，瀏覽器與 node 共用）。
   指標 → 滾動歷史百分位 → 加權平均風險分數（0=平靜、1=高壓）。缺值指標自動剔除並重新正規化。 */
(function (root) {
'use strict';
var IND = [
  { k: 'VIX1M', label: '台指 VIX（1M）', dir: 'hi', hint: '越高越緊張' },
  { k: 'VIX9D:VIX1M', label: 'VIX9D / VIX1M', dir: 'hi', hint: '短天期相對偏貴＝倒掛' },
  { k: 'VIX1M:VIX3M', label: 'VIX1M / VIX3M', dir: 'hi', hint: '>1 期限結構倒掛' },
  { k: 'VIX1M:VIX6M', label: 'VIX1M / VIX6M', dir: 'hi', hint: '>1 期限結構倒掛' },
  { k: 'CashVIXOsc', label: 'Cash VIX Oscillator', dir: 'lo', hint: '3M+6M−9D−1M，越低越緊張' },
  { k: 'VX30RollYield', label: 'VX30:VIX Roll Yield（前夜美股）', dir: 'lo', hint: '越低（逆價差）越緊張' },
  { k: 'MA60Bias', label: '0050 季線乖離(%)', dir: 'hi', hint: '越高越過熱' }
];
var BANDS = [
  { max: 0.5, name: '平靜', cls: 'calm' },
  { max: 0.8, name: '升溫', cls: 'warm' },
  { max: 0.9, name: '高壓', cls: 'hot' },
  { max: 1.01, name: '極端', cls: 'extreme' }
];
function band(b) { for (var i = 0; i < BANDS.length; i++) if (b < BANDS[i].max) return BANDS[i]; return BANDS[BANDS.length - 1]; }
function nz(a) { return a.map(function (x) { return x == null ? NaN : x; }); }
function lag(a, k) { k = k || 1; return a.map(function (_, i) { return i - k >= 0 ? a[i - k] : NaN; }); }
function ma60bias(px) {
  return px.map(function (p, i) {
    if (i < 59) return NaN; var s = 0; for (var j = i - 59; j <= i; j++) s += px[j];
    return (p / (s / 60) - 1) * 100;
  });
}
/* term: {date:[...], VIX9D..VIX6M: []}（日頻，已對齊 market.dates，缺值 null）。
   opts.lag=true：台指衍生指標落後 1 日（回測用：收盤後才算得出，隔日開盤才能用）。 */
function buildIndicators(market, term, opts) {
  var L = (opts && opts.lag) ? 1 : 0, anchor = market.assets[market.anchor].c;
  var v9 = nz(term.VIX9D), v1 = nz(term.VIX1M), v3 = nz(term.VIX3M), v6 = nz(term.VIX6M);
  var f = function (a) { return L ? lag(a, L) : a; };
  return {
    'VIX1M': f(v1),
    'VIX9D:VIX1M': f(v9.map(function (a, i) { return a / v1[i]; })),
    'VIX1M:VIX3M': f(v1.map(function (a, i) { return a / v3[i]; })),
    'VIX1M:VIX6M': f(v1.map(function (a, i) { return a / v6[i]; })),
    'CashVIXOsc': f(v3.map(function (a, i) { return a + v6[i] - v9[i] - v1[i]; })),
    'VX30RollYield': nz(market.rollYield),
    'MA60Bias': f(ma60bias(anchor))
  };
}
/* x 在其前 L 個有效觀測中的百分位（與 Volatility-Barometer 相同的中位處理）；觀測少於 minObs 回傳 NaN */
function pctOf(x, hist, minObs) {
  if (isNaN(x)) return NaN; var less = 0, eq = 0, c = 0;
  for (var j = 0; j < hist.length; j++) { var h = hist[j]; if (isNaN(h)) continue; c++; if (h < x) less++; else if (h === x) eq++; }
  if (c < (minObs || 250)) return NaN; return (less + (eq + 2) / 2) / (c + 1);
}
function pctSeries(x, L, minObs) {
  L = L || 1000; minObs = minObs || 250; var n = x.length, out = new Array(n);
  for (var i = 0; i < n; i++) {
    if (isNaN(x[i])) { out[i] = NaN; continue; }
    var less = 0, eq = 0, c = 0;
    for (var j = Math.max(0, i - L); j < i; j++) { var h = x[j]; if (isNaN(h)) continue; c++; if (h < x[i]) less++; else if (h === x[i]) eq++; }
    out[i] = c < minObs ? NaN : (less + (eq + 2) / 2) / (c + 1);
  }
  return out;
}
function riskSeries(ind, L) {
  return IND.map(function (m) { return pctSeries(ind[m.k], L).map(function (p) { return isNaN(p) ? NaN : (m.dir === 'hi' ? p : 1 - p); }); });
}
function combine(R, w) {
  var n = R[0].length, b = new Array(n).fill(NaN), cov = new Array(n).fill(0), tot = w.reduce(function (a, c) { return a + c; }, 0);
  for (var i = 0; i < n; i++) {
    var num = 0, den = 0;
    for (var k = 0; k < R.length; k++) if (!isNaN(R[k][i]) && w[k] > 0) { num += w[k] * R[k][i]; den += w[k]; }
    if (den > 0) { b[i] = num / den; cov[i] = den / tot; }
  }
  return { b: b, cov: cov };
}
/* 三區間規則：b < t1 → BULL；t1 ≤ b < t2 → BEAR；b ≥ t2 → BULL（極端壓力逢低買進，t2≥1.01 即關閉） */
function signal3(b, t1, t2) { return b.map(function (v) { return isNaN(v) ? null : (v >= t2 ? 'BULL' : (v >= t1 ? 'BEAR' : 'BULL')); }); }
/* 即時：以最新原始值對歷史（不含今日）算百分位。cur: {k: value}。 */
function liveBarometer(histInd, cur, w, L) {
  L = L || 1000; var num = 0, den = 0, tot = 0, rows = [];
  IND.forEach(function (m, k) {
    var h = histInd[m.k]; h = h.slice(Math.max(0, h.length - L));
    var x = cur[m.k], p = (x == null || isNaN(x)) ? NaN : pctOf(x, h, 250), r = isNaN(p) ? NaN : (m.dir === 'hi' ? p : 1 - p);
    tot += w[k]; if (!isNaN(r) && w[k] > 0) { num += w[k] * r; den += w[k]; }
    rows.push({ k: m.k, label: m.label, hint: m.hint, dir: m.dir, value: (x == null || isNaN(x)) ? null : x, pct: isNaN(p) ? null : p, risk: isNaN(r) ? null : r, w: w[k] });
  });
  return { b: den > 0 ? num / den : NaN, cov: tot > 0 ? den / tot : 0, rows: rows };
}
/* ===== 依「各指標歷史分位」調整權重（參考美股溫度計：權重按排名分級） ===== */
/* 美股溫度計權重由大到小：0.2597, 0.1787, 0.1787, 0.0618, 0.0357…；這裡取前 7 級（排名第 1 的指標拿最大權重），並正規化。 */
var TIERS = [0.2597, 0.1787, 0.1787, 0.0618, 0.0357, 0.0357, 0.0357];
function combineW(R, Wm) {
  var n = R[0].length, b = new Array(n).fill(NaN), cov = new Array(n).fill(0);
  for (var i = 0; i < n; i++) {
    var w = Wm[i], num = 0, den = 0, tot = 0; if (!w) continue;
    for (var k = 0; k < R.length; k++) { tot += w[k]; if (!isNaN(R[k][i]) && w[k] > 0) { num += w[k] * R[k][i]; den += w[k]; } }
    if (den > 0) { b[i] = num / den; cov[i] = den / tot; }
  }
  return { b: b, cov: cov };
}
/* 極端加權：每天依各指標「目前歷史分位」距 50% 的距離加權（越極端權重越大；floor 避免全部為 0）。無需擬合。 */
function weightsExtreme(R, floor) {
  floor = floor == null ? 0.05 : floor; var n = R[0].length, W = new Array(n);
  for (var i = 0; i < n; i++) W[i] = R.map(function (r) { return isNaN(r[i]) ? 0 : Math.abs(r[i] - 0.5) + floor; });
  return W;
}
/* 排名加權（walk-forward）：每年初，用「過去」資料估各指標的預測品質 q = −corr(風險分位, 標的當日報酬)，
   依 q 由高到低套用 TIERS 權重；樣本 < minObs 時退回等權。ret[i]＝以 R[i] 決策所賺到的標的報酬。dates 用來判斷換年。 */
function weightsRankWF(R, ret, dates, minObs) {
  minObs = minObs || 500; var n = R[0].length, W = new Array(n), cur = null, y0 = '';
  for (var i = 0; i < n; i++) {
    var y = dates[i].slice(0, 4);
    if (y !== y0) {
      y0 = y; var q = R.map(function (r) {
        var c = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
        for (var j = 0; j < i; j++) { var a = r[j], b = ret[j]; if (isNaN(a) || b == null || isNaN(b)) continue; c++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b; }
        if (c < minObs) return null; var cv = sxy / c - (sx / c) * (sy / c), vx = sxx / c - (sx / c) * (sx / c), vy = syy / c - (sy / c) * (sy / c);
        return vx > 0 && vy > 0 ? -cv / Math.sqrt(vx * vy) : 0;
      });
      if (q.some(function (v) { return v == null; })) cur = R.map(function () { return 1; });
      else { var order = q.map(function (v, k) { return k; }).sort(function (a, b) { return q[b] - q[a]; }); cur = new Array(R.length); order.forEach(function (k, rank) { cur[k] = TIERS[rank]; }); }
    }
    W[i] = cur;
  }
  return W;
}
function schemeWeights(scheme, R, ret, dates) {
  if (scheme === 'extreme') return weightsExtreme(R);
  if (scheme === 'rank') return weightsRankWF(R, ret, dates);
  var w = R.map(function () { return 1; }); return R[0].map(function () { return w; });
}
/* 收盤成交版回測：signal[i] 在第 i 日收盤成交，持有第 i+1 日（收盤對收盤）。回傳 {equity, applied, trades}。 */
function runCloseExec(ds, signal, bull, bear, cost) {
  var n = ds.n, cr = (cost && cost.commissionRate || 0) / 100, tr = (cost && cost.taxRate || 0) / 100, eq = new Array(n).fill(1), ap = new Array(n).fill('CASH'), trades = 0;
  for (var i = 1; i < n; i++) {
    var s = signal[i - 1], need = s == null ? 'CASH' : (s === 'BULL' ? bull : bear), prev = ap[i - 1], e = eq[i - 1];
    if (need !== prev) { e *= 1 - (prev === 'CASH' ? 0 : cr + tr) - (need === 'CASH' ? 0 : cr); trades++; }
    eq[i] = e * (1 + (need === 'CASH' ? 0 : ds.returns[need][i])); ap[i] = need;
  }
  return { equity: eq, appliedAsset: ap, trades: trades, tradeList: [] };
}
var api = { TIERS: TIERS, combineW: combineW, weightsExtreme: weightsExtreme, weightsRankWF: weightsRankWF, schemeWeights: schemeWeights, runCloseExec: runCloseExec, IND: IND, BANDS: BANDS, band: band, nz: nz, lag: lag, ma60bias: ma60bias, buildIndicators: buildIndicators, pctOf: pctOf, pctSeries: pctSeries,
  riskSeries: riskSeries, combine: combine, signal3: signal3, liveBarometer: liveBarometer };
if (typeof module !== 'undefined') module.exports = api; else root.TWB = api;
})(typeof window !== 'undefined' ? window : this);
