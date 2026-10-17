"""銘柄マスタと財務データを simulator/autodata/ に書き出すバッチ。

GitHub Actions(.github/workflows/market-data.yml)から毎朝実行され、
結果をリポジトリにコミットする。Streamlit Cloud はプッシュで自動再デプロイ
されるため、アプリは起動時に autodata/ を読むだけで最新データが使える。

使い方: python simulator/scripts/build_autodata.py [prime|jp|us|all]
  prime … 財務データは東証プライムのみ(既定。約1,600銘柄・30〜40分)
  jp    … 東証全銘柄(約3,700銘柄)
  us    … 米国株の普通株のみ(ETF・優先株・ワラント等を除く約6,500銘柄・約2時間)
  all   … 日米全銘柄(非常に時間がかかるため非推奨)

財務データ(fundamentals.json)は既存ファイルにマージして書くため、
平日=prime / 土曜=jp+us のように分割実行しても全銘柄分が蓄積される。
"""

from __future__ import annotations

import csv
import json
import re
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

# 米国株の普通株以外(優先株 -P、ワラント -WS/-W、ユニット -U、ライツ -R)を除く
US_EXCLUDE_RE = re.compile(r"-(P[A-Z]*|WS[A-Z]?|W|U|R)$")

# 平日実行時に、まだ一度も取得していない銘柄(新規上場など)を穴埋めする上限
MISSING_CATCHUP_LIMIT = 300


def read_existing_fundamentals(path: Path) -> dict:
    """蓄積済みの財務データを読む。

    壊れている場合は例外を投げて中断する。空扱いで続行すると、その日の
    スコープ分だけのファイルで上書きしてしまい「全銘柄分が常にある」が崩れるため。
    """
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(
            f"{path} を読み込めません。上書きすると蓄積データを失うため中断します。"
            f"詳細: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"{path} の形式が想定外(dictでない)のため中断します。")
    return data


def catchup_missing(rows: list, existing: dict, limit: int = MISSING_CATCHUP_LIMIT) -> list:
    """スクリーニング対象の全ユニバース(東証全銘柄+米国普通株)のうち、
    まだ一度もデータが無い銘柄を返す(新規上場の穴埋め用)。"""
    universe = select_targets(rows, "jp") + select_targets(rows, "us")
    missing = [r for r in universe if r["ticker"] not in existing]
    return missing[:limit]


def select_targets(rows: list, scope: str) -> list:
    """スコープに応じて財務データ取得の対象銘柄を選ぶ(rowsは銘柄マスタの行)。"""
    if scope == "prime":
        return [r for r in rows if "プライム" in r["market"]]
    if scope == "jp":
        return [r for r in rows if r["country"] == "JP"]
    if scope == "us":
        return [
            r for r in rows
            if r["country"] == "US"
            and "ETF" not in r["market"]
            and not US_EXCLUDE_RE.search(r["ticker"])
        ]
    return rows


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

    fund_path = AUTODATA_DIR / "fundamentals.json"
    existing = read_existing_fundamentals(fund_path)

    targets = select_targets(rows, scope)
    # 平日のプライム更新でも、未取得の銘柄(新規上場など)は全ユニバースから拾い、
    # 「最新でなくても全銘柄分のデータが常にある」状態を保つ
    if scope == "prime":
        seen = {r["ticker"] for r in targets}
        extra = [r for r in catchup_missing(rows, existing) if r["ticker"] not in seen]
        if extra:
            print(f"未取得銘柄の穴埋めを追加: {len(extra):,}件", flush=True)
            targets = targets + extra
    print(f"財務データを取得中…(scope={scope}、対象 {len(targets):,}銘柄)", flush=True)

    fetched: dict[str, dict] = {}
    errors = 0
    for i, r in enumerate(targets, start=1):
        data = _fetch_info(r["ticker"])
        fetched[r["ticker"]] = data
        if "error" in data:
            errors += 1
        if i % 100 == 0:
            print(f"  {i}/{len(targets)}(失敗 {errors})", flush=True)
        time.sleep(FETCH_INTERVAL_SEC)

    # 既存のautodataにマージする(prime/jp/usを別日に実行しても蓄積される)
    merged = {**existing, **fetched}

    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with open(fund_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))
    with open(AUTODATA_DIR / "meta.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "generated_at": generated_at,
                "jp_count": jp,
                "us_count": us,
                "fundamentals_count": len(merged),
                "fetched_now": len(fetched),
                "fundamentals_errors": errors,
                "scope": scope,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(
        f"完了: マスタ{len(rows):,}件 / 今回取得{len(fetched):,}件(失敗{errors}) / "
        f"蓄積合計{len(merged):,}件",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
