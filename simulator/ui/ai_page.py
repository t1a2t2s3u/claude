"""AI連携ページ: 状況の書き出しと、売買指示JSONの一括発注。"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from sim import ai_bridge
from sim.ai_bridge import OrderParseError
from sim.db import get_setting, get_setting_float
from sim.metrics import BENCHMARKS
from sim.portfolio import TradeError, execute_trade, get_trades, value_positions
from sim.quotes import QuoteError, get_history, get_quote
from ui.common import current_usdjpy, resolve_name


def _index_summary() -> list[str]:
    lines = []
    for label, ticker in BENCHMARKS.items():
        try:
            hist = get_history(ticker, period="3mo")["Close"].dropna()
            if len(hist) < 22:
                continue
            last = hist.iloc[-1]
            w1 = (last / hist.iloc[-6] - 1) * 100 if len(hist) >= 6 else None
            m1 = (last / hist.iloc[-22] - 1) * 100
            lines.append(
                f"{label}: {last:,.1f}(1週間 {w1:+.1f}% / 1か月 {m1:+.1f}%)"
                if w1 is not None
                else f"{label}: {last:,.1f}(1か月 {m1:+.1f}%)"
            )
        except QuoteError:
            continue
    return lines


def _settings_note(conn) -> str:
    odd = get_setting(conn, "allow_odd_lot_jp") == "1"
    return (
        f"- 日本株は{'1株単位(単元未満株ON)' if odd else '100株単位(単元株)'}、"
        f"米国株は1株単位。手数料: 日本株 {get_setting_float(conn, 'jp_fee_rate') * 100:.2f}% / "
        f"米国株 {get_setting_float(conn, 'us_fee_rate') * 100:.2f}%、"
        f"為替スプレッド 片道{get_setting_float(conn, 'fx_spread') * 100:.0f}銭。"
    )


def render(conn, pf) -> None:
    st.subheader("🤖 AI連携(Claude売買判断)")
    st.markdown(
        "1. **書き出し** — 現在の状況を `ai_input/` にMarkdownで保存\n"
        "2. それをClaude Codeに読ませ、売買指示JSONを `ai_orders/` に保存させる\n"
        "3. **取込** — JSONを読み込んで一括発注(タグ「AI」で記録)"
    )

    # ── 1. 書き出し ──────────────────────────────────────
    st.markdown("##### ① 状況の書き出し")
    if st.button("📤 Claudeに判断させる(状況を書き出す)", type="primary"):
        usdjpy = current_usdjpy(conn)
        rows, positions_value, warnings = value_positions(
            conn, pf["id"], lambda t: get_quote(conn, t), usdjpy
        )
        for w in warnings:
            st.warning(w)
        total = pf["cash"] + positions_value
        with st.spinner("指数データを取得中…"):
            index_summary = _index_summary()
        path, text = ai_bridge.export_state(
            pf, pf["cash"], total, rows, get_trades(conn, pf["id"]),
            index_summary, usdjpy, _settings_note(conn),
        )
        st.success(f"書き出しました: `{path}`")
        st.download_button("⬇️ このファイルをダウンロード", text,
                           file_name=path.name, mime="text/markdown")
        with st.expander("内容を確認", expanded=False):
            st.code(text, language="markdown")
        st.caption(
            f"Claude Codeへの指示例: 「{path} を読んで、売買指示を "
            f"{ai_bridge.AI_ORDERS_DIR}/orders.json に保存して」"
        )

    st.divider()

    # ── 2. 取込・一括発注 ─────────────────────────────────
    st.markdown("##### ② 売買指示JSONの取込")
    files = ai_bridge.list_order_files()
    source = None
    col1, col2 = st.columns(2)
    with col1:
        selected = st.selectbox(
            "ai_orders/ のファイル",
            ["(選択してください)"] + [f.name for f in files],
        )
        if selected != "(選択してください)":
            source = next(f for f in files if f.name == selected).read_text(encoding="utf-8")
    with col2:
        uploaded = st.file_uploader("またはJSONをアップロード", type=["json"])
        if uploaded:
            source = uploaded.getvalue().decode("utf-8")

    if not source:
        st.caption(f"注文JSONの置き場所: `{ai_bridge.AI_ORDERS_DIR}`")
        return

    try:
        orders = ai_bridge.parse_orders(source)
    except OrderParseError as exc:
        st.error(str(exc))
        return

    if not orders:
        st.info("注文は空でした(「取引しない」という判断です)。")
        return

    st.dataframe(
        pd.DataFrame(orders).rename(
            columns={"ticker": "ティッカー", "side": "売買", "qty": "数量", "reason": "理由"}
        ),
        use_container_width=True,
        hide_index=True,
    )

    if not st.button(f"🚀 この{len(orders)}件を一括発注する(タグ: AI)", type="primary"):
        return

    usdjpy = current_usdjpy(conn)
    results = []
    for order in orders:
        try:
            quote = get_quote(conn, order["ticker"])
            if quote.currency != "JPY" and usdjpy is None:
                raise TradeError("USD/JPYレートを取得できません。")
            result = execute_trade(
                conn, pf["id"], order["ticker"], resolve_name(conn, order["ticker"]),
                order["side"], order["qty"], quote, usdjpy,
                reason=order["reason"], tag="AI",
            )
            results.append(("✅", order["ticker"], result.describe()))
        except (TradeError, QuoteError) as exc:
            results.append(("❌", order["ticker"], str(exc)))

    ok = sum(1 for r in results if r[0] == "✅")
    (st.success if ok == len(results) else st.warning)(
        f"{ok}/{len(results)}件を約定しました。"
    )
    for mark, ticker, message in results:
        st.write(f"{mark} **{ticker}** — {message}")
