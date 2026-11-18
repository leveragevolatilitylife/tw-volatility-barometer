(function () {
'use strict';
var F = TWC.fmt, $ = function (id) { return document.getElementById(id); };
function twToday() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' })).toISOString().slice(0, 10).replace(/./, function (c) { return c; }); }
function todayStr() { var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()); return p; }
var NS = 'http://www.w3.org/2000/svg', RS = TWC.RISK_STEPS, riskRgb = TWC.riskRgb;
function el(t, a, txt) { var e = document.createElementNS(NS, t); for (var k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; }
function polar(cx, cy, r, v) { var a = Math.PI * (1 - v); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
function arcPath(cx, cy, r, v0, v1) { var p0 = polar(cx, cy, r, v0), p1 = polar(cx, cy, r, v1); return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + r + ' ' + r + ' 0 0 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2); }
function gauge(b) {
  var s = $('gauge'); s.innerHTML = ''; var cx = 220, cy = 215, R = 160, W = 22;
  var defs = el('defs', {}), f = el('filter', { id: 'glow', x: '-30%', y: '-30%', width: '160%', height: '160%' }); f.appendChild(el('feGaussianBlur', { stdDeviation: '2.2', result: 'b' })); var mg = el('feMerge', {}); mg.appendChild(el('feMergeNode', { in: 'b' })); mg.appendChild(el('feMergeNode', { in: 'SourceGraphic' })); f.appendChild(mg); defs.appendChild(f); s.appendChild(defs);
  s.appendChild(el('path', { d: arcPath(cx, cy, R + W / 2 + 6, 0, 1), fill: 'none', stroke: '#202932', 'stroke-width': 1 }));
  for (var i = 0; i < 10; i++) { var c = RS[9 - i]; s.appendChild(el('path', { d: arcPath(cx, cy, R, i / 10 + .002, (i + 1) / 10 - .002), fill: 'none', stroke: 'rgb(' + c.join(',') + ')', 'stroke-width': W, opacity: b != null && !isNaN(b) && ((i + 1) / 10 <= b + .0001 || (i / 10 < b)) ? 1 : .32 })); }
  for (var k = 0; k <= 40; k++) { var v = k / 40, maj = k % 4 === 0, a = polar(cx, cy, R - W / 2 - 3, v), c2 = polar(cx, cy, R - W / 2 - (maj ? 13 : 8), v); s.appendChild(el('line', { x1: a[0], y1: a[1], x2: c2[0], y2: c2[1], stroke: maj ? '#8a97a6' : '#3a4654', 'stroke-width': maj ? 1.6 : 1 }));
    if (maj) { var t = polar(cx, cy, R - W / 2 - 26, v); s.appendChild(el('text', { x: t[0], y: t[1] + 3.5, 'text-anchor': 'middle', 'font-family': 'JetBrains Mono', 'font-size': 11, fill: '#8a97a6' }, Math.round(v * 100))); } }
  [[.5, '50'], [.8, '80'], [.9, '90']].forEach(function (m) { var p0 = polar(cx, cy, R + W / 2 + 2, m[0]), p1 = polar(cx, cy, R + W / 2 + 11, m[0]), t = polar(cx, cy, R + W / 2 + 23, m[0]);
    s.appendChild(el('line', { x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], stroke: '#c9805f', 'stroke-width': 2.4 }));
    s.appendChild(el('text', { x: t[0], y: t[1] + 3.5, 'text-anchor': 'middle', 'font-family': 'JetBrains Mono', 'font-size': 10.5, 'font-weight': 600, fill: '#c9805f' }, m[1])); });
  var g = el('g', { id: 'needle', filter: 'url(#glow)' }); g.style.transformOrigin = cx + 'px ' + cy + 'px'; g.style.transition = 'transform 1.1s cubic-bezier(.2,.9,.25,1)'; g.style.transform = 'rotate(0deg)';
  g.appendChild(el('polygon', { points: (cx - R + W / 2 + 2) + ',' + cy + ' ' + (cx - 12) + ',' + (cy - 4.5) + ' ' + (cx + 22) + ',' + cy + ' ' + (cx - 12) + ',' + (cy + 4.5), fill: '#f4f7fa' })); s.appendChild(g);
  s.appendChild(el('circle', { cx: cx, cy: cy, r: 13, fill: '#0a0e14', stroke: '#e7edf3', 'stroke-width': 2.5 })); s.appendChild(el('circle', { cx: cx, cy: cy, r: 4, fill: '#c9805f' }));
  var ok = b != null && !isNaN(b);
  if (ok) requestAnimationFrame(function () { requestAnimationFrame(function () { g.style.transform = 'rotate(' + (Math.max(0, Math.min(1, b)) * 180) + 'deg)'; }); });
  var c3 = ok ? riskRgb(b) : null;
  s.appendChild(el('text', { x: cx, y: cy - 52, 'text-anchor': 'middle', 'font-family': 'JetBrains Mono', 'font-size': 34, 'font-weight': 700, fill: c3 ? 'rgb(' + c3.join(',') + ')' : '#8a97a6' }, ok ? Math.round(b * 100) + '%' : '--'));
  s.appendChild(el('text', { x: cx, y: cy - 32, 'text-anchor': 'middle', 'font-family': 'Noto Sans TC', 'font-size': 11.5, fill: '#8a97a6' }, ok ? TWB.band(b).name : '等待資料'));
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
  gauge(res.b);
  var cc = riskRgb(res.b); $('val').textContent = isNaN(res.b) ? '--' : Math.round(res.b * 100) + '%'; $('val').style.color = cc ? 'rgb(' + cc.join(',') + ')' : '';
  $('zone').textContent = isNaN(res.b) ? '' : TWB.band(res.b).name + (isLive ? '・盤中即時' : '・以最近收盤計算') + (isNaN(prevRes.b) ? '' : '　前一收盤 ' + Math.round(prevRes.b * 100) + '%');
  $('kv').innerHTML = [['VIX9D', src.VIX9D, 1], ['VIX1M', src.VIX1M, 1], ['VIX3M', src.VIX3M, 1], ['VIX6M', src.VIX6M, 1], ['Cash VIX Osc', cur.CashVIXOsc, 1], ['覆蓋率', res.cov * 100, 0, '%']].map(function (k) { return '<div><small>' + k[0] + '</small><b>' + (k[1] == null || isNaN(k[1]) ? '--' : (+k[1]).toFixed(k[2]) + (k[3] || '')) + '</b></div>'; }).join('');
  if (res.cov < .95) { var wb = $('warn'); wb.style.display = 'block'; wb.textContent = '⚠ 覆蓋率 ' + Math.round(res.cov * 100) + '%：部分指標暫缺，已重新正規化，數值僅供參考。'; }
  // term
  var lab = ['9D', '1M', '3M', '6M'], keys = ['VIX9D', 'VIX1M', 'VIX3M', 'VIX6M'], p5 = li - 5;
  var ser = [{ name: isLive ? '即時' : '最新收盤', color: '#c9805f', y: keys.map(function (k) { return src[k]; }), w: 2.4 }, { name: '前一收盤 ' + raw.date[li - (isLive ? 0 : 1)].slice(5), color: '#6d8fb3', y: keys.map(function (k) { return raw[k][li - (isLive ? 0 : 1)]; }) }, { name: '5日前 ' + raw.date[p5].slice(5), color: '#55626f', dash: true, y: keys.map(function (k) { return raw[k][p5]; }) }];
  TWC.lineChart($('term'), lab, ser, { height: 220, xlen: 3, yfmt: function (v) { return v.toFixed(1); } });
  $('termNums').innerHTML = keys.map(function (k) { return '<span>' + k + ' <b style="color:var(--text-primary)">' + F.n(src[k], 1) + '</b></span>'; }).join('') + '<span>Osc <b style="color:var(--text-primary)">' + F.n(cur.CashVIXOsc, 1) + '</b></span>';
  // table
  $('scale').innerHTML = RS.slice().reverse().map(function (c) { return '<b style="background:rgb(' + c.join(',') + ')"></b>'; }).join('');
  var rows = '<tr><th>指標</th><th class="num" style="text-align:right">目前值</th><th style="text-align:center">風險分位</th><th style="text-align:right">權重</th></tr>';
  res.rows.forEach(function (r) { var vtxt = r.value == null ? '<span style="color:var(--text-tertiary)">缺</span>' : (r.k === 'MA60Bias' || r.k === 'VX30RollYield' ? F.n(r.value * (r.k === 'VX30RollYield' ? 100 : 1), 2) + '%' : F.n(r.value, r.k.indexOf(':') > 0 ? 3 : 1));
    rows += '<tr><td title="' + r.hint + '">' + r.label + '</td><td>' + vtxt + '</td>' + TWC.rkCell(r.risk, r.risk == null ? '--' : Math.round(r.risk * 100) + '%') + '<td>' + F.p(D.weights.weights[r.k] / w.reduce(function (a, b) { return a + b; }, 0), 1) + '</td></tr>'; });
  $('ind').innerHTML = rows; $('indNote').textContent = '風險分位＝該指標在近 1000 日歷史中的百分位（「低＝風險」者已反轉）。溫度計＝各指標風險分位等權平均；缺值指標自動剔除並重新正規化（例：2023 年前缺週選時 9D 無資料）。權重依 2,520 組試驗的過擬合檢定後決定採等權，詳見研究報告。';
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
  var tb = TWB.signal3(B, 0.85, 1.01), defs = [['VX30 Roll Yield 輪動', ryS, 'RULE · 28 / 1 / 0.5'], ['Hybrid', hy, '60MA + Roll Yield · 分歧不輪動'], ['Hybrid II', hy2, '60MA + Roll Yield · OR'], ['反向閘門', gate, 'Osc 百分位 &lt;30 用 II，其餘 Hybrid'], ['溫度計規則', tb, '溫度計 ≥ 0.85 轉空']];
  var cards = '';
  defs.forEach(function (d) { var sg = d[1], i = last; while (i >= 0 && sg[i] == null) i--; var cur2 = sg[i], run = 1; for (var j = i - 1; j >= 0 && sg[j] === cur2; j--) run++;
    var col = cur2 === 'BULL' ? riskRgb(.15) : cur2 === 'BEAR' ? riskRgb(.92) : null, hold = cur2 === 'BULL' ? '00631L' : cur2 === 'BEAR' ? '00635U' : '—';
    cards += '<div class="card st static"><div class="tick">' + d[2] + '</div><h2>' + d[0] + '</h2><div class="posv" style="color:' + (col ? 'rgb(' + col.join(',') + ')' : '#8a97a6') + '">' + hold + '</div><div class="desc">' + (cur2 ? (cur2 === 'BULL' ? '多方' : '空方') + '訊號，已持續 ' + run + ' 個交易日' : '資料不足') + '</div></div>'; });
  $('strats').innerHTML = cards;
  var hn = 250, hs = Math.max(0, last - hn + 1), hx = [], hy = []; for (var q2 = hs; q2 <= last; q2++) if (!isNaN(B[q2])) { hx.push(mk.dates[q2].slice(5)); hy.push(B[q2]); }
  TWC.riskLine($('hist'), hx, hy, { height: 220 });
}
TWC.loadAll(true).then(build).catch(function (e) { $('err').textContent = '資料載入失敗：' + e.message; console.error(e); });
$('refresh').onclick = function () { var b = this; b.disabled = true; $('refreshMsg').textContent = '觸發中…'; TWC.triggerWorkflow('live.yml', {}).then(function () { $('refreshMsg').textContent = '已觸發，約 1–2 分鐘後重新整理頁面。'; }).catch(function (e) { $('refreshMsg').textContent = '失敗：' + e.message; }).then(function () { b.disabled = false; }); };
})();
