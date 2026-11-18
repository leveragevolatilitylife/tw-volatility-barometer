"""離線測試：用保存的 MIS 原始報價（tests/fixtures/dump.json）驗證 live_mis 的計算與輸出格式。"""
import json, subprocess, sys, tempfile, pathlib
root = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as d:
    subprocess.run([sys.executable, str(root / "scripts/live_mis.py"), "--from-dump", str(root / "tests/fixtures/dump.json"), "--data-dir", d, "--force"], check=True)
    j = json.load(open(pathlib.Path(d) / "live.json"))
assert j["VIX1M"] and 20 < j["VIX1M"] < 80, j["VIX1M"]
assert all(j.get(k) for k in ("VIX9D", "VIX3M")), j
assert (j["VIX6M"] is None) == (j["CashVIXOsc"] is None)  # Osc 需要四個期限皆有效
print("OK", {k: j[k] for k in ("VIX9D", "VIX1M", "VIX3M", "VIX6M", "CashVIXOsc")})
