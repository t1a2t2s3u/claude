"""AI成績ページ: AIタグ付き取引の勝率・損益・ドローダウン・指数比較。"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from sim import metrics
from sim.quotes import QuoteError


def render(conn, pf) -> None:
    st.subheader("📈 AI成績")
    stats = metrics.ai_stats(conn, pf["id"])

    if stats["trade_count"] == 0:
        st.info("AIタグ付きの取引がまだありません。AI連携ページから売買指示を取り込むと集計されます。")
        return

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("AI取引数", f"{stats['trade_count']}件",
              f"買い {stats['buy_count']} / 売り {stats['sell_count']}", delta_color="off")
    c2.metric(
        "勝率(売却ベース)",
        f"{stats['win_rate'] * 100:.0f}%" if stats["win_rate"] is not None else "—",
        f"{stats['win_count']}勝{stats['sell_count'] - stats['win_count']}敗"
        if stats["sell_count"] else "売却なし",
        delta_color="off",
    )
    c3.metric(
        "平均損益 / 売却",
        f"{stats['avg_realized']:+,.0f}円" if stats["avg_realized"] is not None else "—",
        f"合計(税引後) {stats['after_tax']:+,.0f}円",
        delta_color="off",
    )
    c4.metric("最大ドローダウン", f"−{stats['max_drawdown'] * 100:.1f}%",
              "ポートフォリオ全体の日次推移から算出", delta_color="off")

    # ── 指数比較(最初のAI取引日以降) ─────────────────────
    st.markdown("##### 指数との比較(最初のAI取引以降)")
    snaps = metrics.get_snapshots(conn, pf["id"])
    first_date = stats["first_trade_ts"][:10]
    snaps = [s for s in snaps if s["date"] >= first_date]
    if len(snaps) >= 2:
        try:
            df = metrics.benchmark_frame(snaps, snaps[0]["total_jpy"])
            import plotly.express as px

            fig = px.line(df, labels={"value": "評価額(円)", "date": "日付", "variable": ""})
            fig.update_layout(height=360, margin=dict(l=10, r=10, t=30, b=10))
            st.plotly_chart(fig, use_container_width=True)
        except QuoteError as exc:
            st.warning(f"指数データを取得できませんでした。{exc}")
    else:
        st.caption("スナップショットが2日分たまると比較グラフを表示します。")

    # ── AI取引一覧 ───────────────────────────────────────
    st.markdown("##### AI取引の一覧")
    df = pd.DataFrame([dict(t) for t in stats["trades"]])
    df = df[["ts", "ticker", "name", "side", "qty", "price_ccy", "currency",
             "realized_jpy", "tax_jpy", "reason"]]
    df.columns = ["日時", "ティッカー", "銘柄名", "売買", "数量", "約定価格", "通貨",
                  "実現損益(円)", "源泉徴収(円)", "理由"]
    df["売買"] = df["売買"].map({"buy": "買い", "sell": "売り"})
    st.dataframe(df.sort_values("日時", ascending=False),
                 use_container_width=True, hide_index=True)
