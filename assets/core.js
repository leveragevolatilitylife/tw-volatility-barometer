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
var api = { IND: IND, BANDS: BANDS, band: band, nz: nz, lag: lag, ma60bias: ma60bias, buildIndicators: buildIndicators, pctOf: pctOf, pctSeries: pctSeries,
  riskSeries: riskSeries, combine: combine, signal3: signal3, liveBarometer: liveBarometer };
if (typeof module !== 'undefined') module.exports = api; else root.TWB = api;
})(typeof window !== 'undefined' ? window : this);
