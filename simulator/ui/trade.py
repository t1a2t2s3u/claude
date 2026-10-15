"""取引ページ: 銘柄を指定して現物の買い・売りを行う。"""

from __future__ import annotations

import streamlit as st

from sim.portfolio import TradeError, execute_trade, get_positions
from sim.quotes import QuoteError, get_history, get_quote
from ui.common import current_usdjpy, resolve_name, yen

# チャートの期間 → (yfinanceのperiod, interval)
CHART_RANGES = {
    "当日(5分足)": ("1d", "5m"),
    "5日(15分足)": ("5d", "15m"),
    "1か月(日足)": ("1mo", "1d"),
    "3か月(日足)": ("3mo", "1d"),
    "6か月(日足)": ("6mo", "1d"),
    "1年(日足)": ("1y", "1d"),
    "2年(日足)": ("2y", "1d"),
}


def render(conn, pf) -> None:
    st.subheader("💱 取引(現物)")
    st.caption(
        "約定価格は取得時点の最新価格(Yahoo Finance、15〜20分遅延)です。"
        "米国株は取得時点のUSD/JPYレート±スプレッドで円換算します。"
    )

    positions = get_positions(conn, pf["id"])
    st.session_state.setdefault("trade_ticker_input", "")

    with st.form("trade_form"):
        col1, col2, col3 = st.columns([2, 1, 1])
        with col1:
            ticker = st.text_input(
                "ティッカー(例: 7203.T / AAPL)", key="trade_ticker_input"
            ).strip().upper()
        with col2:
            side = st.radio("売買", ["買い", "売り"], horizontal=True)
        with col3:
            qty = st.number_input("数量(株)", min_value=1, value=100, step=1)
        reason = st.text_input("理由メモ(任意)", placeholder="例: 決算好調のため打診買い")
        submitted = st.form_submit_button("発注する", type="primary", use_container_width=True)

    if positions:
        st.caption("保有中: " + " / ".join(f"{p['ticker']}×{p['qty']:g}" for p in positions))

    # チャート(発注前の確認用)。分足+自動更新で「準リアルタイム」表示にも対応
    if ticker:
        with st.expander(f"📉 {ticker} のチャート", expanded=False):
            c1, c2 = st.columns([3, 1])
            with c1:
                range_label = st.select_slider(
                    "期間",
                    list(CHART_RANGES.keys()),
                    value="6か月(日足)",
                    key="chart_period",
                )
            with c2:
                st.write("")
                auto = st.toggle(
                    "自動更新",
                    key="chart_auto",
                    help="1分ごとにチャートを再取得します(データ自体は15〜20分遅延)。",
                )
            period, interval = CHART_RANGES[range_label]

            def draw_chart():
                try:
                    hist = get_history(ticker, period=period, interval=interval)
                except QuoteError as exc:
                    st.warning(str(exc))
                    return
                import plotly.graph_objects as go

                fig = go.Figure(
                    go.Candlestick(
                        x=hist.index,
                        open=hist["Open"],
                        high=hist["High"],
                        low=hist["Low"],
                        close=hist["Close"],
                        increasing_line_color="#e05f5f",
                        decreasing_line_color="#3987e5",
                    )
                )
                fig.update_layout(
                    height=380, margin=dict(l=10, r=10, t=10, b=10),
                    xaxis_rangeslider_visible=False,
                )
                if interval != "1d":
                    # 分足は取引時間外の空白を詰める
                    fig.update_xaxes(type="category", nticks=8)
                st.plotly_chart(fig, use_container_width=True)
                last = hist.index[-1]
                st.caption(
                    f"最終データ: {last:%m/%d %H:%M}(Yahoo Financeの無料データは"
                    "15〜20分遅延。真のリアルタイムではありません)"
                )

            if auto:
                st.fragment(draw_chart, run_every=60)()
            else:
                draw_chart()

    if not submitted:
        return
    if not ticker:
        st.error("ティッカーを入力してください。銘柄検索ページからコードを調べられます。")
        return

    try:
        quote = get_quote(conn, ticker)
    except QuoteError as exc:
        st.error(str(exc))
        return

    usdjpy = None
    if quote.currency != "JPY":
        usdjpy = current_usdjpy(conn)
        if usdjpy is None:
            st.error("USD/JPYレートを取得できないため、米国株の約定を中止しました。")
            return

    try:
        result = execute_trade(
            conn,
            pf["id"],
            ticker,
            resolve_name(conn, ticker),
            "buy" if side == "買い" else "sell",
            qty,
            quote,
            usdjpy,
            reason=reason,
            tag="manual",
        )
    except TradeError as exc:
        st.error(str(exc))
        return

    st.success(result.describe())
    st.caption(
        f"参照価格の取得時刻: {quote.fetched_at:%H:%M:%S}"
        + ("(キャッシュ利用)" if quote.is_cached else "")
    )
