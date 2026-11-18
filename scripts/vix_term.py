#!/usr/bin/env python3
"""
以 TXO（臺指選擇權）依 CBOE VIX 公式，重建固定天期波動率：VIX9D / VIX1M / VIX3M / VIX6M

用法
----
  # 1) 自我測試（合成 flat-vol 選擇權鏈，驗證公式；不需任何資料）
  python vix_term.py --selftest

  # 2) 讀取期交所「選擇權每日交易行情」下載 CSV（可多檔，支援萬用字元）
  python vix_term.py --input "OptionsDaily_*.csv" --out vix_term.csv
  python vix_term.py --input data.csv --rate 0.015 --compare taiwan_vix.csv

輸入欄位（期交所每日行情 CSV 的標準欄名）
  交易日期, 契約, 到期月份(週別), 履約價, 買賣權, 結算價,
  最後最佳買價, 最後最佳賣價, 交易時段  （選填：契約到期日）

方法重點
  * 只用一般交易時段、契約=TXO
  * 價格來源 --source：settle(預設，結算價) / quote(最佳買賣中價) / hybrid
    （每日行情檔的最佳買賣價常缺值，quote 結果不穩，故預設用結算價）
  * 遠期價 F、K0、價外序列、「連續兩個無有效價格即停止」、ΔK、σ² 皆依 CBOE 白皮書
  * 9D、1M 使用週選＋月選（1M 需要週選，否則季月到期後一週內找不到 30 天內的近端到期日）；3M/6M 只用月選/季月
  * 目標天期在兩個到期日之間做變異數時間加權插補；不在區間內預設輸出空值
    （加 --allow-extrapolate 才外插）
"""
import argparse
import glob
import math
import re
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd

MIN_PER_YEAR = 525600.0
# 名稱: (目標天數, 是否使用週選)
TENORS = {
    "VIX9D": (9, True),
    "VIX1M": (30, True),
    "VIX3M": (91, False),
    "VIX6M": (182, False),
}

COLS = {
    "date": "交易日期", "contract": "契約", "code": "到期月份(週別)",
    "strike": "履約價", "cp": "買賣權", "bid": "最後最佳買價",
    "ask": "最後最佳賣價", "settle": "結算價", "session": "交易時段",
    "exp": "契約到期日",
}


# ----------------------------------------------------------------- 到期日
def nth_weekday(y, m, weekday, n):
    first = date(y, m, 1)
    d = first + timedelta(days=(weekday - first.weekday()) % 7 + 7 * (n - 1))
    return d if d.month == m else None


def rule_expiry(code):
    """月選：第3個週三；Wn：第n個週三；Fn：第n個週五。（未考慮假日順延）"""
    m = re.fullmatch(r"(\d{4})(\d{2})([WF]?)(\d?)", code)
    if not m:
        return None
    y, mo, kind, n = int(m[1]), int(m[2]), m[3], m[4]
    if kind == "":
        return nth_weekday(y, mo, 2, 3)
    return nth_weekday(y, mo, 2 if kind == "W" else 4, int(n or 1))


def is_weekly(code):
    return bool(re.search(r"[WF]\d$", code))


def resolve_expiries(df, user_map):
    """優先序：使用者對照表 > 檔內『契約到期日』欄 > 規則推算（再依檔內交易日做假日順延）。"""
    trading_days = np.array(sorted(df["date"].dt.date.unique()))
    out = {}
    file_exp = {}
    if "exp" in df.columns:
        sub = df.dropna(subset=["exp"])
        if len(sub):
            file_exp = sub.groupby("code")["exp"].agg(lambda s: s.mode().iloc[0]).dt.date.to_dict()
    for code in df["code"].unique():
        if code in user_map:
            out[code] = user_map[code]
        elif code in file_exp:
            out[code] = file_exp[code]
        else:
            r = rule_expiry(code)
            if r is None:
                continue
            if r <= trading_days[-1] and r not in set(trading_days):
                k = np.searchsorted(trading_days, r)
                r = trading_days[k]
            out[code] = r
    return out


# ----------------------------------------------------------------- 讀檔
def read_one(path):
    last = None
    for enc in ("utf-8-sig", "cp950", "big5"):
        try:
            df = pd.read_csv(path, encoding=enc, dtype=str)
            df.columns = [re.sub(r"\s+", "", str(c)) for c in df.columns]
            return df
        except UnicodeDecodeError as e:
            last = e
    raise last


