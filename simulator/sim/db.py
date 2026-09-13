"""SQLite接続・スキーマ・アプリ設定。

データはすべて simulator/data/sim.db に永続化する。
ロジック層(sim/)は Streamlit に依存しない。
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "sim.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS stocks (
  ticker     TEXT PRIMARY KEY,  -- yfinance用ティッカー(例: 7203.T / AAPL)
  code       TEXT NOT NULL,     -- 元のコード(例: 7203 / BRK.B)
  name       TEXT NOT NULL,
  market     TEXT NOT NULL,     -- プライム/スタンダード/グロース/NYSE/NASDAQ など
  country    TEXT NOT NULL,     -- JP / US
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stocks_name ON stocks(name);
CREATE INDEX IF NOT EXISTS idx_stocks_code ON stocks(code);

CREATE TABLE IF NOT EXISTS portfolios (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,
  initial_cash REAL NOT NULL,
  cash         REAL NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  portfolio_id INTEGER NOT NULL,
  ticker       TEXT NOT NULL,
  name         TEXT NOT NULL,
  currency     TEXT NOT NULL,          -- JPY / USD
  qty          REAL NOT NULL,
  avg_cost_jpy REAL NOT NULL,          -- 手数料込みの平均取得単価(円)
  PRIMARY KEY (portfolio_id, ticker)
);

CREATE TABLE IF NOT EXISTS trades (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL,
  ts           TEXT NOT NULL,          -- ISO日時
  ticker       TEXT NOT NULL,
  name         TEXT NOT NULL,
  side         TEXT NOT NULL,          -- buy / sell
  qty          REAL NOT NULL,
  price_ccy    REAL NOT NULL,          -- 現地通貨の約定単価
  currency     TEXT NOT NULL,
  fx_rate      REAL NOT NULL,          -- 適用した円換算レート(スプレッド込み。JPYは1.0)
  price_jpy    REAL NOT NULL,          -- 円換算の約定単価
  fee_jpy      REAL NOT NULL,
  amount_jpy   REAL NOT NULL,          -- 受渡金額(買い: 支払額 / 売り: 受取額。手数料込み)
  realized_jpy REAL,                   -- 売りの実現損益(税引前)。買いはNULL
  tax_jpy      REAL,                   -- この売りで源泉徴収(負なら還付)した税額
  reason       TEXT,
  tag          TEXT NOT NULL DEFAULT 'manual'  -- manual / AI
);
CREATE INDEX IF NOT EXISTS idx_trades_pf ON trades(portfolio_id, ts);

CREATE TABLE IF NOT EXISTS snapshots (
  portfolio_id  INTEGER NOT NULL,
  date          TEXT NOT NULL,         -- YYYY-MM-DD
  total_jpy     REAL NOT NULL,
  cash_jpy      REAL NOT NULL,
  positions_jpy REAL NOT NULL,
  PRIMARY KEY (portfolio_id, date)
);

CREATE TABLE IF NOT EXISTS quote_cache (
  ticker     TEXT PRIMARY KEY,
  price      REAL NOT NULL,
  currency   TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""

# 手数料・取引ルールの既定値(設定ページで変更可能)
DEFAULT_SETTINGS = {
    "jp_fee_rate": "0.001",       # 日本株手数料率(0.1%)
    "us_fee_rate": "0.0045",      # 米国株手数料率(0.45%)
    "fx_spread": "0.25",          # 為替スプレッド(円/ドル。片道25銭)
    "allow_odd_lot_jp": "0",      # 日本株の単元未満(1株単位)取引を許可するか
}

TAX_RATE = 0.20315  # 譲渡益課税(所得税+復興特別所得税+住民税)


def connect(db_path: Path | str = DB_PATH) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    for key, value in DEFAULT_SETTINGS.items():
        conn.execute("INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)", (key, value))
    conn.commit()


def get_setting(conn: sqlite3.Connection, key: str) -> str:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else DEFAULT_SETTINGS[key]


def get_setting_float(conn: sqlite3.Connection, key: str) -> float:
    return float(get_setting(conn, key))


def set_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )
    conn.commit()
