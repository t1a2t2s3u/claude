import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRealEngine,
  step,
  stepDays,
  placeMarketOrder,
  placeLimitOrder,
  snapshot,
  quotes,
  isAtEnd,
  rebindDataset,
} from '../src/engine.js';
import { toInstruments } from '../src/dataset.js';
import { heldQty } from '../src/portfolio.js';

/** loadDataset と同じ形の、テスト用データセットを組み立てる */
function fakeDataset({ days = 120, symbols, dividends = {} } = {}) {
  const specs = symbols ?? [
    { symbol: '7203', name: 'トヨタ自動車', sector: '輸送用機器', market: 'JP', sourceCurrency: 'JPY', lot: 100, base: 2500 },
    { symbol: 'AAPL', name: 'アップル', sector: 'テクノロジー', market: 'US', sourceCurrency: 'USD', lot: 1, base: 30000 },
  ];

  const calendar = [];
  const cursor = new Date(Date.UTC(2024, 0, 1));
  while (calendar.length < days) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) calendar.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const series = new Map();
  for (const spec of specs) {
    const byDate = new Map();
    calendar.forEach((date, i) => {
      // 銘柄ごとに位相をずらした決定論的な波形にする（日々 ±3% を超える程度の振幅）
      const close = Math.round(spec.base * (1 + 0.15 * Math.sin((i + spec.base) / 3)) * 10) / 10;
      byDate.set(date, {
        date,
        open: close * 0.995,
        high: close * 1.02,
        low: close * 0.98,
        close,
        volume: 100_000 + i,
      });
    });
    series.set(spec.symbol, {
      symbol: spec.symbol,
      bars: [...byDate.values()],
      byDate,
      dividends: new Map(dividends[spec.symbol] ?? []),
    });
  }

  return {
    universe: {
      version: 1,
      generatedAt: '2026-08-26T00:00:00.000Z',
      source: 'yahoo',
      baseCurrency: 'JPY',
      calendar,
      symbols: specs.map(({ base, ...rest }) => rest),
    },
    calendar,
    series,
    barAt: (symbol, date) => series.get(symbol)?.byDate.get(date) ?? null,
    dividendAt: (symbol, date) => series.get(symbol)?.dividends.get(date) ?? 0,
    get lastDate() {
      return calendar.at(-1);
    },
  };
}

test('universe から銘柄マスタを組み立てる', () => {
  const dataset = fakeDataset();
  const instruments = toInstruments(dataset.universe);
  assert.equal(instruments.length, 2);
  assert.equal(instruments[0].lot, 100);
  assert.equal(instruments[1].lot, 1); // 米国株は 1 株単位
  assert.equal(instruments[1].currency, 'JPY'); // 取り込み時に基準通貨へ換算済み
});

test('実データモードは指定位置から始まり、履歴が積まれている', () => {
  const dataset = fakeDataset({ days: 200 });
  const state = createRealEngine(dataset, { startIndex: 100 });
  assert.equal(state.mode, 'real');
  assert.equal(state.date, dataset.calendar[100]);
  assert.equal(state.cursor, 100);
  assert.equal(state.market.instruments['7203'].bars.length, 61); // ウォームアップ 60 + 当日
  assert.equal(state.market.instruments['7203'].bars.at(-1).date, state.date);
  assert.equal(state.portfolio.cash, state.equity[0].value);
});

test('1 日進めると実データの足がそのまま入る', () => {
  const dataset = fakeDataset();
  const state = createRealEngine(dataset, { startIndex: 60 });
  const expected = dataset.barAt('7203', dataset.calendar[61]);
  const result = step(state, dataset);

  assert.equal(result.date, dataset.calendar[61]);
  assert.deepEqual(state.market.instruments['7203'].bars.at(-1), expected);
  assert.equal(state.market.instruments['7203'].last, expected.close);
  assert.equal(quotes(state).find((q) => q.symbol === '7203').last, expected.close);
});

test('データの最終日を超えて進めない', () => {
  const dataset = fakeDataset({ days: 70 });
  const state = createRealEngine(dataset, { startIndex: 67 });
  assert.equal(isAtEnd(state, dataset), false);

  assert.ok(step(state, dataset));
  assert.ok(step(state, dataset));
  assert.equal(state.date, dataset.lastDate);
  assert.equal(step(state, dataset), null);
  assert.equal(isAtEnd(state, dataset), true);
  assert.equal(stepDays(state, 10, dataset).length, 0);
});

test('dataset を渡さずに実データモードを進めると例外', () => {
  const dataset = fakeDataset();
  const state = createRealEngine(dataset, { startIndex: 60 });
  assert.throws(() => step(state), /dataset が必要/);
});

