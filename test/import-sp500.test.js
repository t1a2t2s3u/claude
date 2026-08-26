import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAllStocksCsv,
  parseConstituentsCsv,
  buildImport,
  sectorJa,
} from '../tools/import-sp500.js';

const STOCKS_CSV = [
  'date,open,high,low,close,volume,Name',
  '2013-02-08,67.71,68.40,66.89,67.85,158168400,AAPL',
  '2013-02-11,68.07,69.28,67.61,68.56,129029400,AAPL',
  '2013-02-08,,45.10,44.20,44.90,1000,MMM', // 始値欠損
  '2013-02-11,45.00,45.50,44.80,,2000,MMM', // 終値欠損 → 捨てる
  '2013-02-12,44.95,45.20,44.60,45.05,1500,MMM',
  'garbage line',
  '',
].join('\n');

const NAMES_CSV = [
  'Symbol,Security,GICS Sector,GICS Sub-Industry,Headquarters Location,Date added,CIK,Founded',
  'AAPL,Apple Inc.,Information Technology,"Technology Hardware, Storage & Peripherals","Cupertino, California",1982-11-30,320193,1977',
  'MMM,3M,Industrials,Industrial Conglomerates,"Saint Paul, Minnesota",1957-03-04,66740,1902',
].join('\n');

test('日足 CSV を銘柄別に分解し、欠損行を処理する', () => {
  const bySymbol = parseAllStocksCsv(STOCKS_CSV);
  assert.deepEqual([...bySymbol.keys()].sort(), ['AAPL', 'MMM']);
  assert.equal(bySymbol.get('AAPL').length, 2);
  assert.equal(bySymbol.get('MMM').length, 2); // 終値欠損の行は捨てる

  const gap = bySymbol.get('MMM')[0];
  assert.equal(gap.open, 44.9); // 始値欠損は終値で補う
  assert.ok(gap.high >= Math.max(gap.open, gap.close));
  assert.ok(gap.low <= Math.min(gap.open, gap.close));
});

test('ヘッダが想定と違う CSV は例外にする', () => {
  assert.throws(() => parseAllStocksCsv('a,b,c\n1,2,3'), /想定外のヘッダ/);
});

test('銘柄名一覧は引用符つき CSV として読める', () => {
  const names = parseConstituentsCsv(NAMES_CSV);
  assert.equal(names.get('AAPL').name, 'Apple Inc.');
  assert.equal(names.get('AAPL').sector, '情報技術');
  assert.equal(names.get('MMM').sector, '資本財');
});

test('GICS セクターは日本語になり、未知の値はそのまま通す', () => {
  assert.equal(sectorJa('Health Care'), 'ヘルスケア');
  assert.equal(sectorJa('Something New'), 'Something New');
  assert.equal(sectorJa(undefined), '—');
});

test('universe は日付の和集合をカレンダーとして持ち、USD 建てになる', () => {
  const { universe, files } = buildImport(parseAllStocksCsv(STOCKS_CSV), parseConstituentsCsv(NAMES_CSV));
  assert.equal(universe.baseCurrency, 'USD');
  assert.deepEqual(universe.calendar, ['2013-02-08', '2013-02-11', '2013-02-12']);
  assert.equal(universe.symbols.length, 2);

  const aapl = universe.symbols.find((s) => s.symbol === 'AAPL');
  assert.equal(aapl.name, 'Apple Inc.');
  assert.equal(aapl.lot, 1);
  assert.equal(aapl.lastClose, 68.56);

  const file = files.find((f) => f.json.symbol === 'AAPL');
  assert.deepEqual(file.json.bars[0], ['2013-02-08', 67.71, 68.4, 66.89, 67.85, 158168400]);
  assert.deepEqual(file.json.dividends, []);
});

test('名前を引けない銘柄はコードのまま載る', () => {
  const { universe } = buildImport(parseAllStocksCsv(STOCKS_CSV), new Map());
  assert.equal(universe.symbols.find((s) => s.symbol === 'AAPL').name, 'AAPL');
  assert.equal(universe.symbols.find((s) => s.symbol === 'AAPL').sector, '—');
});

test('limit で先頭 N 銘柄に絞れる', () => {
  const { universe } = buildImport(parseAllStocksCsv(STOCKS_CSV), new Map(), { limit: 1 });
  assert.equal(universe.symbols.length, 1);
  assert.equal(universe.symbols[0].symbol, 'AAPL'); // アルファベット順の先頭
});
