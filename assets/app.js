(function () {
'use strict';
var F = TWC.fmt, $ = function (id) { return document.getElementById(id); };
function twToday() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' })).toISOString().slice(0, 10).replace(/./, function (c) { return c; }); }
function todayStr() { var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()); return p; }
function gauge(b, cov) {
  var W = 320, H = 190, cx = 160, cy = 160, r = 120, a0 = Math.PI, bands = TWB.BANDS, cols = ['#6d8fb3', '#c9a688', '#c9805f', '#e0645f'], g = '', prev = 0;
  function pt(v, rr) { var a = a0 - v * Math.PI; return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; }
  bands.forEach(function (bd, i) { var e = Math.min(bd.max, 1), p1 = pt(prev, r), p2 = pt(e, r), q1 = pt(e, r - 16), q2 = pt(prev, r - 16);
    g += '<path d="M' + p1 + ' A' + r + ' ' + r + ' 0 0 1 ' + p2 + ' L' + q1 + ' A' + (r - 16) + ' ' + (r - 16) + ' 0 0 0 ' + q2 + ' Z" fill="' + cols[i] + '" opacity=".85"/>'; prev = e; });
  if (!isNaN(b)) { var n = pt(b, r - 26); g += '<line x1="' + cx + '" y1="' + cy + '" x2="' + n[0] + '" y2="' + n[1] + '" stroke="#e7edf3" stroke-width="3" stroke-linecap="round"/><circle cx="' + cx + '" cy="' + cy + '" r="6" fill="#e7edf3"/>'; }
  g += '<text x="30" y="178">0</text><text x="290" y="178" text-anchor="end">100</text>';
  $('gauge').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:380px;display:block;margin:0 auto">' + g + '</svg><div style="text-align:center"><span class="big ' + (isNaN(b) ? '' : TWB.band(b).cls) + '">' + (isNaN(b) ? '—' : Math.round(b * 100)) + '</span><div class="sub">' + (isNaN(b) ? '' : TWB.band(b).name) + '　覆蓋率 ' + F.p(cov, 0) + '</div></div>';
}
function build(D) {
  var mk = D.market, px = mk.assets[mk.anchor].c, raw = D.termRaw, w = TWB.IND.map(function (m) { return D.weights.weights[m.k] || 0; });
  var nzr = {}; ['VIX9D', 'VIX1M', 'VIX3M', 'VIX6M'].forEach(function (k) { nzr[k] = TWB.nz(raw[k]); });
  var hist = {
    'VIX1M': nzr.VIX1M, 'VIX9D:VIX1M': nzr.VIX9D.map(function (a, i) { return a / nzr.VIX1M[i]; }), 'VIX1M:VIX3M': nzr.VIX1M.map(function (a, i) { return a / nzr.VIX3M[i]; }),
    'VIX1M:VIX6M': nzr.VIX1M.map(function (a, i) { return a / nzr.VIX6M[i]; }), 'CashVIXOsc': nzr.VIX3M.map(function (a, i) { return a + nzr.VIX6M[i] - nzr.VIX9D[i] - nzr.VIX1M[i]; }),
    'VX30RollYield': TWB.nz(mk.rollYield), 'MA60Bias': TWB.ma60bias(px)
  };
  var li = raw.date.length - 1, lastRow = { VIX9D: raw.VIX9D[li], VIX1M: raw.VIX1M[li], VIX3M: raw.VIX3M[li], VIX6M: raw.VIX6M[li] };
  var isLive = D.live && D.live.VIX1M != null && D.live.asof.slice(0, 10) === todayStr(), src = isLive ? D.live : lastRow;
  function vec(t) {
    var ry = null; for (var i = mk.rollYield.length - 1; i >= 0; i--) if (mk.rollYield[i] != null && mk.rollYield[i] !== 0) { ry = mk.rollYield[i]; break; }
    var bias = TWB.ma60bias(px); bias = bias[bias.length - 1];
    var v9 = t.VIX9D, v1 = t.VIX1M, v3 = t.VIX3M, v6 = t.VIX6M, ok = function () { for (var k = 0; k < arguments.length; k++) if (arguments[k] == null) return false; return true; };
    return { 'VIX1M': v1, 'VIX9D:VIX1M': ok(v9, v1) ? v9 / v1 : null, 'VIX1M:VIX3M': ok(v1, v3) ? v1 / v3 : null, 'VIX1M:VIX6M': ok(v1, v6) ? v1 / v6 : null,
      'CashVIXOsc': ok(v9, v1, v3, v6) ? v3 + v6 - v9 - v1 : null, 'VX30RollYield': ry, 'MA60Bias': bias };
  }
  // 歷史百分位基準：排除最後一列（若最新值本身已在 CSV 內，避免自己比自己）
  var h2 = {}; Object.keys(hist).forEach(function (k) { h2[k] = (isLive || k === 'VX30RollYield' || k === 'MA60Bias') ? hist[k] : hist[k].slice(0, -1); });
  var cur = vec(src), res = TWB.liveBarometer(h2, cur, w, D.weights.lookback);
  var prevH = {}; Object.keys(hist).forEach(function (k) { prevH[k] = (k === 'VX30RollYield' || k === 'MA60Bias') ? hist[k] : hist[k].slice(0, -2); });
  var prevRes = TWB.liveBarometer(prevH, vec(lastRow), w, D.weights.lookback);
  // badge
  var bd = $('badge'); bd.className = 'badge ' + (isLive ? 'live' : 'stale'); bd.innerHTML = isLive ? '<span class="dot"></span>LIVE' : '收盤資料';
  $('asof').textContent = isLive ? D.live.asof.slice(5, 16).replace('T', ' ') : raw.date[li];
  gauge(res.b, res.cov);
  $('gaugeSub').innerHTML = (isNaN(prevRes.b) ? '' : '前一收盤 ' + Math.round(prevRes.b * 100) + '　') + (isLive ? '盤中即時' : '以最近收盤計算');
  // term
  var lab = ['9D', '1M', '3M', '6M'], keys = ['VIX9D', 'VIX1M', 'VIX3M', 'VIX6M'], p5 = li - 5;
  var ser = [{ name: isLive ? '即時' : '最新收盤', color: '#c9805f', y: keys.map(function (k) { return src[k]; }), w: 2.4 }, { name: '前一收盤 ' + raw.date[li - (isLive ? 0 : 1)].slice(5), color: '#6d8fb3', y: keys.map(function (k) { return raw[k][li - (isLive ? 0 : 1)]; }) }, { name: '5日前 ' + raw.date[p5].slice(5), color: '#55626f', dash: true, y: keys.map(function (k) { return raw[k][p5]; }) }];
  TWC.lineChart($('term'), lab, ser, { height: 220, xlen: 3, yfmt: function (v) { return v.toFixed(1); } });
  $('termNums').innerHTML = keys.map(function (k) { return '<span>' + k + ' <b style="color:var(--text-primary)">' + F.n(src[k], 1) + '</b></span>'; }).join('') + '<span>Osc <b style="color:var(--text-primary)">' + F.n(cur.CashVIXOsc, 1) + '</b></span>';
  // table
  var rows = '<tr><th>指標</th><th>目前值</th><th>歷史百分位</th><th>風險</th><th style="min-width:110px"></th></tr>';
  res.rows.forEach(function (r) { rows += '<tr><td title="' + r.hint + '">' + r.label + '</td><td>' + (r.value == null ? '—' : (r.k === 'MA60Bias' || r.k === 'VX30RollYield' ? F.n(r.value * (r.k === 'VX30RollYield' ? 100 : 1), 2) + '%' : F.n(r.value, r.k.indexOf(':') > 0 ? 3 : 1))) + '</td><td>' + F.p(r.pct, 0) + '</td><td>' + F.p(r.risk, 0) + '</td><td><div class="bar"><i style="width:' + (r.risk == null ? 0 : r.risk * 100) + '%"></i></div></td></tr>'; });
  $('ind').innerHTML = rows; $('indNote').textContent = '風險＝依方向換算的百分位（越高越緊張）。缺值指標自動剔除並重新正規化（例：2023 年前缺週選時 9D 無資料）。權重：等權。';
  // today
  var pts = D.today && D.today.date === todayStr() ? D.today.points : [];
  if (pts.length) TWC.lineChart($('today'), pts.map(function (p) { return p.t; }), [{ name: 'VIX9D', color: '#c9805f', y: pts.map(function (p) { return p.VIX9D; }) }, { name: 'VIX1M', color: '#c9a688', y: pts.map(function (p) { return p.VIX1M; }) }, { name: 'VIX3M', color: '#6d8fb3', y: pts.map(function (p) { return p.VIX3M; }) }], { height: 200, xlen: 5, yfmt: function (v) { return v.toFixed(1); } });
  else $('today').innerHTML = '<div class="note">今日尚無盤中資料（休市或尚未開盤；盤中每 10 分鐘更新）。</div>';
  if (D.live && D.live.spot && D.live.spot.last) $('spot').textContent = '台指現貨 ' + F.n(D.live.spot.last, 0) + '（日內 ' + F.n(D.live.spot.low, 0) + ' – ' + F.n(D.live.spot.high, 0) + '；前收 ' + F.n(D.live.spot.ref, 0) + '）。來源：' + D.live.source;
  // signals（回測規則的最新輸出）
  var ds = BT.buildDataset(mk), n = ds.n, last = n - 1;
  var ryS = BT.computeVixSignal(ds.rollYield, 1000, 'advanced', 28, 1, 0.5), maS = BT.computeMASignal(ds.prices[ds.anchor], ds.opens[ds.anchor] || ds.prices[ds.anchor], 60, 20, 'open');
  var hy = BT.combineSignals(maS, ryS, 'HOLD'), hy2 = BT.combineSignals(maS, ryS, 'OR');
  var ind = TWB.buildIndicators(mk, D.term, { lag: true }), R = TWB.riskSeries(ind, 1000), B = TWB.combine(R, w).b;
  var oscP = TWB.pctSeries(ind.CashVIXOsc, 1000).map(function (p) { return p * 100; });
  var gate = hy.map(function (_, i) { return isNaN(oscP[i]) || hy[i] == null || hy2[i] == null ? null : (oscP[i] < 30 ? hy2[i] : hy[i]); });
  var tb = TWB.signal3(B, 0.85, 1.01), defs = [['VX30 Roll Yield 輪動（28/1/0.5）', ryS], ['Hybrid（均線＋Roll Yield，分歧不輪動）', hy], ['Hybrid II（OR）', hy2], ['反向閘門（Osc 百分位<30 用 II，其餘用 Hybrid）', gate], ['溫度計規則（≥0.85 轉空）', tb]];
  var h = '<tr><th>策略</th><th>訊號</th><th>持有</th><th>已持續(日)</th></tr>';
  defs.forEach(function (d) { var s = d[1], i = last; while (i >= 0 && s[i] == null) i--; var cur2 = s[i], run = 1; for (var j = i - 1; j >= 0 && s[j] === cur2; j--) run++;
    h += '<tr><td>' + d[0] + '</td><td>' + (cur2 ? '<span class="pos ' + (cur2 === 'BULL' ? 'bull' : 'bear') + '">' + cur2 + '</span>' : '—') + '</td><td>' + (cur2 === 'BULL' ? '00631L' : cur2 === 'BEAR' ? '00635U' : '—') + '</td><td>' + (cur2 ? run : '—') + '</td></tr>'; });
  $('sig').innerHTML = h + '<tr><td colspan="4" class="note" style="text-align:left">資料最後交易日：' + mk.dates[last] + '（台指衍生訊號落後一日；Roll Yield 為前一晚美股）</td></tr>';
}
TWC.loadAll(true).then(build).catch(function (e) { $('err').textContent = '資料載入失敗：' + e.message; console.error(e); });
$('refresh').onclick = function () { var b = this; b.disabled = true; $('refreshMsg').textContent = '觸發中…'; TWC.triggerWorkflow('live.yml', {}).then(function () { $('refreshMsg').textContent = '已觸發，約 1–2 分鐘後重新整理頁面。'; }).catch(function (e) { $('refreshMsg').textContent = '失敗：' + e.message; }).then(function () { b.disabled = false; }); };
})();
