"""週次レポートの集計と Markdown 出力。

直近7日と、その前の7日を並べて比較する。単月の絶対値より「前週と比べて
どうか」のほうが、現場で打つ手 (投稿を増やす・写真を足す) の判断に直結する。
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import date, timedelta

from .. import metrics as m
from ..storage import (
    KeywordCount,
    daily_series,
    keywords_for_month,
    latest_keyword_month,
    metric_totals,
    used_sample_source,
)

WINDOW_DAYS = 7

# 反応率がこの割合以上落ちたら注意として書き出す。
_ALERT_DROP = 0.20

_SPARK_CHARS = "▁▂▃▄▅▆▇█"


@dataclass(frozen=True)
class Change:
    """今週と前週の対比。"""

    label: str
    current: int
    previous: int

    @property
    def delta(self) -> int:
        return self.current - self.previous

    @property
    def pct(self) -> float | None:
        """変化率。前週が 0 のときは比較不能として None を返す。"""
        if self.previous == 0:
            return None
        return (self.current - self.previous) / self.previous

    def format_pct(self) -> str:
        if self.pct is None:
            return "—" if self.current == 0 else "新規"
        return f"{self.pct * 100:+.1f}%"

    def format_delta(self) -> str:
        return f"{self.delta:+d}"


@dataclass
class WeeklyReport:
    business_name: str
    start: date
    end: date
    prev_start: date
    prev_end: date
    impressions: list[Change]
    actions: list[Change]
    total_impressions: Change
    total_actions: Change
    daily_totals: list[tuple[str, int]]
    keyword_month: str | None
    keywords: list[KeywordCount]
    is_sample: bool = False
    notes: list[str] = field(default_factory=list)

    @property
    def action_rate(self) -> float | None:
        return _rate(self.total_actions.current, self.total_impressions.current)

    @property
    def prev_action_rate(self) -> float | None:
        return _rate(self.total_actions.previous, self.total_impressions.previous)


def _rate(actions: int, impressions: int) -> float | None:
    return actions / impressions if impressions else None


def build(
    conn: sqlite3.Connection,
    location_id: str,
    business_name: str,
    end: date,
    *,
    is_sample: bool = False,
) -> WeeklyReport:
    """DB から週次レポートを組み立てる。``end`` は今週窓の最終日。

    ``is_sample`` は明示指定用。指定が無くても、対象期間にサンプル由来の
    取り込みが混ざっていれば自動でサンプル扱いにする。
    """
    start = end - timedelta(days=WINDOW_DAYS - 1)
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=WINDOW_DAYS - 1)

    current = metric_totals(conn, location_id, start, end)
    previous = metric_totals(conn, location_id, prev_start, prev_end)

    def changes(names: tuple[str, ...]) -> list[Change]:
        return [
            Change(m.label(name), current.get(name, 0), previous.get(name, 0))
            for name in names
        ]

    impressions = changes(m.IMPRESSION_METRICS)
    actions = changes(m.ACTION_METRICS)

    total_impressions = Change(
        "総表示回数",
        sum(current.get(n, 0) for n in m.IMPRESSION_METRICS),
        sum(previous.get(n, 0) for n in m.IMPRESSION_METRICS),
    )
    total_actions = Change(
        "総アクション数",
        sum(current.get(n, 0) for n in m.ACTION_METRICS),
        sum(previous.get(n, 0) for n in m.ACTION_METRICS),
    )

    series = daily_series(conn, location_id, start, end)
    daily_totals = [
        (day, sum(values.get(n, 0) for n in m.IMPRESSION_METRICS))
        for day, values in sorted(series.items())
    ]

    keyword_month = latest_keyword_month(conn, location_id)
    keywords = (
        keywords_for_month(conn, location_id, keyword_month) if keyword_month else []
    )

    report = WeeklyReport(
        business_name=business_name,
        start=start,
        end=end,
        prev_start=prev_start,
        prev_end=prev_end,
        impressions=impressions,
        actions=actions,
        total_impressions=total_impressions,
        total_actions=total_actions,
        daily_totals=daily_totals,
        keyword_month=keyword_month,
        keywords=keywords,
        is_sample=is_sample or used_sample_source(conn, location_id, prev_start, end),
    )
    report.notes = _observations(report)
    return report


def _observations(report: WeeklyReport) -> list[str]:
    """数字から機械的に読み取れることだけを書き出す。推測は入れない。"""
    notes: list[str] = []

    if report.total_impressions.current == 0:
        notes.append(
            "今週の表示回数が0件です。データ未取得か、拠点が一時休業・停止状態の"
            "可能性があります。まず取り込みが成功しているか確認してください。"
        )
        return notes

    impressions_pct = report.total_impressions.pct
    if impressions_pct is not None and impressions_pct <= -_ALERT_DROP:
        notes.append(
            f"総表示回数が前週比 {impressions_pct * 100:.1f}% と大きく落ちています。"
            "投稿の停止、写真の削除、競合の新規出店などを確認してください。"
        )

    rate, prev_rate = report.action_rate, report.prev_action_rate
    if rate is not None and prev_rate:
        if (prev_rate - rate) / prev_rate >= _ALERT_DROP:
            notes.append(
                f"反応率が {prev_rate * 100:.2f}% → {rate * 100:.2f}% に低下しています。"
                "見られてはいるが選ばれていない状態です。写真・営業時間・"
                "口コミ返信の鮮度を確認してください。"
            )

    calls = next((c for c in report.actions if c.label == "電話タップ"), None)
    if calls and calls.previous and calls.pct is not None and calls.pct <= -_ALERT_DROP:
        notes.append(
            f"電話タップが前週比 {calls.pct * 100:.1f}% です。"
            "問い合わせ件数に直結するため優先して確認してください。"
        )

    if not notes:
        notes.append("大きな異常値はありません。")
    return notes


def sparkline(values: list[int]) -> str:
    """日次推移を1行のテキストグラフにする。"""
    if not values:
        return ""
    low, high = min(values), max(values)
    if high == low:
        return _SPARK_CHARS[len(_SPARK_CHARS) // 2] * len(values)
    span = len(_SPARK_CHARS) - 1
    return "".join(
        _SPARK_CHARS[round((v - low) / (high - low) * span)] for v in values
    )


def _fmt_rate(rate: float | None) -> str:
    return f"{rate * 100:.2f}%" if rate is not None else "—"


def render_markdown(report: WeeklyReport) -> str:
    """レポートを Markdown にする。"""
    lines: list[str] = []
    add = lines.append

    add(f"# {report.business_name} MEO週次レポート")
    add("")
    add(f"- 対象期間: **{report.start} 〜 {report.end}**")
    add(f"- 比較対象: {report.prev_start} 〜 {report.prev_end}")
    add("")

    if report.is_sample:
        add("> ⚠️ **これはサンプルデータです。** Google ビジネスプロフィール API の")
        add("> 利用承認が下りるまでの動作確認用で、実際の数値ではありません。")
        add("")

    add("## サマリー")
    add("")
    add("| 指標 | 今週 | 前週 | 増減 | 変化率 |")
    add("|---|---:|---:|---:|---:|")
    for change in (report.total_impressions, report.total_actions):
        add(
            f"| **{change.label}** | {change.current:,} | {change.previous:,} "
            f"| {change.format_delta()} | {change.format_pct()} |"
        )
    add(
        f"| **反応率** | {_fmt_rate(report.action_rate)} "
        f"| {_fmt_rate(report.prev_action_rate)} | — | — |"
    )
    add("")
    add("反応率 = 総アクション数 ÷ 総表示回数。「見つけてもらえたうち、実際に")
    add("動いてもらえた割合」で、プロフィールの中身の良し悪しが出る。")
    add("")

    if report.daily_totals:
        values = [total for _, total in report.daily_totals]
        add("### 表示回数の日次推移")
        add("")
        add(f"```\n{sparkline(values)}  ({min(values):,} 〜 {max(values):,})\n```")
        add("")

    add("## 表示回数の内訳")
    add("")
    add(_metric_table(report.impressions))
    add("")

    add("## アクションの内訳")
    add("")
    add(_metric_table(report.actions))
    add("")

    if report.keywords:
        add(f"## 検索キーワード ({report.keyword_month})")
        add("")
        add("| 順位 | キーワード | 表示回数 |")
        add("|---:|---|---:|")
        for rank, keyword in enumerate(report.keywords, start=1):
            add(f"| {rank} | {keyword.keyword} | {keyword.display} |")
        add("")
        add("`<15` は Google が実数を公開していないキーワード。")
        add("")

    add("## 気づき")
    add("")
    for note in report.notes:
        add(f"- {note}")
    add("")

    return "\n".join(lines)


def _metric_table(changes: list[Change]) -> str:
    rows = ["| 指標 | 今週 | 前週 | 増減 | 変化率 |", "|---|---:|---:|---:|---:|"]
    for change in changes:
        rows.append(
            f"| {change.label} | {change.current:,} | {change.previous:,} "
            f"| {change.format_delta()} | {change.format_pct()} |"
        )
    return "\n".join(rows)
