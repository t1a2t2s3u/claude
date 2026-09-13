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
