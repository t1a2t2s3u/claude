"""AI売買判断モードの入出力。

- export_state: 現在のポートフォリオ状況・市況を ai_input/YYYYMMDD_HHMM.md に書き出す。
  このファイルをClaude Code等に読ませ、売買指示JSONを作らせる想定。
- parse_orders: ai_orders/*.json(またはアップロードされたJSON)を検証して注文リストにする。
  形式: [{"ticker": "7203.T", "side": "buy", "qty": 100, "reason": "..."}, ...]
  もしくは {"orders": [...]}。
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
AI_INPUT_DIR = BASE_DIR / "ai_input"
AI_ORDERS_DIR = BASE_DIR / "ai_orders"

ORDER_SCHEMA_EXAMPLE = """[
  {"ticker": "7203.T", "side": "buy", "qty": 100, "reason": "自動車セクターの出遅れを拾う"},
  {"ticker": "AAPL", "side": "sell", "qty": 5, "reason": "利益確定"}
]"""


class OrderParseError(Exception):
    """注文JSONが不正なときの、ユーザー向け日本語メッセージを持つ例外。"""


def export_state(
    pf,
    cash: float,
    total: float,
    position_rows: list[dict],
    recent_trades: list,
    index_summary: list[str],
    usdjpy: float | None,
    settings_note: str,
) -> tuple[Path, str]:
    """ポートフォリオ状況をMarkdownにまとめて ai_input/ に保存する。"""
    now = datetime.now()
    AI_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = AI_INPUT_DIR / f"{now:%Y%m%d_%H%M}.md"

    lines = [
        f"# ポートフォリオ状況レポート({now:%Y-%m-%d %H:%M})",
        "",
        "あなたは株式投資のアドバイザーです。以下の状況を踏まえ、売買指示をJSONで返してください。",
        "",
        f"## ポートフォリオ「{pf['name']}」",
        f"- 総資産: ¥{total:,.0f}(初期資金 ¥{pf['initial_cash']:,.0f})",
        f"- 現金: ¥{cash:,.0f}",
    ]
    if usdjpy:
        lines.append(f"- USD/JPY(仲値): {usdjpy:.2f}円")
    lines += ["", "## 保有銘柄"]
    if position_rows:
        lines.append("| ティッカー | 銘柄名 | 数量 | 取得単価(円) | 現在評価額(円) | 評価損益(円) |")
        lines.append("|---|---|---|---|---|---|")
        for r in position_rows:
            lines.append(
                f"| {r['ティッカー']} | {r['銘柄名']} | {r['数量']:g} | "
                f"{r['取得単価(円)']:,.0f} | {r['評価額(円)']:,.0f} | {r['評価損益(円)']:+,.0f} |"
            )
    else:
        lines.append("(保有なし)")

    lines += ["", "## 直近の取引(新しい順・最大10件)"]
    if recent_trades:
        for t in recent_trades[:10]:
            side = "買" if t["side"] == "buy" else "売"
            lines.append(
                f"- {t['ts']} {side} {t['ticker']} ×{t['qty']:g} @{t['price_ccy']:,.2f}"
                f" {t['currency']}({t['tag']}){' — ' + t['reason'] if t['reason'] else ''}"
            )
    else:
        lines.append("(取引なし)")

    lines += ["", "## 市況(指数の直近推移)"]
    lines += [f"- {s}" for s in index_summary] if index_summary else ["(取得できませんでした)"]

    lines += [
        "",
        "## 取引ルール",
        settings_note,
        "- 現物のみ(空売り・信用不可)。買いは現金の範囲内、売りは保有数の範囲内。",
        "- 約定はインポート時点の最新価格(15〜20分遅延)。",
        "",
        "## 出力形式(このJSONだけを ai_orders/ に保存すること)",
        "```json",
        ORDER_SCHEMA_EXAMPLE,
        "```",
        '- side は "buy" / "sell"、qty は株数(整数)。理由は reason に日本語で。',
        "- 取引しない判断も有効。その場合は空配列 [] を返すこと。",
    ]
    text = "\n".join(lines)
    path.write_text(text, encoding="utf-8")
    return path, text


def list_order_files() -> list[Path]:
    AI_ORDERS_DIR.mkdir(parents=True, exist_ok=True)
    return sorted(AI_ORDERS_DIR.glob("*.json"), reverse=True)


def parse_orders(text: str) -> list[dict]:
    """注文JSONを検証して正規化する。問題があれば OrderParseError。"""
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise OrderParseError(f"JSONとして読み込めませんでした: {exc}") from exc
    if isinstance(data, dict) and "orders" in data:
        data = data["orders"]
    if not isinstance(data, list):
        raise OrderParseError('注文は配列(または {"orders": [...]})で指定してください。')

    orders = []
    for i, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            raise OrderParseError(f"{i}件目が注文オブジェクトではありません。")
        ticker = str(item.get("ticker", "")).strip().upper()
        side = str(item.get("side", "")).strip().lower()
        qty = item.get("qty")
        if not ticker:
            raise OrderParseError(f"{i}件目: ticker がありません。")
        if side not in ("buy", "sell"):
            raise OrderParseError(f'{i}件目({ticker}): side は "buy" か "sell" にしてください。')
        try:
            qty = float(qty)
        except (TypeError, ValueError):
            raise OrderParseError(f"{i}件目({ticker}): qty が数値ではありません。")
        if qty <= 0 or qty != int(qty):
            raise OrderParseError(f"{i}件目({ticker}): qty は1以上の整数にしてください。")
        orders.append(
            {
                "ticker": ticker,
                "side": side,
                "qty": int(qty),
                "reason": str(item.get("reason", "")).strip(),
            }
        )
    return orders
