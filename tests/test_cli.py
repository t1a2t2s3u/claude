"""CLI の疎通確認。サンプルデータ経路なら API 認証なしで通しで動く。"""

import pytest

from seo_meo import config as config_mod
from seo_meo.cli import main

CONFIG = """
[business]
name = "辰弥塗装工業"
location_id = "12345"

[storage]
database = "data/test.sqlite3"

[collection]
lookback_days = 14
data_lag_days = 5

[report]
output_dir = "out"
"""


@pytest.fixture
def config_path(tmp_path):
    path = tmp_path / "config.toml"
    path.write_text(CONFIG, encoding="utf-8")
    return path


def run(config_path, *args):
    return main(["--config", str(config_path), *args])


def test_fetch_report_roundtrip(config_path, tmp_path, capsys):
    assert run(config_path, "fetch", "--source", "sample", "--end", "2026-08-14") == 0
    assert run(config_path, "keywords", "--source", "sample", "--end", "2026-08-14") == 0
    assert run(
        config_path, "report", "--end", "2026-08-14", "--sample", "--out", "-"
    ) == 0

    output = capsys.readouterr().out
    assert "辰弥塗装工業 MEO週次レポート" in output
    assert "2026-08-08 〜 2026-08-14" in output
    assert "サンプルデータ" in output
    assert "外壁塗装" in output


def test_fetch_is_repeatable_without_duplicating_rows(config_path, tmp_path):
    for _ in range(2):
        run(config_path, "fetch", "--source", "sample", "--end", "2026-08-14", "--days", "7")

    cfg = config_mod.load(config_path)
    import sqlite3

    conn = sqlite3.connect(cfg.database)
    count = conn.execute("SELECT COUNT(*) FROM daily_metrics").fetchone()[0]
    conn.close()
    assert count == 7 * 8  # 7日 × 8指標


def test_report_writes_to_default_directory(config_path, tmp_path):
    run(config_path, "fetch", "--source", "sample", "--end", "2026-08-14")
    assert run(config_path, "report", "--end", "2026-08-14") == 0
    assert (tmp_path / "out" / "weekly-2026-08-14.md").exists()


def test_status_lists_ingestion_history(config_path, capsys):
    run(config_path, "fetch", "--source", "sample", "--end", "2026-08-14", "--days", "7")
    capsys.readouterr()

    assert run(config_path, "status") == 0
    output = capsys.readouterr().out
    assert "locations/12345" in output
    assert "daily:sample" in output


def test_missing_config_reports_error(tmp_path, capsys):
    assert main(["--config", str(tmp_path / "nope.toml"), "status"]) == 1
    assert "設定ファイルが見つかりません" in capsys.readouterr().err
