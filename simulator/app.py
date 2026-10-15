"""株式投資シミュレータ(ペーパートレード)のエントリポイント。

起動: streamlit run app.py
スマホ前提のため、サイドバーは使わない(スマホでは開くボタンが見つけにくい)。
ページ切替は画面上部のピル型ボタン、ポートフォリオ作成は
「ようこそ」画面と設定ページに置く。
"""

from __future__ import annotations

import streamlit as st

from sim.db import restore_db_bytes
from sim.master import load_autodata_masters, master_counts
from sim.portfolio import list_portfolios
from ui import ai_page, ai_stats_page, dashboard, master_page, screener_page, settings_page, trade
from ui.common import get_conn, inject_style, portfolio_create_form

st.set_page_config(
    page_title="株式投資シミュレータ",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="collapsed",
)

conn = get_conn()
inject_style()

# GitHub Actionsが同梱した自動収集データがあれば、マスタ未取込時に自動で読み込む
# (サーバー再起動でDBが初期化されても、銘柄マスタは手動更新なしで復活する)
if not st.session_state.get("autodata_checked"):
    st.session_state["autodata_checked"] = True
    if not master_counts(conn):
        load_autodata_masters(conn)

PAGES = {
    "📊 ダッシュボード": dashboard.render,
    "💱 取引": trade.render,
    "🔍 銘柄検索・マスタ": master_page.render,
    "🔎 スクリーナー": screener_page.render,
    "🤖 AI連携": ai_page.render,
    "📈 AI成績": ai_stats_page.render,
    "⚙️ 設定": settings_page.render,
}

portfolios = list_portfolios(conn)

# ── 初期画面: ポートフォリオ作成 or バックアップ復元 ─────────

if not portfolios:
    st.title("📈 株式投資シミュレータ")
    st.caption("実在の株価(Yahoo Finance・15〜20分遅延)で練習する仮想売買。実際のお金は動きません。")

    st.markdown("##### ➕ ポートフォリオを作成して始める")
    portfolio_create_form(conn)

    st.divider()
    # 無料クラウドでは再起動でサーバー上のデータが消えることがあるため、
    # 初期画面からバックアップ復元できるようにしておく
    st.markdown("##### 💾 以前のデータがある場合(バックアップから復元)")
    st.caption(
        "サーバーの再起動でデータが初期化された場合は、設定ページで保存した"
        "バックアップ(.db)をここにアップロードすると全データが元に戻ります。"
    )
    backup = st.file_uploader("バックアップファイル(.db)", type=["db"], key="welcome_restore")
    if backup is not None and st.button("このバックアップで復元する", type="primary"):
        try:
            restore_db_bytes(backup.getvalue())
        except ValueError as exc:
            st.error(str(exc))
        else:
            st.cache_resource.clear()
            st.success("復元しました。再読み込みします…")
            st.rerun()
    st.stop()

# ── 本体 ──────────────────────────────────────────────────

names = [p["name"] for p in portfolios]
if len(names) > 1:
    selected_name = st.selectbox(
        "ポートフォリオ", names, key="pf_select", label_visibility="collapsed"
    )
else:
    selected_name = names[0]
pf = next(p for p in portfolios if p["name"] == selected_name)

# ページ切替(画面上部・タップしやすいピル型)
page = st.pills(
    "ページ",
    list(PAGES.keys()),
    default="📊 ダッシュボード",
    key="page_nav",
    label_visibility="collapsed",
)

PAGES[page or "📊 ダッシュボード"](conn, pf)
