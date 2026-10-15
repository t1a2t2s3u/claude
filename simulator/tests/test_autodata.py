"""自動収集データ(autodata/)取込のユニットテスト(ネットワーク不要)。"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sim import db
from sim.master import load_autodata_masters, master_counts
from sim.screener import load_autodata_fundamentals


class AutodataTest(unittest.TestCase):
    def setUp(self):
        self.conn = db.connect(":memory:")
        db.init_db(self.conn)
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def write_autodata(self, generated_at: datetime):
        (self.dir / "stocks.csv").write_text(
            "ticker,code,name,market,country\n"
            "7203.T,7203,トヨタ自動車,プライム,JP\n"
            "AAPL,AAPL,Apple Inc.,NASDAQ,US\n",
            encoding="utf-8",
        )
        (self.dir / "fundamentals.json").write_text(
            json.dumps({"7203.T": {"marketCap": 5e13, "currency": "JPY"}}),
            encoding="utf-8",
        )
        (self.dir / "meta.json").write_text(
            json.dumps({"generated_at": generated_at.isoformat(timespec="seconds")}),
            encoding="utf-8",
        )

    def test_マスタと財務データを取り込める(self):
        self.write_autodata(datetime.now(timezone.utc) - timedelta(hours=1))
        self.assertEqual(load_autodata_masters(self.conn, self.dir), 2)
        self.assertEqual(master_counts(self.conn)["JP"]["count"], 1)

        result = load_autodata_fundamentals(self.conn, self.dir)
        self.assertEqual(result["loaded"], 1)
        row = self.conn.execute("SELECT data FROM fundamentals WHERE ticker='7203.T'").fetchone()
        self.assertEqual(json.loads(row["data"])["marketCap"], 5e13)

    def test_アプリ側のより新しいキャッシュは上書きしない(self):
        self.write_autodata(datetime.now(timezone.utc) - timedelta(hours=1))
        self.conn.execute(
            "INSERT INTO fundamentals VALUES('7203.T', '{}', ?)",
            (datetime.now().isoformat(timespec="seconds"),),
        )
        self.conn.commit()
        result = load_autodata_fundamentals(self.conn, self.dir)
        self.assertEqual(result["loaded"], 0)

    def test_データが無ければNone(self):
        self.assertIsNone(load_autodata_masters(self.conn, self.dir))
        self.assertIsNone(load_autodata_fundamentals(self.conn, self.dir))


if __name__ == "__main__":
    unittest.main()
