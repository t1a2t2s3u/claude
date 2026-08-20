"""Google ビジネスプロフィールの指標定義。

Business Profile Performance API の DailyMetric enum のうち、塗装業で意味の
ある指標だけを扱う。飲食店向け指標 (BUSINESS_FOOD_ORDERS など) は除外。
"""

from __future__ import annotations

from dataclasses import dataclass

IMPRESSION = "impression"
ACTION = "action"


@dataclass(frozen=True)
class MetricDef:
    """1つの日次指標の定義。"""

    api_name: str
    """Performance API の DailyMetric 名。"""

    label_ja: str
    """レポートに出す日本語ラベル。"""

    group: str
    """IMPRESSION (見られた回数) か ACTION (反応した回数) か。"""


METRICS: tuple[MetricDef, ...] = (
    # --- 表示回数 ---
    MetricDef("BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "検索表示(スマホ)", IMPRESSION),
    MetricDef("BUSINESS_IMPRESSIONS_MOBILE_MAPS", "マップ表示(スマホ)", IMPRESSION),
    MetricDef("BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "検索表示(PC)", IMPRESSION),
    MetricDef("BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "マップ表示(PC)", IMPRESSION),
    # --- 反応 (問い合わせにつながる行動) ---
    MetricDef("CALL_CLICKS", "電話タップ", ACTION),
    MetricDef("BUSINESS_DIRECTION_REQUESTS", "ルート検索", ACTION),
    MetricDef("BUSINESS_CONVERSATIONS", "メッセージ", ACTION),
    MetricDef("WEBSITE_CLICKS", "サイトクリック", ACTION),
)

BY_NAME: dict[str, MetricDef] = {m.api_name: m for m in METRICS}

IMPRESSION_METRICS: tuple[str, ...] = tuple(
    m.api_name for m in METRICS if m.group == IMPRESSION
)
ACTION_METRICS: tuple[str, ...] = tuple(
    m.api_name for m in METRICS if m.group == ACTION
)
ALL_METRICS: tuple[str, ...] = tuple(m.api_name for m in METRICS)


def label(api_name: str) -> str:
    """API 名から日本語ラベルを引く。未知の指標は API 名をそのまま返す。"""
    metric = BY_NAME.get(api_name)
    return metric.label_ja if metric else api_name
