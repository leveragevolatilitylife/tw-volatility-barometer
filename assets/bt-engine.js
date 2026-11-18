/* 回測引擎：自動由 scripts/build_engine.mjs 從 TWN-rotation-strategy-backtester/src/App.jsx 抽出，勿手改。 */
(function (root) {
'use strict';
function buildDataset(mk) {
  // mk: { dates, anchor, rollYield, vix, assets: { 代號: { c: 收盤價[], o: 開盤價[] | null } } }
  const { dates, rollYield, vix } = mk;
  const n = dates.length;
  const retOf = (arr) => {
    const r = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      r[i] = arr[i - 1] > 0 ? (arr[i] - arr[i - 1]) / arr[i - 1] : 0;
    }
    return r;
  };
  const prices = {};
  const opens = {};
  const returns = { CASH: new Array(n).fill(0) };
  const assetInfo = {};
  for (const key of Object.keys(mk.assets)) {
    const { c, o } = mk.assets[key];
    prices[key] = c;
    if (o) opens[key] = o;
    returns[key] = retOf(c);
    // 偵測上市前的「佔位資料」：開頭連續不變的價格（Excel 內以第一筆有效價回填）。
    // validFromIdx = 價格第一次變動的前一天；之前的報酬為 0%，不是真實行情。
    const firstChange = c.findIndex((v, i) => i > 0 && (v !== c[0] || (o && o[i] !== o[0])));
    const validFromIdx = firstChange === -1 ? n - 1 : Math.max(0, firstChange - 1);
    assetInfo[key] = { tradeable: !!o, validFromIdx, validFromDate: dates[validFromIdx] };
  }
  const assetKeys = Object.keys(assetInfo).filter((k) => assetInfo[k].tradeable); // 可輪動持有
  const signalKeys = Object.keys(assetInfo); // 可作為均線訊號標的
  return { dates, prices, opens, rollYield, vix, returns, n, assetInfo, assetKeys, signalKeys, anchor: mk.anchor };
}

function computeSMA(arr, period) {
  const n = arr.length;
  const out = new Array(n).fill(null);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += arr[i];
    if (i >= period) sum -= arr[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function computeMASignal(closePrices, openPrices, period, biasPctThreshold, priceBasis) {
  const n = closePrices.length;
  const biasThresh = biasPctThreshold / 100;
  const sig = new Array(n).fill(null);
  if (priceBasis === "open") {
    // 對應「MA Rotation II」：以「當日開盤價」與「當日開盤 + 前(period-1)日收盤」的均線比較，
    // 可在當日開盤時就取得訊號（不需等到當日收盤）。
    for (let t = period - 1; t < n; t++) {
      let sum = openPrices[t];
      for (let k = 1; k <= period - 1; k++) sum += closePrices[t - k];
      const ma = sum / period;
      if (ma === 0) continue;
      const price = openPrices[t];
      const bias = (price - ma) / ma;
      sig[t] = price > ma ? (bias < biasThresh ? "BULL" : "BEAR") : "BEAR";
    }
  } else {
    // 對應「MA Rotation」：標準以收盤價計算的簡單移動平均
    const ma = computeSMA(closePrices, period);
    for (let i = 0; i < n; i++) {
      if (ma[i] == null) continue;
      const bias = (closePrices[i] - ma[i]) / ma[i];
      sig[i] = closePrices[i] > ma[i] ? (bias < biasThresh ? "BULL" : "BEAR") : "BEAR";
    }
  }
  return sig;
}

function percentileLinear(sortedArr, pct) {
  const n = sortedArr.length;
  if (n === 0) return null;
  if (n === 1) return sortedArr[0];
  const idx = (pct / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * frac;
}

function computeRollingSortedWindows(rollYield, lookback) {
  // 昂貴的排序步驟獨立出來，供同一 lookback 的不同門檻設定重複利用（PBO 網格搜尋時大幅加速）
  const n = rollYield.length;
  const windows = new Array(n).fill(null);
  for (let i = lookback - 1; i < n; i++) {
    windows[i] = rollYield.slice(i - lookback + 1, i + 1).sort((a, b) => a - b);
  }
  return windows;
}

function computeVixSignalFromSorted(rollYield, sortedWindows, lookback, mode, highPct, lowPct, extremeLowPct) {
  const n = rollYield.length;
  const raw = new Array(n).fill(null);
  for (let i = lookback - 1; i < n; i++) {
    const window = sortedWindows[i];
    const high = percentileLinear(window, highPct);
    const value = rollYield[i];
    if (value > high) {
      raw[i] = "BULL";
    } else if (mode === "advanced") {
      const extremeLow = percentileLinear(window, extremeLowPct);
      const low = percentileLinear(window, lowPct);
      if (value < extremeLow) raw[i] = "BULL";
      else if (value < low) raw[i] = "INERTIA";
      else raw[i] = "BEAR";
    } else {
      raw[i] = "BEAR";
    }
  }
  // 慣性區(INERTIA)：沿用前一天已解析出的訊號
  const sig = new Array(n).fill(null);
  let prevResolved = null;
  for (let i = 0; i < n; i++) {
    if (raw[i] == null) continue;
    if (raw[i] === "INERTIA") {
      sig[i] = prevResolved != null ? prevResolved : "BEAR";
    } else {
      sig[i] = raw[i];
    }
    prevResolved = sig[i];
  }
  return sig;
}

function computeVixSignal(rollYield, lookback, mode, highPct, lowPct, extremeLowPct) {
  const sortedWindows = computeRollingSortedWindows(rollYield, lookback);
  return computeVixSignalFromSorted(rollYield, sortedWindows, lookback, mode, highPct, lowPct, extremeLowPct);
}

function combineSignals(sigA, sigB, mode) {
  const n = sigA.length;
  const out = new Array(n).fill(null);
  let prevResolved = null;
  for (let i = 0; i < n; i++) {
    if (sigA[i] == null || sigB[i] == null) continue;
    if (mode === "AND") {
      out[i] = sigA[i] === "BULL" && sigB[i] === "BULL" ? "BULL" : "BEAR";
    } else if (mode === "OR") {
      out[i] = sigA[i] === "BULL" || sigB[i] === "BULL" ? "BULL" : "BEAR";
    } else {
      // HOLD：訊號相同時採用該訊號；訊號分歧時維持前一日已解析出的訊號（不輪動）
      if (sigA[i] === sigB[i]) {
        out[i] = sigA[i];
      } else {
        out[i] = prevResolved != null ? prevResolved : "BEAR";
      }
    }
    prevResolved = out[i];
  }
  return out;
}

function runBacktest(dataset, signal, bullAsset, bearAsset, costConfig) {
  const { n, dates, returns, prices, opens } = dataset;
  const commissionRate = (costConfig?.commissionRate ?? 0) / 100;
  const taxRate = (costConfig?.taxRate ?? 0) / 100;
  const equity = new Array(n).fill(1);
  const appliedAsset = new Array(n).fill("CASH");
  let trades = 0;
  let totalCostDrag = 0; // 累計因交易成本損失的權益（相對值，粗估）

  const tradeList = [];
  let openTrade = null; // { asset, entryDate, entryIdx, entryEquity }

  for (let i = 1; i < n; i++) {
    const prevAsset = appliedAsset[i - 1];
    const prevSignal = signal[i - 1];
    const requiredAsset = prevSignal == null ? "CASH" : prevSignal === "BULL" ? bullAsset : bearAsset;

    if (requiredAsset === prevAsset) {
      const ret = requiredAsset === "CASH" ? 0 : returns[requiredAsset][i];
      equity[i] = equity[i - 1] * (1 + ret);
    } else {
      const overnightRet =
        prevAsset === "CASH" ? 0 : (opens[prevAsset][i] - prices[prevAsset][i - 1]) / prices[prevAsset][i - 1];
      const intradayRet =
        requiredAsset === "CASH" ? 0 : (prices[requiredAsset][i] - opens[requiredAsset][i]) / opens[requiredAsset][i];
      const sellCost = prevAsset === "CASH" ? 0 : commissionRate + taxRate;
      const buyCost = requiredAsset === "CASH" ? 0 : commissionRate;

      let eq = equity[i - 1] * (1 + overnightRet);
      const eqAfterOvernight = eq;
      eq = eq * (1 - sellCost); // 賣出舊倉（若有）
      const eqAfterSell = eq;

      if (prevAsset !== "CASH" && openTrade) {
        tradeList.push({
          asset: openTrade.asset,
          entryDate: openTrade.entryDate,
          exitDate: dates[i],
          entryEquity: openTrade.entryEquity,
          exitEquity: eqAfterSell,
          returnPct: eqAfterSell / openTrade.entryEquity - 1,
          holdingDays: i - openTrade.entryIdx,
          open: false,
        });
        openTrade = null;
      }

      eq = eq * (1 - buyCost); // 買進新倉（若有）
      totalCostDrag += eqAfterOvernight - eq;

      if (requiredAsset !== "CASH") {
        openTrade = { asset: requiredAsset, entryDate: dates[i], entryIdx: i, entryEquity: eq };
      }

      eq = eq * (1 + intradayRet);
      equity[i] = eq;
      trades += 1;
    }
    appliedAsset[i] = requiredAsset;
  }

  // 資料結尾時若仍持有部位，列為「未平倉」交易（以最後一天equity作為暫估出場值）
  if (openTrade) {
    tradeList.push({
      asset: openTrade.asset,
      entryDate: openTrade.entryDate,
      exitDate: dates[n - 1],
      entryEquity: openTrade.entryEquity,
      exitEquity: equity[n - 1],
      returnPct: equity[n - 1] / openTrade.entryEquity - 1,
      holdingDays: n - 1 - openTrade.entryIdx,
      open: true,
    });
  }

  return { equity, appliedAsset, trades, totalCostDrag, tradeList };
}

function sliceAndNormalize(equity, startIdx, endIdx) {
  const base = equity[startIdx];
  const out = [];
  for (let i = startIdx; i <= endIdx; i++) out.push(equity[i] / base);
  return out;
}

function computeStats(equitySlice, tradesInRange, riskFreeRatePct) {
  const n = equitySlice.length;
  const totalReturn = equitySlice[n - 1] / equitySlice[0] - 1;
  const tradingDays = n - 1;
  const years = tradingDays / 252;
  const cagr = years > 0 ? Math.pow(equitySlice[n - 1] / equitySlice[0], 252 / tradingDays) - 1 : 0;
  const dailyReturns = [];
  for (let i = 1; i < n; i++) dailyReturns.push(equitySlice[i] / equitySlice[i - 1] - 1);
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / (dailyReturns.length || 1);
  const variance =
    dailyReturns.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (dailyReturns.length || 1);
  const dailyStd = Math.sqrt(variance);
  const annualVol = dailyStd * Math.sqrt(252);
  const annualRet = mean * 252;
  const rf = riskFreeRatePct / 100;
  const sharpe = annualVol > 0 ? (annualRet - rf) / annualVol : 0;

  // Sortino ratio：以日化無風險利率為 MAR，只取下方（低於 MAR）的波動
  const dailyMAR = rf / 252;
  const downsideSqSum = dailyReturns.reduce((a, r) => {
    const d = Math.min(r - dailyMAR, 0);
    return a + d * d;
  }, 0);
  const downsideDeviation = Math.sqrt(downsideSqSum / (dailyReturns.length || 1)) * Math.sqrt(252);
  const sortino = downsideDeviation > 0 ? (annualRet - rf) / downsideDeviation : null;

  let peak = equitySlice[0];
  let maxDD = 0;
  let ulcerSqSum = 0;
  for (const e of equitySlice) {
    if (e > peak) peak = e;
    const dd = (e - peak) / peak;
    if (dd < maxDD) maxDD = dd;
    ulcerSqSum += (dd * 100) * (dd * 100);
  }
  const ulcerIndex = Math.sqrt(ulcerSqSum / n); // 以「%」為單位的均方根回撤深度
  const upi = ulcerIndex > 0 ? (cagr * 100 - riskFreeRatePct) / ulcerIndex : null; // Ulcer Performance Index (Martin Ratio)

  const winRate =
    dailyReturns.length > 0 ? dailyReturns.filter((r) => r > 0).length / dailyReturns.length : 0;
  const calmar = maxDD !== 0 ? cagr / Math.abs(maxDD) : null;
  return { totalReturn, cagr, annualVol, sharpe, sortino, maxDD, ulcerIndex, upi, winRate, calmar, trades: tradesInRange,
    tradeFreqDays: tradesInRange > 0 ? tradingDays / tradesInRange : null };
}
var api = { buildDataset, computeSMA, computeMASignal, percentileLinear, computeRollingSortedWindows, computeVixSignalFromSorted, computeVixSignal, combineSignals, runBacktest, sliceAndNormalize, computeStats };
if (typeof module !== 'undefined') module.exports = api; else root.BT = api;
})(typeof window !== 'undefined' ? window : this);
