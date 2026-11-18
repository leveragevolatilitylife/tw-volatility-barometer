// 研究共用：與網站相同的核心（assets/core.js）與回測引擎（assets/bt-engine.js）。
import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
export const TWB = require('../assets/core.js'), E = require('../assets/bt-engine.js');
const root = new URL('../', import.meta.url).pathname;
export const mk = JSON.parse(fs.readFileSync(root + 'data/market_data.json', 'utf8')).TW;
const csv = fs.readFileSync(root + 'data/vix_term.csv', 'utf8').trim().split('\n'), hd = csv[0].split(','), by = {};
csv.slice(1).forEach((l) => { const c = l.split(','); by[c[0]] = c; });
export const T = {}; ['VIX9D', 'VIX1M', 'VIX3M', 'VIX6M'].forEach((k) => { T[k] = mk.dates.map((d) => { const r = by[d]; if (!r) return null; const v = parseFloat(r[hd.indexOf(k)]); return isNaN(v) ? null : v; }); });
export const ds = E.buildDataset(mk);
export const IND = TWB.IND;
const ind = TWB.buildIndicators(mk, T, { lag: true });
export const risks = (L = 1000) => TWB.riskSeries(ind, L);
export const barometer = (R, w) => TWB.combine(R, w);
export const signalFromB = (b, th) => TWB.signal3(b, th, 1.01);
export const run = (sig) => E.runBacktest(ds, sig, '00631L', '00635U', { commissionRate: 0.1425, taxRate: 0.1 });
export const dailyRets = (r) => r.equity.map((e, i) => (i ? e / r.equity[i - 1] - 1 : 0));
export const statsFromRets = (rr, idx, rf = 1.5) => { const e = [1]; for (const i of idx) e.push(e[e.length - 1] * (1 + rr[i])); return E.computeStats(e, 0, rf); };
