"""SQLite への蓄積。

再取得しても壊れないよう、すべての書き込みは (拠点, 期間, 指標) を主キーに
した upsert にしている。Performance API は数日かけて値が確定するため、同じ
日を何度も取り直して上書きするのが前提。
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS daily_metrics (
    location_id TEXT NOT NULL,
    date        TEXT NOT NULL,   -- YYYY-MM-DD
    metric      TEXT NOT NULL,   -- Performance API の DailyMetric 名
    value       INTEGER NOT NULL,
    fetched_at  TEXT NOT NULL,
    PRIMARY KEY (location_id, date, metric)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_date
    ON daily_metrics (location_id, date);

CREATE TABLE IF NOT EXISTS monthly_keywords (
    location_id TEXT NOT NULL,
    month       TEXT NOT NULL,   -- YYYY-MM
    keyword     TEXT NOT NULL,
    value       INTEGER,         -- 実数。しきい値未満のときは NULL
    threshold   INTEGER,         -- 実数が伏せられたときの「これ未満」の値
    fetched_at  TEXT NOT NULL,
    PRIMARY KEY (location_id, month, keyword)
);

CREATE TABLE IF NOT EXISTS fetch_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id TEXT NOT NULL,
    source      TEXT NOT NULL,
    range_start TEXT NOT NULL,
    range_end   TEXT NOT NULL,
    rows        INTEGER NOT NULL,
    fetched_at  TEXT NOT NULL
);
"""


@dataclass(frozen=True)
class DailyValue:
    """1拠点・1日・1指標の実測値。"""

    date: date
    metric: str
    value: int


@dataclass(frozen=True)
class KeywordCount:
    """月次の検索キーワードと表示回数。

    Google は表示回数が少ないキーワードの実数を伏せ、代わりに「しきい値未満」
    としてのみ返す。その場合 ``value`` は None、``threshold`` に境界値が入る。
    """

    month: str
    keyword: str
    value: int | None
    threshold: int | None

    @property
    def display(self) -> str:
        if self.value is not None:
            return str(self.value)
        if self.threshold is not None:
            return f"<{self.threshold}"
        return "-"

    @property
    def sort_key(self) -> int:
        """並べ替え用。伏せられた値はしきい値の1つ下として扱う。"""
        if self.value is not None:
            return self.value
        if self.threshold is not None:
            return max(self.threshold - 1, 0)
        return 0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect(path: str | Path) -> Iterator[sqlite3.Connection]:
    """DB に接続する。ファイルとスキーマが無ければ作る。"""
    db_path = Path(path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()


def save_daily(
    conn: sqlite3.Connection, location_id: str, values: Iterable[DailyValue]
) -> int:
    """日次指標を upsert し、書き込んだ行数を返す。"""
    now = _now()
    rows = [(location_id, v.date.isoformat(), v.metric, v.value, now) for v in values]
    conn.executemany(
        """
        INSERT INTO daily_metrics (location_id, date, metric, value, fetched_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (location_id, date, metric) DO UPDATE SET
            value = excluded.value,
            fetched_at = excluded.fetched_at
        """,
        rows,
    )
    return len(rows)


def save_keywords(
    conn: sqlite3.Connection, location_id: str, counts: Iterable[KeywordCount]
) -> int:
    """月次キーワードを upsert し、書き込んだ行数を返す。"""
    now = _now()
    rows = [(location_id, c.month, c.keyword, c.value, c.threshold, now) for c in counts]
    conn.executemany(
        """
        INSERT INTO monthly_keywords
            (location_id, month, keyword, value, threshold, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (location_id, month, keyword) DO UPDATE SET
            value = excluded.value,
            threshold = excluded.threshold,
            fetched_at = excluded.fetched_at
        """,
        rows,
    )
    return len(rows)


def log_fetch(
    conn: sqlite3.Connection,
    location_id: str,
    source: str,
    range_start: str,
    range_end: str,
    rows: int,
) -> None:
    """取り込み履歴を1件残す。いつ何を取ったかを後から追えるように。"""
    conn.execute(
        """
        INSERT INTO fetch_log
            (location_id, source, range_start, range_end, rows, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (location_id, source, range_start, range_end, rows, _now()),
    )


def metric_totals(
    conn: sqlite3.Connection, location_id: str, start: date, end: date
) -> dict[str, int]:
    """期間内 (両端を含む) の指標ごとの合計を返す。"""
    cur = conn.execute(
        """
        SELECT metric, SUM(value) AS total
        FROM daily_metrics
        WHERE location_id = ? AND date BETWEEN ? AND ?
        GROUP BY metric
        """,
        (location_id, start.isoformat(), end.isoformat()),
    )
    return {row["metric"]: int(row["total"] or 0) for row in cur}


def daily_series(
    conn: sqlite3.Connection, location_id: str, start: date, end: date
) -> dict[str, dict[str, int]]:
    """``{日付: {指標: 値}}`` の形で期間内の日次値を返す。"""
    cur = conn.execute(
        """
        SELECT date, metric, value
        FROM daily_metrics
        WHERE location_id = ? AND date BETWEEN ? AND ?
        ORDER BY date
        """,
        (location_id, start.isoformat(), end.isoformat()),
    )
    series: dict[str, dict[str, int]] = {}
    for row in cur:
        series.setdefault(row["date"], {})[row["metric"]] = int(row["value"])
    return series


def latest_keyword_month(conn: sqlite3.Connection, location_id: str) -> str | None:
    """キーワードデータが入っている最新の月 (YYYY-MM) を返す。"""
    cur = conn.execute(
        "SELECT MAX(month) AS m FROM monthly_keywords WHERE location_id = ?",
        (location_id,),
    )
    row = cur.fetchone()
    return row["m"] if row and row["m"] else None


def keywords_for_month(
    conn: sqlite3.Connection, location_id: str, month: str, limit: int = 20
) -> list[KeywordCount]:
    """指定月のキーワードを表示回数の多い順に返す。"""
    cur = conn.execute(
        """
        SELECT month, keyword, value, threshold
        FROM monthly_keywords
        WHERE location_id = ? AND month = ?
        """,
        (location_id, month),
    )
    counts = [
        KeywordCount(
            month=row["month"],
            keyword=row["keyword"],
            value=row["value"],
            threshold=row["threshold"],
        )
        for row in cur
    ]
    counts.sort(key=lambda c: (-c.sort_key, c.keyword))
    return counts[:limit]


def used_sample_source(
    conn: sqlite3.Connection, location_id: str, start: date, end: date
) -> bool:
    """期間内にサンプル由来の取り込みが混ざっているかを返す。

    サンプルデータのレポートを実データと取り違えると判断を誤るため、
    レポート側で自動的に警告を出せるようにしている。
    """
    cur = conn.execute(
        """
        SELECT 1 FROM fetch_log
        WHERE location_id = ?
          AND source LIKE 'daily:sample%'
          AND range_start <= ? AND range_end >= ?
        LIMIT 1
        """,
        (location_id, end.isoformat(), start.isoformat()),
    )
    return cur.fetchone() is not None
