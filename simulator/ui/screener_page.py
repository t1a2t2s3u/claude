"""スクリーナーページ: 「第二のキオクシア型」銘柄を全銘柄から探す。"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from sim import screener
from sim.ai_bridge import export_candidates
from sim.master import master_counts

COUNTRY_LABELS = {"日本株": "JP", "米国株": "US"}
MCAP_PRESETS = {
    "300億円以上": 3e10,
    "1,000億円以上": 1e11,
    "3,000億円以上": 3e11,
    "1兆円以上": 1e12,
    "指定なし": 0,
}


def _universe(conn, country: str, markets: list[str]) -> list:
    rows = conn.execute(
        "SELECT * FROM stocks WHERE country = ? ORDER BY ticker", (country,)
    ).fetchall()
    if markets:
        rows = [r for r in rows if any(m in r["market"] for m in markets)]
    return rows


def render(conn, pf) -> None:
    st.subheader("🔎 スクリーナー — 「第二のキオクシア」型")
    st.markdown(
        "キオクシア(285A)が急騰する**前**に持っていた特徴を点数化し、同じ\"型\"の銘柄を探します: "
        "**①大型なのに若い上場**(放置された大型IPO) × **②出遅れ・低評価**(低PBR/PER) × "
        "**③点火の兆し**(52週高値圏+出来高急増) × **④テーマ**(半導体・AI等)。"
    )
    st.warning(
        "これは「過去に急騰した銘柄と似た状態」を探すツールであり、将来の上昇を予測・保証する"
        "ものではありません。候補はAI分析や自分の調査の出発点として使ってください。",
        icon="⚠️",
    )

    counts = master_counts(conn)
    if not counts:
        st.error("銘柄マスタが未取込です。先に「🔍 銘柄検索・マスタ」ページで更新してください。")
        return

    # ── 対象の選択 ───────────────────────────────────────
    col1, col2 = st.columns([1, 2])
    with col1:
        country_label = st.selectbox("対象", list(COUNTRY_LABELS.keys()))
        country = COUNTRY_LABELS[country_label]
    with col2:
        markets = []
        if country == "JP":
            markets = st.multiselect(
                "市場区分(未選択=全部)", ["プライム", "スタンダード", "グロース"],
                default=["プライム"],
                help="キオクシア型(大型)を狙うならプライムだけで十分です。",
            )

    universe = _universe(conn, country, markets)
    pending = screener.pending_tickers(conn, [r["ticker"] for r in universe])
    done = len(universe) - len(pending)
    st.caption(f"対象 {len(universe):,}銘柄 / データ取得済み {done:,}銘柄(残り {len(pending):,})")

    # ── ① データ取得(スキャン) ──────────────────────────
    st.markdown("##### ① 財務データのスキャン")
    st.caption(
        "yfinanceから1銘柄ずつ取得するため時間がかかります(目安: 100銘柄で2〜5分)。"
        "取得結果は24時間キャッシュされ、途中で止めても「続きから」になります。"
    )
    c1, c2 = st.columns([1, 2])
    with c1:
        batch = st.select_slider("今回スキャンする件数", [25, 50, 100, 200, 400], value=100)
    with c2:
        st.write("")
        run = st.button(
            f"▶ スキャン開始(残り{len(pending):,}件のうち{min(batch, len(pending))}件)",
            type="primary",
            disabled=not pending,
        )
    if run and pending:
        targets = pending[:batch]
        bar = st.progress(0.0, text="取得中…")
        def update(i, total, ticker):
            bar.progress(i / total, text=f"取得中… {i}/{total} {ticker}")
        stats = screener.scan(conn, targets, progress_cb=update)
        bar.empty()
        st.success(f"{stats['ok']}件取得(失敗 {stats['error']}件)。失敗分は6時間後に再試行できます。")
        st.rerun()

    # ── ② ランキング ─────────────────────────────────────
    st.markdown("##### ② キオクシア型スコアランキング")
    with st.expander("重み・条件を調整する", expanded=False):
        w1, w2, w3, w4 = st.columns(4)
        weights = {
            "freshness": w1.slider("① 大型×若さ", 0, 50, screener.DEFAULT_WEIGHTS["freshness"]),
            "undervalue": w2.slider("② 低評価", 0, 50, screener.DEFAULT_WEIGHTS["undervalue"]),
            "momentum": w3.slider("③ 点火", 0, 50, screener.DEFAULT_WEIGHTS["momentum"]),
            "theme": w4.slider("④ テーマ", 0, 50, screener.DEFAULT_WEIGHTS["theme"]),
        }
        f1, f2 = st.columns(2)
        min_mcap = MCAP_PRESETS[f1.selectbox("最低時価総額", list(MCAP_PRESETS.keys()), index=1)]
        keywords = [
            k.strip() for k in f2.text_input(
                "テーマ追加キーワード(カンマ区切り・英語)",
                placeholder="例: defense, nuclear, robotics",
            ).split(",") if k.strip()
        ]
    results = screener.rank(conn, universe, weights, keywords, min_mcap)
    if not results:
        st.info("スコア計算できる銘柄がまだありません。①のスキャンを実行してください。")
        return

    top = results[:30]
    df = pd.DataFrame(
        [
            {
                "順位": i + 1,
                "ティッカー": r["ticker"],
                "銘柄名": r["name"],
                "スコア": r["score"],
                "大型×若さ": round(r["components"]["freshness"], 2),
                "低評価": round(r["components"]["undervalue"], 2),
                "点火": round(r["components"]["momentum"], 2),
                "テーマ": round(r["components"]["theme"], 2),
                "時価総額": f"{r['mcap_jpy'] / 1e8:,.0f}億円",
                "PBR": round(r["pbr"], 2) if r["pbr"] else None,
                "PER": round(r["per"], 1) if r["per"] else None,
                "上場年数": r["ipo_years"],
                "業種": r["industry"] or r["sector"],
            }
            for i, r in enumerate(top)
        ]
    )
    st.dataframe(df, use_container_width=True, hide_index=True, height=420)
    st.caption(
        f"スコア対象 {len(results):,}銘柄(データ取得済みのみ)。"
        "因子は0〜1(1が「キオクシア急騰前」に最も近い)。"
    )

    # ── ③ AI分析へ ───────────────────────────────────────
    st.markdown("##### ③ 上位候補をAI分析に渡す")
    n = st.number_input("書き出す件数", min_value=3, max_value=30, value=10)
    note = st.text_input("Claudeへの補足(任意)", placeholder="例: 予算3万円、1〜2銘柄に絞りたい")
    if st.button("📤 AI分析用に書き出す"):
        path, text = export_candidates(results[: int(n)], note)
        st.success(f"書き出しました: `{path}`")
        st.download_button("⬇️ ダウンロード", text, file_name=path.name, mime="text/markdown")
        with st.expander("内容を確認"):
            st.code(text, language="markdown")
        st.caption("この内容をClaudeに貼ると、各候補の分析と売買指示JSONが得られます。")
