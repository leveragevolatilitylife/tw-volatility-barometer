# 台股波動率溫度計（TW Volatility Barometer）

即時（盤中台指權）＋ 自動回測的靜態網站，部署於 GitHub Pages。
- `index.html`：即時溫度計（指數表、期限結構、盤中走勢、策略訊號）
- `backtest.html`：自動回測（權重／門檻／成本可調）

## 資料流
| 來源 | 頻率 | Workflow |
|---|---|---|
| TAIFEX MIS 台指權即時買賣價 → CBOE 公式 → VIX9D/1M/3M/6M、Osc | 盤中每 10 分鐘 | `live.yml` → `data/live*.json` |
| 價格、VX30 Roll Yield（`stock-data-collection@data`）＋ 台指權收盤 VIX（`tw-vix-term-structure@data`） | 每交易日收盤後 | `daily.yml` → `data/market_data.json`, `vix_term.csv` |

## 部署
1. Settings → Pages：Deploy from branch `main` / root。
2. Settings → Actions → General：Workflow permissions 設為 Read and write。
3. Secrets：`DATA_TOKEN`（fine-grained PAT，對兩個私人來源 repo 有 Contents 讀取）。
4. 準點盤中更新：GitHub cron 常延遲，可用 cron-job.org 每 10 分鐘呼叫 `workflow_dispatch` 觸發 `live.yml`。
5. 頁面上的「立即更新」按鈕需在瀏覽器 localStorage 設定 `twb_token`（僅限本 repo Actions 寫入權限）。

## 測試
```
node tests/test_core.mjs
python3 tests/test_live_offline.py
```
研究方法與過擬合分析見 `research/README.md`。

> 本網站內容僅為個人資料整理與策略追蹤工具，不構成任何投資建議。
