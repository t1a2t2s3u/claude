"""ポートフォリオ管理と売買の約定処理。

- 現物のみ(信用・空売りなし)。買いは現金の範囲内、売りは保有数の範囲内。
- 単元株: 日本株100株単位(設定で単元未満=1株単位を許可)、米国株1株単位。
- 手数料: 約定代金 × 設定率。取得単価は手数料込みで計算する。
- 為替: 米国株はUSD/JPY仲値±スプレッド(買い=+、売り=−)で円換算し、レートを記録。
- 税: 「源泉徴収あり特定口座」を再現。売却のたびに、暦年内の通算実現損益に対する
  20.315%と源泉徴収済み額の差分を徴収(利益)または還付(損失)する。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .db import TAX_RATE, get_setting, get_setting_float
from .quotes import Quote


class TradeError(Exception):
    """発注できないときの、ユーザー向け日本語メッセージを持つ例外。"""


# ── ポートフォリオCRUD ──────────────────────────────────────

def create_portfolio(conn, name: str, initial_cash: float) -> int:
    name = name.strip()
    if not name:
        raise TradeError("ポートフォリオ名を入力してください。")
    if initial_cash < 10_000 or initial_cash > 1_000_000:
        raise TradeError("初期資金は1万円〜100万円の範囲で指定してください。")
    if conn.execute("SELECT 1 FROM portfolios WHERE name = ?", (name,)).fetchone():
        raise TradeError(f"ポートフォリオ「{name}」は既に存在します。")
    cur = conn.execute(
        "INSERT INTO portfolios(name, initial_cash, cash, created_at) VALUES(?, ?, ?, ?)",
        (name, initial_cash, initial_cash, datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    return cur.lastrowid


def list_portfolios(conn) -> list:
    return conn.execute("SELECT * FROM portfolios ORDER BY id").fetchall()


def get_portfolio(conn, portfolio_id: int):
    return conn.execute("SELECT * FROM portfolios WHERE id = ?", (portfolio_id,)).fetchone()


def get_positions(conn, portfolio_id: int) -> list:
    return conn.execute(
        "SELECT * FROM positions WHERE portfolio_id = ? ORDER BY ticker", (portfolio_id,)
    ).fetchall()


def get_trades(conn, portfolio_id: int, tag: str | None = None) -> list:
    if tag:
        return conn.execute(
            "SELECT * FROM trades WHERE portfolio_id = ? AND tag = ? ORDER BY ts DESC, id DESC",
            (portfolio_id, tag),
        ).fetchall()
    return conn.execute(
        "SELECT * FROM trades WHERE portfolio_id = ? ORDER BY ts DESC, id DESC", (portfolio_id,)
    ).fetchall()


# ── 約定 ─────────────────────────────────────────────────

@dataclass
class TradeResult:
    side: str
    ticker: str
    name: str
    qty: float
    price_ccy: float
    currency: str
    fx_rate: float
    price_jpy: float
    fee_jpy: float
    amount_jpy: float
    realized_jpy: float | None
    tax_jpy: float | None

    def describe(self) -> str:
        side = "買い" if self.side == "buy" else "売り"
        text = (
            f"{self.name}({self.ticker}) {self.qty:g}株を"
            f" {self.price_ccy:,.2f} {self.currency} で{side}約定。"
        )
        if self.currency != "JPY":
            text += f" 適用レート {self.fx_rate:.2f}円/ドル。"
        text += f" 手数料 ¥{self.fee_jpy:,.0f}。"
        if self.side == "sell":
            text += f" 実現損益 {self.realized_jpy:+,.0f}円(源泉徴収 {self.tax_jpy:+,.0f}円)。"
        return text


def _validate_qty(conn, ticker: str, qty: float) -> None:
    if qty <= 0 or qty != int(qty):
        raise TradeError("数量は1以上の整数で指定してください。")
    if ticker.endswith(".T"):
        allow_odd = get_setting(conn, "allow_odd_lot_jp") == "1"
        if not allow_odd and int(qty) % 100 != 0:
            raise TradeError(
                "日本株は100株単位(単元株)です。1株単位で取引したい場合は"
                "設定ページで「単元未満株取引」をONにしてください。"
            )


def _ytd_tax_delta(conn, portfolio_id: int, realized: float, now: datetime) -> float:
    """この売りを含む暦年内の通算実現損益に対して、追加で徴収(+)/還付(−)すべき税額。"""
    year_start = f"{now.year}-01-01"
    row = conn.execute(
        "SELECT COALESCE(SUM(realized_jpy), 0) AS realized, COALESCE(SUM(tax_jpy), 0) AS tax "
        "FROM trades WHERE portfolio_id = ? AND side = 'sell' AND ts >= ?",
        (portfolio_id, year_start),
    ).fetchone()
    ytd_realized = row["realized"] + realized
    ytd_tax_due = max(0.0, ytd_realized) * TAX_RATE
    return round(ytd_tax_due - row["tax"], 4)


def execute_trade(
    conn,
    portfolio_id: int,
    ticker: str,
    stock_name: str,
    side: str,
    qty: float,
    quote: Quote,
    usdjpy_mid: float | None,
    reason: str = "",
    tag: str = "manual",
    now: datetime | None = None,
) -> TradeResult:
    """取得済みの現在値(quote)で約定させ、DBを更新する。

    usdjpy_mid は米国株のときだけ必要(JPY銘柄では無視)。
    """
    now = now or datetime.now()
    pf = get_portfolio(conn, portfolio_id)
    if pf is None:
        raise TradeError("ポートフォリオが見つかりません。")
    if side not in ("buy", "sell"):
        raise TradeError(f"不正な売買区分です: {side}")
    _validate_qty(conn, ticker, qty)
    qty = float(int(qty))

    currency = quote.currency
    if currency == "JPY":
        fx_rate = 1.0
        fee_rate = get_setting_float(conn, "jp_fee_rate")
    else:
        if usdjpy_mid is None:
            raise TradeError("為替レートを取得できていないため、米国株を約定できません。")
        spread = get_setting_float(conn, "fx_spread")
        fx_rate = usdjpy_mid + spread if side == "buy" else usdjpy_mid - spread
        fee_rate = get_setting_float(conn, "us_fee_rate")

    price_jpy = quote.price * fx_rate
    notional = price_jpy * qty
    fee = round(notional * fee_rate, 4)

    pos = conn.execute(
        "SELECT * FROM positions WHERE portfolio_id = ? AND ticker = ?",
        (portfolio_id, ticker),
    ).fetchone()

    realized = None
    tax = None
    if side == "buy":
        amount = notional + fee  # 支払額
        if amount > pf["cash"] + 1e-6:
            raise TradeError(
                f"現金が不足しています(必要 ¥{amount:,.0f} / 残高 ¥{pf['cash']:,.0f})。"
            )
        new_qty = (pos["qty"] if pos else 0.0) + qty
        prev_cost = (pos["qty"] * pos["avg_cost_jpy"]) if pos else 0.0
        avg_cost = (prev_cost + amount) / new_qty
        conn.execute(
            "INSERT INTO positions(portfolio_id, ticker, name, currency, qty, avg_cost_jpy) "
            "VALUES(?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(portfolio_id, ticker) DO UPDATE SET "
            "qty = excluded.qty, avg_cost_jpy = excluded.avg_cost_jpy, name = excluded.name",
            (portfolio_id, ticker, stock_name, currency, new_qty, avg_cost),
        )
        conn.execute(
            "UPDATE portfolios SET cash = cash - ? WHERE id = ?", (amount, portfolio_id)
        )
    else:
        if pos is None or pos["qty"] < qty:
            held = pos["qty"] if pos else 0
            raise TradeError(f"保有数が不足しています(売却 {qty:g} / 保有 {held:g})。")
        amount = notional - fee  # 受取額
        realized = round(amount - pos["avg_cost_jpy"] * qty, 4)
        tax = _ytd_tax_delta(conn, portfolio_id, realized, now)
        remaining = pos["qty"] - qty
        if remaining < 1e-9:
            conn.execute(
                "DELETE FROM positions WHERE portfolio_id = ? AND ticker = ?",
                (portfolio_id, ticker),
            )
        else:
            conn.execute(
                "UPDATE positions SET qty = ? WHERE portfolio_id = ? AND ticker = ?",
                (remaining, portfolio_id, ticker),
            )
        conn.execute(
            "UPDATE portfolios SET cash = cash + ? - ? WHERE id = ?",
            (amount, tax, portfolio_id),
        )

    conn.execute(
        "INSERT INTO trades(portfolio_id, ts, ticker, name, side, qty, price_ccy, currency, "
        "fx_rate, price_jpy, fee_jpy, amount_jpy, realized_jpy, tax_jpy, reason, tag) "
        "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            portfolio_id,
            now.isoformat(timespec="seconds"),
            ticker,
            stock_name,
            side,
            qty,
            quote.price,
            currency,
            fx_rate,
            price_jpy,
            fee,
            amount,
            realized,
            tax,
            reason,
            tag,
        ),
    )
    conn.commit()
    return TradeResult(
        side, ticker, stock_name, qty, quote.price, currency, fx_rate, price_jpy,
        fee, amount, realized, tax,
    )


# ── 評価 ─────────────────────────────────────────────────

def value_positions(conn, portfolio_id: int, quote_fn, usdjpy_mid: float | None) -> tuple[list[dict], float, list[str]]:
    """保有銘柄を時価評価する。

    quote_fn(ticker) -> Quote。取得に失敗した銘柄は取得単価で代用し、警告一覧に載せる。
    戻り値: (行のリスト, 評価額合計(円), 警告メッセージのリスト)
    """
    rows = []
    warnings = []
    total = 0.0
    for pos in get_positions(conn, portfolio_id):
        price_jpy = None
        price_ccy = None
        try:
            quote = quote_fn(pos["ticker"])
            price_ccy = quote.price
            if quote.currency == "JPY":
                price_jpy = quote.price
            elif usdjpy_mid is not None:
                price_jpy = quote.price * usdjpy_mid
        except Exception as exc:
            warnings.append(f"{pos['ticker']}: {exc}")
        if price_jpy is None:
            price_jpy = pos["avg_cost_jpy"]
            warnings.append(f"{pos['ticker']}: 現在値が取れないため取得単価で評価しています。")
        value = price_jpy * pos["qty"]
        cost = pos["avg_cost_jpy"] * pos["qty"]
        rows.append(
            {
                "ティッカー": pos["ticker"],
                "銘柄名": pos["name"],
                "数量": pos["qty"],
                "通貨": pos["currency"],
                "現在値": price_ccy,
                "取得単価(円)": round(pos["avg_cost_jpy"], 2),
                "評価額(円)": round(value),
                "評価損益(円)": round(value - cost),
                "損益率": f"{((value / cost) - 1) * 100:+.1f}%" if cost else "—",
            }
        )
        total += value
    return rows, total, warnings


def realized_summary(conn, portfolio_id: int) -> dict:
    """実現損益(税引前/源泉徴収額/税引後)の合計。"""
    row = conn.execute(
        "SELECT COALESCE(SUM(realized_jpy), 0) AS realized, COALESCE(SUM(tax_jpy), 0) AS tax "
        "FROM trades WHERE portfolio_id = ? AND side = 'sell'",
        (portfolio_id,),
    ).fetchone()
    return {
        "realized": row["realized"],
        "tax": row["tax"],
        "after_tax": row["realized"] - row["tax"],
    }
