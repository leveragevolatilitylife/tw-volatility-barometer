/* 共用：資料載入、CSV、SVG 折線圖、手動觸發 workflow */
(function (root) {
'use strict';
var CFG = { owner: 'leveragevolatilitylife', repo: 'tw-volatility-barometer' };
function q(u) { return u + (u.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(); }
function getJSON(u) { return fetch(q(u)).then(function (r) { if (!r.ok) throw new Error(u + ' HTTP ' + r.status); return r.json(); }); }
function getText(u) { return fetch(q(u)).then(function (r) { if (!r.ok) throw new Error(u + ' HTTP ' + r.status); return r.text(); }); }
function parseCsv(t) { var L = t.trim().split(/\r?\n/), h = L[0].split(','); return { head: h, rows: L.slice(1).map(function (l) { return l.split(','); }) }; }
function num(s) { var v = parseFloat(s); return isNaN(v) ? null : v; }
/* 載入全部資料。term（對齊 market.dates）供回測；termRaw（CSV 自身日期）供即時頁。 */
function loadAll(withLive) {
  var ps = [getJSON('data/market_data.json'), getText('data/vix_term.csv'), getJSON('data/weights.json')];
  if (withLive) ps.push(getJSON('data/live.json').catch(function () { return null; }), getJSON('data/live_today.json').catch(function () { return null; }));
  return Promise.all(ps).then(function (a) {
    var mk = a[0].TW, csv = parseCsv(a[1]), h = csv.head, ix = function (k) { return h.indexOf(k); }, by = {}, raw = { date: [] };
    ['VIX9D', 'VIX1M', 'VIX3M', 'VIX6M'].forEach(function (k) { raw[k] = []; });
    csv.rows.forEach(function (r) { by[r[0]] = r; raw.date.push(r[0]); ['VIX9D', 'VIX1M', 'VIX3M', 'VIX6M'].forEach(function (k) { raw[k].push(num(r[ix(k)])); }); });
    var term = {}; ['VIX9D', 'VIX1M', 'VIX3M', 'VIX6M'].forEach(function (k) { term[k] = mk.dates.map(function (d) { var r = by[d]; return r ? num(r[ix(k)]) : null; }); });
    return { market: mk, term: term, termRaw: raw, weights: a[2], live: a[3] || null, today: a[4] || null };
  });
}
/* 風險色階（與美股即時波動率溫度計／台股輪換儀表板相同）：10 格，高風險 #FF2400 → 中位 #FFE135 → 低風險 #00FF7F */
var RISK_STEPS = (function () { var R = [255, 36, 0], M = [255, 225, 53], G = [0, 255, 127], o = []; for (var i = 0; i < 10; i++) { var t = i / 9, a = t < .5 ? R : M, b = t < .5 ? M : G, u = t < .5 ? t / .5 : (t - .5) / .5; o.push(a.map(function (v, k) { return Math.round(v + (b[k] - v) * u); })); } return o; })();
function riskRgb(risk) { if (risk == null || isNaN(risk)) return null; return RISK_STEPS[Math.min(9, Math.floor(Math.max(0, Math.min(1, 1 - risk)) * 10))]; }
function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function rkCell(risk, txt) { var c = riskRgb(risk); return c ? '<td class="rk" style="background:' + rgba(c, .62) + ';box-shadow:inset 0 0 0 1px ' + rgba(c, .9) + '">' + txt + '</td>' : '<td class="na" style="text-align:center;color:var(--text-tertiary)">' + txt + '</td>'; }
/* 溫度計折線：灰線＋依風險上色的點；th 為門檻（虛線）。hollow[i] 為空心點（資料不全） */
function riskLine(el, xs, ys, opts) {
  opts = opts || {}; var W = 900, H = opts.height || 220, pl = 38, pr = 10, pt = 10, pb = 22, n = ys.length, NS = 'http://www.w3.org/2000/svg', g = '';
  if (!n) { el.innerHTML = '<div class="note">尚無資料</div>'; return; }
  var X = function (i) { return pl + (n < 2 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (n - 1)); }, Y = function (v) { return pt + (1 - v) * (H - pt - pb); };
  [0, 0.5, 0.8, 0.9, 1].forEach(function (v) { var th = v > 0 && v < 1; g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="' + (th ? '#2a323c' : '#171e26') + '"' + (th ? ' stroke-dasharray="4 4"' : '') + '/><text x="' + (pl - 5) + '" y="' + (Y(v) + 3) + '" text-anchor="end">' + Math.round(v * 100) + '</text>'; });
  g += '<path d="' + ys.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join('') + '" fill="none" stroke="#8a97a6" stroke-width="1.4" vector-effect="non-scaling-stroke" opacity=".8"/>';
  var r = n > 60 ? (n > 300 ? 1.4 : 2.2) : 4.5;
  ys.forEach(function (v, i) { var c = riskRgb(v).join(','), h = opts.hollow && opts.hollow[i]; g += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="' + r + '" fill="' + (h ? '#0a0e14' : 'rgb(' + c + ')') + '" stroke="rgb(' + c + ')" stroke-width="' + (h ? 1.8 : 0) + '"><title>' + xs[i] + '　' + Math.round(v * 100) + '%</title></circle>'; });
  var step = Math.max(1, Math.ceil(n / 9)); xs.forEach(function (x, i) { if (i % step === 0 || i === n - 1) g += '<text x="' + X(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + x + '</text>'; });
  el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:' + H + 'px;display:block">' + g + '</svg>';
}
var fmt = {
  n: function (v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); },
  p: function (v, d) { return v == null || isNaN(v) ? '—' : (v * 100).toFixed(d == null ? 1 : d) + '%'; }
};
var COLORS = ['#c9805f', '#6d8fb3', '#c9a688', '#34d399', '#a78bfa', '#e0645f', '#fbbf24'];
/* series: [{name,color,y:[],dash}]；x: 標籤陣列（日期字串）；opts:{log,height,yfmt,zero} */
function lineChart(el, x, series, opts) {
  opts = opts || {}; var W = el.clientWidth || 700, H = opts.height || 280, m = { l: 48, r: 12, t: 10, b: 22 }, w = W - m.l - m.r, h = H - m.t - m.b;
  var lo = Infinity, hi = -Infinity, n = x.length;
  series.forEach(function (s) { s.y.forEach(function (v) { if (v != null && !isNaN(v) && (!opts.log || v > 0)) { if (v < lo) lo = v; if (v > hi) hi = v; } }); });
  if (!isFinite(lo)) { el.innerHTML = '<div class="note">無資料</div>'; return; }
  if (opts.zero) lo = Math.min(lo, 0); if (hi === lo) { hi += 1; lo -= 1; }
  var T = opts.log ? Math.log : function (v) { return v; }, a = T(lo), b = T(hi), pad = (b - a) * 0.05; a -= pad; b += pad;
  var X = function (i) { return m.l + (n <= 1 ? 0 : i / (n - 1) * w); }, Y = function (v) { return m.t + h - (T(v) - a) / (b - a) * h; };
  var g = '', ticks = 5;
  for (var t = 0; t <= ticks; t++) { var tv = a + (b - a) * t / ticks, val = opts.log ? Math.exp(tv) : tv, yy = m.t + h - t / ticks * h;
    g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yy + '" y2="' + yy + '" stroke="#171e26"/><text x="' + (m.l - 6) + '" y="' + (yy + 3) + '" text-anchor="end">' + (opts.yfmt ? opts.yfmt(val) : val.toFixed(val > 100 ? 0 : 2)) + '</text>'; }
  var xt = Math.min(6, n); for (var k = 0; k < xt; k++) { var ii = Math.round(k / Math.max(1, xt - 1) * (n - 1)); g += '<text x="' + X(ii) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 ? 'start' : k === xt - 1 ? 'end' : 'middle') + '">' + String(x[ii]).slice(0, opts.xlen || 7) + '</text>'; }
  series.forEach(function (s) {
    var d = '', pen = false; for (var i = 0; i < n; i++) { var v = s.y[i]; if (v == null || isNaN(v) || (opts.log && v <= 0)) { pen = false; continue; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }
    g += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="' + (s.w || 1.6) + '"' + (s.dash ? ' stroke-dasharray="4 3"' : '') + '/>';
  });
  if (n <= 3) series.forEach(function (s) { s.y.forEach(function (v, i) { if (v != null && !isNaN(v)) g += '<circle cx="' + X(i) + '" cy="' + Y(v) + '" r="3.5" fill="' + s.color + '"/>'; }); });
  (opts.hlines || []).forEach(function (hl) { if (hl.v > lo && hl.v < hi) g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(hl.v) + '" y2="' + Y(hl.v) + '" stroke="' + (hl.c || '#55626f') + '" stroke-dasharray="3 3"/>'; });
  el.innerHTML = '<svg width="' + W + '" height="' + H + '" style="display:block">' + g + '<line id="hv" y1="' + m.t + '" y2="' + (m.t + h) + '" stroke="#55626f" style="display:none"/></svg><div class="legend">' + series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + s.name + '</span>'; }).join('') + '</div><div class="note mono" id="tip" style="min-height:18px"></div>';
  var svg = el.querySelector('svg'), hv = svg.querySelector('#hv'), tip = el.querySelector('#tip');
  svg.addEventListener('mousemove', function (e) { var r = svg.getBoundingClientRect(), px = e.clientX - r.left, i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / w * (n - 1))));
    hv.setAttribute('x1', X(i)); hv.setAttribute('x2', X(i)); hv.style.display = ''; tip.textContent = x[i] + '　' + series.map(function (s) { return s.name + ' ' + (s.y[i] == null ? '—' : (opts.yfmt ? opts.yfmt(s.y[i]) : Number(s.y[i]).toFixed(2))); }).join('　'); });
  svg.addEventListener('mouseleave', function () { hv.style.display = 'none'; });
}
/* 手動觸發 workflow：token 只存在此瀏覽器 localStorage（fine-grained PAT，僅本 repo、Actions 讀寫） */
function triggerWorkflow(file, inputs) {
  var tk = null; try { tk = localStorage.getItem('twb_token'); } catch (e) {}
  if (!tk) { tk = prompt('貼上 GitHub fine-grained token（僅限 ' + CFG.repo + '、Actions: Read and write；只存在這個瀏覽器）'); if (!tk) return Promise.reject(new Error('未提供 token')); try { localStorage.setItem('twb_token', tk); } catch (e) {} }
  return fetch('https://api.github.com/repos/' + CFG.owner + '/' + CFG.repo + '/actions/workflows/' + file + '/dispatches', { method: 'POST', headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json' }, body: JSON.stringify({ ref: 'main', inputs: inputs || {} }) })
    .then(function (r) { if (r.status === 401 || r.status === 403) { try { localStorage.removeItem('twb_token'); } catch (e) {} } if (r.status !== 204) throw new Error('HTTP ' + r.status); });
}
root.TWC = { CFG: CFG, getJSON: getJSON, loadAll: loadAll, fmt: fmt, lineChart: lineChart, triggerWorkflow: triggerWorkflow, COLORS: COLORS, RISK_STEPS: RISK_STEPS, riskRgb: riskRgb, rgba: rgba, rkCell: rkCell, riskLine: riskLine };
})(window);
