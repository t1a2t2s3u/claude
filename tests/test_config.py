import pytest

from seo_meo.config import ConfigError, load


def write(tmp_path, body):
    path = tmp_path / "config.toml"
    path.write_text(body, encoding="utf-8")
    return path


def test_location_id_is_normalised_to_api_path(tmp_path):
    bare = load(write(tmp_path, '[business]\nlocation_id = "12345"\n'))
    prefixed = load(write(tmp_path, '[business]\nlocation_id = "locations/12345"\n'))
    assert bare.location_path == prefixed.location_path == "locations/12345"


def test_relative_paths_resolve_against_the_config_file(tmp_path):
    cfg = load(
        write(
            tmp_path,
            '[business]\nlocation_id = "1"\n[storage]\ndatabase = "data/db.sqlite3"\n',
        )
    )
    assert cfg.database == tmp_path / "data" / "db.sqlite3"


def test_absolute_paths_are_left_alone(tmp_path):
    cfg = load(
        write(
            tmp_path,
            f'[business]\nlocation_id = "1"\n[storage]\ndatabase = "{tmp_path}/abs.sqlite3"\n',
        )
    )
    assert cfg.database == tmp_path / "abs.sqlite3"


def test_missing_location_id_is_an_error(tmp_path):
    with pytest.raises(ConfigError, match="location_id"):
        load(write(tmp_path, '[business]\nname = "辰弥塗装工業"\n'))


def test_defaults_are_applied(tmp_path):
    cfg = load(write(tmp_path, '[business]\nlocation_id = "1"\n'))
    assert cfg.lookback_days == 30
    assert cfg.data_lag_days == 5


def test_env_var_selects_config(tmp_path, monkeypatch):
    path = write(tmp_path, '[business]\nlocation_id = "777"\n')
    monkeypatch.setenv("SEO_MEO_CONFIG", str(path))
    assert load().location_path == "locations/777"
