import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEngine,
  step,
  stepDays,
  placeMarketOrder,
  placeLimitOrder,
  cancelOrder,
  snapshot,
  quotes,
  currentPrices,
  DEFAULT_CASH,
} from '../src/engine.js';
import { INSTRUMENTS } from '../src/instruments.js';
import { heldQty } from '../src/portfolio.js';
import { isTradingDay, parseIso } from '../src/calendar.js';

test('初期化するとウォームアップぶんの足と初期資金が用意される', () => {
  const s = createEngine({ seed: 1 });
  assert.equal(s.date, '2024-01-04');
  assert.equal(s.portfolio.cash, DEFAULT_CASH);
  for (const inst of INSTRUMENTS) {
    assert.equal(s.market.instruments[inst.symbol].bars.length, 60);
  }
  assert.equal(s.equity.length, 1);
});

test('同じシードなら相場は完全に再現される', () => {
  const a = createEngine({ seed: 99 });
  const b = createEngine({ seed: 99 });
  stepDays(a, 30);
  stepDays(b, 30);
  assert.deepEqual(
    a.market.instruments['1411'].bars.map((x) => x.close),
    b.market.instruments['1411'].bars.map((x) => x.close)
  );
});

test('1 日進めると全銘柄に営業日の足が 1 本増える', () => {
  const s = createEngine({ seed: 3 });
  const before = s.market.instruments['1010'].bars.length;
  const { date } = step(s);
  assert.equal(s.market.instruments['1010'].bars.length, before + 1);
  assert.equal(s.date, date);
  assert.ok(isTradingDay(parseIso(date)));
});

test('足の高値・安値は始値と終値を必ず含む', () => {
  const s = createEngine({ seed: 11 });
  stepDays(s, 120);
  for (const inst of INSTRUMENTS) {
    for (const bar of s.market.instruments[inst.symbol].bars) {
      assert.ok(bar.high >= Math.max(bar.open, bar.close), `high ${JSON.stringify(bar)}`);
      assert.ok(bar.low <= Math.min(bar.open, bar.close), `low ${JSON.stringify(bar)}`);
      assert.ok(bar.low > 0 && bar.volume > 0);
    }
  }
});

test('成行注文はその場で約定して現金が減る', () => {
  const s = createEngine({ seed: 5 });
  const before = s.portfolio.cash;
  const res = placeMarketOrder(s, { symbol: '1010', side: 'buy', qty: 200 });
  assert.equal(res.ok, true);
  assert.equal(heldQty(s.portfolio, '1010'), 200);
  assert.ok(s.portfolio.cash < before);
});

test('資金を超える成行注文は拒否される', () => {
  const s = createEngine({ seed: 5 });
  const res = placeMarketOrder(s, { symbol: '1411', side: 'buy', qty: 100_000 });
  assert.equal(res.ok, false);
  assert.match(res.reason, /現金/);
});

test('単元未満の注文は拒否される', () => {
  const s = createEngine({ seed: 5 });
  assert.equal(placeMarketOrder(s, { symbol: '1010', side: 'buy', qty: 50 }).ok, false);
  assert.equal(placeLimitOrder(s, { symbol: '1010', side: 'buy', qty: 150, limit: 100 }).ok, false);
});

test('未保有の銘柄は売れない', () => {
  const s = createEngine({ seed: 5 });
  assert.equal(placeMarketOrder(s, { symbol: '1010', side: 'sell', qty: 100 }).ok, false);
  assert.equal(placeLimitOrder(s, { symbol: '1010', side: 'sell', qty: 100, limit: 9999 }).ok, false);
});

test('指値買いは安値が指値に届いた日に約定する', () => {
  const s = createEngine({ seed: 21 });
  const limit = s.market.instruments['1010'].last * 0.9;
  placeLimitOrder(s, { symbol: '1010', side: 'buy', qty: 100, limit });
  assert.equal(s.orders.length, 1);

  let filled = null;
  for (let i = 0; i < 250 && !filled; i++) {
    const r = step(s);
    filled = r.fills.find((f) => f.trade) ?? null;
  }

  assert.ok(filled, '250 営業日以内に約定するはず');
  const bar = s.market.instruments['1010'].bars.at(-1);
  assert.ok(bar.low <= filled.order.limit);
  assert.ok(filled.trade.price <= filled.order.limit + 1e-9);
  assert.equal(s.orders.length, 0);
  assert.equal(heldQty(s.portfolio, '1010'), 100);
});

