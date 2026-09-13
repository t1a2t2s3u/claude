"""ダッシュボード: 総資産・損益・保有一覧・資産推移・指数比較。"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from sim import metrics
from sim.portfolio import get_trades, realized_summary, value_positions
from sim.quotes import QuoteError, get_quote
from ui.common import current_usdjpy, yen


def render(conn, pf) -> None:
    st.subheader(f"📊 ダッシュボード — {pf['name']}")

    usdjpy = current_usdjpy(conn)
    rows, positions_value, warnings = value_positions(
        conn, pf["id"], lambda t: get_quote(conn, t), usdjpy
    )
    total = pf["cash"] + positions_value
    unrealized = sum(r["評価損益(円)"] for r in rows)
    realized = realized_summary(conn, pf["id"])

    for w in warnings:
        st.warning(w)

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("総資産", yen(total), f"{total - pf['initial_cash']:+,.0f}円(初期資金比)")
    c2.metric("現金", yen(pf["cash"]))
    c3.metric("評価損益(含み)", f"{unrealized:+,.0f}円")
    c4.metric(
        "実現損益(税引後)",
        f"{realized['after_tax']:+,.0f}円",
        f"税引前 {realized['realized']:+,.0f}円 / 源泉徴収 {realized['tax']:,.0f}円",
        delta_color="off",
    )
    if usdjpy:
        st.caption(f"USD/JPY(仲値・参考): {usdjpy:.2f}円")

    # 当日スナップショットの自動記録
    saved = metrics.ensure_today_snapshot(conn, pf["id"], total, pf["cash"], positions_value)
    if saved:
        st.caption("本日の総資産スナップショットを記録しました。")

    st.markdown("##### 保有銘柄")
    if rows:
        st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
    else:
        st.info("保有銘柄はありません。取引ページから発注してください。")

    # 資産推移+指数比較
    st.markdown("##### 資産推移と指数比較")
    snaps = metrics.get_snapshots(conn, pf["id"])
    if len(snaps) >= 2:
        try:
            chart_df = metrics.benchmark_frame(snaps, pf["initial_cash"])
            import plotly.express as px

            fig = px.line(
                chart_df,
                labels={"value": "評価額(円)", "date": "日付", "variable": ""},
            )
            fig.update_layout(height=380, margin=dict(l=10, r=10, t=30, b=10))
            st.plotly_chart(fig, use_container_width=True)
            st.caption(
                "指数比較: 同額を各指数(日経平均 / S&P500 / 全世界株式=2559.T を代理)に"
                "開始日に投資した場合の推移。"
            )
        except QuoteError as exc:
            st.warning(f"指数データを取得できないため、資産推移のみ表示します。{exc}")
            df = pd.DataFrame(snaps, columns=snaps[0].keys()).set_index("date")
            st.line_chart(df["total_jpy"])
    else:
        st.info("スナップショットが2日分たまるとグラフを表示します(毎日起動すると記録されます)。")

    st.markdown("##### 直近の取引")
    trades = get_trades(conn, pf["id"])[:20]
    if trades:
        df = pd.DataFrame([dict(t) for t in trades])
        df = df[["ts", "ticker", "name", "side", "qty", "price_ccy", "currency",
                 "fx_rate", "fee_jpy", "realized_jpy", "reason", "tag"]]
        df.columns = ["日時", "ティッカー", "銘柄名", "売買", "数量", "約定価格", "通貨",
                      "適用レート", "手数料(円)", "実現損益(円)", "理由", "タグ"]
        df["売買"] = df["売買"].map({"buy": "買い", "sell": "売り"})
        df["実現損益(円)"] = df["実現損益(円)"].map(
            lambda v: "" if v is None else f"{v:+,.0f}"
        )
        st.dataframe(df, use_container_width=True, hide_index=True)
    else:
        st.caption("まだ取引はありません。")
