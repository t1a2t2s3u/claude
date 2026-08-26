#!/usr/bin/env node
// GitHub 上で公開されている S&P 500 の実データを data/ に取り込む CLI。
//
//   node tools/import-sp500.js              # 505 銘柄・5 年ぶん（約 30MB をダウンロード）
//   node tools/import-sp500.js --limit 20   # 動作確認用に先頭 20 銘柄だけ
//
// Yahoo / Stooq に出られないネットワークでも、GitHub にさえ届けば実データを用意できる。
// 出典:
//   価格   plotly/datasets の all_stocks_5yr.csv（Kaggle "S&P 500 stock data", CC0）
//          2013-02-08 〜 2018-02-07 の日足。配当イベントは含まれない
//   銘柄名 datasets/s-and-p-500-companies の constituents.csv（現在の構成銘柄なので、
//          当時と入れ替わった銘柄は名前を引けず、コードのまま表示される）

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const STOCKS_URL =
  process.env.STOCKSIM_SP500_STOCKS_URL ??
  'https://raw.githubusercontent.com/plotly/datasets/master/all_stocks_5yr.csv';
const NAMES_URL =
  process.env.STOCKSIM_SP500_NAMES_URL ??
  'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv';

// GICS セクターの日本語表示
const SECTOR_JA = {
  'Information Technology': '情報技術',
  'Health Care': 'ヘルスケア',
  Financials: '金融',
  'Consumer Discretionary': '一般消費財',
  'Communication Services': '通信サービス',
  Industrials: '資本財',
  'Consumer Staples': '生活必需品',
  Energy: 'エネルギー',
  Utilities: '公共事業',
  'Real Estate': '不動産',
  Materials: '素材',
  'Telecommunication Services': '通信サービス',
};

export function sectorJa(gics) {
  return SECTOR_JA[gics] ?? gics ?? '—';
}

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * all_stocks_5yr.csv（date,open,high,low,close,volume,Name）を
 * 銘柄コード -> 足の配列 に変換する。close のない行は捨て、
 * open/high/low の欠損は close で補って四本値の整合を保つ。
 */
export function parseAllStocksCsv(text) {
  const lines = text.split(/\r?\n/);
  const header = lines[0]?.trim().toLowerCase();
  if (header !== 'date,open,high,low,close,volume,name') {
    throw new Error(`想定外のヘッダ: ${lines[0]?.slice(0, 60)}`);
  }

  const bySymbol = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const [date, open, high, low, close, volume, symbol] = line.split(',');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !symbol) continue;

    const c = Number(close);
    if (!(c > 0)) continue;
    const o = Number(open) > 0 ? Number(open) : c;
    const h = Number(high) > 0 ? Number(high) : c;
    const l = Number(low) > 0 ? Number(low) : c;

    let bars = bySymbol.get(symbol);
    if (!bars) bySymbol.set(symbol, (bars = []));
    bars.push({
      date,
      open: round2(o),
      high: round2(Math.max(h, o, c)),
      low: round2(Math.min(l, o, c)),
      close: round2(c),
      volume: Math.round(Number(volume) || 0),
    });
  }

  for (const bars of bySymbol.values()) bars.sort((a, b) => a.date.localeCompare(b.date));
  return bySymbol;
}

/** constituents.csv から 銘柄コード -> { name, sector } を作る（引用符つき CSV に対応） */
export function parseConstituentsCsv(text) {
  const map = new Map();
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 3 || !cols[0]) continue;
    map.set(cols[0], { name: cols[1], sector: sectorJa(cols[2]) });
  }
  return map;
}

function splitCsvLine(line) {
  const cols = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') cols.push(cur), (cur = '');
    else cur += ch;
  }
  cols.push(cur);
  return cols;
}

/** 取り込み済みの構造（universe と 銘柄別ファイルの中身）を組み立てる */
export function buildImport(bySymbol, names, { limit = 0 } = {}) {
  // CSV 内の Yahoo 由来コード（BRK.B など）はドットをハイフンに寄せて表示を揃える
  let symbols = [...bySymbol.keys()].sort();
  if (limit > 0) symbols = symbols.slice(0, limit);

  const calendar = new Set();
  const entries = [];
  const files = [];

  for (const symbol of symbols) {
    const bars = bySymbol.get(symbol);
    for (const bar of bars) calendar.add(bar.date);
    const info = names.get(symbol) ?? names.get(symbol.replace('.', '-')) ?? null;

    files.push({
      file: `prices/${symbol.replace(/[^A-Za-z0-9._-]/g, '_')}.json`,
      json: {
        symbol,
        currency: 'USD',
        bars: bars.map((b) => [b.date, b.open, b.high, b.low, b.close, b.volume]),
        dividends: [],
      },
    });
    entries.push({
      symbol,
      name: info?.name ?? symbol,
      sector: info?.sector ?? '—',
      market: 'US',
      sourceCurrency: 'USD',
      lot: 1,
      file: files.at(-1).file,
      bars: bars.length,
      first: bars[0].date,
      last: bars.at(-1).date,
      lastClose: bars.at(-1).close,
      dividends: 0,
    });
  }

  const dates = [...calendar].sort();
  return {
    universe: {
      version: 1,
      generatedAt: new Date().toISOString(),
      source: 'sp500-github',
      baseCurrency: 'USD',
      from: dates[0],
      to: dates.at(-1),
      calendar: dates,
      symbols: entries,
    },
    files,
  };
}

/* ------------------------------------------------------------------ CLI */

async function download(url, label) {
  process.stdout.write(`${label} をダウンロード中… `);
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
  const text = await res.text();
  console.log(`${(text.length / 1e6).toFixed(1)}MB`);
  return text;
}

function parseArgs(argv) {
  const args = { out: 'data', limit: 0, stocksFile: null, namesFile: null };
  for (let i = 0; i < argv.length; i++) {
    const [key, inline] = argv[i].replace(/^--/, '').split('=');
    const value = inline ?? argv[++i];
    if (key === 'limit') args.limit = Number(value);
    else if (key === 'out') args.out = value;
    else if (key === 'stocks-file') args.stocksFile = value;
    else if (key === 'names-file') args.namesFile = value;
    else throw new Error(`不明なオプション: --${key}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const stocksText = args.stocksFile
    ? readFileSync(args.stocksFile, 'utf8')
    : await download(STOCKS_URL, 'S&P 500 日足 (約30MB)');
  const namesText = args.namesFile
    ? readFileSync(args.namesFile, 'utf8')
    : await download(NAMES_URL, '銘柄名一覧');

  const bySymbol = parseAllStocksCsv(stocksText);
  const names = parseConstituentsCsv(namesText);
  const { universe, files } = buildImport(bySymbol, names, { limit: args.limit });

  const outDir = resolve(ROOT, args.out);
  await rm(join(outDir, 'prices'), { recursive: true, force: true });
  await mkdir(join(outDir, 'prices'), { recursive: true });
  for (const f of files) await writeFile(join(outDir, f.file), JSON.stringify(f.json));
  await writeFile(join(outDir, 'universe.json'), JSON.stringify(universe));

  const named = universe.symbols.filter((s) => s.name !== s.symbol).length;
  console.log(
    `${universe.symbols.length} 銘柄 / ${universe.calendar.length} 営業日 ` +
      `(${universe.from} 〜 ${universe.to}) を ${args.out}/ に書き出しました（USD 建て）`
  );
  console.log(`銘柄名を引けたもの: ${named} / ${universe.symbols.length}（残りはコード表示）`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`失敗: ${e.message}`);
    process.exit(1);
  });
}
