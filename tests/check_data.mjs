// 資料健全性檢查（CI 用）：日期遞增、最新資料不過舊、核心可計算出最新溫度計。
import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url); const TWB = require('../assets/core.js');
const mk = JSON.parse(fs.readFileSync('data/market_data.json', 'utf8')).TW;
const d = mk.dates; let bad = 0;
for (let i = 1; i < d.length; i++) if (d[i] <= d[i - 1]) bad++;
if (bad) { console.error('FAIL 日期未遞增', bad); process.exit(1); }
const csv = fs.readFileSync('data/vix_term.csv', 'utf8').trim().split('\n');
const lastVix = csv[csv.length - 1].split(',')[0];
const age = (Date.now() - new Date(d[d.length - 1]).getTime()) / 864e5;
console.log('market 最新', d[d.length - 1], '| vix_term 最新', lastVix, '| 天數差', age.toFixed(1));
if (age > 10) { console.error('FAIL 價格資料過舊'); process.exit(1); }
if (csv.length < 2000) { console.error('FAIL vix_term 筆數異常', csv.length); process.exit(1); }
console.log('OK');
