import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maxDrawdown, volatility, sharpe, tradeStats, dailyReturns } from '../src/stats.js';

const eq = (...values) => values.map((value, i) => ({ date: `d${i}`, value }));

test('最大ドローダウンは高値からの下落率', () => {
  const dd = maxDrawdown(eq(100, 120, 90, 130));
  assert.ok(Math.abs(dd.ratio - -0.25) < 1e-9); // 120 -> 90
  assert.equal(dd.date, 'd2');
});

test('右肩上がりならドローダウンは 0', () => {
  assert.equal(maxDrawdown(eq(100, 110, 120)).ratio, 0);
});

test('日次リターンは 1 点少ない', () => {
  assert.equal(dailyReturns(eq(100, 110, 121)).length, 2);
  assert.ok(Math.abs(dailyReturns(eq(100, 110))[0] - 0.1) < 1e-12);
});

test('変動がなければボラティリティもシャープも 0', () => {
  const returns = dailyReturns(eq(100, 100, 100, 100));
  assert.equal(volatility(returns), 0);
  assert.equal(sharpe(returns), 0);
});

test('ボラティリティは年率換算される', () => {
  const returns = [0.01, -0.01, 0.01, -0.01, 0.01, -0.01];
  const annual = volatility(returns);
  assert.ok(annual > 0.1 && annual < 0.3, `annual=${annual}`);
});

test('トレード集計は売り約定だけを見る', () => {
  const trades = [
    { type: 'buy', pnl: 0 },
    { type: 'sell', pnl: 1000 },
    { type: 'sell', pnl: -400 },
    { type: 'sell', pnl: 600 },
    { type: 'dividend', pnl: 0 },
  ];
  const s = tradeStats(trades);
  assert.equal(s.count, 3);
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 1);
  assert.ok(Math.abs(s.winRate - 2 / 3) < 1e-9);
  assert.equal(s.avgWin, 800);
  assert.equal(s.avgLoss, 400);
  assert.equal(s.profitFactor, 1600 / 400);
});

test('取引がなくても 0 で返る', () => {
  const s = tradeStats([]);
  assert.equal(s.count, 0);
  assert.equal(s.winRate, 0);
  assert.equal(s.profitFactor, 0);
});
