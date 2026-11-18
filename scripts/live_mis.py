"""盤中台指權 VIX 期限結構（TAIFEX MIS 即時買賣價中價，CBOE 公式）。
寫入 data/live.json（最新）與 data/live_today.json（當日走勢，隔日自動重置）。
非交易時段／休市（資料日期不是今天）→ 不寫入，結束碼 0。 --force 可略過檢查。"""
import argparse, json, math, re, sys, time
from datetime import datetime, date
from pathlib import Path
from zoneinfo import ZoneInfo
import numpy as np, pandas as pd, requests
sys.path.insert(0, str(Path(__file__).parent))
import vix_term as vt

TZ = ZoneInfo("Asia/Taipei")
H = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json;charset=UTF-8",
     "Origin": "https://mis.taifex.com.tw", "Referer": "https://mis.taifex.com.tw/futures/"}
API = "https://mis.taifex.com.tw/futures/api/"
S = requests.Session()
MIN_N = 40            # 單一到期日至少 40 個有效履約價，否則視為報價不完整而略過


def post(ep, body, retries=3):
    for k in range(retries):
        try:
            r = S.post(API + ep, headers=H, data=json.dumps(body), timeout=60)
            if r.status_code == 200:
                return (r.json().get("RtData") or {}).get("QuoteList", []) or []
            print(f"  {ep} {body.get('ExpireMonth', '')}: HTTP {r.status_code}", file=sys.stderr)
            if r.status_code in (400, 404):
                return []
        except requests.RequestException as e:
            print(f"  {ep}: {e!r}", file=sys.stderr)
        time.sleep(1.5 * (k + 1))
    return []


def fetch_opt(em):
    return post("getQuoteListOption", {"MarketType": "0", "SymbolType": "O", "KindID": "1", "CID": "TXO", "ExpireMonth": em,
                                       "RowSize": "全部", "PageNo": "", "SortColumn": "", "AscDesc": "A"})


def fetch_spot():
    rows = post("getQuoteList", {"MarketType": "0", "SymbolType": "F", "KindID": "1", "CID": "TXF", "ExpireMonth": "",
                                 "RowSize": "全部", "PageNo": "", "SortColumn": "", "AscDesc": "A"})
    for x in rows:
        if x.get("SymbolID") == "TXF-S":
            return x
    return {}


def candidate_codes(today):
    y, m = today.year, today.month
    codes = []
    for k in range(0, 14):
        codes.append(f"{y + (m - 1 + k) // 12}{(m - 1 + k) % 12 + 1:02d}")
    for k in range(0, 3):
        yy, mm = y + (m - 1 + k) // 12, (m - 1 + k) % 12 + 1
        for n in range(1, 6):
            codes += [f"{yy}{mm:02d}W{n}", f"{yy}{mm:02d}F{n}"]
    return codes


def f(x):
    try:
        v = float(x)
        return v if v > 0 else np.nan
    except (TypeError, ValueError):
        return np.nan


def table(rows):
    d = {}
    for x in rows:
        K, cp = x.get("StrikePrice"), x.get("CP")
        if not K or cp not in ("C", "P"):
            continue
        d.setdefault(float(K), {})[cp] = (f(x.get("CBidPrice1")), f(x.get("CAskPrice1")))
    idx = sorted(d)
    nan = (np.nan, np.nan)
    return pd.DataFrame({"cb": [d[k].get("C", nan)[0] for k in idx], "ca": [d[k].get("C", nan)[1] for k in idx],
                         "pb": [d[k].get("P", nan)[0] for k in idx], "pa": [d[k].get("P", nan)[1] for k in idx],
                         "cs": np.nan, "ps": np.nan}, index=idx)


def expiry_of(code, rows):
    m = re.search(r"\((\d{4})/(\d{2})/(\d{2})\)", rows[0].get("DispCName", "")) if rows else None
    return date(int(m[1]), int(m[2]), int(m[3])) if m else vt.rule_expiry(code)


