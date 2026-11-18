// 驗證 assets/core.js 與研究腳本（research/lib.mjs）結果一致，且引擎可執行
import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const TWB = require('../assets/core.js'), BT = require('../assets/bt-engine.js');
const mk = JSON.parse(fs.readFileSync('data/market_data.json', 'utf8')).TW;
const csv = fs.readFileSync('data/vix_term.csv', 'utf8').trim().split('\n'); const hd = csv[0].split(',');
const col = (n) => hd.indexOf(n); const byDate = {};
csv.slice(1).forEach((l) => { const c = l.split(','); byDate[c[0]] = c; });
const term = {}; ['VIX9D', 'VIX1M', 'VIX3M', 'VIX6M'].forEach((k) => { term[k] = mk.dates.map((d) => { const r = byDate[d]; if (!r) return null; const v = parseFloat(r[col(k)]); return isNaN(v) ? null : v; }); });
const ind = TWB.buildIndicators(mk, term, { lag: true });
const R = TWB.riskSeries(ind, 1000), { b } = TWB.combine(R, [1, 1, 1, 1, 1, 1, 1]);
const ds = BT.buildDataset(mk), sig = TWB.signal3(b, 0.85, 1.01);
const first = b.findIndex((x, i) => !isNaN(x) && R.every((r) => !isNaN(r[i])));
const r = BT.runBacktest(ds, sig, '00631L', '00635U', { commissionRate: 0.1425, taxRate: 0.1 });
const eq = BT.sliceAndNormalize(r.equity, first, ds.n - 1), s = BT.computeStats(eq, 0, 1.5);
console.log('共同起點', ds.dates[first], 'CAGR', (s.cagr * 100).toFixed(1) + '%', 'Sharpe', s.sharpe.toFixed(2));
// 研究結果：等權 θ0.85（空方 00635U）38.6% / Sh 1.01（Sharpe 以日報酬統計；容許 0.5 pt）
if (Math.abs(s.cagr * 100 - 38.6) > 0.6) { console.error('FAIL 與研究結果不符'); process.exit(1); }
console.log('OK');
