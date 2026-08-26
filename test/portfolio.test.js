import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPortfolio,
  commission,
  buyCost,
  validateBuy,
  validateSell,
  applyBuy,
  applySell,
  applyDividend,
  evaluate,
  heldQty,
  FEE_MIN,
  FEE_MAX,
} from '../src/portfolio.js';

const args = (over = {}) => ({
  date: '2024-01-04',
  symbol: '1010',
  name: 'アクシス電機',
  qty: 100,
  price: 1000,
  ...over,
});

test('手数料は下限と上限で頭打ちになる', () => {
  assert.equal(commission(1000), FEE_MIN);
  assert.equal(commission(500_000), 500);
  assert.equal(commission(100_000_000), FEE_MAX);
});

test('買付で現金が約定代金＋手数料ぶん減る', () => {
  const p = createPortfolio(1_000_000);
  applyBuy(p, args());
  assert.equal(p.cash, 1_000_000 - buyCost(1000, 100));
  assert.equal(heldQty(p, '1010'), 100);
  assert.equal(p.positions['1010'].avgCost, 1000);
});

test('買い増しで取得単価が加重平均される', () => {
  const p = createPortfolio(1_000_000);
  applyBuy(p, args({ qty: 100, price: 1000 }));
  applyBuy(p, args({ qty: 300, price: 1200 }));
  assert.equal(heldQty(p, '1010'), 400);
  assert.equal(p.positions['1010'].avgCost, (1000 * 100 + 1200 * 300) / 400);
});

test('売却で実現損益が確定し、全部売るとポジションが消える', () => {
  const p = createPortfolio(1_000_000);
  applyBuy(p, args({ qty: 200, price: 1000 }));
  const trade = applySell(p, args({ qty: 200, price: 1100 }));
  assert.equal(trade.pnl, 20_000);
  assert.equal(p.realized, 20_000);
  assert.equal(heldQty(p, '1010'), 0);
  assert.equal(p.positions['1010'], undefined);
});

test('一部売却しても取得単価は変わらない', () => {
  const p = createPortfolio(1_000_000);
  applyBuy(p, args({ qty: 300, price: 1000 }));
  applySell(p, args({ qty: 100, price: 1500 }));
  assert.equal(heldQty(p, '1010'), 200);
  assert.equal(p.positions['1010'].avgCost, 1000);
  assert.equal(p.realized, 50_000);
});

test('現金・単元・保有株数のバリデーション', () => {
  const p = createPortfolio(100_000);
  assert.equal(validateBuy(p, { price: 1000, qty: 1000 }).ok, false); // 資金不足
  assert.equal(validateBuy(p, { price: 1000, qty: 150 }).ok, false); // 単元未満
  assert.equal(validateBuy(p, { price: 1000, qty: 0 }).ok, false);
  assert.equal(validateBuy(p, { price: 100, qty: 100 }).ok, true);
  assert.equal(validateSell(p, { symbol: '1010', qty: 100 }).ok, false); // 未保有
});

test('売買を繰り返しても 現金＋評価額 と 実現損益 の関係が保たれる', () => {
  const p = createPortfolio(1_000_000);
  applyBuy(p, args({ qty: 200, price: 1000 }));
  applyBuy(p, args({ qty: 100, price: 900, symbol: '1102', name: '光和機械' }));
  applySell(p, args({ qty: 100, price: 1200 }));

  const snap = evaluate(p, { '1010': 1300, '1102': 950 });
  // 総資産 = 初期資金 + 実現損益 + 評価損益 - 手数料 + 配当
  const expected = p.initialCash + p.realized + snap.unrealized - p.fees + p.dividends;
  assert.ok(Math.abs(snap.equity - expected) < 1e-6, `${snap.equity} vs ${expected}`);
});

test('配当は現金と累計に加算される', () => {
  const p = createPortfolio(1_000_000);
  applyBuy(p, args({ qty: 100, price: 1000 }));
  const cashBefore = p.cash;
  applyDividend(p, { date: '2024-03-29', symbol: '1010', name: 'アクシス電機', qty: 100, perShare: 12.5 });
  assert.equal(p.cash, cashBefore + 1250);
  assert.equal(p.dividends, 1250);
});

test('評価は保有なしでも壊れない', () => {
  const p = createPortfolio(500_000);
  const snap = evaluate(p, {});
  assert.equal(snap.equity, 500_000);
  assert.equal(snap.totalPnl, 0);
  assert.equal(snap.rows.length, 0);
});
