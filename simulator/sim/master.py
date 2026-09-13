"""銘柄マスタの取込(JPX / nasdaqtrader.com)と検索。

- 日本株: JPX公開の「東証上場銘柄一覧」(data_j.xls)から内国株式を取り込む。
  yfinance用ティッカーは「7203.T」のようにコード+".T"。
- 米国株: nasdaqtrader.com の nasdaqlisted.txt / otherlisted.txt を取り込む。
  クラス株などの記号はyfinance流に変換する(BRK.B → BRK-B、優先株 $ → -P)。
- ダウンロードできない環境向けに、ファイルを直接渡す引数(bytes)にも対応。
"""

from __future__ import annotations

import io
from datetime import datetime

import pandas as pd
import requests

JPX_URL = "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls"
NASDAQ_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"

# otherlisted.txt の Exchange 列 → 取引所名
US_EXCHANGES = {
    "N": "NYSE",
    "A": "NYSE American",
    "P": "NYSE Arca",
    "Z": "Cboe BZX",
    "V": "IEX",
}


class MasterError(Exception):
    """マスタ取込に失敗したときの、ユーザー向け日本語メッセージを持つ例外。"""


def _download(url: str, label: str) -> bytes:
    try:
        res = requests.get(url, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
        res.raise_for_status()
        return res.content
    except Exception as exc:
        raise MasterError(
            f"{label}のダウンロードに失敗しました({url})。ネットワーク制限がある場合は、"
            "ブラウザでファイルを取得して下のアップロード欄から取り込んでください。"
            f" 詳細: {exc}"
        ) from exc


def _upsert(conn, rows: list[tuple]) -> int:
    now = datetime.now().isoformat(timespec="seconds")
    conn.executemany(
        "INSERT INTO stocks(ticker, code, name, market, country, updated_at) "
        "VALUES(?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(ticker) DO UPDATE SET code = excluded.code, name = excluded.name, "
        "market = excluded.market, country = excluded.country, updated_at = excluded.updated_at",
        [(*row, now) for row in rows],
    )
    conn.commit()
    return len(rows)


def update_jp_master(conn, file_bytes: bytes | None = None) -> int:
    """東証の内国株式を取り込む。戻り値は件数。"""
    data = file_bytes or _download(JPX_URL, "JPX 東証上場銘柄一覧(data_j.xls)")
    try:
        df = pd.read_excel(io.BytesIO(data))
    except Exception as exc:
        raise MasterError(f"data_j.xls の読み込みに失敗しました。詳細: {exc}") from exc

    col_code = next((c for c in df.columns if "コード" in str(c)), None)
    col_name = next((c for c in df.columns if "銘柄名" in str(c)), None)
    col_seg = next((c for c in df.columns if "市場" in str(c)), None)
    if not (col_code and col_name and col_seg):
        raise MasterError("data_j.xls の列構成が想定と異なります(コード/銘柄名/市場・商品区分)。")

    rows = []
    for _, r in df.iterrows():
        seg = str(r[col_seg])
        if "内国株式" not in seg:
            continue
        code = str(r[col_code]).strip()
        market = seg.split("（")[0].strip() or "東証"
        rows.append((f"{code}.T", code, str(r[col_name]).strip(), market, "JP"))
    if not rows:
        raise MasterError("内国株式が1件も見つかりませんでした。ファイルの内容を確認してください。")
    return _upsert(conn, rows)


def _to_yf_symbol(symbol: str) -> str:
    """NASDAQ/CQS表記をyfinance表記に変換(BRK.B→BRK-B、優先株の$→-P)。"""
    return symbol.strip().replace("$", "-P").replace(".", "-").replace("/", "-")


def _parse_pipe_file(data: bytes) -> list[list[str]]:
    text = data.decode("utf-8", errors="replace")
    lines = [ln for ln in text.splitlines() if ln and not ln.startswith("File Creation Time")]
    return [ln.split("|") for ln in lines]


def update_us_master(
    conn, nasdaq_bytes: bytes | None = None, other_bytes: bytes | None = None
) -> int:
    """NASDAQ・NYSE系の上場銘柄を取り込む。戻り値は件数。"""
    nasdaq = nasdaq_bytes or _download(NASDAQ_LISTED_URL, "NASDAQ上場銘柄一覧(nasdaqlisted.txt)")
    other = other_bytes or _download(OTHER_LISTED_URL, "NYSE等上場銘柄一覧(otherlisted.txt)")

    rows = []
    parsed = _parse_pipe_file(nasdaq)
    header = parsed[0]
    idx = {name: i for i, name in enumerate(header)}
    for r in parsed[1:]:
        if len(r) < len(header):
            continue
        if r[idx.get("Test Issue", 3)] == "Y":
            continue
        symbol = r[idx["Symbol"]]
        rows.append((_to_yf_symbol(symbol), symbol, r[idx["Security Name"]], "NASDAQ", "US"))

    parsed = _parse_pipe_file(other)
    header = parsed[0]
    idx = {name: i for i, name in enumerate(header)}
    for r in parsed[1:]:
        if len(r) < len(header):
            continue
        if r[idx.get("Test Issue", 6)] == "Y":
            continue
        symbol = r[idx["ACT Symbol"]]
        market = US_EXCHANGES.get(r[idx.get("Exchange", 2)], "US")
        rows.append((_to_yf_symbol(symbol), symbol, r[idx["Security Name"]], market, "US"))

    if not rows:
        raise MasterError("米国株が1件も見つかりませんでした。ファイルの内容を確認してください。")
    return _upsert(conn, rows)


def search_stocks(conn, query: str, country: str | None = None, limit: int = 50) -> list:
    """銘柄名・ティッカー・コードの部分一致検索。"""
    query = query.strip()
    if not query:
        return []
    like = f"%{query.upper()}%"
    like_raw = f"%{query}%"
    sql = (
        "SELECT * FROM stocks WHERE "
        "(UPPER(ticker) LIKE ? OR UPPER(code) LIKE ? OR name LIKE ? OR UPPER(name) LIKE ?)"
    )
    params: list = [like, like, like_raw, like]
    if country:
        sql += " AND country = ?"
        params.append(country)
    sql += " ORDER BY country, ticker LIMIT ?"
    params.append(limit)
    return conn.execute(sql, params).fetchall()


def master_counts(conn) -> dict:
    rows = conn.execute(
        "SELECT country, COUNT(*) AS n, MAX(updated_at) AS updated FROM stocks GROUP BY country"
    ).fetchall()
    return {r["country"]: {"count": r["n"], "updated": r["updated"]} for r in rows}
