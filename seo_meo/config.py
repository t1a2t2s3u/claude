"""設定ファイル (TOML) の読み込み。"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_CONFIG_PATH = Path("config.toml")

# Performance API のデータは即日では確定しない。既定でこの日数だけ手前を
# 「確定済みの最終日」として扱う。
DEFAULT_DATA_LAG_DAYS = 5

# 取り込みは毎回この日数分さかのぼる。後から埋まった値を上書きするため、
# 「前回の続きから」ではなく常に窓ごと取り直す。
DEFAULT_LOOKBACK_DAYS = 30


class ConfigError(Exception):
    """設定が不足している、または不正なとき。"""


@dataclass
class Config:
    business_name: str
    location_id: str
    database: Path
    client_secret_file: Path
    token_file: Path
    lookback_days: int = DEFAULT_LOOKBACK_DAYS
    data_lag_days: int = DEFAULT_DATA_LAG_DAYS
    report_dir: Path = field(default_factory=lambda: Path("reports"))

    @property
    def location_path(self) -> str:
        """API パスとして使える ``locations/{id}`` 形式に正規化して返す。"""
        loc = self.location_id.strip()
        return loc if loc.startswith("locations/") else f"locations/{loc}"


def _require(table: dict, section: str, key: str) -> str:
    value = table.get(key)
    if not value:
        raise ConfigError(
            f"設定 [{section}] の {key} が未設定です。"
            " config.example.toml を config.toml にコピーして記入してください。"
        )
    return str(value)


def load(path: str | os.PathLike[str] | None = None) -> Config:
    """TOML 設定を読み込む。

    ``SEO_MEO_CONFIG`` 環境変数があればそれを優先する。
    """
    resolved = Path(path or os.environ.get("SEO_MEO_CONFIG") or DEFAULT_CONFIG_PATH)
    if not resolved.exists():
        raise ConfigError(
            f"設定ファイルが見つかりません: {resolved}\n"
            "config.example.toml を config.toml にコピーして記入してください。"
        )

    with resolved.open("rb") as fh:
        raw = tomllib.load(fh)

    business = raw.get("business", {})
    storage = raw.get("storage", {})
    auth = raw.get("auth", {})
    collection = raw.get("collection", {})
    report = raw.get("report", {})

    base = resolved.parent

    def _path(value: str) -> Path:
        candidate = Path(value)
        return candidate if candidate.is_absolute() else base / candidate

    return Config(
        business_name=business.get("name", "（社名未設定）"),
        location_id=_require(business, "business", "location_id"),
        database=_path(storage.get("database", "data/seo_meo.sqlite3")),
        client_secret_file=_path(auth.get("client_secret_file", "secrets/client_secret.json")),
        token_file=_path(auth.get("token_file", "secrets/token.json")),
        lookback_days=int(collection.get("lookback_days", DEFAULT_LOOKBACK_DAYS)),
        data_lag_days=int(collection.get("data_lag_days", DEFAULT_DATA_LAG_DAYS)),
        report_dir=_path(report.get("output_dir", "reports")),
    )
