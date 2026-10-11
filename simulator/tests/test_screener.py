"""スクリーナーのスコアリング・ランキングのユニットテスト(ネットワーク不要)。"""

from __future__ import annotations

import json
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sim import db
from sim.screener import ipo_years, mcap_jpy, rank, score

NOW = datetime(2026, 10, 1)


def epoch(years_ago: float) -> int:
    return int((NOW - timedelta(days=365.25 * years_ago)).timestamp())


# 急騰前のキオクシアを模したプロフィール:
# 上場1年の大型(2兆円)、PBR1.2、52週高値圏、出来高急増、半導体
KIOXIA_LIKE = {
    "currency": "JPY",
    "marketCap": 2e12,
    "trailingPE": 9.0,
    "priceToBook": 1.2,
    "regularMarketPrice": 95,
    "fiftyTwoWeekHigh": 100,
    "fiftyTwoWeekLow": 40,
    "averageVolume": 1_000_000,
    "averageVolume10days": 2_500_000,
    "firstTradeDateEpochUtc": epoch(1.0),
    "sector": "Technology",
    "industry": "Semiconductors",
}

# 対極: 上場30年の小型、割高、52週安値圏、出来高閑散、テーマ外
OLD_SMALL = {
    "currency": "JPY",
    "marketCap": 5e9,
    "trailingPE": 40.0,
    "priceToBook": 4.0,
    "regularMarketPrice": 45,
    "fiftyTwoWeekHigh": 100,
    "fiftyTwoWeekLow": 40,
    "averageVolume": 100_000,
    "averageVolume10days": 60_000,
    "firstTradeDateEpochUtc": epoch(30),
    "sector": "Consumer Defensive",
    "industry": "Packaged Foods",
}


class ScoreTest(unittest.TestCase):
    def test_キオクシア型は高得点で対極の銘柄は低得点(self):
        high = score(KIOXIA_LIKE, now=NOW)["total"]
        low = score(OLD_SMALL, now=NOW)["total"]
        self.assertGreater(high, 80)
        self.assertLess(low, 25)
        self.assertGreater(high, low)

    def test_因子は0から1の範囲(self):
        for fund in (KIOXIA_LIKE, OLD_SMALL, {}):
            comps = score(fund, now=NOW)["components"]
            for name, value in comps.items():
                self.assertTrue(0 <= value <= 1, f"{name}={value}")

    def test_米ドル時価総額は円換算して規模判定する(self):
        usd = dict(KIOXIA_LIKE, currency="USD", marketCap=1e10)  # $100億 ≒ 1.5兆円
        self.assertGreater(mcap_jpy(usd), 1e12)
        self.assertAlmostEqual(mcap_jpy(KIOXIA_LIKE), 2e12)

    def test_上場年数とデータ欠損の扱い(self):
        self.assertAlmostEqual(ipo_years(KIOXIA_LIKE, NOW), 1.0, places=1)
        self.assertIsNone(ipo_years({}, NOW))
        # firstTradeDate欠損なら freshness は0になる(若さを証明できない)
        no_ipo = dict(KIOXIA_LIKE)
        del no_ipo["firstTradeDateEpochUtc"]
        self.assertEqual(score(no_ipo, now=NOW)["components"]["freshness"], 0.0)

    def test_テーマは追加キーワードでも一致する(self):
        fund = dict(OLD_SMALL, industry="Specialty Industrial Machinery - Robotics")
        base = score(fund, now=NOW)["components"]["theme"]
        with_kw = score(fund, extra_keywords=["robotics"], now=NOW)["components"]["theme"]
        self.assertEqual(base, 0.0)
        self.assertEqual(with_kw, 1.0)


class RankTest(unittest.TestCase):
    def setUp(self):
        self.conn = db.connect(":memory:")
        db.init_db(self.conn)
        stocks = [
            ("9001.T", "キオクシア型", KIOXIA_LIKE),
            ("9002.T", "古い小型", OLD_SMALL),
            ("9003.T", "取得失敗", {"error": "接続不可"}),
        ]
        for ticker, name, fund in stocks:
            self.conn.execute(
                "INSERT INTO stocks VALUES(?, ?, ?, 'プライム', 'JP', '2026-10-01')",
                (ticker, ticker[:4], name),
            )
            self.conn.execute(
                "INSERT INTO fundamentals VALUES(?, ?, '2026-10-01T00:00:00')",
                (ticker, json.dumps(fund)),
            )
        self.universe = self.conn.execute("SELECT * FROM stocks").fetchall()

    def test_スコア降順で並び取得失敗は除外される(self):
        results = rank(self.conn, self.universe, now=NOW)
        self.assertEqual([r["name"] for r in results], ["キオクシア型", "古い小型"])
        self.assertGreater(results[0]["score"], results[1]["score"])

    def test_最低時価総額フィルタ(self):
        results = rank(self.conn, self.universe, min_mcap_jpy=1e11, now=NOW)
        self.assertEqual([r["name"] for r in results], ["キオクシア型"])


if __name__ == "__main__":
    unittest.main()
