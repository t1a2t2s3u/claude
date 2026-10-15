"""売買ロジックのユニットテスト(ネットワーク不要)。

実行: cd simulator && python -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sim import db
from sim.portfolio import (
    TradeError,
    create_portfolio,
    execute_trade,
    get_positions,
    realized_summary,
    value_positions,
)
from sim.quotes import Quote


def make_quote(ticker: str, price: float, currency: str) -> Quote:
    return Quote(ticker, price, currency, datetime.now())


class PortfolioTest(unittest.TestCase):
    def setUp(self):
        self.conn = db.connect(":memory:")
        db.init_db(self.conn)
        self.pid = create_portfolio(self.conn, "テスト", 1_000_000)

    def cash(self) -> float:
        return self.conn.execute(
            "SELECT cash FROM portfolios WHERE id = ?", (self.pid,)
        ).fetchone()["cash"]

    def test_初期資金の範囲チェック(self):
        with self.assertRaises(TradeError):
            create_portfolio(self.conn, "小さすぎ", 9_999)
        with self.assertRaises(TradeError):
            create_portfolio(self.conn, "大きすぎ", 1_000_001)
        with self.assertRaises(TradeError):
            create_portfolio(self.conn, "テスト", 100_000)  # 名前重複

    def test_日本株は単元株100株単位(self):
        quote = make_quote("7203.T", 2900, "JPY")
        with self.assertRaises(TradeError):
            execute_trade(self.conn, self.pid, "7203.T", "トヨタ", "buy", 30, quote, None)
        # 設定で単元未満を許可すれば1株から買える
        db.set_setting(self.conn, "allow_odd_lot_jp", "1")
        result = execute_trade(self.conn, self.pid, "7203.T", "トヨタ", "buy", 30, quote, None)
        self.assertEqual(result.qty, 30)

    def test_買いの会計_手数料込み取得単価(self):
        quote = make_quote("7203.T", 2000, "JPY")
        result = execute_trade(self.conn, self.pid, "7203.T", "トヨタ", "buy", 100, quote, None)
        # 手数料 = 20万円 × 0.1% = 200円
        self.assertAlmostEqual(result.fee_jpy, 200)
        self.assertAlmostEqual(self.cash(), 1_000_000 - 200_200)
        pos = get_positions(self.conn, self.pid)[0]
        self.assertAlmostEqual(pos["avg_cost_jpy"], 200_200 / 100)

    def test_現金不足の買いは拒否(self):
        quote = make_quote("7203.T", 20000, "JPY")
        with self.assertRaises(TradeError):
            execute_trade(self.conn, self.pid, "7203.T", "トヨタ", "buy", 100, quote, None)
        self.assertAlmostEqual(self.cash(), 1_000_000)  # 状態は変わらない

    def test_売りの実現損益と源泉徴収(self):
        buy = make_quote("7203.T", 2000, "JPY")
        execute_trade(self.conn, self.pid, "7203.T", "トヨタ", "buy", 100, buy, None)
        sell = make_quote("7203.T", 2200, "JPY")
        result = execute_trade(self.conn, self.pid, "7203.T", "トヨタ", "sell", 100, sell, None)
        # 受取 = 22万 − 手数料220 = 219,780 / 原価 = 200,200 → 実現 +19,580
        self.assertAlmostEqual(result.realized_jpy, 19_580)
        self.assertAlmostEqual(result.tax_jpy, 19_580 * db.TAX_RATE, places=2)
        summary = realized_summary(self.conn, self.pid)
        self.assertAlmostEqual(summary["after_tax"], 19_580 * (1 - db.TAX_RATE), places=2)
        self.assertEqual(get_positions(self.conn, self.pid), [])

    def test_損失売却で年内の源泉徴収が還付される(self):
        buy = make_quote("7203.T", 2000, "JPY")
        execute_trade(self.conn, self.pid, "7203.T", "トヨタ", "buy", 200, buy, None)
        # 100株を利益確定 → 源泉徴収される
        win = execute_trade(
            self.conn, self.pid, "7203.T", "トヨタ", "sell", 100,
            make_quote("7203.T", 2200, "JPY"), None,
        )
        self.assertGreater(win.tax_jpy, 0)
        # 残り100株を大きな損失で売却 → 年内通算がマイナスになり全額還付
        lose = execute_trade(
            self.conn, self.pid, "7203.T", "トヨタ", "sell", 100,
            make_quote("7203.T", 1500, "JPY"), None,
        )
        self.assertLess(lose.realized_jpy, 0)
        self.assertAlmostEqual(lose.tax_jpy, -win.tax_jpy, places=2)
        summary = realized_summary(self.conn, self.pid)
        self.assertAlmostEqual(summary["tax"], 0, places=2)

    def test_保有超過の売りは拒否(self):
        with self.assertRaises(TradeError):
            execute_trade(
                self.conn, self.pid, "7203.T", "トヨタ", "sell", 100,
                make_quote("7203.T", 2000, "JPY"), None,
            )

    def test_米国株は為替スプレッド込みで円換算(self):
        quote = make_quote("AAPL", 200.0, "USD")
        result = execute_trade(
            self.conn, self.pid, "AAPL", "Apple", "buy", 10, quote, 150.0
        )
        # 買いレート = 150 + 0.25
        self.assertAlmostEqual(result.fx_rate, 150.25)
        self.assertAlmostEqual(result.price_jpy, 200 * 150.25)
        sell = execute_trade(
            self.conn, self.pid, "AAPL", "Apple", "sell", 10, quote, 150.0
        )
        self.assertAlmostEqual(sell.fx_rate, 149.75)

    def test_米国株は1株単位で小数は拒否(self):
        quote = make_quote("AAPL", 200.0, "USD")
        with self.assertRaises(TradeError):
            execute_trade(self.conn, self.pid, "AAPL", "Apple", "buy", 0.5, quote, 150.0)
        result = execute_trade(self.conn, self.pid, "AAPL", "Apple", "buy", 1, quote, 150.0)
        self.assertEqual(result.qty, 1)

    def test_バックアップはSQLiteファイルとして書き出される(self):
        data = db.dump_db_bytes(self.conn)
        self.assertTrue(data.startswith(b"SQLite format 3"))
        with self.assertRaises(ValueError):
            db.restore_db_bytes(b"not a database")

    def test_評価はquote取得失敗時に取得単価で代用(self):
        execute_trade(
            self.conn, self.pid, "7203.T", "トヨタ", "buy", 100,
            make_quote("7203.T", 2000, "JPY"), None,
        )

        def failing_quote(_ticker):
            raise RuntimeError("接続不可")

        rows, total, warnings = value_positions(self.conn, self.pid, failing_quote, None)
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(total, 200_200)
        self.assertTrue(warnings)


if __name__ == "__main__":
    unittest.main()
