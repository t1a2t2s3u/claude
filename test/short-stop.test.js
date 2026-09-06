import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEngine,
  step,
  stepDays,
  placeMarketOrder,
  placeOrder,
  snapshot,
  DEFAULT_CASH,
} from '../src/engine.js';
import {
  createPortfolio,
  applyBuy,
  applySell,
  applyDividend,
  validateShort,
  shortCapacity,
  shortNotional,
  evaluate,
  heldQty,
  MARGIN_RATIO,
  commission,
} from '../src/portfolio.js';
import { benchmarkReturn, tradeStats } from '../src/stats.js';

const args = (over = {}) => ({
  date: '2024-01-04',
  symbol: '1010',
  name: 'アクシス電機',
  qty: 100,
  price: 1000,
  ...over,
});

/* ------------------------------------------------------------ 空売りの会計 */

test('空売りで現金が増え、建玉は負の数量で持つ', () => {
  const p = createPortfolio(1_000_000);
  const trade = applySell(p, args({ qty: 100, price: 1000 }));
  assert.equal(trade.type, 'short');
  assert.equal(heldQty(p, '1010'), -100);
  assert.equal(p.positions['1010'].avgCost, 1000);
  assert.equal(p.cash, 1_000_000 + 100_000 - commission(100_000));
  assert.equal(p.realized, 0);
});

test('買い戻しで実現損益が確定する（下がれば利益・上がれば損失）', () => {
  const p = createPortfolio(1_000_000);
  applySell(p, args({ qty: 100, price: 1000 })); // 空売り
  const cover = applyBuy(p, args({ qty: 100, price: 900 })); // 下がって買い戻し
  assert.equal(cover.type, 'cover');
  assert.equal(cover.pnl, 100 * (1000 - 900));
  assert.equal(p.realized, 10_000);
  assert.equal(p.positions['1010'], undefined);

  applySell(p, args({ qty: 100, price: 1000 }));
  applyBuy(p, args({ qty: 100, price: 1100 })); // 上がって買い戻し
  assert.equal(p.realized, 10_000 - 10_000);
});

test('売建の積み増しは平均建値になる', () => {
  const p = createPortfolio(1_000_000);
  applySell(p, args({ qty: 100, price: 1000 }));
  applySell(p, args({ qty: 300, price: 1200 }));
  assert.equal(heldQty(p, '1010'), -400);
  assert.equal(p.positions['1010'].avgCost, (1000 * 100 + 1200 * 300) / 400);
});

test('売建の評価損益は値下がりでプラスになる', () => {
  const p = createPortfolio(1_000_000);
  applySell(p, args({ qty: 100, price: 1000 }));
  const result = evaluate(p, { '1010': 900 });
  assert.equal(result.rows[0].unrealized, 10_000);
  assert.ok(result.rows[0].unrealizedRatio > 0);
  // equity = 現金 + 建玉の符号付き評価額
  assert.ok(Math.abs(result.equity - (p.cash + -100 * 900)) < 1e-6);
});

test('保証金率 30% を超える空売りは拒否される', () => {
  const p = createPortfolio(1_000_000);
  const capacity = shortCapacity(1_000_000);
  assert.ok(Math.abs(capacity - 1_000_000 / MARGIN_RATIO) < 1e-9);

  const ok = validateShort(p, { symbol: '1010', price: 1000, qty: 3300, equity: 1_000_000, shortTotal: 0 });
  assert.equal(ok.ok, true);
  const over = validateShort(p, { symbol: '1010', price: 1000, qty: 3400, equity: 1_000_000, shortTotal: 0 });
  assert.equal(over.ok, false);
  assert.match(over.reason, /保証金/);
});

test('現物を保有中の銘柄は空売りできず、売建を超える買い戻しもできない', () => {
  const s = createEngine({ seed: 5 });
  placeMarketOrder(s, { symbol: '1010', side: 'buy', qty: 100 });
  const shortRes = placeMarketOrder(s, { symbol: '1010', side: 'short', qty: 100 });
  assert.equal(shortRes.ok, false);
  assert.match(shortRes.reason, /現物を保有中/);

  placeMarketOrder(s, { symbol: '1102', side: 'short', qty: 100 });
  const overCover = placeMarketOrder(s, { symbol: '1102', side: 'buy', qty: 200 });
  assert.equal(overCover.ok, false);
  assert.match(overCover.reason, /買い戻せるのは/);
  assert.equal(placeMarketOrder(s, { symbol: '1102', side: 'buy', qty: 100 }).ok, true);
  assert.equal(heldQty(s.portfolio, '1102'), 0);
});

test('shortNotional は売建だけを時価で合算する', () => {
  const p = createPortfolio(1_000_000);
  applyBuy(p, args({ qty: 100, price: 1000 })); // 買建は含めない
  applySell(p, args({ symbol: '1102', name: 'x', qty: 200, price: 500 }));
  assert.equal(shortNotional(p, { '1010': 1100, '1102': 550 }), 200 * 550);
});