def compute(now, chains, rate=0.015, min_n=MIN_N):
    """chains: {code: rows}。回傳 (指標 dict, diag list)。"""
    cands, diag = [], []
    for code, rows in chains.items():
        exp = expiry_of(code, rows)
        if exp is None:
            continue
        nt = (datetime(exp.year, exp.month, exp.day, 13, 30, tzinfo=TZ) - now).total_seconds() / 60.0
        if nt < 2 * 1440.0:
            continue
        T = nt / vt.MIN_PER_YEAR
        r = vt.expiry_variance(table(rows), T, rate, 4, "quote", 0.1)
        ok = bool(r) and r["n"] >= min_n
        diag.append({"code": code, "expiry": exp.isoformat(), "n": r["n"] if r else 0, "F": round(r["F"], 1) if r else None,
                     "vol": round(100 * math.sqrt(r["s2"]), 2) if r else None, "used": ok})
        if ok:
            cands.append({"nt": nt, "T": T, "s2": r["s2"], "code": code, "n": r["n"]})
    out = {}
    for name, (days, wk) in vt.TENORS.items():
        pool = sorted([c for c in cands if wk or not vt.is_weekly(c["code"])], key=lambda c: c["nt"])
        res = vt.interp_tenor(pool, days, False)
        out[name], out[name + "_legs"] = (round(res[0], 4), res[1]) if res else (None, "")
    v = [out.get(k) for k in ("VIX9D", "VIX1M", "VIX3M", "VIX6M")]
    out["CashVIXOsc"] = round(v[2] + v[3] - v[0] - v[1], 4) if all(x is not None for x in v) else None
    return out, diag


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--rate", type=float, default=0.015)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--from-dump", help="離線：讀 dump json（{code: rows, TXF: rows}），不連線")
    a = ap.parse_args()
    now = datetime.now(TZ)
    dd = Path(a.data_dir)
    if not a.force and not a.from_dump and not (now.weekday() < 5 and (8, 44) <= (now.hour, now.minute) <= (14, 15)):
        print("非盤中時段（週一至週五 08:44–14:15），略過。")
        return
    if a.from_dump:
        dump = json.load(open(a.from_dump))
        chains = {k: v for k, v in dump.items() if k not in ("asof", "TXF") and isinstance(v, list)}
        spot = next((x for x in dump.get("TXF", []) if x.get("SymbolID") == "TXF-S"), {})
    else:
        chains = {}
        for code in candidate_codes(now.date()):
            time.sleep(0.4)
            rows = fetch_opt(code)
            if rows:
                chains[code] = rows
        spot = fetch_spot()
    # 交易日檢查：報價日期必須是今天（休市日 MIS 仍回傳前一日資料）
    cdates = {x.get("CDate") for rows in chains.values() for x in rows[:50] if x.get("CDate")}
    today_s = now.strftime("%Y%m%d")
    if not a.force and not a.from_dump and today_s not in cdates:
        print(f"今日 {today_s} 無即時報價（休市或尚未開盤）；報價日期={sorted(cdates)[-3:]}，略過。")
        return
    out, diag = compute(now, chains, a.rate)
    snap = {"asof": now.isoformat(timespec="seconds"), "source": "TAIFEX MIS 最佳買賣價中價（CBOE 公式）",
            "spot": {"last": f(spot.get("CLastPrice")), "ref": f(spot.get("CRefPrice")), "high": f(spot.get("CHighPrice")), "low": f(spot.get("CLowPrice"))},
            **out, "diag": diag}
    snap["spot"] = {k: (None if (v is None or (isinstance(v, float) and math.isnan(v))) else v) for k, v in snap["spot"].items()}
    dd.mkdir(exist_ok=True)
    (dd / "live.json").write_text(json.dumps(snap, ensure_ascii=False, indent=1))
    tp = dd / "live_today.json"
    today = {"date": now.date().isoformat(), "points": []}
    if tp.exists():
        try:
            old = json.loads(tp.read_text())
            if old.get("date") == today["date"]:
                today = old
        except Exception:
            pass
    today["points"].append({"t": now.strftime("%H:%M"), **{k: out[k] for k in ("VIX9D", "VIX1M", "VIX3M", "VIX6M", "CashVIXOsc")}})
    tp.write_text(json.dumps(today, ensure_ascii=False))
    print(json.dumps({k: snap[k] for k in ("asof", "VIX9D", "VIX1M", "VIX3M", "VIX6M", "CashVIXOsc")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