test('実データでも成行・指値の約定は同じ規則で動く', () => {
  const dataset = fakeDataset({ days: 200 });
  const state = createRealEngine(dataset, { startIndex: 60 });

  assert.equal(placeMarketOrder(state, { symbol: '7203', side: 'buy', qty: 100 }).ok, true);
  assert.equal(heldQty(state.portfolio, '7203'), 100);

  // 米国株は 1 株から買える
  assert.equal(placeMarketOrder(state, { symbol: 'AAPL', side: 'buy', qty: 3 }).ok, true);
  assert.equal(heldQty(state.portfolio, 'AAPL'), 3);

  // 波形の中心（2500 円）を指値にすれば、下振れした日に必ず約定する
  const limit = 2500;
  placeLimitOrder(state, { symbol: '7203', side: 'buy', qty: 100, limit });
  let filled = null;
  for (let i = 0; i < 30 && !filled; i++) {
    const r = step(state, dataset);
    if (!r) break;
    filled = r.fills.find((f) => f.trade) ?? null;
  }
  assert.ok(filled, '波形が下げる局面で約定するはず');
  assert.ok(filled.trade.price <= filled.order.limit + 1e-9);
});

test('配当は実際の権利落ち日に、実際の金額で入る', () => {
  const dataset = fakeDataset({ days: 120 });
  const exDate = dataset.calendar[70];
  dataset.series.get('7203').dividends.set(exDate, 37.5);

  const state = createRealEngine(dataset, { startIndex: 60 });
  placeMarketOrder(state, { symbol: '7203', side: 'buy', qty: 200 });

  const results = stepDays(state, 20, dataset);
  const paid = results.flatMap((r) => r.dividends);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].date, exDate);
  assert.equal(paid[0].price, 37.5);
  assert.equal(state.portfolio.dividends, 7500);
});

test('保有していない銘柄の配当は入らない', () => {
  const dataset = fakeDataset({ days: 120 });
  dataset.series.get('7203').dividends.set(dataset.calendar[70], 37.5);
  const state = createRealEngine(dataset, { startIndex: 60 });
  const paid = stepDays(state, 20, dataset).flatMap((r) => r.dividends);
  assert.equal(paid.length, 0);
  assert.equal(state.portfolio.dividends, 0);
});

test('大きく動いた銘柄が値動きフィードに載る', () => {
  const dataset = fakeDataset({ days: 200 });
  const state = createRealEngine(dataset, { startIndex: 60 });
  const news = stepDays(state, 60, dataset).flatMap((r) => r.news);
  assert.ok(news.length > 0, '±3% 以上動いた日があるはず');
  for (const n of news) {
    assert.equal(n.scope, 'move');
    assert.ok(Math.abs(n.impact) >= 0.03);
    assert.ok(n.text.includes('大幅'));
  }
});

test('総資産は現金＋時価評価と一致する', () => {
  const dataset = fakeDataset({ days: 200 });
  const state = createRealEngine(dataset, { startIndex: 60 });
  placeMarketOrder(state, { symbol: '7203', side: 'buy', qty: 300 });
  placeMarketOrder(state, { symbol: 'AAPL', side: 'buy', qty: 5 });
  stepDays(state, 30, dataset);

  const manual =
    state.portfolio.cash +
    Object.values(state.portfolio.positions).reduce(
      (sum, p) => sum + p.qty * state.market.instruments[p.symbol].last,
      0
    );
  assert.ok(Math.abs(snapshot(state).equity - manual) < 1e-6);
  assert.equal(state.equity.at(-1).date, state.date);
});

test('保存した state は、読み直したデータセットに日付で結び直せる', () => {
  const dataset = fakeDataset({ days: 200 });
  const state = createRealEngine(dataset, { startIndex: 60 });
  placeMarketOrder(state, { symbol: '7203', side: 'buy', qty: 100 });
  stepDays(state, 20, dataset);

  const revived = JSON.parse(JSON.stringify(state));
  revived.cursor = -1; // 取り込み直しでずれた状況を模す
  assert.equal(rebindDataset(revived, dataset).ok, true);
  assert.equal(revived.cursor, dataset.calendar.indexOf(revived.date));

  assert.deepEqual(
    stepDays(state, 5, dataset).map((r) => r.date),
    stepDays(revived, 5, dataset).map((r) => r.date)
  );
  assert.equal(snapshot(state).equity, snapshot(revived).equity);
});

test('日付が見つからないデータセットには結び直せない', () => {
  const dataset = fakeDataset({ days: 120 });
  const state = createRealEngine(dataset, { startIndex: 60 });
  state.date = '1999-12-31';
  const result = rebindDataset(state, dataset);
  assert.equal(result.ok, false);
  assert.match(result.reason, /日付/);
});

test('休場でその日の足がない銘柄は価格を据え置く', () => {
  const dataset = fakeDataset({ days: 120 });
  const holiday = dataset.calendar[61];
  dataset.series.get('AAPL').byDate.delete(holiday); // 米国だけ休場の日

  const state = createRealEngine(dataset, { startIndex: 60 });
  const before = state.market.instruments['AAPL'].last;
  const bars = state.market.instruments['AAPL'].bars.length;

  step(state, dataset);
  assert.equal(state.market.instruments['AAPL'].last, before);
  assert.equal(state.market.instruments['AAPL'].bars.length, bars);
  assert.equal(state.market.instruments['7203'].bars.at(-1).date, holiday);
});
