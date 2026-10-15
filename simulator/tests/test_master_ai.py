"""銘柄マスタ取込(米国株)とAI注文JSONのユニットテスト(ネットワーク不要)。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import io

import pandas as pd

from sim import db
from sim.ai_bridge import OrderParseError, parse_orders
from sim.master import (
    MasterError,
    discover_jpx_url,
    search_stocks,
    update_jp_master,
    update_us_master,
)

NASDAQ_SAMPLE = "\n".join([
    "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares",
    "AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N",
    "ZTEST|Test Stock|Q|Y|N|100|N|N",
    "File Creation Time: 0913202522:01|||||||",
])

OTHER_SAMPLE = "\n".join([
    "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol",
    "BRK.B|Berkshire Hathaway Inc. Class B|N|BRK.B|N|100|N|BRK=B",
    "SPY|SPDR S&P 500 ETF Trust|P|SPY|Y|100|N|SPY",
    "File Creation Time: 0913202522:01|||||||",
])


class MasterTest(unittest.TestCase):
    def setUp(self):
        self.conn = db.connect(":memory:")
        db.init_db(self.conn)

    def test_米国株マスタの取込とティッカー変換(self):
        n = update_us_master(
            self.conn,
            nasdaq_bytes=NASDAQ_SAMPLE.encode(),
            other_bytes=OTHER_SAMPLE.encode(),
        )
        self.assertEqual(n, 3)  # テスト銘柄(Test Issue=Y)は除外
        rows = {r["ticker"]: r for r in self.conn.execute("SELECT * FROM stocks").fetchall()}
        self.assertIn("AAPL", rows)
        self.assertIn("BRK-B", rows)  # BRK.B → BRK-B に変換
        self.assertEqual(rows["BRK-B"]["code"], "BRK.B")
        self.assertEqual(rows["BRK-B"]["market"], "NYSE")
        self.assertEqual(rows["SPY"]["market"], "NYSE Arca")

    def test_日本株マスタはxlsx形式を読み込める(self):
        df = pd.DataFrame(
            {
                "コード": ["7203", "1305", "285A"],
                "銘柄名": ["トヨタ自動車", "ETFもどき", "キオクシアHD"],
                "市場・商品区分": ["プライム（内国株式）", "ETF・ETN", "プライム（内国株式）"],
            }
        )
        buf = io.BytesIO()
        df.to_excel(buf, index=False)  # openpyxlでxlsx(zip形式)を生成
        n = update_jp_master(self.conn, file_bytes=buf.getvalue())
        self.assertEqual(n, 2)  # ETFは除外
        rows = {r["ticker"] for r in self.conn.execute("SELECT * FROM stocks").fetchall()}
        self.assertEqual(rows, {"7203.T", "285A.T"})

    def test_JPX一覧ページからdata_jリンクを発見できる(self):
        html = '<a href="/markets/statistics-equities/misc/xxxx-att/data_j.xlsx">一覧</a>'
        self.assertEqual(
            discover_jpx_url(html),
            "https://www.jpx.co.jp/markets/statistics-equities/misc/xxxx-att/data_j.xlsx",
        )
        with self.assertRaises(MasterError):
            discover_jpx_url("<html>リンクなし</html>")

    def test_検索は名前とコードの部分一致(self):
        update_us_master(
            self.conn,
            nasdaq_bytes=NASDAQ_SAMPLE.encode(),
            other_bytes=OTHER_SAMPLE.encode(),
        )
        self.assertEqual(len(search_stocks(self.conn, "apple")), 1)
        self.assertEqual(len(search_stocks(self.conn, "BRK")), 1)
        self.assertEqual(len(search_stocks(self.conn, "存在しない")), 0)
        self.assertEqual(len(search_stocks(self.conn, "SPY", country="JP")), 0)


class OrdersTest(unittest.TestCase):
    def test_正常な注文JSON(self):
        orders = parse_orders(
            '[{"ticker": "7203.t", "side": "BUY", "qty": 100, "reason": "テスト"}]'
        )
        self.assertEqual(orders, [
            {"ticker": "7203.T", "side": "buy", "qty": 100, "reason": "テスト"}
        ])

    def test_ordersキー包みと空配列(self):
        self.assertEqual(parse_orders('{"orders": []}'), [])

    def test_不正な注文は日本語エラー(self):
        for bad in [
            "こわれたJSON",
            '[{"side": "buy", "qty": 100}]',          # ticker欠落
            '[{"ticker": "AAPL", "side": "hold", "qty": 1}]',  # side不正
            '[{"ticker": "AAPL", "side": "buy", "qty": 0}]',   # qty不正
            '[{"ticker": "AAPL", "side": "buy", "qty": 1.5}]', # 小数
        ]:
            with self.assertRaises(OrderParseError):
                parse_orders(bad)


if __name__ == "__main__":
    unittest.main()
