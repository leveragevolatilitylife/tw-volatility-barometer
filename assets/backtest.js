(function () {
'use strict';
var F = TWC.fmt, $ = function (id) { return document.getElementById(id); };
var D, ds, ind, R, oscP, ryCache = {}, STRATS, params = {};
var PD = {
  ry: [['lb', '滾動視窗(日)', 250, 1500, 50, 1000], ['high', '高分位 %', 5, 60, 1, 28], ['low', '低分位 %', 0.5, 10, 0.5, 1], ['xlow', '極低分位 %', 0.1, 5, 0.1, 0.5]],
  baro: [['t1', '轉空門檻 t1', 0.4, 0.99, 0.01, 0.85], ['t2', '極端壓力轉多 t2（>1=關閉）', 0.9, 1.01, 0.01, 1.01], ['mc', '最低指標覆蓋率', 0.5, 1, 0.05, 0.7]],
  gate: [['T', 'Osc 百分位門檻 %', 5, 80, 1, 30]]
};
function ryRaw(p) { var k = [p.lb, p.high, p.low, p.xlow].join('|'); return ryCache[k] || (ryCache[k] = BT.computeVixSignal(ds.rollYield, p.lb, 'advanced', p.high, p.low, p.xlow)); }
function maSig() { return BT.computeMASignal(ds.prices[ds.anchor], ds.opens[ds.anchor] || ds.prices[ds.anchor], 60, 20, 'open'); }
var DEF = { lb: 1000, high: 28, low: 1, xlow: 0.5 };
function sigOf(id, p) {
  var ry = ryRaw(Object.assign({}, DEF, id === 'ry' ? p : {})), ma = maSig();
  if (id === 'bh') return ds.dates.map(function () { return 'BULL'; });
  if (id === 'ry') return ry;
  if (id === 'ma') return ma;
  if (id === 'hybrid') return BT.combineSignals(ma, ry, 'HOLD');
  if (id === 'hybrid2') return BT.combineSignals(ma, ry, 'OR');
  if (id === 'gate') { var h1 = BT.combineSignals(ma, ry, 'HOLD'), h2 = BT.combineSignals(ma, ry, 'OR'), T = (p.T == null ? 30 : p.T);
    return h1.map(function (_, i) { return isNaN(oscP[i]) || h1[i] == null || h2[i] == null ? null : (oscP[i] < T ? h2[i] : h1[i]); }); }
  if (id === 'baro') { var w = TWB.IND.map(function (m) { return params['w_' + m.k] == null ? 1 : params['w_' + m.k]; }); var cb = TWB.combine(R, w), mc = p.mc == null ? 0.7 : p.mc; return TWB.signal3(cb.b.map(function (v, i) { return cb.cov[i] < mc ? NaN : v; }), p.t1, p.t2); }
}
STRATS = [['baro', '溫度計規則（等權／可調權重）'], ['ry', 'VX30 Roll Yield 輪動'], ['ma', '0050 均線輪動（60MA＋乖離20%）'], ['hybrid', 'Hybrid（均線＋Roll Yield，分歧不輪動）'], ['hybrid2', 'Hybrid II（OR）'], ['gate', '反向閘門（壓力區用 II，其餘 Hybrid）'], ['bh', '買進持有（多方標的）']];
function readParams(id) { var p = {}; (PD[id] || []).forEach(function (d) { var e = $('p_' + d[0]); p[d[0]] = e ? parseFloat(e.value) : d[5]; }); return p; }
function drawParams() {
  var id = $('strat').value, h = '';
  (PD[id] || []).forEach(function (d) { h += '<label class="f">' + d[1] + ' <b id="v_' + d[0] + '">' + d[5] + '</b></label><input type="range" id="p_' + d[0] + '" min="' + d[2] + '" max="' + d[3] + '" step="' + d[4] + '" value="' + d[5] + '">'; });
  if (id === 'baro') { h += '<label class="f">指標權重（0＝停用；預設等權）</label>'; TWB.IND.forEach(function (m) { h += '<div class="wrow"><span>' + m.label + '</span><input type="range" id="w_' + m.k + '" min="0" max="3" step="0.5" value="1"><b id="wv_' + m.k + '">1</b></div>'; }); h += '<div class="note">研究結論：最佳化權重樣本外不穩，預設等權（見下方）。</div>'; }
  $('params').innerHTML = h;
  Array.prototype.forEach.call($('params').querySelectorAll('input'), function (e) { e.oninput = function () { var v = $((e.id.indexOf('w_') === 0 ? 'wv_' : 'v_') + e.id.replace(/^(p|w)_/, '')); if (v) v.textContent = e.value; if (e.id.indexOf('w_') === 0) params[e.id] = parseFloat(e.value); run(); }; });
}
function firstIdx(sig) { for (var i = 0; i < sig.length; i++) if (sig[i] != null) return i; return sig.length; }
function bt(sig, bull, bear, fee, tax) { return BT.runBacktest(ds, sig, bull, bear, { commissionRate: fee, taxRate: tax }); }
function run() {
  try {
    var id = $('strat').value, bull = $('bull').value, bear = $('bear').value, fee = parseFloat($('fee').value), tax = parseFloat($('tax').value);
    var p = readParams(id), curves = [{ id: id, name: STRATS.filter(function (s) { return s[0] === id; })[0][1], sig: sigOf(id, p), color: '#c9805f', w: 2.4 }];
    if ($('cmp').checked) [['hybrid', 'Hybrid', '#6d8fb3'], ['hybrid2', 'Hybrid II', '#c9a688'], ['ry', 'Roll Yield', '#a78bfa']].forEach(function (c) { if (c[0] !== id) curves.push({ id: c[0], name: c[1], sig: sigOf(c[0], {}), color: c[2] }); });
    var s0 = Math.max.apply(null, curves.map(function (c) { return firstIdx(c.sig); }));
    var floor = Math.max(s0, ds.assetInfo[bull].validFromIdx, ds.assetInfo[ds.anchor].validFromIdx), st = $('start').value, en = $('end').value;
    var i0 = Math.max(floor, st ? ds.dates.findIndex(function (d) { return d >= st; }) : 0), i1 = ds.n - 1;
    if (en) { var j = ds.dates.map(function (d) { return d <= en; }).lastIndexOf(true); if (j > i0) i1 = j; }
    var res = curves.map(function (c) { var r = bt(c.sig, bull, bear, fee, tax), sw = 0; for (var i = i0 + 1; i <= i1; i++) if (r.appliedAsset[i] !== r.appliedAsset[i - 1]) sw++; var eq = BT.sliceAndNormalize(r.equity, i0, i1); return Object.assign({}, c, { r: r, eq: eq, sw: sw, st: BT.computeStats(eq, sw, 1.5) }); });
    [[bull, '買進持有 ' + bull, '#34d399'], ['0050', '買進持有 0050', '#55626f']].forEach(function (b) { if (!ds.returns[b[0]]) return; var e = [1]; for (var i = i0 + 1; i <= i1; i++) e.push(e[e.length - 1] * (1 + ds.returns[b[0]][i])); res.push({ name: b[1], color: b[2], eq: e, sw: 0, st: BT.computeStats(e, 0, 1.5), dash: true }); });
    var x = ds.dates.slice(i0, i1 + 1);
    TWC.lineChart($('eq'), x, res.map(function (c) { return { name: c.name, color: c.color, y: c.eq, w: c.w, dash: c.dash }; }), { log: $('log').checked, height: 300, xlen: 7, yfmt: function (v) { return v.toFixed(2) + '×'; } });
    TWC.lineChart($('dd'), x, res.map(function (c) { var pk = 0; return { name: c.name, color: c.color, w: c.w, dash: c.dash, y: c.eq.map(function (v) { pk = Math.max(pk, v); return (v / pk - 1) * 100; }) }; }), { height: 240, xlen: 7, yfmt: function (v) { return v.toFixed(0) + '%'; }, zero: true });
    var h = '<tr><th>策略</th><th>CAGR</th><th>波動</th><th>Sharpe</th><th>最大回撤</th><th>Calmar</th><th>換倉</th><th>累積</th></tr>';
    res.forEach(function (c) { var s = c.st; h += '<tr><td><span style="color:' + c.color + '">■</span> ' + c.name + '</td><td>' + F.p(s.cagr) + '</td><td>' + F.p(s.annualVol) + '</td><td>' + F.n(s.sharpe) + '</td><td>' + F.p(s.maxDD, 0) + '</td><td>' + F.n(s.calmar) + '</td><td>' + c.sw + '</td><td>' + F.n(c.eq[c.eq.length - 1], 1) + '×</td></tr>'; });
    $('stats').innerHTML = h;
    $('statNote').textContent = '共同區間 ' + ds.dates[i0] + ' ～ ' + ds.dates[i1] + '（' + (i1 - i0 + 1) + ' 日；起點取各訊號皆有值之處）。Sharpe 無風險利率 1.5%。過去績效不代表未來；參數在樣本內調整者含過擬合風險。';
    var tl = res[0].r && res[0].r.tradeList ? res[0].r.tradeList.slice(-30).reverse() : [];
    $('trades').innerHTML = '<tr><th>持有</th><th>進場</th><th>出場</th><th>天數</th><th>報酬</th></tr>' + tl.map(function (t) { return '<tr><td>' + t.asset + '</td><td>' + t.entryDate + '</td><td>' + t.exitDate + (t.open ? '（持有中）' : '') + '</td><td>' + t.holdingDays + '</td><td style="color:' + (t.returnPct >= 0 ? 'var(--green)' : 'var(--red)') + '">' + F.p(t.returnPct) + '</td></tr>'; }).join('');
  } catch (e) { $('err').textContent = '回測失敗：' + e.message; console.error(e); }
}
TWC.loadAll(false).then(function (d) {
  D = d; ds = BT.buildDataset(d.market); ind = TWB.buildIndicators(d.market, d.term, { lag: true }); R = TWB.riskSeries(ind, d.weights.lookback);
  oscP = TWB.pctSeries(ind.CashVIXOsc, d.weights.lookback).map(function (p) { return p * 100; });
  $('strat').innerHTML = STRATS.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('');
  var keys = ds.assetKeys; $('bull').innerHTML = keys.map(function (k) { return '<option>' + k + '</option>'; }).join(''); $('bull').value = '00631L';
  $('bear').innerHTML = keys.concat(['CASH']).map(function (k) { return '<option>' + k + '</option>'; }).join(''); $('bear').value = '00635U';
  $('strat').onchange = function () { drawParams(); run(); }; ['bull', 'bear', 'start', 'end', 'fee', 'tax', 'log', 'cmp'].forEach(function (i) { $(i).onchange = run; });
  drawParams(); run();
}).catch(function (e) { $('err').textContent = '資料載入失敗：' + e.message; console.error(e); });
})();