test('売建中の配当は配当落調整金として支払う', () => {
  const p = createPortfolio(1_000_000);
  applySell(p, args({ qty: 100, price: 1000 }));
  const cashBefore = p.cash;
  const trade = applyDividend(p, { date: '2024-03-29', symbol: '1010', name: 'x', qty: -100, perShare: 12.5 });
  assert.equal(trade.amount, -1250);
  assert.equal(p.cash, cashBefore - 1250);
  assert.equal(p.dividends, -1250);
});

test('エンジン経由でも空売り→権利確定日に調整金が引かれる', () => {
  const s = createEngine({ seed: 13 });
  placeMarketOrder(s, { symbol: '1205', side: 'short', qty: 1000 }); // 高配当銘柄を売建
  const results = stepDays(s, 70); // 3 月末を跨ぐ
  const dividends = results.flatMap((r) => r.dividends);
  assert.ok(dividends.length >= 1);
  assert.ok(dividends[0].amount < 0, '売建は支払う側');
  assert.ok(s.portfolio.dividends < 0);
});

test('買い戻しも勝敗集計に入る', () => {
  const stats = tradeStats([
    { type: 'short', pnl: 0 },
    { type: 'cover', pnl: 5000 },
    { type: 'sell', pnl: -2000 },
  ]);
  assert.equal(stats.count, 2);
  assert.equal(stats.wins, 1);
  assert.equal(stats.losses, 1);
});

/* ------------------------------------------------------------ 逆指値 */

test('逆指値の売り（損切り）は安値が水準を割った日に、不利な側で約定する', () => {
  const s = createEngine({ seed: 21 });
  placeMarketOrder(s, { symbol: '1010', side: 'buy', qty: 100 });
  const stop = s.market.instruments['1010'].last * 0.93;
  const res = placeOrder(s, { symbol: '1010', side: 'sell', qty: 100, kind: 'stop', price: stop });
  assert.equal(res.ok, true);

  let filled = null;
  for (let i = 0; i < 300 && !filled; i++) {
    filled = step(s).fills.find((f) => f.trade) ?? null;
  }
  assert.ok(filled, '300 営業日以内に発動するはず');
  const bar = s.market.instruments['1010'].bars.at(-1);
  assert.ok(bar.low <= filled.order.price, '安値が水準に届いた日');
  assert.ok(filled.trade.price <= filled.order.price + 1e-9, '発動後は水準以下（不利な側）で約定');
  assert.equal(heldQty(s.portfolio, '1010'), 0);
});

test('逆指値の買いは高値が水準を超えた日に、水準以上で約定する', () => {
  const s = createEngine({ seed: 8 });
  const trigger = s.market.instruments['1868'].last * 1.06;
  placeOrder(s, { symbol: '1868', side: 'buy', qty: 100, kind: 'stop', price: trigger });

  let filled = null;
  for (let i = 0; i < 400 && !filled; i++) {
    filled = step(s).fills.find((f) => f.trade) ?? null;
  }
  assert.ok(filled, '400 営業日以内に発動するはず');
  assert.ok(filled.trade.price >= filled.order.price - 1e-9);
  assert.equal(heldQty(s.portfolio, '1868'), 100);
});

test('指値と逆指値で発動条件が逆になる（同じ水準・同じ足で確認）', () => {
  // 買い指値は「下がったら」、買い逆指値は「上がったら」。水準を現在値のすぐ上に置くと
  // 逆指値だけが先に発動するはず
  const s = createEngine({ seed: 42 });
  const last = s.market.instruments['1308'].last;
  placeOrder(s, { symbol: '1308', side: 'buy', qty: 100, kind: 'limit', price: last * 0.8 });
  placeOrder(s, { symbol: '1308', side: 'buy', qty: 100, kind: 'stop', price: last * 1.02 });

  const r = stepDays(s, 30);
  const fills = r.flatMap((x) => x.fills).filter((f) => f.trade);
  if (fills.length > 0) {
    assert.equal(fills[0].order.kind, 'stop');
  }
  // ディフェンシブ銘柄が 30 日で 2% 上抜けせず 20% 下落もしない場合もある（このシードでは発動する）
  assert.ok(fills.length >= 1, 'このシードでは逆指値が発動するはず');
});

/* ------------------------------------------------------------ ベンチマーク */

test('資産推移に指数が並記され、同期間リターンを引ける', () => {
  const s = createEngine({ seed: 7 });
  stepDays(s, 60);
  for (const e of s.equity) assert.ok(e.index > 0, '全点に指数がある');

  const expected = s.equity.at(-1).index / s.equity[0].index - 1;
  assert.ok(Math.abs(benchmarkReturn(s.equity) - expected) < 1e-12);
});

test('取引しなければ超過リターンは 0 − 指数リターンになる', () => {
  const s = createEngine({ seed: 11 });
  stepDays(s, 40);
  const bench = benchmarkReturn(s.equity);
  const snap = snapshot(s);
  assert.equal(snap.totalReturn, 0); // 現金のまま
  assert.ok(Math.abs((snap.totalReturn - bench) - -bench) < 1e-12);
});
