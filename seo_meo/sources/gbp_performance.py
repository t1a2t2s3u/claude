"""Business Profile Performance API v1 のクライアント。

扱うのは2種類:

* 日次指標 (表示回数・電話タップ等) — ``locations/{id}:fetchMultiDailyMetricsTimeSeries``
* 月次の検索キーワード — ``locations/{id}/searchkeywords/impressions/monthly``

キーワード API は月ごとの内訳を返さず、指定期間の合計しか返さない。月別に
持ちたいので、1か月ずつ範囲を区切って呼ぶ。
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Any, Iterator

from ..storage import DailyValue, KeywordCount
from .base import request_json

BASE_URL = "https://businessprofileperformance.googleapis.com/v1"

# API が1リクエストで返すキーワード数の上限。
KEYWORD_PAGE_SIZE = 100


def _date_params(prefix: str, value: date) -> list[tuple[str, Any]]:
    return [
        (f"{prefix}.year", value.year),
        (f"{prefix}.month", value.month),
        (f"{prefix}.day", value.day),
    ]


def fetch_daily_metrics(
    session: Any,
    location_path: str,
    metrics: list[str] | tuple[str, ...],
    start: date,
    end: date,
) -> list[DailyValue]:
    """期間内 (両端を含む) の日次指標をまとめて取得する。"""
    url = f"{BASE_URL}/{location_path}:fetchMultiDailyMetricsTimeSeries"
    params: list[tuple[str, Any]] = [("dailyMetrics", m) for m in metrics]
    params += _date_params("dailyRange.start_date", start)
    params += _date_params("dailyRange.end_date", end)

    payload = request_json(session, url, params)
    return list(parse_daily_metrics(payload))


def parse_daily_metrics(payload: dict) -> Iterator[DailyValue]:
    """fetchMultiDailyMetricsTimeSeries の応答を DailyValue に変換する。

    値が 0 の日は ``value`` フィールドごと省略されて返るため、欠けていたら 0
    として扱う (行を落とすと「未取得」と「0件」の区別がつかなくなる)。
    """
    for multi in payload.get("multiDailyMetricTimeSeries", []):
        for series in multi.get("dailyMetricTimeSeries", []):
            metric = series.get("dailyMetric")
            if not metric:
                continue
            dated = series.get("timeSeries", {}).get("datedValues", [])
            for entry in dated:
                day = _parse_date(entry.get("date"))
                if day is None:
                    continue
                yield DailyValue(date=day, metric=metric, value=int(entry.get("value", 0)))


def _parse_date(raw: dict | None) -> date | None:
    if not raw:
        return None
    try:
        return date(int(raw["year"]), int(raw["month"]), int(raw["day"]))
    except (KeyError, TypeError, ValueError):
        return None


def fetch_monthly_keywords(
    session: Any, location_path: str, months: list[str]
) -> list[KeywordCount]:
    """指定した各月 (YYYY-MM) の検索キーワードを取得する。"""
    results: list[KeywordCount] = []
    for month in months:
        results.extend(_fetch_one_month(session, location_path, month))
    return results


def _fetch_one_month(
    session: Any, location_path: str, month: str
) -> list[KeywordCount]:
    year, mon = (int(part) for part in month.split("-"))
    last_day = monthrange(year, mon)[1]
    url = f"{BASE_URL}/{location_path}/searchkeywords/impressions/monthly"

    counts: list[KeywordCount] = []
    page_token: str | None = None
    while True:
        params: list[tuple[str, Any]] = [
            ("monthlyRange.start_month.year", year),
            ("monthlyRange.start_month.month", mon),
            ("monthlyRange.start_month.day", 1),
            ("monthlyRange.end_month.year", year),
            ("monthlyRange.end_month.month", mon),
            ("monthlyRange.end_month.day", last_day),
            ("pageSize", KEYWORD_PAGE_SIZE),
        ]
        if page_token:
            params.append(("pageToken", page_token))

        payload = request_json(session, url, params)
        counts.extend(parse_keywords(payload, month))

        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    return counts


def parse_keywords(payload: dict, month: str) -> list[KeywordCount]:
    """検索キーワード応答を KeywordCount に変換する。

    表示回数が少ないキーワードは実数が伏せられ ``threshold`` だけが返る。
    """
    counts: list[KeywordCount] = []
    for entry in payload.get("searchKeywordsCounts", []):
        keyword = entry.get("searchKeyword")
        if not keyword:
            continue
        insights = entry.get("insightsValue", {})
        raw_value = insights.get("value")
        raw_threshold = insights.get("threshold")
        counts.append(
            KeywordCount(
                month=month,
                keyword=keyword,
                value=int(raw_value) if raw_value is not None else None,
                threshold=int(raw_threshold) if raw_threshold is not None else None,
            )
        )
    return counts


def recent_months(end: date, count: int) -> list[str]:
    """``end`` の月から遡って ``count`` か月分の YYYY-MM を古い順に返す。"""
    months: list[str] = []
    year, mon = end.year, end.month
    for _ in range(count):
        months.append(f"{year:04d}-{mon:02d}")
        mon -= 1
        if mon == 0:
            year, mon = year - 1, 12
    return list(reversed(months))
