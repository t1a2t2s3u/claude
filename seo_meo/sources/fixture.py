"""API 承認が下りる前に基盤を動かすためのサンプルデータ生成。

Google の Business Profile API はプロジェクト単位の利用申請と承認が要る。
承認待ちの間もレポートの体裁や集計ロジックを確認できるよう、実データと同じ
形の値を決定的に (同じ日付なら常に同じ値で) 生成する。

本番データではないので、レポートには必ずサンプルである旨が出る。
"""

from __future__ import annotations

import random
from datetime import date, timedelta

from ..metrics import ALL_METRICS
from ..storage import DailyValue, KeywordCount

# 塗装の需要はスマホ検索に偏るため、指標ごとの平均的な水準を変えている。
_DAILY_BASELINE = {
    "BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 120,
    "BUSINESS_IMPRESSIONS_MOBILE_MAPS": 85,
    "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH": 30,
    "BUSINESS_IMPRESSIONS_DESKTOP_MAPS": 12,
    "CALL_CLICKS": 4,
    "BUSINESS_DIRECTION_REQUESTS": 3,
    "BUSINESS_CONVERSATIONS": 1,
    "WEBSITE_CLICKS": 6,
}

# 曜日ごとの倍率 (0=月 .. 6=日)。週末に検索が伸びる家庭向け工事の形。
_WEEKDAY_FACTOR = (0.95, 0.95, 1.0, 1.0, 1.05, 1.35, 1.30)

_SAMPLE_KEYWORDS = (
    "外壁塗装",
    "外壁塗装 見積もり",
    "屋根塗装 費用",
    "塗装業者 近く",
    "辰弥塗装工業",
    "外壁 塗り替え 時期",
    "防水工事",
    "サイディング 塗装",
    "屋根 雨漏り 修理",
    "外壁塗装 助成金",
)


def _seeded(day: date, metric: str) -> random.Random:
    return random.Random(f"{day.isoformat()}:{metric}")


def daily_metrics(start: date, end: date) -> list[DailyValue]:
    """期間内 (両端を含む) のサンプル日次指標を返す。"""
    values: list[DailyValue] = []
    day = start
    while day <= end:
        for metric in ALL_METRICS:
            baseline = _DAILY_BASELINE.get(metric, 5)
            factor = _WEEKDAY_FACTOR[day.weekday()]
            noise = _seeded(day, metric).uniform(0.75, 1.25)
            values.append(
                DailyValue(date=day, metric=metric, value=max(0, round(baseline * factor * noise)))
            )
        day += timedelta(days=1)
    return values


def monthly_keywords(months: list[str]) -> list[KeywordCount]:
    """サンプルの月次検索キーワードを返す。

    実データと同じく、下位のキーワードは実数ではなくしきい値で返す。
    """
    counts: list[KeywordCount] = []
    for month in months:
        rng = random.Random(f"keywords:{month}")
        for rank, keyword in enumerate(_SAMPLE_KEYWORDS):
            volume = round(320 * (0.72**rank) * rng.uniform(0.85, 1.15))
            if volume < 15:
                counts.append(KeywordCount(month, keyword, None, 15))
            else:
                counts.append(KeywordCount(month, keyword, volume, None))
    return counts


def date_range_back(end: date, days: int) -> tuple[date, date]:
    """``end`` を最終日とする ``days`` 日間の範囲を返す。"""
    return end - timedelta(days=days - 1), end
