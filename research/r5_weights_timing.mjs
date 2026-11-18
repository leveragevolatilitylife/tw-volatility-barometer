// 權重方案（等權／排名加權 walk-forward／極端加權）× 成交時點（次日開盤／當日收盤(13:25決策)／次日收盤）
import { TWB, E, mk, T, ds } from './lib.mjs';
const cost = { commissionRate: 0.1425, taxRate: 0.1 }, BULL = '00631L', BEAR = '00635U';
const ind1 = TWB.buildIndicators(mk, T, { lag: true }), ind0 = TWB.buildIndicators(mk, T, { lag: false });
const R1 = TWB.riskSeries(ind1, 1000), R0 = TWB.riskSeries(ind0, 1000), n = ds.n, ret = ds.returns[BULL];
const next = ret.map((_, i) => (i + 1 < n ? ret[i + 1] : NaN));
const mask = (b, cov, mc) => b.map((v, i) => (cov[i] < mc ? NaN : v));
const TIM = [
  ['A 次日開盤（訊號用前一日資料）', 'open'],
  ['B 次日收盤（訊號用前一日資料）', 'close1'],
  ['C 當日收盤前（訊號用當日資料，13:25 決策）', 'close0']];
const out = {};
for (const sch of ['equal', 'rank', 'extreme']) for (const [tn, tk] of TIM) for (const th of [0.8, 0.85, 0.9]) {
  const R = tk === 'close0' ? R0 : R1, rr = tk === 'open' ? ret : next;
  const W = TWB.schemeWeights(sch, R, rr, ds.dates), c = TWB.combineW(R, W), sig = TWB.signal3(mask(c.b, c.cov, 0.7), th, 1.01);
  const r = tk === 'open' ? E.runBacktest(ds, sig, BULL, BEAR, cost) : TWB.runCloseExec(ds, sig, BULL, BEAR, cost);
  out[[sch, tk, th].join('|')] = { r, sig };
}
const first = (s) => s.findIndex((x) => x != null);
const i0 = Math.max(...Object.values(out).map((o) => first(o.sig)), ds.assetInfo[BULL].validFromIdx, ds.assetInfo[ds.anchor].validFromIdx), i1 = n - 1, mid = ds.dates.findIndex((d) => d >= '2021-01-01');
const st = (r, a, b) => { const e = E.sliceAndNormalize(r.equity, a, b); let sw = 0; for (let i = a + 1; i <= b; i++) if (r.appliedAsset[i] !== r.appliedAsset[i - 1]) sw++; return E.computeStats(e, sw, 1.5); };
const f = (s) => `${(s.cagr * 100).toFixed(1).padStart(5)}% Sh${s.sharpe.toFixed(2)} DD${(s.maxDD * 100).toFixed(0).padStart(4)}%`;
console.log('共同區間', ds.dates[i0], '~', ds.dates[i1], '(', i1 - i0 + 1, '日)');
const bh = { equity: ds.returns[BULL].reduce((a, x, i) => (a.push(i ? a[i - 1] * (1 + x) : 1), a), []), appliedAsset: ds.dates.map(() => BULL) };
console.log('買進持有 00631L 全期', f(st(bh, i0, i1)), '| 前段', f(st(bh, i0, mid - 1)), '| 後段', f(st(bh, mid, i1)));
for (const sch of ['equal', 'rank', 'extreme']) for (const [tn, tk] of TIM) for (const th of [0.8, 0.85, 0.9]) {
  const o = out[[sch, tk, th].join('|')]; console.log(sch.padEnd(8), tk.padEnd(7), 'θ' + th, '全期', f(st(o.r, i0, i1)), '| 前段(~2020)', f(st(o.r, i0, mid - 1)), '| 後段(2021~)', f(st(o.r, mid, i1)), '換倉', o.r.trades);
}
// 權重快照：排名權重在各年的排序
const Wr = TWB.weightsRankWF(R1, ret, ds.dates); const seen = {};
ds.dates.forEach((d, i) => { const y = d.slice(0, 4); if (!seen[y] && Wr[i] && y >= '2017') { seen[y] = 1; console.log('rankW', y, Wr[i].map((w, k) => TWB.IND[k].k + ':' + (w * 100 / TWB.TIERS.reduce((a, b) => a + b, 0)).toFixed(0)).join(' ')); } });
// 時段報酬分解：溫度計分帶 vs 00631L 隔夜(收→開)與日內(開→收)平均報酬（bp）
const c = TWB.combine(R1, R1.map(() => 1)), o = mk.assets[BULL].o, cl = mk.assets[BULL].c, bands = [[0, 0.5, '平靜<50'], [0.5, 0.8, '升溫50-80'], [0.8, 0.9, '高壓80-90'], [0.9, 1.01, '極端≥90']];
console.log('\n時段報酬分解（訊號=前一日資料的溫度計；平均 bp / 日；樣本 i0 起）');
for (const [lo, hi, nm] of bands) { let nO = 0, sO = 0, nI = 0, sI = 0; for (let i = i0; i < n; i++) { const b = c.b[i]; if (isNaN(b) || c.cov[i] < 0.7 || b < lo || b >= hi) continue; if (o[i] && cl[i - 1]) { sO += o[i] / cl[i - 1] - 1; nO++; } if (o[i] && cl[i]) { sI += cl[i] / o[i] - 1; nI++; } }
  console.log(nm.padEnd(10), 'N', nO, '隔夜', (sO / nO * 1e4).toFixed(1), 'bp 日內', (sI / nI * 1e4).toFixed(1), 'bp'); }
