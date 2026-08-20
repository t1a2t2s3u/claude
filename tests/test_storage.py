from datetime import date

import pytest

from seo_meo.storage import (
    DailyValue,
    KeywordCount,
    connect,
    daily_series,
    keywords_for_month,
    latest_keyword_month,
    log_fetch,
    metric_totals,
    save_daily,
    save_keywords,
)

LOC = "locations/12345"


@pytest.fixture
def conn(tmp_path):
    with connect(tmp_path / "test.sqlite3") as connection:
        yield connection


def test_save_daily_is_idempotent_and_overwrites(conn):
    """同じ日を取り直したら上書きされる (Performance API は後から値が確定する)。"""
    save_daily(conn, LOC, [DailyValue(date(2026, 8, 1), "CALL_CLICKS", 3)])
    save_daily(conn, LOC, [DailyValue(date(2026, 8, 1), "CALL_CLICKS", 9)])

    rows = conn.execute("SELECT value FROM daily_metrics").fetchall()
    assert len(rows) == 1
    assert rows[0]["value"] == 9


def test_metric_totals_sums_within_inclusive_range(conn):
    save_daily(
        conn,
        LOC,
        [
            DailyValue(date(2026, 7, 31), "CALL_CLICKS", 100),  # 範囲外
            DailyValue(date(2026, 8, 1), "CALL_CLICKS", 3),
            DailyValue(date(2026, 8, 3), "CALL_CLICKS", 4),
            DailyValue(date(2026, 8, 3), "WEBSITE_CLICKS", 5),
            DailyValue(date(2026, 8, 4), "CALL_CLICKS", 100),  # 範囲外
        ],
    )

    totals = metric_totals(conn, LOC, date(2026, 8, 1), date(2026, 8, 3))
    assert totals == {"CALL_CLICKS": 7, "WEBSITE_CLICKS": 5}


def test_metric_totals_ignores_other_locations(conn):
    save_daily(conn, LOC, [DailyValue(date(2026, 8, 1), "CALL_CLICKS", 3)])
    save_daily(conn, "locations/999", [DailyValue(date(2026, 8, 1), "CALL_CLICKS", 50)])

    assert metric_totals(conn, LOC, date(2026, 8, 1), date(2026, 8, 1)) == {
        "CALL_CLICKS": 3
    }


def test_daily_series_groups_by_date(conn):
    save_daily(
        conn,
        LOC,
        [
            DailyValue(date(2026, 8, 1), "CALL_CLICKS", 3),
            DailyValue(date(2026, 8, 1), "WEBSITE_CLICKS", 6),
            DailyValue(date(2026, 8, 2), "CALL_CLICKS", 1),
        ],
    )

    series = daily_series(conn, LOC, date(2026, 8, 1), date(2026, 8, 2))
    assert series == {
        "2026-08-01": {"CALL_CLICKS": 3, "WEBSITE_CLICKS": 6},
        "2026-08-02": {"CALL_CLICKS": 1},
    }


def test_keywords_sorted_by_volume_with_threshold_below_real_values(conn):
    save_keywords(
        conn,
        LOC,
        [
            KeywordCount("2026-07", "外壁塗装", 240, None),
            KeywordCount("2026-07", "屋根塗装", 60, None),
            KeywordCount("2026-07", "防水工事", None, 15),
        ],
    )

    top = keywords_for_month(conn, LOC, "2026-07")
    assert [k.keyword for k in top] == ["外壁塗装", "屋根塗装", "防水工事"]
    assert top[-1].display == "<15"


def test_keywords_respects_limit(conn):
    save_keywords(
        conn,
        LOC,
        [KeywordCount("2026-07", f"kw{i}", 100 - i, None) for i in range(30)],
    )
    assert len(keywords_for_month(conn, LOC, "2026-07", limit=5)) == 5


def test_latest_keyword_month(conn):
    assert latest_keyword_month(conn, LOC) is None
    save_keywords(
        conn,
        LOC,
        [
            KeywordCount("2026-05", "外壁塗装", 10, None),
            KeywordCount("2026-07", "外壁塗装", 20, None),
        ],
    )
    assert latest_keyword_month(conn, LOC) == "2026-07"


def test_log_fetch_records_history(conn):
    log_fetch(conn, LOC, "daily:gbp", "2026-08-01", "2026-08-07", 56)
    row = conn.execute("SELECT * FROM fetch_log").fetchone()
    assert row["source"] == "daily:gbp"
    assert row["rows"] == 56


def test_connect_creates_parent_directory(tmp_path):
    nested = tmp_path / "a" / "b" / "db.sqlite3"
    with connect(nested):
        pass
    assert nested.exists()
