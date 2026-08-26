import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMarketState, stepMarket, sma, changeRatio } from '../src/market.js';
import { createRng } from '../src/rng.js';
import { INSTRUMENTS } from '../src/instruments.js';

test('銘柄マスタのコードは重複しない', () => {
  const symbols = INSTRUMENTS.map((i) => i.symbol);
  assert.equal(new Set(symbols).size, symbols.length);
});

test('初期状態は始値どおりで足が空', () => {
  const m = createMarketState();
  for (const inst of INSTRUMENTS) {
    assert.equal(m.instruments[inst.symbol].last, inst.start);
    assert.equal(m.instruments[inst.symbol].bars.length, 0);
  }
});

test('1 日進めると last が最新の終値になる', () => {
  const m = createMarketState();
  const rng = createRng(1);
  stepMarket(m, rng, '2024-01-04');
  for (const inst of INSTRUMENTS) {
    const state = m.instruments[inst.symbol];
    assert.equal(state.last, state.bars.at(-1).close);
  }
});

test('銘柄どうしは市場要因で正に相関する', () => {
  const m = createMarketState();
  const rng = createRng(77);
  let dates = [];
  let d = new Date(Date.UTC(2024, 0, 4));
  for (let i = 0; i < 300; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  for (const date of dates) stepMarket(m, rng, date);

  const rets = (symbol) => {
    const bars = m.instruments[symbol].bars;
    return bars.slice(1).map((b, i) => b.close / bars[i].close - 1);
  };
  const a = rets('1010');
  const b = rets('1868'); // どちらも β が高い銘柄
  const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = mean(a);
  const mb = mean(b);
  const cov = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0);
  const sa = Math.sqrt(a.reduce((s, v) => s + (v - ma) ** 2, 0));
  const sb = Math.sqrt(b.reduce((s, v) => s + (v - mb) ** 2, 0));
  const corr = cov / (sa * sb);
  assert.ok(corr > 0.2, `corr=${corr}`);
});

test('ニュースは日付つきで返る', () => {
  const m = createMarketState();
  const rng = createRng(4);
  const collected = [];
  for (let i = 0; i < 200; i++) collected.push(...stepMarket(m, rng, '2024-01-04'));
  assert.ok(collected.length > 0);
  for (const n of collected) {
    assert.equal(n.date, '2024-01-04');
    assert.ok(typeof n.text === 'string' && n.text.length > 0);
    assert.ok(['market', 'sector', 'symbol'].includes(n.scope));
    assert.ok(!n.text.includes('{'), `テンプレートが未置換: ${n.text}`);
  }
});

test('移動平均は期間が満たないうちは null', () => {
  const bars = [10, 20, 30, 40].map((close) => ({ close }));
  const out = sma(bars, 3);
  assert.deepEqual(out, [null, null, 20, 30]);
});

test('前日比は足が 1 本以下なら 0', () => {
  assert.equal(changeRatio([]), 0);
  assert.equal(changeRatio([{ close: 100 }]), 0);
  assert.ok(Math.abs(changeRatio([{ close: 100 }, { close: 110 }]) - 0.1) < 1e-12);
});
