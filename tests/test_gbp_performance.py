from datetime import date

import pytest

from seo_meo.sources import gbp_performance as gbp


DAILY_PAYLOAD = {
    "multiDailyMetricTimeSeries": [
        {
            "dailyMetricTimeSeries": [
                {
                    "dailyMetric": "CALL_CLICKS",
                    "timeSeries": {
                        "datedValues": [
                            {"date": {"year": 2026, "month": 8, "day": 1}, "value": "3"},
                            # value が無い日は 0 件を意味する
                            {"date": {"year": 2026, "month": 8, "day": 2}},
                            {"date": {"year": 2026, "month": 8, "day": 3}, "value": "7"},
                        ]
                    },
                },
                {
                    "dailyMetric": "WEBSITE_CLICKS",
                    "timeSeries": {
                        "datedValues": [
                            {"date": {"year": 2026, "month": 8, "day": 1}, "value": "12"}
                        ]
                    },
                },
            ]
        }
    ]
}


def test_parse_daily_metrics_reads_all_series():
    values = list(gbp.parse_daily_metrics(DAILY_PAYLOAD))
    assert len(values) == 4
    assert values[0] == gbp.DailyValue(date(2026, 8, 1), "CALL_CLICKS", 3)
    assert values[-1] == gbp.DailyValue(date(2026, 8, 1), "WEBSITE_CLICKS", 12)


def test_missing_value_becomes_zero_not_dropped():
    """0件の日を落とすと「未取得」と区別できなくなるため行は残す。"""
    values = list(gbp.parse_daily_metrics(DAILY_PAYLOAD))
    august_2 = [v for v in values if v.date == date(2026, 8, 2)]
    assert len(august_2) == 1
    assert august_2[0].value == 0


def test_parse_daily_metrics_skips_malformed_entries():
    payload = {
        "multiDailyMetricTimeSeries": [
            {
                "dailyMetricTimeSeries": [
                    {"timeSeries": {"datedValues": [{"value": "5"}]}},  # 指標名なし
                    {
                        "dailyMetric": "CALL_CLICKS",
                        "timeSeries": {"datedValues": [{"value": "5"}]},  # 日付なし
                    },
                ]
            }
        ]
    }
    assert list(gbp.parse_daily_metrics(payload)) == []


def test_parse_daily_metrics_empty_payload():
    assert list(gbp.parse_daily_metrics({})) == []


def test_parse_keywords_handles_threshold():
    payload = {
        "searchKeywordsCounts": [
            {"searchKeyword": "外壁塗装", "insightsValue": {"value": "240"}},
            {"searchKeyword": "屋根 塗装 相場", "insightsValue": {"threshold": "15"}},
        ]
    }
    counts = gbp.parse_keywords(payload, "2026-07")

    assert counts[0].value == 240 and counts[0].threshold is None
    assert counts[0].display == "240"
    assert counts[1].value is None and counts[1].threshold == 15
    assert counts[1].display == "<15"
    assert all(c.month == "2026-07" for c in counts)


def test_recent_months_crosses_year_boundary():
    assert gbp.recent_months(date(2026, 2, 10), 4) == [
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
    ]


@pytest.mark.parametrize("count", [1, 12])
def test_recent_months_length(count):
    assert len(gbp.recent_months(date(2026, 8, 20), count)) == count
