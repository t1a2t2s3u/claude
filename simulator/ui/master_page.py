"""銘柄検索・銘柄マスタ更新ページ。"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from sim.master import (
    MasterError,
    master_counts,
    search_stocks,
    update_jp_master,
    update_us_master,
)


def render(conn, pf) -> None:
    st.subheader("🔍 銘柄検索・マスタ")

    counts = master_counts(conn)
    jp = counts.get("JP")
    us = counts.get("US")
    c1, c2 = st.columns(2)
    c1.metric("日本株マスタ", f"{jp['count']:,}件" if jp else "未取込",
              f"更新: {jp['updated'][:16]}" if jp else None, delta_color="off")
    c2.metric("米国株マスタ", f"{us['count']:,}件" if us else "未取込",
              f"更新: {us['updated'][:16]}" if us else None, delta_color="off")
    if not jp and not us:
        st.info("最初に下の「銘柄マスタ更新」でマスタを取り込んでください(検索に必要です)。"
                "マスタが無くてもティッカー直接入力での取引は可能です。")

    # ── 検索 ─────────────────────────────────────────────
    st.markdown("##### 検索(銘柄名・ティッカー・コード)")
    col1, col2 = st.columns([3, 1])
    with col1:
        query = st.text_input("検索語", placeholder="例: トヨタ / 7203 / AAPL / apple",
                              label_visibility="collapsed")
    with col2:
        country = st.selectbox("市場", ["すべて", "日本株", "米国株"], label_visibility="collapsed")

    if query:
        results = search_stocks(
            conn, query, {"日本株": "JP", "米国株": "US"}.get(country), limit=50
        )
        if not results:
            st.warning("該当する銘柄が見つかりませんでした。マスタが未取込の場合は下から更新してください。")
        else:
            st.caption(f"{len(results)}件(最大50件)。「取引へ」でティッカーを取引ページに送ります。")
            for row in results[:20]:
                a, b, c, d = st.columns([2, 4, 2, 1])
                a.write(f"`{row['ticker']}`")
                b.write(row["name"])
                c.caption(row["market"])
                if d.button("取引へ", key=f"to_trade_{row['ticker']}"):
                    st.session_state["trade_ticker_input"] = row["ticker"]
                    st.session_state["page_nav"] = "💱 取引"
                    st.rerun()
            if len(results) > 20:
                df = pd.DataFrame([dict(r) for r in results[20:]])
                df = df[["ticker", "name", "market", "country"]]
                df.columns = ["ティッカー", "銘柄名", "市場", "国"]
                with st.expander(f"残り{len(results) - 20}件を表示"):
                    st.dataframe(df, use_container_width=True, hide_index=True)

    st.divider()

    # ── マスタ更新 ───────────────────────────────────────
    st.markdown("##### 銘柄マスタ更新")
    st.caption(
        "日本株はJPX「東証上場銘柄一覧」(data_j.xls)、米国株は nasdaqtrader.com の "
        "nasdaqlisted.txt / otherlisted.txt から取り込みます。"
    )
    b1, b2 = st.columns(2)
    if b1.button("🇯🇵 日本株マスタを更新", use_container_width=True):
        with st.spinner("JPXからダウンロード中…"):
            try:
                n = update_jp_master(conn)
                st.success(f"日本株マスタを更新しました({n:,}件)。")
            except MasterError as exc:
                st.error(str(exc))
    if b2.button("🇺🇸 米国株マスタを更新", use_container_width=True):
        with st.spinner("nasdaqtrader.comからダウンロード中…"):
            try:
                n = update_us_master(conn)
                st.success(f"米国株マスタを更新しました({n:,}件)。")
            except MasterError as exc:
                st.error(str(exc))

    with st.expander("📄 ダウンロードできない場合(ファイルから取込)"):
        st.caption(
            "プロキシ等でダウンロードに失敗する場合は、ブラウザで取得したファイルを"
            "ここにアップロードしてください。"
        )
        jp_file = st.file_uploader("data_j.xls(JPX)", type=["xls"])
        if jp_file and st.button("このファイルで日本株マスタを更新"):
            try:
                n = update_jp_master(conn, file_bytes=jp_file.getvalue())
                st.success(f"日本株マスタを更新しました({n:,}件)。")
            except MasterError as exc:
                st.error(str(exc))
        nasdaq_file = st.file_uploader("nasdaqlisted.txt", type=["txt"])
        other_file = st.file_uploader("otherlisted.txt", type=["txt"])
        if nasdaq_file and other_file and st.button("このファイルで米国株マスタを更新"):
            try:
                n = update_us_master(
                    conn,
                    nasdaq_bytes=nasdaq_file.getvalue(),
                    other_bytes=other_file.getvalue(),
                )
                st.success(f"米国株マスタを更新しました({n:,}件)。")
            except MasterError as exc:
                st.error(str(exc))
