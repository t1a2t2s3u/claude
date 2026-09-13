"""設定ページ: 手数料率・為替スプレッド・単元未満株の可否。"""

from __future__ import annotations

import streamlit as st

from sim.db import get_setting, get_setting_float, set_setting


def render(conn, pf) -> None:
    st.subheader("⚙️ 設定")
    st.caption("手数料・為替スプレッドの設定は全ポートフォリオ共通で、以後の約定に適用されます。")

    with st.form("settings_form"):
        jp_fee = st.number_input(
            "日本株 手数料率(%)",
            min_value=0.0,
            value=get_setting_float(conn, "jp_fee_rate") * 100,
            step=0.01,
            format="%.3f",
            help="約定代金に対する率。上限はありません(既定 0.1%)。",
        )
        us_fee = st.number_input(
            "米国株 手数料率(%)",
            min_value=0.0,
            value=get_setting_float(conn, "us_fee_rate") * 100,
            step=0.01,
            format="%.3f",
            help="約定代金(円換算)に対する率(既定 0.45%)。",
        )
        spread = st.number_input(
            "為替スプレッド(銭/ドル・片道)",
            min_value=0.0,
            value=get_setting_float(conn, "fx_spread") * 100,
            step=1.0,
            help="米国株の円換算時に仲値へ加減します(既定 25銭)。",
        )
        odd_lot = st.toggle(
            "日本株の単元未満株取引(1株単位)を許可する",
            value=get_setting(conn, "allow_odd_lot_jp") == "1",
            help="OFFの場合、日本株は100株単位でのみ発注できます。",
        )
        saved = st.form_submit_button("保存", type="primary")

    if saved:
        set_setting(conn, "jp_fee_rate", str(jp_fee / 100))
        set_setting(conn, "us_fee_rate", str(us_fee / 100))
        set_setting(conn, "fx_spread", str(spread / 100))
        set_setting(conn, "allow_odd_lot_jp", "1" if odd_lot else "0")
        st.success("設定を保存しました。以後の約定に適用されます。")

    st.divider()
    st.markdown(
        """
##### 税金の扱い
売却のたびに **暦年内の通算実現損益 × 20.315%** と源泉徴収済み額の差分を
徴収・還付します(源泉徴収あり特定口座の近似)。年をまたぐ損失繰越には対応していません。
"""
    )
