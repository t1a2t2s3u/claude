"""UI共通ヘルパー(DB接続・銘柄名解決・書式)。"""

from __future__ import annotations

import streamlit as st

from sim import db
from sim.quotes import QuoteError, get_usdjpy


@st.cache_resource
def get_conn():
    conn = db.connect()
    db.init_db(conn)
    return conn


def inject_style() -> None:
    """スマホでの見やすさ重視のスタイル調整(1回だけ呼ぶ)。"""
    st.markdown(
        """
<style>
/* 余白を詰めて1画面の情報量を増やす */
.block-container { padding: 1.1rem 0.9rem 3rem; max-width: 1100px; }
/* 上部ツールバー(Share等)と右上メニューを隠してすっきりさせる */
[data-testid="stToolbar"], #MainMenu, footer { display: none !important; }
/* st.metricの数字が巨大になりすぎるのを抑える(スクリーナー等で使用) */
[data-testid="stMetricValue"] { font-size: 1.45rem; }
[data-testid="stMetricLabel"] { font-size: 0.78rem; }
/* 見出しの肥大化を抑える */
h3 { font-size: 1.15rem !important; padding-top: 0.3rem; }
h5 { font-size: 0.95rem !important; }
/* タップしやすいボタン */
.stButton button { min-height: 2.6rem; }
/* サマリーカード(2列グリッド。狭い画面でも2列を保つ) */
.mgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
         gap: 8px; margin-bottom: 0.6rem; }
.mcard { background: rgba(255,255,255,0.055); border: 1px solid rgba(255,255,255,0.13);
         border-radius: 10px; padding: 10px 12px; min-width: 0; }
.mcard .k { font-size: 0.68rem; color: #b9b2d8; letter-spacing: 0.06em; }
.mcard .v { font-size: 1.35rem; font-weight: 700; font-variant-numeric: tabular-nums;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mcard .s { font-size: 0.7rem; color: #b9b2d8; white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis; }
.mcard .v.up { color: #35b95f; }
.mcard .v.down { color: #e05f5f; }
</style>
""",
        unsafe_allow_html=True,
    )


def metric_grid(items: list[tuple]) -> None:
    """コンパクトなサマリーカードを並べる。items: (ラベル, 値, 補足, 'up'|'down'|'')"""
    cards = "".join(
        f'<div class="mcard"><div class="k">{label}</div>'
        f'<div class="v {cls}">{value}</div>'
        + (f'<div class="s">{sub}</div>' if sub else "")
        + "</div>"
        for label, value, sub, cls in items
    )
    st.markdown(f'<div class="mgrid">{cards}</div>', unsafe_allow_html=True)


def resolve_name(conn, ticker: str) -> str:
    row = conn.execute("SELECT name FROM stocks WHERE ticker = ?", (ticker,)).fetchone()
    return row["name"] if row else ticker


def current_usdjpy(conn) -> float | None:
    """USD/JPY仲値。取れないときはNone(呼び出し側で必要なら警告)。"""
    try:
        return get_usdjpy(conn)
    except QuoteError:
        return None


def yen(value: float) -> str:
    return f"¥{value:,.0f}"


def signed_yen(value: float) -> str:
    return f"{value:+,.0f}円"