def load(paths, contract="TXO"):
    frames = []
    for p in paths:
        frames.append(read_one(p))
    raw = pd.concat(frames, ignore_index=True)
    missing = [v for k, v in COLS.items() if k not in ("session", "exp", "settle") and v not in raw.columns]
    if missing:
        sys.exit(f"缺少欄位 {missing}；實際欄位：{list(raw.columns)}")
    df = pd.DataFrame({
        "date": pd.to_datetime(raw[COLS["date"]].str.strip(), errors="coerce").dt.normalize(),
        "contract": raw[COLS["contract"]].str.strip(),
        "code": raw[COLS["code"]].str.strip(),
        "strike": pd.to_numeric(raw[COLS["strike"]], errors="coerce"),
        "bid": pd.to_numeric(raw[COLS["bid"]], errors="coerce"),
        "ask": pd.to_numeric(raw[COLS["ask"]], errors="coerce"),
        "settle": pd.to_numeric(raw[COLS["settle"]], errors="coerce") if COLS["settle"] in raw.columns else np.nan,
    })
    cp = raw[COLS["cp"]].str.strip()
    df["cp"] = np.where(cp.str.contains("買|call|Call|CALL"), "C",
                        np.where(cp.str.contains("賣|put|Put|PUT"), "P", None))
    if COLS["session"] in raw.columns:
        df["session"] = raw[COLS["session"]].str.strip()
    if COLS["exp"] in raw.columns:
        df["exp"] = pd.to_datetime(raw[COLS["exp"]].str.strip(), errors="coerce")
    df = df[(df["contract"] == contract) & df["date"].notna() & df["strike"].notna() & df["cp"].notna()]
    if "session" in df.columns:
        df = df[df["session"].str.contains("一般|Regular|regular", na=False)]
    return df.reset_index(drop=True)


# ----------------------------------------------------------------- 核心公式
def _mid(b, a):
    ok = (b > 0) & (a > 0) & (a >= b)
    return np.where(ok, (b + a) / 2.0, np.nan)


def _settle(x, min_price):
    return np.where(x > min_price, x, np.nan)


def expiry_variance(tbl, T, R, min_strikes=4, source="settle", min_price=0.1):
    """單一到期日的 CBOE σ²。tbl: index=strike, 欄位 cb, ca, pb, pa, cs, ps。
    source: quote=只用最佳買賣中價；settle=只用結算價；hybrid=中價優先、無有效報價時改用結算價。
    """
    tbl = tbl.sort_index()
    K = tbl.index.values.astype(float)
    cm = _mid(tbl["cb"].values.astype(float), tbl["ca"].values.astype(float))
    pm = _mid(tbl["pb"].values.astype(float), tbl["pa"].values.astype(float))
    cs = _settle(tbl["cs"].values.astype(float), min_price)
    ps = _settle(tbl["ps"].values.astype(float), min_price)
    if source == "settle":
        cm, pm = cs, ps
    elif source == "hybrid":
        cm = np.where(np.isnan(cm), cs, cm)
        pm = np.where(np.isnan(pm), ps, pm)
    both = ~np.isnan(cm) & ~np.isnan(pm)
    if not both.any() or T <= 0:
        return None
    diff = np.where(both, np.abs(cm - pm), np.inf)
    i = int(np.argmin(diff))
    F = K[i] + math.exp(R * T) * (cm[i] - pm[i])
    below = np.where(K <= F)[0]
    if len(below) == 0:
        return None
    i0 = int(below[-1])
    K0 = K[i0]

    sel = {}
    miss = 0
    for j in range(i0 - 1, -1, -1):            # 價外賣權
        if np.isnan(pm[j]):
            miss += 1
            if miss >= 2:
                break
            continue
        miss = 0
        sel[j] = pm[j]
    miss = 0
    for j in range(i0 + 1, len(K)):            # 價外買權
        if np.isnan(cm[j]):
            miss += 1
            if miss >= 2:
                break
            continue
        miss = 0
        sel[j] = cm[j]
    if both[i0]:
        sel[i0] = (cm[i0] + pm[i0]) / 2.0
    elif not np.isnan(cm[i0]):
        sel[i0] = cm[i0]
    elif not np.isnan(pm[i0]):
        sel[i0] = pm[i0]
    else:
        return None
    idx = sorted(sel)
    if len(idx) < min_strikes:
        return None
    Ks = K[idx]
    Qs = np.array([sel[j] for j in idx])
    dK = np.empty_like(Ks)
    dK[0] = Ks[1] - Ks[0]
    dK[-1] = Ks[-1] - Ks[-2]
    dK[1:-1] = (Ks[2:] - Ks[:-2]) / 2.0
    total = float(np.sum(dK / Ks ** 2 * math.exp(R * T) * Qs))
    s2 = 2.0 / T * total - (F / K0 - 1.0) ** 2 / T
    if not np.isfinite(s2) or s2 <= 0:
        return None
    return {"s2": s2, "F": F, "K0": K0, "n": len(idx)}


