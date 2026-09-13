"""株式投資シミュレータ(ペーパートレード)のエントリポイント。

起動: streamlit run app.py
"""

from __future__ import annotations

import streamlit as st

from sim.portfolio import TradeError, create_portfolio, list_portfolios
from ui import ai_page, ai_stats_page, dashboard, master_page, settings_page, trade
from ui.common import get_conn, yen

st.set_page_config(page_title="株式投資シミュレータ", page_icon="📈", layout="wide")

conn = get_conn()

# ── サイドバー: ポートフォリオの選択・作成 ─────────────────────

PRESETS = {
    "1万円": 10_000,
    "5万円": 50_000,
    "10万円": 100_000,
    "30万円": 300_000,
    "50万円": 500_000,
    "100万円": 1_000_000,
    "自由入力": None,
}

with st.sidebar:
    st.title("📈 株式投資シミュレータ")
    st.caption("実在の株価で練習する仮想売買。実際のお金は動きません。")

    portfolios = list_portfolios(conn)
    if portfolios:
        names = [p["name"] for p in portfolios]
        selected_name = st.selectbox("ポートフォリオ", names, key="pf_select")
        pf = next(p for p in portfolios if p["name"] == selected_name)
        st.caption(f"初期資金 {yen(pf['initial_cash'])} / 現金 {yen(pf['cash'])}")
    else:
        pf = None
        st.info("まずポートフォリオを作成してください。")

    with st.expander("➕ 新しいポートフォリオ", expanded=pf is None):
        with st.form("create_pf"):
            new_name = st.text_input("名前", placeholder="例: Claude判断 / 自分の判断")
            preset = st.selectbox("初期資金", list(PRESETS.keys()), index=2)
            custom = st.number_input(
                "自由入力(円)", min_value=10_000, max_value=1_000_000,
                value=100_000, step=10_000,
                help="「自由入力」を選んだときに使われます(1万〜100万円)。",
            )
            if st.form_submit_button("作成", use_container_width=True):
                initial = PRESETS[preset] if PRESETS[preset] is not None else custom
                try:
                    create_portfolio(conn, new_name, initial)
                    st.success(f"「{new_name}」を作成しました。")
                    st.rerun()
                except TradeError as exc:
                    st.error(str(exc))

    st.divider()
    page = st.radio(
        "ページ",
        [
            "📊 ダッシュボード",
            "💱 取引",
            "🔍 銘柄検索・マスタ",
            "🤖 AI連携",
            "📈 AI成績",
            "⚙️ 設定",
        ],
        key="page_nav",
        label_visibility="collapsed",
    )

# ── 本体 ──────────────────────────────────────────────────

if pf is None:
    st.header("ようこそ")
    st.markdown(
        "左のサイドバーからポートフォリオを作成すると始められます。\n\n"
        "- 実在の株価(Yahoo Finance・15〜20分遅延)で仮想売買します\n"
        "- 「自分の判断」「Claude判断」のように複数ポートフォリオを並走できます"
    )
else:
    PAGES = {
        "📊 ダッシュボード": dashboard.render,
        "💱 取引": trade.render,
        "🔍 銘柄検索・マスタ": master_page.render,
        "🤖 AI連携": ai_page.render,
        "📈 AI成績": ai_stats_page.render,
        "⚙️ 設定": settings_page.render,
    }
    PAGES[page](conn, pf)
