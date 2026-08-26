import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStooqCsv,
  parseYahooChart,
  buildFxMap,
  convertToBase,
  normalizeSeries,
  buildCalendar,
  fetchSeries,
  selectSpecs,
} from '../tools/fetch-prices.js';
import { PRESETS, resolveSymbols } from '../tools/tickers.js';

const epoch = (iso) => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000);

const yahooResponse = {
  chart: {
    error: null,
    result: [
      {
        meta: { currency: 'JPY', longName: 'Toyota Motor Corporation' },
        timestamp: ['2024-01-04', '2024-01-05', '2024-01-09'].map(epoch),
        events: { dividends: { [epoch('2024-01-05')]: { amount: 30, date: epoch('2024-01-05') } } },
        indicators: {
          quote: [
            {
              open: [2500, 2530, null],
              high: [2560, 2570, 2600],
              low: [2480, 2500, 2510],
              close: [2540, null, 2580], // 欠損日が混ざる
              volume: [1_000_000, 900_000, 1_100_000],
            },
          ],
        },
      },
    ],
  },
};

test('Yahoo のレスポンスから足と配当を取り出す', () => {
  const series = parseYahooChart(yahooResponse);
  assert.equal(series.bars.length, 2); // close が null の日は落とす
  assert.deepEqual(series.bars[0], {
    date: '2024-01-04',
    open: 2500,
    high: 2560,
    low: 2480,
    close: 2540,
    volume: 1_000_000,
  });
  assert.deepEqual(series.dividends, [{ date: '2024-01-05', amount: 30 }]);
  assert.equal(series.meta.currency, 'JPY');
});

test('始値が欠けている日は終値で埋め、高安の整合も保つ', () => {
  const series = parseYahooChart(yahooResponse);
  const bar = series.bars.at(-1);
  assert.equal(bar.open, 2580);
  assert.ok(bar.high >= Math.max(bar.open, bar.close));
  assert.ok(bar.low <= Math.min(bar.open, bar.close));
});

test('Yahoo のエラーレスポンスは例外にする', () => {
  assert.throws(
    () => parseYahooChart({ chart: { result: null, error: { code: 'Not Found', description: 'x' } } }),
    /Not Found/
  );
});

test('Stooq の CSV を足に変換する', () => {
  const csv = [
    'Date,Open,High,Low,Close,Volume',
    '2024-01-04,2500,2560,2480,2540,1000000',
    '2024-01-05,2530,2570,2500,2550,900000',
    '', // 末尾の空行
  ].join('\n');
  const series = parseStooqCsv(csv);
  assert.equal(series.bars.length, 2);
  assert.equal(series.bars[1].close, 2550);
  assert.deepEqual(series.dividends, []);
});

test('壊れた CSV は例外にする', () => {
  assert.throws(() => parseStooqCsv('<html>error</html>'), /想定外/);
});

test('為替は当日のレート、なければ直近営業日のレートを使う', () => {
  const fx = buildFxMap([
    { date: '2024-01-04', close: 145 },
    { date: '2024-01-05', close: 146 },
    { date: '2024-01-09', close: 148 },
  ]);
  assert.equal(fx.rateAt('2024-01-05'), 146);
  assert.equal(fx.rateAt('2024-01-08'), 146); // 休場日は前営業日に遡る
  assert.equal(fx.rateAt('2024-01-09'), 148);
  assert.equal(fx.rateAt('2023-12-31'), null); // それより前は引けない
});

test('外貨建ての足と配当を基準通貨に換算する', () => {
  const fx = buildFxMap([{ date: '2024-01-04', close: 150 }]);
  const converted = convertToBase(
    {
      bars: [{ date: '2024-01-04', open: 100, high: 110, low: 95, close: 105, volume: 12.4 }],
      dividends: [{ date: '2024-01-04', amount: 0.24 }],
    },
    fx
  );
  assert.deepEqual(converted.bars[0], {
    date: '2024-01-04',
    open: 15_000,
    high: 16_500,
    low: 14_250,
    close: 15_750,
    volume: 12,
  });
  assert.deepEqual(converted.dividends, [{ date: '2024-01-04', amount: 36 }]);
});

test('レートを引けない日の足は落とす', () => {
  const fx = buildFxMap([{ date: '2024-01-04', close: 150 }]);
  const converted = convertToBase(
    { bars: [{ date: '2023-06-01', open: 1, high: 1, low: 1, close: 1, volume: 1 }], dividends: [] },
    fx
  );
  assert.equal(converted.bars.length, 0);
});

test('換算不要でも小数桁と出来高は揃える', () => {
  const series = normalizeSeries({
    bars: [{ date: '2024-01-04', open: 2500.123, high: 2560.98, low: 2480.04, close: 2540.55, volume: 1000.7 }],
    dividends: [{ date: '2024-01-04', amount: 30.456 }],
  });
  assert.deepEqual(series.bars[0], {
    date: '2024-01-04',
    open: 2500.1,
    high: 2561,
    low: 2480,
    close: 2540.6,
    volume: 1001,
  });
  assert.equal(series.dividends[0].amount, 30.46);
});

test('カレンダーは全銘柄の日付の和集合になる', () => {
  const calendar = buildCalendar([
    { bars: [{ date: '2024-01-04' }, { date: '2024-01-05' }] },
    { bars: [{ date: '2024-01-05' }, { date: '2024-01-08' }] },
  ]);
  assert.deepEqual(calendar, ['2024-01-04', '2024-01-05', '2024-01-08']);
});

test('Yahoo が失敗したら Stooq にフォールバックする', async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (url.includes('/v8/finance/chart/')) throw new Error('HTTP 429');
    return 'Date,Open,High,Low,Close,Volume\n2024-01-04,1,2,0.5,1.5,10\n';
  };
  const spec = { symbol: '7203', yahoo: '7203.T', stooq: '7203.jp' };
  const series = await fetchSeries(spec, { source: 'yahoo', from: '2024-01-01', to: '2024-01-31', fetcher });
  assert.equal(series.provider, 'stooq');
  assert.equal(series.bars.length, 1);
  assert.equal(calls.length, 2);
});

test('どちらの取得元も失敗したら理由をまとめて投げる', async () => {
  const fetcher = async () => {
    throw new Error('HTTP 503');
  };
  await assert.rejects(
    fetchSeries(
      { symbol: 'X', yahoo: 'X', stooq: 'x.us' },
      { source: 'yahoo', from: '2024-01-01', to: '2024-01-31', fetcher }
    ),
    /yahoo: HTTP 503 \/ stooq: HTTP 503/
  );
});

test('プリセットと個別指定の解決', () => {
  assert.equal(selectSpecs({ preset: 'jp' }).length, PRESETS.jp.length);
  assert.equal(selectSpecs({ preset: 'all', limit: 3 }).length, 3);
  assert.throws(() => selectSpecs({ preset: 'nope' }), /不明なプリセット/);

  const [toyota, unknown] = resolveSymbols(['7203', 'SPY']);
  assert.equal(toyota.name, 'トヨタ自動車');
  assert.equal(toyota.yahoo, '7203.T');
  assert.equal(toyota.lot, 100);
  assert.equal(unknown.market, 'US'); // 4 桁数字でなければ米国株として扱う
  assert.equal(unknown.lot, 1);
});

test('プリセットの銘柄コードは重複しない', () => {
  const symbols = PRESETS.all.map((s) => s.symbol);
  assert.equal(new Set(symbols).size, symbols.length);
});