def interp_tenor(cands, n_days, allow_extrap):
    """cands: 依 nt 排序的 dict list（nt=到期分鐘, T=年, s2, code, n）。"""
    N = n_days * 1440.0
    near = [c for c in cands if c["nt"] <= N]
    far = [c for c in cands if c["nt"] > N]
    if near and far:
        c1, c2, extrap = near[-1], far[0], False
    elif allow_extrap and len(cands) >= 2:
        c1, c2 = (cands[0], cands[1]) if far else (cands[-2], cands[-1])
        extrap = True
    else:
        return None
    w1 = (c2["nt"] - N) / (c2["nt"] - c1["nt"])
    w2 = 1.0 - w1
    V = (c1["T"] * c1["s2"] * w1 + c2["T"] * c2["s2"] * w2) * MIN_PER_YEAR / N
    if V <= 0:
        return None
    legs = f"{c1['code']}(n={c1['n']})+{c2['code']}(n={c2['n']})" + ("*extrap" if extrap else "")
    return 100.0 * math.sqrt(V), legs


def get_rate(rate, d):
    if isinstance(rate, pd.Series):
        v = rate.asof(pd.Timestamp(d))
        return float(v) / 100.0 if pd.notna(v) else float(rate.iloc[0]) / 100.0
    return float(rate)


def add_osc(df):
    """台指權版 Cash VIX Oscillator = VIX3M + VIX6M - VIX9D - VIX1M
    （與 Volatility-Barometer 的 -VIX9D - VIX + VIX3M + VIX6M 相同，VIX 以 1M 取代）。
    任一天期缺值則為空值。正值=期限結構正價差（平靜）；越負=短天期波動飆升（壓力）。"""
    df = df.copy()
    df["CashVIXOsc"] = df["VIX3M"] + df["VIX6M"] - df["VIX9D"] - df["VIX1M"]
    return df


def compute(df, rate=0.015, user_map=None, min_days=2, allow_extrap=False, min_strikes=4, source="settle", min_price=0.1):
    expmap = resolve_expiries(df, user_map or {})
    rows = []
    for d, g in df.groupby("date"):
        td = d.date()
        R = get_rate(rate, d)
        cands = []
        for code, sub in g.groupby("code"):
            if code not in expmap:
                continue
            nt = (expmap[code] - td).days * 1440.0 - 15.0   # 13:45 收盤 → 到期日 13:30
            if nt < min_days * 1440.0:
                continue
            sub = sub.drop_duplicates(["strike", "cp"], keep="last")
            u = sub.set_index(["strike", "cp"])[["bid", "ask", "settle"]].unstack("cp")
            tbl = pd.DataFrame({
                "cb": u[("bid", "C")] if ("bid", "C") in u.columns else np.nan,
                "ca": u[("ask", "C")] if ("ask", "C") in u.columns else np.nan,
                "pb": u[("bid", "P")] if ("bid", "P") in u.columns else np.nan,
                "pa": u[("ask", "P")] if ("ask", "P") in u.columns else np.nan,
                "cs": u[("settle", "C")] if ("settle", "C") in u.columns else np.nan,
                "ps": u[("settle", "P")] if ("settle", "P") in u.columns else np.nan,
            }, index=u.index)
            T = nt / MIN_PER_YEAR
            r = expiry_variance(tbl, T, R, min_strikes, source, min_price)
            if r:
                cands.append({"nt": nt, "T": T, "s2": r["s2"], "code": code, "n": r["n"]})
        row = {"date": td}
        for name, (days, use_weekly) in TENORS.items():
            pool = sorted([c for c in cands if use_weekly or not is_weekly(c["code"])], key=lambda c: c["nt"])
            res = interp_tenor(pool, days, allow_extrap)
            row[name], row[name + "_legs"] = res if res else (np.nan, "")
        rows.append(row)
    return add_osc(pd.DataFrame(rows))


