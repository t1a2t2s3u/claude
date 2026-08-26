#!/usr/bin/env node
// 実在する銘柄の日足を取得して data/ 配下に書き出す CLI。
//
//   node tools/fetch-prices.js --preset jp --years 10
//   node tools/fetch-prices.js --symbols 7203,6758,AAPL --source stooq
//
// 取得元は Yahoo Finance（配当・分割イベント付き）と Stooq（CSV）の 2 系統。
// Yahoo が失敗した銘柄は自動で Stooq にフォールバックする。
// 外貨建ての銘柄は、取得時点でその日の為替レートを使って基準通貨へ換算しておく
// （アプリ側を単一通貨に保つため。実行時に換算すると state に為替が必要になる）。

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { PRESETS, resolveSymbols } from './tickers.js';

const ROOT = resolve(import.meta.dirname, '..');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* ------------------------------------------------------------------ 解析 */

const round = (v, digits) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** Stooq の CSV（Date,Open,High,Low,Close,Volume）を足の配列にする */
export function parseStooqCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || !/^date,/i.test(lines[0])) {
    throw new Error(`想定外の CSV: ${text.slice(0, 80)}`);
  }

  const bars = [];
  for (const line of lines.slice(1)) {
    const [date, open, high, low, close, volume] = line.split(',');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const bar = {
      date,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume ?? 0),
    };
    if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) continue;
    if (bar.close <= 0) continue;
    if (!Number.isFinite(bar.volume)) bar.volume = 0;
    bars.push(bar);
  }
  return { bars, dividends: [], meta: {} };
}

const isoFromEpoch = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 10);

/** Yahoo Finance の chart レスポンスを足・配当の配列にする */
export function parseYahooChart(json) {
  const error = json?.chart?.error;
  if (error) throw new Error(`${error.code}: ${error.description}`);

  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('chart.result が空');

  const stamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const bars = [];

  for (let i = 0; i < stamps.length; i++) {
    const close = quote.close?.[i];
    if (close == null) continue; // 休場・欠損日は null で返る
    const open = quote.open?.[i] ?? close;
    const high = quote.high?.[i] ?? close;
    const low = quote.low?.[i] ?? close;
    if (!(close > 0)) continue;
    bars.push({
      date: isoFromEpoch(stamps[i]),
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume: quote.volume?.[i] ?? 0,
    });
  }

  const dividends = Object.values(result.events?.dividends ?? {})
    .map((d) => ({ date: isoFromEpoch(d.date), amount: d.amount }))
    .filter((d) => d.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    bars,
    dividends,
    meta: {
      currency: result.meta?.currency,
      name: result.meta?.longName ?? result.meta?.shortName,
    },
  };
}

