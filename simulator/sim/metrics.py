"""スナップショット・資産推移・指数比較・AI成績の集計。"""

from __future__ import annotations

from datetime import date

import pandas as pd

from .quotes import get_history

# 比較対象の指数。eMAXIS Slim 全世界株式は投資信託でyfinanceに無いため、
# 同じMSCI ACWIに連動する東証ETF 2559.T(MAXIS全世界株式)を代理に使う
BENCHMARKS = {
    "日経平均": "^N225",
    "S&P500": "^GSPC",
    "全世界株式(2559.T代理)": "2559.T",
}


def ensure_today_snapshot(conn, portfolio_id: int, total: float, cash: float, positions_value: float) -> bool:
    """当日分のスナップショットが無ければ記録する。記録したらTrue。"""
    today = date.today().isoformat()
    exists = conn.execute(
        "SELECT 1 FROM snapshots WHERE portfolio_id = ? AND date = ?", (portfolio_id, today)
    ).fetchone()
    if exists:
        return False
    conn.execute(
        "INSERT INTO snapshots(portfolio_id, date, total_jpy, cash_jpy, positions_jpy) "
        "VALUES(?, ?, ?, ?, ?)",
        (portfolio_id, today, total, cash, positions_value),
    )
    conn.commit()
    return True


def get_snapshots(conn, portfolio_id: int) -> list:
    return conn.execute(
        "SELECT * FROM snapshots WHERE portfolio_id = ? ORDER BY date", (portfolio_id,)
    ).fetchall()


def _history_period(days: int) -> str:
    if days <= 85:
        return "3mo"
    if days <= 350:
        return "1y"
    if days <= 700:
        return "2y"
    return "5y"


def benchmark_frame(snaps: list, initial_cash: float) -> pd.DataFrame:
    """ポートフォリオの資産推移と、同額を各指数に投資した場合の推移を1つの表にする。

    指数は開始日の終値を基準に initial_cash を正規化する(S&P500は現地通貨ベースで、
    為替変動は考慮しない。目的はパフォーマンス形状の比較)。
    """
    df = pd.DataFrame([dict(s) for s in snaps])
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()
    out = pd.DataFrame({"ポートフォリオ": df["total_jpy"]})

    days = (df.index[-1] - df.index[0]).days + 30
    for label, ticker in BENCHMARKS.items():
        try:
            hist = get_history(ticker, period=_history_period(days))
        except Exception:
            continue  # 取れない指数はスキップ(呼び出し側でメッセージ済み)
        close = hist["Close"].dropna()
        close.index = pd.to_datetime(close.index.date)
        close = close[close.index >= df.index[0] - pd.Timedelta(days=10)]
        if close.empty:
            continue
        aligned = close.reindex(out.index.union(close.index)).ffill().reindex(out.index)
        aligned = aligned.dropna()
        if aligned.empty:
            continue
        out[label] = initial_cash * aligned / aligned.iloc[0]
    return out


def max_drawdown(values: pd.Series) -> float:
    """最大ドローダウン(0〜1の比率)。データ不足なら0。"""
    if values is None or len(values) < 2:
        return 0.0
    peak = values.cummax()
    dd = (peak - values) / peak
    return float(dd.max())


def ai_stats(conn, portfolio_id: int) -> dict:
    """AIタグ付き取引の成績サマリー。"""
    trades = conn.execute(
        "SELECT * FROM trades WHERE portfolio_id = ? AND tag = 'AI' ORDER BY ts", (portfolio_id,)
    ).fetchall()
    sells = [t for t in trades if t["side"] == "sell"]
    wins = [t for t in sells if (t["realized_jpy"] or 0) > 0]
    total_realized = sum(t["realized_jpy"] or 0 for t in sells)
    total_tax = sum(t["tax_jpy"] or 0 for t in sells)
    snaps = get_snapshots(conn, portfolio_id)
    series = pd.Series([s["total_jpy"] for s in snaps]) if snaps else pd.Series(dtype=float)
    return {
        "trade_count": len(trades),
        "buy_count": sum(1 for t in trades if t["side"] == "buy"),
        "sell_count": len(sells),
        "win_count": len(wins),
        "win_rate": (len(wins) / len(sells)) if sells else None,
        "avg_realized": (total_realized / len(sells)) if sells else None,
        "total_realized": total_realized,
        "total_tax": total_tax,
        "after_tax": total_realized - total_tax,
        "max_drawdown": max_drawdown(series),
        "first_trade_ts": trades[0]["ts"] if trades else None,
        "trades": trades,
    }
