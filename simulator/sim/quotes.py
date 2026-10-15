"""株価・為替の取得とキャッシュ。

- 現在値: yfinance から取得し SQLite に保存。TTL内(既定10分)は再取得しない。
  無料のYahoo Financeデータは15〜20分遅延がある(READMEに明記)。
- 日足履歴: メモリ内キャッシュ(TTL 1時間)。
- 取得失敗は QuoteError(日本語メッセージ)で呼び出し側に伝える。
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timedelta

import pandas as pd

QUOTE_TTL_SEC = 600        # 現在値キャッシュ(10分)
HISTORY_TTL_SEC = 3600     # 日足キャッシュ(1時間)

USDJPY_TICKER = "USDJPY=X"


class QuoteError(Exception):
    """株価取得に失敗したときの、ユーザー向け日本語メッセージを持つ例外。"""


@dataclass
class Quote:
    ticker: str
    price: float
    currency: str
    fetched_at: datetime

    @property
    def is_cached(self) -> bool:
        return (datetime.now() - self.fetched_at).total_seconds() > 5


def _guess_currency(ticker: str, info_currency: str | None) -> str:
    if info_currency:
        return info_currency.upper()
    return "JPY" if ticker.endswith(".T") else "USD"


def _fetch_from_yfinance(ticker: str) -> tuple[float, str]:
    """yfinanceから最新価格を取る。fast_infoが空なら直近の日足終値に落とす。"""
    import yfinance as yf  # 起動を速くするため遅延import

    try:
        t = yf.Ticker(ticker)
        price = None
        currency = None
        try:
            fi = t.fast_info
            price = fi.get("last_price") or fi.get("lastPrice")
            currency = fi.get("currency")
        except Exception:
            pass
        if not price:
            hist = t.history(period="5d", interval="1d", auto_adjust=False)
            if hist is None or hist.empty:
                raise QuoteError(
                    f"「{ticker}」の価格を取得できませんでした。ティッカーが正しいか、"
                    "上場廃止になっていないか確認してください。"
                )
            price = float(hist["Close"].dropna().iloc[-1])
        return float(price), _guess_currency(ticker, currency)
    except QuoteError:
        raise
    except Exception as exc:  # ネットワーク断など
        raise QuoteError(
            f"「{ticker}」の価格取得に失敗しました(ネットワークまたはYahoo Finance側の問題の"
            f"可能性があります)。時間を置いて再試行してください。詳細: {exc}"
        ) from exc


def get_quote(conn, ticker: str, max_age_sec: int = QUOTE_TTL_SEC) -> Quote:
    """現在値を返す。TTL内ならSQLiteキャッシュを使う。"""
    ticker = ticker.strip()
    row = conn.execute("SELECT * FROM quote_cache WHERE ticker = ?", (ticker,)).fetchone()
    if row:
        fetched = datetime.fromisoformat(row["fetched_at"])
        if datetime.now() - fetched < timedelta(seconds=max_age_sec):
            return Quote(ticker, row["price"], row["currency"], fetched)

    price, currency = _fetch_from_yfinance(ticker)
    now = datetime.now()
    conn.execute(
        "INSERT INTO quote_cache(ticker, price, currency, fetched_at) VALUES(?, ?, ?, ?) "
        "ON CONFLICT(ticker) DO UPDATE SET price = excluded.price, "
        "currency = excluded.currency, fetched_at = excluded.fetched_at",
        (ticker, price, currency, now.isoformat(timespec="seconds")),
    )
    conn.commit()
    return Quote(ticker, price, currency, now)


def get_usdjpy(conn) -> float:
    """USD/JPYの仲値。取得失敗時は QuoteError。"""
    quote = get_quote(conn, USDJPY_TICKER)
    return quote.price


# ── 日足履歴(メモリキャッシュ) ─────────────────────────────

_history_cache: dict[tuple[str, str], tuple[float, pd.DataFrame]] = {}


def get_history(ticker: str, period: str = "1y") -> pd.DataFrame:
    """日足のOHLCV DataFrameを返す(空ならQuoteError)。"""
    key = (ticker, period)
    cached = _history_cache.get(key)
    if cached and time.time() - cached[0] < HISTORY_TTL_SEC:
        return cached[1]

    import yfinance as yf

    try:
        df = yf.Ticker(ticker).history(period=period, interval="1d", auto_adjust=False)
    except Exception as exc:
        raise QuoteError(
            f"「{ticker}」の履歴取得に失敗しました(ネットワークまたはYahoo Finance側の問題)。"
            f"詳細: {exc}"
        ) from exc
    if df is None or df.empty:
        raise QuoteError(
            f"「{ticker}」の日足データがありません。休場のみの期間か、ティッカーが誤っている"
            "可能性があります。"
        )
    df = df.tz_localize(None) if df.index.tz is not None else df
    _history_cache[key] = (time.time(), df)
    return df


def clear_history_cache() -> None:
    _history_cache.clear()
