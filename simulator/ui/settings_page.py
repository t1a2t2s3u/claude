"""設定ページ: 手数料率・為替スプレッド・単元未満株の可否。"""

from __future__ import annotations

import streamlit as st

from datetime import date

from sim.db import dump_db_bytes, get_setting, get_setting_float, restore_db_bytes, set_setting


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
    st.markdown("##### 💾 データのバックアップ・復元")
    st.caption(
        "全データ(ポートフォリオ・取引履歴・スナップショット)を1ファイルで保存/復元します。"
        "無料クラウド(Streamlit Community Cloud等)で動かす場合はサーバー再起動でデータが"
        "消えることがあるため、取引後にバックアップをダウンロードしておいてください。"
    )
    st.download_button(
        "⬇️ バックアップをダウンロード",
        dump_db_bytes(conn),
        file_name=f"sim-backup-{date.today():%Y%m%d}.db",
        mime="application/octet-stream",
    )
    backup = st.file_uploader("バックアップから復元(.db)", type=["db"])
    if backup is not None:
        st.warning("復元すると現在のデータはバックアップの内容で上書きされます。")
        if st.button("このバックアップで復元する", type="primary"):
            try:
                restore_db_bytes(backup.getvalue())
            except ValueError as exc:
                st.error(str(exc))
            else:
                st.cache_resource.clear()  # 開いていたDB接続を作り直す
                st.success("復元しました。再読み込みします…")
                st.rerun()

    st.divider()
    st.markdown(
        """
##### 税金の扱い
売却のたびに **暦年内の通算実現損益 × 20.315%** と源泉徴収済み額の差分を
徴収・還付します(源泉徴収あり特定口座の近似)。年をまたぐ損失繰越には対応していません。
"""
    )