test('指値売りは高値が指値に届いた日に約定する', () => {
  const s = createEngine({ seed: 33 });
  placeMarketOrder(s, { symbol: '1308', side: 'buy', qty: 100 });
  const limit = s.market.instruments['1308'].last * 1.05;
  placeLimitOrder(s, { symbol: '1308', side: 'sell', qty: 100, limit });

  let filled = null;
  for (let i = 0; i < 400 && !filled; i++) {
    filled = step(s).fills.find((f) => f.trade) ?? null;
  }
  assert.ok(filled, '400 営業日以内に約定するはず');
  assert.ok(filled.trade.price >= filled.order.limit - 1e-9);
  assert.equal(heldQty(s.portfolio, '1308'), 0);
});

test('注文は取り消せる', () => {
  const s = createEngine({ seed: 7 });
  const { order } = placeLimitOrder(s, { symbol: '1010', side: 'buy', qty: 100, limit: 1 });
  assert.equal(cancelOrder(s, order.id), true);
  assert.equal(s.orders.length, 0);
  assert.equal(cancelOrder(s, 'unknown'), false);
});

test('配当は 3 月と 9 月の月末営業日に入る', () => {
  const s = createEngine({ seed: 13 });
  placeMarketOrder(s, { symbol: '1205', side: 'buy', qty: 1000 }); // 高配当銘柄
  const results = stepDays(s, 252);
  const dividends = results.flatMap((r) => r.dividends);
  assert.ok(dividends.length >= 2, `配当が ${dividends.length} 回しかない`);
  for (const d of dividends) {
    const month = parseIso(d.date).getUTCMonth() + 1;
    assert.ok([3, 9].includes(month), d.date);
  }
  assert.ok(s.portfolio.dividends > 0);
});

test('資産推移は営業日ごとに 1 点ずつ記録される', () => {
  const s = createEngine({ seed: 4 });
  stepDays(s, 40);
  assert.equal(s.equity.length, 41);
  const dates = s.equity.map((e) => e.date);
  assert.equal(new Set(dates).size, dates.length);
  assert.equal(s.equity.at(-1).date, s.date);
});

test('総資産は現金＋時価評価と一致する', () => {
  const s = createEngine({ seed: 8 });
  placeMarketOrder(s, { symbol: '1010', side: 'buy', qty: 200 });
  placeMarketOrder(s, { symbol: '1640', side: 'buy', qty: 300 });
  stepDays(s, 25);

  const prices = currentPrices(s);
  const manual =
    s.portfolio.cash +
    Object.values(s.portfolio.positions).reduce((sum, p) => sum + p.qty * prices[p.symbol], 0);
  assert.ok(Math.abs(snapshot(s).equity - manual) < 1e-6);
  assert.equal(s.equity.at(-1).value, snapshot(s).equity);
});

test('状態は JSON で往復できる（セーブ／ロード相当）', () => {
  const s = createEngine({ seed: 55 });
  placeMarketOrder(s, { symbol: '1755', side: 'buy', qty: 100 });
  stepDays(s, 20);

  const revived = JSON.parse(JSON.stringify(s));
  const a = stepDays(s, 10).map((r) => r.date);
  const b = stepDays(revived, 10).map((r) => r.date);
  assert.deepEqual(a, b);
  assert.deepEqual(
    s.market.instruments['1755'].bars.map((x) => x.close),
    revived.market.instruments['1755'].bars.map((x) => x.close)
  );
  assert.equal(snapshot(s).equity, snapshot(revived).equity);
});

test('quotes は銘柄マスタと保有株数を合成して返す', () => {
  const s = createEngine({ seed: 6 });
  placeMarketOrder(s, { symbol: '1972', side: 'buy', qty: 500 });
  const rows = quotes(s);
  assert.equal(rows.length, INSTRUMENTS.length);
  assert.equal(rows.find((r) => r.symbol === '1972').qty, 500);
  assert.ok(rows.every((r) => r.last > 0 && Number.isFinite(r.change)));
});

test('長期間まわしても価格・現金が破綻しない', () => {
  const s = createEngine({ seed: 2 });
  stepDays(s, 1000);
  assert.ok(s.market.instruments['1010'].bars.length <= 750, '足の本数は上限で切り詰められる');
  for (const inst of INSTRUMENTS) {
    assert.ok(Number.isFinite(s.market.instruments[inst.symbol].last));
    assert.ok(s.market.instruments[inst.symbol].last > 0);
  }
  assert.equal(s.portfolio.cash, DEFAULT_CASH);
});