# ----------------------------------------------------------------- 自我測試
def _bs(S, K, T, r, sig, cp):
    N = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))
    d1 = (math.log(S / K) + (r + sig * sig / 2) * T) / (sig * math.sqrt(T))
    d2 = d1 - sig * math.sqrt(T)
    if cp == "C":
        return S * N(d1) - K * math.exp(-r * T) * N(d2)
    return K * math.exp(-r * T) * N(-d2) - S * N(-d1)


def selftest(sig=0.20, r=0.015, S=40000.0):
    assert rule_expiry("202606") == date(2026, 6, 17)
    assert rule_expiry("202606F2") == date(2026, 6, 12)
    td = date(2026, 11, 13)
    codes = ["202611", "202611F3", "202611W4", "202611F4", "202612W1", "202612F1", "202612",
             "202701", "202703", "202706", "202709"]
    rows = []
    for code in codes:
        e = rule_expiry(code)
        T = ((e - td).days * 1440 - 15) / MIN_PER_YEAR
        for K in range(20000, 60001, 100):
            for cp in "CP":
                p = _bs(S, K, T, r, sig, cp)
                bid = p - 0.5 if p > 0.5 else 0.0
                ask = p + 0.5 if p > 0.5 else (0.5 if p > 0.05 else 0.0)
                rows.append({"date": pd.Timestamp(td), "contract": "TXO", "code": code, "strike": K,
                             "cp": cp, "bid": bid, "ask": ask, "settle": p})
    df = pd.DataFrame(rows)
    out = compute(df, rate=r)
    print(out.T.to_string(header=False))
    for name in TENORS:
        v = out[name].iloc[0]
        assert abs(v - sig * 100) < 0.6, f"{name}={v}"
    print(f"\nSELFTEST OK：flat vol {sig*100:.0f}% 重建結果皆落在 ±0.6 內")


# ----------------------------------------------------------------- CLI
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", help="期交所選擇權每日行情 CSV（可用萬用字元）")
    ap.add_argument("--out", default="vix_term.csv")
    ap.add_argument("--rate", type=float, default=0.015, help="年化無風險利率（小數），預設 1.5%%")
    ap.add_argument("--rate-csv", help="利率時間序列 CSV：欄位 date,rate（rate 以 %% 為單位）")
    ap.add_argument("--expiry-map", help="到期日對照 CSV：欄位 code,date（用來修正假日順延）")
    ap.add_argument("--allow-extrapolate", action="store_true")
    ap.add_argument("--min-days", type=float, default=2.0, help="排除距到期不足此天數的序列")
    ap.add_argument("--source", choices=["quote", "settle", "hybrid"], default="settle",
                    help="選擇權價格來源：quote=最佳買賣中價；settle=結算價；hybrid=中價優先、缺值用結算價")
    ap.add_argument("--min-price", type=float, default=0.1, help="結算價低於或等於此值視為無有效價格")
    ap.add_argument("--compare", help="與期交所 TAIWAN VIX 比對：CSV 欄位 date,vix")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if not a.input:
        ap.error("需要 --input 或 --selftest")
    paths = sorted(glob.glob(a.input))
    if not paths:
        sys.exit("找不到輸入檔")
    df = load(paths)
    rate = a.rate
    if a.rate_csv:
        r = pd.read_csv(a.rate_csv, parse_dates=["date"]).set_index("date")["rate"].sort_index()
        rate = r
    umap = {}
    if a.expiry_map:
        m = pd.read_csv(a.expiry_map, dtype=str)
        umap = {c.strip(): pd.to_datetime(d).date() for c, d in zip(m["code"], m["date"])}
    out = compute(df, rate=rate, user_map=umap, min_days=a.min_days, allow_extrap=a.allow_extrapolate,
                  source=a.source, min_price=a.min_price)
    out.to_csv(a.out, index=False, encoding="utf-8-sig")
    print(f"已輸出 {a.out}（{len(out)} 個交易日）")
    print(out[["date"] + list(TENORS)].tail(5).to_string(index=False))
    if a.compare:
        c = pd.read_csv(a.compare, parse_dates=["date"])
        c["date"] = c["date"].dt.date
        mm = out.merge(c, on="date")[["date", "VIX1M", "vix"]].dropna()
        if len(mm):
            print(f"\n與 TAIWAN VIX 比對：n={len(mm)}, corr={mm.VIX1M.corr(mm.vix):.4f}, "
                  f"MAE={(mm.VIX1M - mm.vix).abs().mean():.3f}, bias={(mm.VIX1M - mm.vix).mean():+.3f}")


if __name__ == "__main__":
    main()
