"""銘柄マスタと財務データを simulator/autodata/ に書き出すバッチ。

GitHub Actions(.github/workflows/market-data.yml)から毎朝実行され、
結果をリポジトリにコミットする。Streamlit Cloud はプッシュで自動再デプロイ
されるため、アプリは起動時に autodata/ を読むだけで最新データが使える。

使い方: python simulator/scripts/build_autodata.py [prime|jp|all]
  prime … 財務データは東証プライムのみ(既定。約1,600銘柄・30〜40分)
  jp    … 東証全銘柄(約3,700銘柄)
  all   … 日米全銘柄(非常に時間がかかるため非推奨)
"""

from __future__ import annotations

import csv
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sim import db
from sim.master import update_jp_master, update_us_master
from sim.screener import _fetch_info

AUTODATA_DIR = Path(__file__).resolve().parent.parent / "autodata"
FETCH_INTERVAL_SEC = 0.4  # yfinanceを叩きすぎないための間隔


def main() -> int:
    scope = sys.argv[1] if len(sys.argv) > 1 else "prime"
    conn = db.connect(":memory:")
    db.init_db(conn)

    print("銘柄マスタを取得中…", flush=True)
    jp = update_jp_master(conn)
    us = update_us_master(conn)
    print(f"  日本株 {jp:,}件 / 米国株 {us:,}件", flush=True)

    rows = conn.execute(
        "SELECT ticker, code, name, market, country FROM stocks ORDER BY country, ticker"
    ).fetchall()
    AUTODATA_DIR.mkdir(exist_ok=True)
    with open(AUTODATA_DIR / "stocks.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["ticker", "code", "name", "market", "country"])
        for r in rows:
            writer.writerow([r["ticker"], r["code"], r["name"], r["market"], r["country"]])

    if scope == "prime":
        targets = [r for r in rows if "プライム" in r["market"]]
    elif scope == "jp":
        targets = [r for r in rows if r["country"] == "JP"]
    else:
        targets = rows
    print(f"財務データを取得中…(対象 {len(targets):,}銘柄)", flush=True)

    funds: dict[str, dict] = {}
    errors = 0
    for i, r in enumerate(targets, start=1):
        data = _fetch_info(r["ticker"])
        funds[r["ticker"]] = data
        if "error" in data:
            errors += 1
        if i % 100 == 0:
            print(f"  {i}/{len(targets)}(失敗 {errors})", flush=True)
        time.sleep(FETCH_INTERVAL_SEC)

    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with open(AUTODATA_DIR / "fundamentals.json", "w", encoding="utf-8") as f:
        json.dump(funds, f, ensure_ascii=False, separators=(",", ":"))
    with open(AUTODATA_DIR / "meta.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "generated_at": generated_at,
                "jp_count": jp,
                "us_count": us,
                "fundamentals_count": len(funds),
                "fundamentals_errors": errors,
                "scope": scope,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"完了: マスタ{len(rows):,}件 / 財務{len(funds):,}件(失敗{errors})", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
