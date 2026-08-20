from datetime import date, timedelta

import pytest

from seo_meo.report.weekly import Change, build, render_markdown, sparkline
from seo_meo.storage import DailyValue, KeywordCount, connect, save_daily, save_keywords

LOC = "locations/12345"
END = date(2026, 8, 14)  # 今週窓は 08-08 〜 08-14、前週窓は 08-01 〜 08-07


@pytest.fixture
def conn(tmp_path):
    with connect(tmp_path / "test.sqlite3") as connection:
        yield connection


def fill(conn, *, this_week: dict[str, int], last_week: dict[str, int]):
    """両方の週に、指定の1日あたりの値を7日分入れる。"""
    values = []
    for offset in range(7):
        values += [
            DailyValue(END - timedelta(days=offset), metric, value)
            for metric, value in this_week.items()
        ]
        values += [
            DailyValue(END - timedelta(days=offset + 7), metric, value)
            for metric, value in last_week.items()
        ]
    save_daily(conn, LOC, values)


def test_change_percentage():
    assert Change("x", 120, 100).pct == pytest.approx(0.2)
    assert Change("x", 120, 100).format_pct() == "+20.0%"
    assert Change("x", 80, 100).format_delta() == "-20"


def test_change_percentage_undefined_when_previous_is_zero():
    """前週が0なら割り算できない。0%と偽らず、区別できる表示にする。"""
    assert Change("x", 5, 0).pct is None
    assert Change("x", 5, 0).format_pct() == "新規"
    assert Change("x", 0, 0).format_pct() == "—"


def test_build_compares_the_two_seven_day_windows(conn):
    fill(
        conn,
        this_week={"BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 100, "CALL_CLICKS": 5},
        last_week={"BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 50, "CALL_CLICKS": 5},
    )
    report = build(conn, LOC, "辰弥塗装工業", END)

    assert (report.start, report.end) == (date(2026, 8, 8), END)
    assert (report.prev_start, report.prev_end) == (date(2026, 8, 1), date(2026, 8, 7))
    assert report.total_impressions.current == 700
    assert report.total_impressions.previous == 350
    assert report.total_actions.current == 35


def test_build_excludes_days_outside_the_windows(conn):
    fill(
        conn,
        this_week={"CALL_CLICKS": 1},
        last_week={"CALL_CLICKS": 1},
    )
    # 前々週の値はどちらの窓にも入らない
    save_daily(conn, LOC, [DailyValue(END - timedelta(days=20), "CALL_CLICKS", 999)])

    report = build(conn, LOC, "辰弥塗装工業", END)
    assert report.total_actions.current == 7
    assert report.total_actions.previous == 7


def test_action_rate(conn):
    fill(
        conn,
        this_week={"BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 100, "CALL_CLICKS": 2},
        last_week={"BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 100, "CALL_CLICKS": 4},
    )
    report = build(conn, LOC, "辰弥塗装工業", END)

    assert report.action_rate == pytest.approx(0.02)
    assert report.prev_action_rate == pytest.approx(0.04)


def test_notes_flag_large_impression_drop(conn):
    fill(
        conn,
        this_week={"BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 50, "CALL_CLICKS": 2},
        last_week={"BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 100, "CALL_CLICKS": 4},
    )
    report = build(conn, LOC, "辰弥塗装工業", END)
    assert any("表示回数が前週比" in note for note in report.notes)


def test_notes_flag_call_drop(conn):
    fill(
        conn,
        this_week={"BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 100, "CALL_CLICKS": 1},
        last_week={"BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 100, "CALL_CLICKS": 10},
    )
    report = build(conn, LOC, "辰弥塗装工業", END)
    assert any("電話タップ" in note for note in report.notes)


def test_notes_quiet_when_stable(conn):
    fill(
        conn,
        this_week={"BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 100, "CALL_CLICKS": 4},
        last_week={"BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 100, "CALL_CLICKS": 4},
    )
    report = build(conn, LOC, "辰弥塗装工業", END)
    assert report.notes == ["大きな異常値はありません。"]


def test_notes_call_out_empty_data(conn):
    report = build(conn, LOC, "辰弥塗装工業", END)
    assert len(report.notes) == 1
    assert "0件" in report.notes[0]


def test_render_markdown_contains_key_sections(conn):
    fill(
        conn,
        this_week={"BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 100, "CALL_CLICKS": 5},
        last_week={"BUSINESS_IMPRESSIONS_MOBILE_SEARCH": 80, "CALL_CLICKS": 4},
    )
    save_keywords(conn, LOC, [KeywordCount("2026-08", "外壁塗装", 240, None)])

    markdown = render_markdown(build(conn, LOC, "辰弥塗装工業", END))

    assert "# 辰弥塗装工業 MEO週次レポート" in markdown
    assert "## サマリー" in markdown
    assert "検索キーワード (2026-08)" in markdown
    assert "外壁塗装" in markdown
    assert "## 気づき" in markdown
    assert "サンプルデータ" not in markdown


def test_render_markdown_marks_sample_data(conn):
    fill(conn, this_week={"CALL_CLICKS": 1}, last_week={"CALL_CLICKS": 1})
    markdown = render_markdown(build(conn, LOC, "辰弥塗装工業", END, is_sample=True))
    assert "サンプルデータ" in markdown


def test_sparkline():
    assert sparkline([]) == ""
    # 全部同じ値なら高さを決められないので、中間の高さで平坦に描く
    flat = sparkline([5, 5, 5])
    assert len(flat) == 3 and len(set(flat)) == 1
    line = sparkline([0, 50, 100])
    assert line[0] == "▁" and line[-1] == "█" and len(line) == 3


def test_sample_data_is_detected_from_the_fetch_log(conn):
    """--sample を付け忘れても、サンプル由来なら自動で警告が付く。"""
    from seo_meo.storage import log_fetch

    fill(conn, this_week={"CALL_CLICKS": 1}, last_week={"CALL_CLICKS": 1})
    log_fetch(conn, LOC, "daily:sample", "2026-08-01", "2026-08-14", 56)

    report = build(conn, LOC, "辰弥塗装工業", END)
    assert report.is_sample is True
    assert "サンプルデータ" in render_markdown(report)


def test_real_data_is_not_marked_as_sample(conn):
    from seo_meo.storage import log_fetch

    fill(conn, this_week={"CALL_CLICKS": 1}, last_week={"CALL_CLICKS": 1})
    log_fetch(conn, LOC, "daily:gbp", "2026-08-01", "2026-08-14", 56)

    assert build(conn, LOC, "辰弥塗装工業", END).is_sample is False


def test_sample_fetch_outside_the_window_does_not_taint_the_report(conn):
    from seo_meo.storage import log_fetch

    fill(conn, this_week={"CALL_CLICKS": 1}, last_week={"CALL_CLICKS": 1})
    log_fetch(conn, LOC, "daily:sample", "2026-01-01", "2026-01-31", 56)

    assert build(conn, LOC, "辰弥塗装工業", END).is_sample is False
