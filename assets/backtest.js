(function () {
'use strict';
var F = TWC.fmt, $ = function (id) { return document.getElementById(id); };
var D, ds, R1, R0, params = {}, cache = {};
var PD = [['t1', '轉空門檻 t1', 0.4, 0.99, 0.01, 0.85], ['t2', '極端壓力轉多 t2（>1=關閉）', 0.9, 1.01, 0.01, 1.01], ['mc', '最低指標覆蓋率', 0.5, 1, 0.05, 0.7]];
var SCH = [['equal', '等權（預設）'], ['rank', '排名加權（walk-forward，參考美股分級權重）'], ['extreme', '極端加權（依當日歷史分位距 50% 的距離）'], ['manual', '手動權重']];
var TIM = [['open', 'A 次日開盤成交（訊號用前一日資料）'], ['close1', 'B 次日收盤成交（訊號用前一日資料）'], ['close0', 'C 當日收盤前成交（訊號用當日資料，≈13:25 決策）']];
function drawParams() {
  var h = ''; PD.forEach(function (d) { h += '<label class="f">' + d[1] + ' <b id="v_' + d[0] + '">' + d[5] + '</b></label><input type="range" id="p_' + d[0] + '" min="' + d[2] + '" max="' + d[3] + '" step="' + d[4] + '" value="' + d[5] + '">'; });
  h += '<div id="manual" style="display:none"><label class="f">指標權重（0＝停用）</label>'; TWB.IND.forEach(function (m) { h += '<div class="wrow"><span>' + m.label + '</span><input type="range" id="w_' + m.k + '" min="0" max="3" step="0.5" value="1"><b id="wv_' + m.k + '">1</b></div>'; }); h += '</div>';
  $('params').innerHTML = h;
  Array.prototype.forEach.call($('params').querySelectorAll('input'), function (e) { e.oninput = function () { var v = $((e.id.indexOf('w_') === 0 ? 'wv_' : 'v_') + e.id.replace(/^(p|w)_/, '')); if (v) v.textContent = e.value; if (e.id.indexOf('w_') === 0) { params[e.id] = parseFloat(e.value); cache = {}; } run(); }; });
}
function readP() { var p = {}; PD.forEach(function (d) { var e = $('p_' + d[0]); p[d[0]] = e ? parseFloat(e.value) : d[5]; }); return p; }
function nextRet(bull) { var r = ds.returns[bull]; return r.map(function (_, i) { return i + 1 < r.length ? r[i + 1] : NaN; }); }
function sigOf(scheme, timing, bull, p) {
  var R = timing === 'close0' ? R0 : R1, key = [scheme, timing, bull, JSON.stringify(params)].join('|'), W = cache[key];
  if (!W) {
    if (scheme === 'manual') { var w = TWB.IND.map(function (m) { return params['w_' + m.k] == null ? 1 : params['w_' + m.k]; }); W = R[0].map(function () { return w; }); }
    else W = TWB.schemeWeights(scheme, R, timing === 'open' ? ds.returns[bull] : nextRet(bull), ds.dates);
    cache[key] = W;
  }
  var c = TWB.combineW(R, W); return TWB.signal3(c.b.map(function (v, i) { return c.cov[i] < p.mc ? NaN : v; }), p.t1, p.t2);
}
function exec(sig, timing, bull, bear, fee, tax) { var cost = { commissionRate: fee, taxRate: tax }; return timing === 'open' ? BT.runBacktest(ds, sig, bull, bear, cost) : TWB.runCloseExec(ds, sig, bull, bear, cost); }
function firstIdx(sig) { for (var i = 0; i < sig.length; i++) if (sig[i] != null) return i; return sig.length; }
function tradesOf(r) { var out = [], cur = null; for (var i = 0; i < ds.n; i++) { var a = r.appliedAsset[i]; if (!cur || cur.asset !== a) { if (cur && cur.asset !== 'CASH') { cur.exit = ds.dates[i]; cur.ret = r.equity[i - 1] / r.equity[cur.i - 1] - 1; cur.days = i - cur.i; out.push(cur); } cur = { asset: a, entry: ds.dates[i], i: i }; } }
  if (cur && cur.asset !== 'CASH') { cur.exit = '持有中'; cur.ret = r.equity[ds.n - 1] / r.equity[Math.max(0, cur.i - 1)] - 1; cur.days = ds.n - cur.i; out.push(cur); } return out; }
function run() {
  try {
    var bull = $('bull').value, bear = $('bear').value, fee = parseFloat($('fee').value), tax = parseFloat($('tax').value), p = readP(), sch = $('scheme').value, tm = $('timing').value;
    $('manual').style.display = sch === 'manual' ? 'block' : 'none';
    var curves = [{ name: SCH.filter(function (s) { return s[0] === sch; })[0][1].split('（')[0] + '・' + tm.replace('open', 'A 開盤').replace('close1', 'B 隔日收盤').replace('close0', 'C 當日收盤'), timing: tm, color: '#c9805f', w: 2.4 }];
    if ($('cmp').checked) [['open', 'A 開盤', '#6d8fb3'], ['close1', 'B 隔日收盤', '#c9a688'], ['close0', 'C 當日收盤', '#a78bfa']].forEach(function (c) { if (c[0] !== tm) curves.push({ name: '同權重・' + c[1], timing: c[0], color: c[2] }); });
    curves.forEach(function (c) { c.sig = sigOf(sch, c.timing, bull, p); });
    var s0 = Math.max.apply(null, curves.map(function (c) { return firstIdx(c.sig); }));
    var floor = Math.max(s0, ds.assetInfo[bull].validFromIdx, ds.assetInfo[ds.anchor].validFromIdx), st = $('start').value, en = $('end').value;
    var i0 = Math.max(floor, st ? ds.dates.findIndex(function (d) { return d >= st; }) : 0), i1 = ds.n - 1;
    if (en) { var j = ds.dates.map(function (d) { return d <= en; }).lastIndexOf(true); if (j > i0) i1 = j; }
    var res = curves.map(function (c) { var r = exec(c.sig, c.timing, bull, bear, fee, tax), sw = 0; for (var i = i0 + 1; i <= i1; i++) if (r.appliedAsset[i] !== r.appliedAsset[i - 1]) sw++; var eq = BT.sliceAndNormalize(r.equity, i0, i1); return Object.assign({}, c, { r: r, eq: eq, sw: sw, st: BT.computeStats(eq, sw, 1.5) }); });
    [[bull, '買進持有 ' + bull, '#34d399'], ['0050', '買進持有 0050', '#55626f']].forEach(function (b) { if (!ds.returns[b[0]]) return; var e = [1]; for (var i = i0 + 1; i <= i1; i++) e.push(e[e.length - 1] * (1 + ds.returns[b[0]][i])); res.push({ name: b[1], color: b[2], eq: e, sw: 0, st: BT.computeStats(e, 0, 1.5), dash: true }); });
    var x = ds.dates.slice(i0, i1 + 1);
    TWC.lineChart($('eq'), x, res.map(function (c) { return { name: c.name, color: c.color, y: c.eq, w: c.w, dash: c.dash }; }), { log: $('log').checked, height: 300, xlen: 7, yfmt: function (v) { return v.toFixed(2) + '×'; } });
    TWC.lineChart($('dd'), x, res.map(function (c) { var pk = 0; return { name: c.name, color: c.color, w: c.w, dash: c.dash, y: c.eq.map(function (v) { pk = Math.max(pk, v); return (v / pk - 1) * 100; }) }; }), { height: 240, xlen: 7, yfmt: function (v) { return v.toFixed(0) + '%'; }, zero: true });
    var h = '<tr><th>方案・成交時點</th><th>CAGR</th><th>波動</th><th>Sharpe</th><th>最大回撤</th><th>Calmar</th><th>換倉</th><th>累積</th></tr>';
    res.forEach(function (c) { var s = c.st; h += '<tr><td><span style="color:' + c.color + '">■</span> ' + c.name + '</td><td>' + F.p(s.cagr) + '</td><td>' + F.p(s.annualVol) + '</td><td>' + F.n(s.sharpe) + '</td><td>' + F.p(s.maxDD, 0) + '</td><td>' + F.n(s.calmar) + '</td><td>' + c.sw + '</td><td>' + F.n(c.eq[c.eq.length - 1], 1) + '×</td></tr>'; });
    $('stats').innerHTML = h;
    $('statNote').textContent = '共同區間 ' + ds.dates[i0] + ' ～ ' + ds.dates[i1] + '（' + (i1 - i0 + 1) + ' 日）。Sharpe 無風險利率 1.5%。過去績效不代表未來；調整參數、挑選權重方案或成交時點都含過擬合風險。';
    var tl = tradesOf(res[0].r).slice(-30).reverse();
    $('trades').innerHTML = '<tr><th>持有</th><th>進場</th><th>出場</th><th>天數</th><th>報酬</th></tr>' + tl.map(function (t) { return '<tr><td>' + t.asset + '</td><td>' + t.entry + '</td><td>' + t.exit + '</td><td>' + t.days + '</td><td style="color:' + (t.ret >= 0 ? 'var(--green)' : 'var(--red)') + '">' + F.p(t.ret) + '</td></tr>'; }).join('');
    decomp(i0, i1, bull);
  } catch (e) { $('err').textContent = '回測失敗：' + e.message; console.error(e); }
}
/* 時段報酬分解：以等權溫度計（前一日資料）分帶，統計標的隔夜（前收→開盤）與日內（開盤→收盤）的平均報酬 */
function decomp(i0, i1, bull) {
  var c = TWB.combine(R1, R1.map(function () { return 1; })), o = ds.opens[bull], cl = ds.prices[bull], bands = [[0, 0.5, '平靜 <50'], [0.5, 0.8, '升溫 50–80'], [0.8, 0.9, '高壓 80–90'], [0.9, 1.01, '極端 ≥90']];
  var h = '<tr><th>溫度計分帶（前一日資料）</th><th>樣本日數</th><th>隔夜 前收→開（bp/日）</th><th>日內 開→收（bp/日）</th></tr>';
  bands.forEach(function (bd) { var nO = 0, sO = 0, nI = 0, sI = 0; for (var i = i0; i <= i1; i++) { var b = c.b[i]; if (isNaN(b) || c.cov[i] < 0.7 || b < bd[0] || b >= bd[1]) continue; if (o && o[i] && cl[i - 1]) { sO += o[i] / cl[i - 1] - 1; nO++; } if (o && o[i] && cl[i]) { sI += cl[i] / o[i] - 1; nI++; } }
    var f = function (v) { return '<td style="color:' + (v >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (v * 1e4).toFixed(1) + '</td>'; };
    h += '<tr><td>' + bd[2] + '</td><td>' + nO + '</td>' + (nO ? f(sO / nO) : '<td>—</td>') + (nI ? f(sI / nI) : '<td>—</td>') + '</tr>'; });
  $('decomp').innerHTML = h;
}
TWC.loadAll(false).then(function (d) {
  D = d; ds = BT.buildDataset(d.market);
  R1 = TWB.riskSeries(TWB.buildIndicators(d.market, d.term, { lag: true }), d.weights.lookback); R0 = TWB.riskSeries(TWB.buildIndicators(d.market, d.term, { lag: false }), d.weights.lookback);
  $('scheme').innerHTML = SCH.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('');
  $('timing').innerHTML = TIM.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('');
  var keys = ds.assetKeys; $('bull').innerHTML = keys.map(function (k) { return '<option>' + k + '</option>'; }).join(''); $('bull').value = '00631L';
  $('bear').innerHTML = keys.concat(['CASH']).map(function (k) { return '<option>' + k + '</option>'; }).join(''); $('bear').value = '00635U';
  ['scheme', 'timing', 'bull', 'bear', 'start', 'end', 'fee', 'tax', 'log', 'cmp'].forEach(function (i) { $(i).onchange = run; });
  drawParams(); run();
}).catch(function (e) { $('err').textContent = '資料載入失敗：' + e.message; console.error(e); });
})();