/** 日付 → レートの表を作る。参照時は直近の値を前方補完する */
export function buildFxMap(bars) {
  const map = new Map();
  for (const bar of bars) map.set(bar.date, bar.close);
  const dates = [...map.keys()].sort();

  return {
    size: map.size,
    rateAt(date) {
      if (map.has(date)) return map.get(date);
      // その日のレートがなければ直近の営業日まで遡る
      let lo = 0;
      let hi = dates.length - 1;
      let found = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (dates[mid] <= date) {
          found = dates[mid];
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return found == null ? null : map.get(found);
    },
  };
}

/** 足と配当を基準通貨に換算する。レートが引けない日は落とす */
export function convertToBase(series, fx, digits = 1) {
  const bars = [];
  for (const bar of series.bars) {
    const rate = fx.rateAt(bar.date);
    if (rate == null) continue;
    bars.push({
      date: bar.date,
      open: round(bar.open * rate, digits),
      high: round(bar.high * rate, digits),
      low: round(bar.low * rate, digits),
      close: round(bar.close * rate, digits),
      volume: Math.round(bar.volume),
    });
  }

  const dividends = series.dividends
    .map((d) => ({ date: d.date, amount: round(d.amount * (fx.rateAt(d.date) ?? 0), 2) }))
    .filter((d) => d.amount > 0);

  return { ...series, bars, dividends };
}

/** 換算不要な銘柄でも、小数桁と出来高の整数化だけは揃えておく */
export function normalizeSeries(series, digits = 1) {
  return {
    ...series,
    bars: series.bars.map((bar) => ({
      date: bar.date,
      open: round(bar.open, digits),
      high: round(bar.high, digits),
      low: round(bar.low, digits),
      close: round(bar.close, digits),
      volume: Math.round(bar.volume ?? 0),
    })),
    dividends: series.dividends.map((d) => ({ date: d.date, amount: round(d.amount, 2) })),
  };
}

/** 全銘柄の日付の和集合を、営業日カレンダーとして返す */
export function buildCalendar(seriesList) {
  const dates = new Set();
  for (const series of seriesList) for (const bar of series.bars) dates.add(bar.date);
  return [...dates].sort();
}

/* ------------------------------------------------------------------ 取得 */

async function fetchWithRetry(url, { retries = 3, timeout = 20_000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: '*/*' },
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// テストやミラー利用のため、取得元のベース URL は環境変数で差し替えられる
const YAHOO_BASE = process.env.STOCKSIM_YAHOO_BASE ?? 'https://query1.finance.yahoo.com';
const STOOQ_BASE = process.env.STOCKSIM_STOOQ_BASE ?? 'https://stooq.com';

function yahooUrl(symbol, from, to) {
  const p1 = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
  const p2 = Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000);
  return `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?period1=${p1}&period2=${p2}&interval=1d&events=div%2Csplit`;
}

function stooqUrl(symbol, from, to) {
  const compact = (iso) => iso.replace(/-/g, '');
  return `${STOOQ_BASE}/q/d/l/?s=${encodeURIComponent(symbol)}&i=d&d1=${compact(
    from
  )}&d2=${compact(to)}`;
}

/** 1 銘柄ぶんの時系列を取得する。yahoo → stooq の順にフォールバックする */
export async function fetchSeries(spec, { source, from, to, fetcher = fetchWithRetry }) {
  const order = source === 'stooq' ? ['stooq', 'yahoo'] : ['yahoo', 'stooq'];
  const errors = [];

  for (const provider of order) {
    try {
      if (provider === 'yahoo') {
        const text = await fetcher(yahooUrl(spec.yahoo, from, to));
        const series = parseYahooChart(JSON.parse(text));
        if (series.bars.length === 0) throw new Error('足が 0 本');
        return { ...series, provider };
      }
      const text = await fetcher(stooqUrl(spec.stooq, from, to));
      const series = parseStooqCsv(text);
      if (series.bars.length === 0) throw new Error('足が 0 本');
      return { ...series, provider };
    } catch (e) {
      errors.push(`${provider}: ${e.message}`);
    }
  }
  throw new Error(errors.join(' / '));
}

/** 並列数を絞って順に処理する */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/* ------------------------------------------------------------------ CLI */

function parseArgs(argv) {
  const args = { preset: 'jp', years: 10, source: 'yahoo', base: 'JPY', out: 'data', limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const [key, inline] = argv[i].replace(/^--/, '').split('=');
    const value = inline ?? argv[++i];
    if (key === 'symbols') args.symbols = value.split(',').filter(Boolean);
    else if (key === 'years') args.years = Number(value);
    else if (key in args) args[key] = key === 'limit' ? Number(value) : value;
    else throw new Error(`不明なオプション: --${key}`);
  }
  return args;
}

export function selectSpecs(args) {
  const specs = args.symbols ? resolveSymbols(args.symbols) : PRESETS[args.preset];
  if (!specs) throw new Error(`不明なプリセット: ${args.preset}（jp / us / all）`);
  return args.limit > 0 ? specs.slice(0, args.limit) : specs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const specs = selectSpecs(args);

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - args.years * 365.25 * 864e5).toISOString().slice(0, 10);
  const outDir = resolve(ROOT, args.out);

  console.log(`取得対象 ${specs.length} 銘柄 / ${from} 〜 ${to} / source=${args.source}`);

  // 外貨建ての銘柄があれば、先に為替を取得しておく
  const needFx = specs.some((s) => s.currency !== args.base);
  let fx = null;
  if (needFx) {
    const pair = { symbol: `USD${args.base}`, yahoo: `${args.base}=X`, stooq: `usd${args.base.toLowerCase()}` };
    process.stdout.write(`為替 ${pair.symbol} … `);
    const series = await fetchSeries(pair, { source: args.source, from, to });
    fx = buildFxMap(series.bars);
    console.log(`${fx.size} 営業日ぶん取得`);
  }

  const failures = [];
  const fetched = await mapLimit(specs, 4, async (spec) => {
    try {
      const raw = await fetchSeries(spec, { source: args.source, from, to });
      await sleep(120); // 提供元に負荷をかけないよう少し間を空ける
      const series =
        spec.currency === args.base ? normalizeSeries(raw) : convertToBase(raw, fx);
      console.log(
        `  ${spec.symbol.padEnd(6)} ${String(series.bars.length).padStart(5)}本  ` +
          `${series.bars.at(-1)?.date}  配当${series.dividends.length}件  (${raw.provider})`
      );
      return { spec, series };
    } catch (e) {
      failures.push(`${spec.symbol}: ${e.message}`);
      return null;
    }
  });

  const ok = fetched.filter(Boolean);
  if (ok.length === 0) throw new Error(`1 銘柄も取得できませんでした\n${failures.join('\n')}`);

  await rm(join(outDir, 'prices'), { recursive: true, force: true });
  await mkdir(join(outDir, 'prices'), { recursive: true });

  const symbols = [];
  for (const { spec, series } of ok) {
    const slug = spec.symbol.replace(/[^A-Za-z0-9._-]/g, '_');
    const file = `prices/${slug}.json`;
    await writeFile(
      join(outDir, file),
      JSON.stringify({
        symbol: spec.symbol,
        currency: args.base,
        // 容量を抑えるため [日付, 始値, 高値, 安値, 終値, 出来高] の配列で持つ
        bars: series.bars.map((b) => [b.date, b.open, b.high, b.low, b.close, b.volume]),
        dividends: series.dividends.map((d) => [d.date, d.amount]),
      })
    );
    symbols.push({
      symbol: spec.symbol,
      name: series.meta?.name && spec.name === spec.symbol ? series.meta.name : spec.name,
      sector: spec.sector,
      market: spec.market,
      sourceCurrency: spec.currency,
      lot: spec.lot,
      file,
      bars: series.bars.length,
      first: series.bars[0].date,
      last: series.bars.at(-1).date,
      lastClose: series.bars.at(-1).close,
      dividends: series.dividends.length,
    });
  }

  const calendar = buildCalendar(ok.map((x) => x.series));
  const universe = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: args.source,
    baseCurrency: args.base,
    from: calendar[0],
    to: calendar.at(-1),
    calendar,
    symbols,
  };
  await writeFile(join(outDir, 'universe.json'), JSON.stringify(universe));

  console.log(
    `\n${symbols.length} 銘柄 / ${calendar.length} 営業日 (${universe.from} 〜 ${universe.to}) を ${args.out}/ に書き出しました`
  );
  if (failures.length) console.log(`取得できなかった銘柄:\n  ${failures.join('\n  ')}`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`失敗: ${e.message}`);
    process.exit(1);
  });
}
