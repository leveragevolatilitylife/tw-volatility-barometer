// 從 TWN-rotation-strategy-backtester 的 src/App.jsx 抽出回測引擎函式，產生瀏覽器可直接載入的 assets/bt-engine.js
// 用法: node scripts/build_engine.mjs <App.jsx 路徑>
import fs from 'fs';
const src = fs.readFileSync(process.argv[2], 'utf8');
function grab(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到 ' + name);
  const j = src.indexOf('{', src.indexOf(')', i));
  let d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
const names = ['buildDataset', 'computeSMA', 'computeMASignal', 'percentileLinear', 'computeRollingSortedWindows',
  'computeVixSignalFromSorted', 'computeVixSignal', 'combineSignals', 'runBacktest', 'sliceAndNormalize', 'computeStats'];
const body = names.map(grab).join('\n\n');
const out = `/* 回測引擎：自動由 scripts/build_engine.mjs 從 TWN-rotation-strategy-backtester/src/App.jsx 抽出，勿手改。 */
(function (root) {
'use strict';
${body}
var api = { ${names.join(', ')} };
if (typeof module !== 'undefined') module.exports = api; else root.BT = api;
})(typeof window !== 'undefined' ? window : this);
`;
fs.writeFileSync(new URL('../assets/bt-engine.js', import.meta.url), out);
console.log('bt-engine.js', out.length, 'bytes');
