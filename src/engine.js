// シミュレーション本体。市場・ポートフォリオ・注文・履歴をまとめて 1 日ずつ進める。
//
// モードは 2 つある。
//   'sim'  … market.js が乱数から相場を生成する架空市場
//   'real' … data/ に取り込んだ実データを、その日の足として順に再生する
// どちらのモードでも state の形は同じなので、注文・配当・集計・描画は共通のまま動く。

import { createRng } from './rng.js';
import { createMarketState, stepMarket, changeRatio } from './market.js';
import { INSTRUMENTS } from './instruments.js';
import { nextTradingDay, isLastTradingDayOfMonth, parseIso } from './calendar.js';
import { toInstruments } from './dataset.js';
import {
  createPortfolio,
  applyBuy,
  applySell,
  applyDividend,
  validateBuy,
  validateSell,
  evaluate,
  heldQty,
} from './portfolio.js';

export const SAVE_VERSION = 2;
export const DEFAULT_CASH = 3_000_000;
// ウォームアップ 60 営業日ぶんの足を作ると、ちょうど 2024-01-04 が取引開始日になる
export const HISTORY_START = '2023-10-05';
const WARMUP_DAYS = 60; // 開始前に用意しておく過去の足の本数
const MAX_BARS = 750; // 1 銘柄あたりに保持する足の上限
const SLIPPAGE = 0.0005; // 成行注文のスリッページ
const DIVIDEND_MONTHS = [3, 9]; // 架空市場の権利確定月（年間利回りの半分を支払う）
const MOVER_THRESHOLD = 0.03; // 実データモードで「値動き」に載せる変動率

let orderSeq = 0;

/* ------------------------------------------------------- 架空市場モード */

export function createEngine({
  seed = Math.floor(Math.random() * 1e9),
  cash = DEFAULT_CASH,
  startDate = HISTORY_START,
} = {}) {
  const rng = createRng(seed);
  const market = createMarketState(INSTRUMENTS);

  // ウォームアップ：開始日にたどり着くまでの過去チャートを先に作っておく
  let date = startDate;
  const warmupDates = [];
  for (let i = 0; i < WARMUP_DAYS; i++) warmupDates.push((date = nextTradingDay(date)));
  for (const d of warmupDates) stepMarket(market, rng, d, INSTRUMENTS);

  return {
    version: SAVE_VERSION,
    mode: 'sim',
    instruments: INSTRUMENTS,
    seed,
    rngState: rng.getState(),
    date,
    startDate: date,
    market,
    portfolio: createPortfolio(cash),
    orders: [],
    news: [],
    equity: [{ date, value: cash }],
  };
}

/* --------------------------------------------------------- 実データモード */

/**
 * 実データを再生するエンジンを作る。
 * startIndex はカレンダー上の取引開始位置で、そこまでの足は履歴として先に流し込む。
 */
export function createRealEngine(dataset, { cash = DEFAULT_CASH, startIndex } = {}) {
  const instruments = toInstruments(dataset.universe);
  const calendar = dataset.calendar;
  const cursor = clamp(startIndex ?? Math.max(0, calendar.length - 750), 1, calendar.length - 1);

  const market = createMarketState(instruments);
  // ウォームアップぶんの足を流し込む（チャートの初期表示に使う）
  const warmupFrom = Math.max(0, cursor - WARMUP_DAYS);
  for (let i = warmupFrom; i <= cursor; i++) {
    appendRealBars(market, instruments, dataset, calendar[i]);
  }

  const date = calendar[cursor];
  return {
    version: SAVE_VERSION,
    mode: 'real',
    instruments,
    dataset: {
      source: dataset.universe.source,
      generatedAt: dataset.universe.generatedAt,
      baseCurrency: dataset.universe.baseCurrency,
      symbols: dataset.universe.symbols.length,
    },
    cursor,
    date,
    startDate: date,
    market,
    portfolio: createPortfolio(cash),
    orders: [],
    news: [],
    equity: [{ date, value: cash }],
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** その日の実データの足を各銘柄に追加する。休場でデータがない銘柄は据え置く */
function appendRealBars(market, instruments, dataset, date) {
  const moves = [];
  for (const inst of instruments) {
    const bar = dataset.barAt(inst.symbol, date);
    if (!bar) continue;
    const state = market.instruments[inst.symbol];
    const prev = state.last;
    state.bars.push(bar);
    state.last = bar.close;
    if (prev > 0) moves.push({ inst, change: bar.close / prev - 1 });
  }

  if (moves.length > 0) {
    const avg = moves.reduce((a, m) => a + Math.log(1 + m.change), 0) / moves.length;
    market.index = Math.round(market.index * Math.exp(avg) * 10) / 10;
  }
  return moves;
}

/** 実データモードでは、大きく動いた銘柄を「値動き」として記録する */
function moversFeed(moves, date) {
  return moves
    .filter((m) => Math.abs(m.change) >= MOVER_THRESHOLD)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 5)
    .map((m) => ({
      date,
      scope: 'move',
      symbol: m.inst.symbol,
      text: `${m.inst.name}が${m.change > 0 ? '大幅高' : '大幅安'}`,
      impact: m.change,
    }));
}

/* ------------------------------------------------------------------ 共通 */

function rngFor(state) {
  const rng = createRng(state.seed);
  rng.setState(state.rngState);
  return rng;
}

export function findInstrument(state, symbol) {
  return state.instruments.find((i) => i.symbol === symbol) ?? null;
}

/** symbol -> 現在値 */
export function currentPrices(state) {
  const prices = {};
  for (const inst of state.instruments) prices[inst.symbol] = state.market.instruments[inst.symbol].last;
  return prices;
}

export function snapshot(state) {
  return evaluate(state.portfolio, currentPrices(state));
}

/** 銘柄一覧（現在値・前日比・保有株数つき） */
export function quotes(state) {
  return state.instruments.map((inst) => {
    const m = state.market.instruments[inst.symbol];
    return {
      ...inst,
      last: m.last,
      change: changeRatio(m.bars),
      bars: m.bars,
      qty: heldQty(state.portfolio, inst.symbol),
    };
  });
}

/** 再生できる日がまだ残っているか */
export function isAtEnd(state, dataset) {
  return state.mode === 'real' && (!dataset || state.cursor >= dataset.calendar.length - 1);
}

/* ------------------------------------------------------------------ 注文 */

/** 成行注文。その場で約定させる（スリッページあり） */
export function placeMarketOrder(state, { symbol, side, qty }) {
  const inst = findInstrument(state, symbol);
  if (!inst) return { ok: false, reason: '銘柄が見つかりません' };

  const base = state.market.instruments[symbol].last;
  const price = Math.round(base * (1 + (side === 'buy' ? SLIPPAGE : -SLIPPAGE)) * 10) / 10;

  const check =
    side === 'buy'
      ? validateBuy(state.portfolio, { price, qty, lot: inst.lot })
      : validateSell(state.portfolio, { symbol, qty, lot: inst.lot });
  if (!check.ok) return check;

  const args = { date: state.date, symbol, name: inst.name, qty, price };
  const trade = side === 'buy' ? applyBuy(state.portfolio, args) : applySell(state.portfolio, args);
  refreshEquity(state);
  return { ok: true, trade };
}

/** 指値注文。翌営業日以降、値幅が条件を満たした日に約定する */
export function placeLimitOrder(state, { symbol, side, qty, limit }) {
  const inst = findInstrument(state, symbol);
  if (!inst) return { ok: false, reason: '銘柄が見つかりません' };
  if (!Number.isFinite(limit) || limit <= 0) return { ok: false, reason: '指値を入力してください' };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: '数量を入力してください' };
  if (qty % inst.lot !== 0) return { ok: false, reason: `売買単位は${inst.lot}株です` };
  if (side === 'sell' && qty > heldQty(state.portfolio, symbol)) {
    return { ok: false, reason: '保有株数が不足しています' };
  }

  const order = {
    id: `o${Date.now().toString(36)}${(orderSeq++).toString(36)}`,
    symbol,
    name: inst.name,
    side,
    qty,
    limit: Math.round(limit * 10) / 10,
    placedAt: state.date,
  };
  state.orders.push(order);
  return { ok: true, order };
}

export function cancelOrder(state, id) {
  const before = state.orders.length;
  state.orders = state.orders.filter((o) => o.id !== id);
  return state.orders.length !== before;
}

/** その日の足に対して指値注文を約定させる */
function fillOrders(state, date) {
  const fills = [];
  const remaining = [];

  for (const order of state.orders) {
    const bar = lastBar(state, order.symbol);
    const inst = findInstrument(state, order.symbol);

    // 実データモードでは、その銘柄が休場でその日の足がないことがある
    if (!bar || bar.date !== date) {
      remaining.push(order);
      continue;
    }

    const hit = order.side === 'buy' ? bar.low <= order.limit : bar.high >= order.limit;
    if (!hit) {
      remaining.push(order);
      continue;
    }

    // 寄り付きで既に指値を超えていれば、より有利な始値で約定する
    const price =
      order.side === 'buy' ? Math.min(order.limit, bar.open) : Math.max(order.limit, bar.open);

    const check =
      order.side === 'buy'
        ? validateBuy(state.portfolio, { price, qty: order.qty, lot: inst.lot })
        : validateSell(state.portfolio, { symbol: order.symbol, qty: order.qty, lot: inst.lot });

    if (!check.ok) {
      // 資金や株数が足りなければ失効させる（残しても永久に約定しないため）
      fills.push({ order, expired: true, reason: check.reason, date });
      continue;
    }

    const args = { date, symbol: order.symbol, name: order.name, qty: order.qty, price };
    const trade =
      order.side === 'buy' ? applyBuy(state.portfolio, args) : applySell(state.portfolio, args);
    fills.push({ order, trade, date });
  }

  state.orders = remaining;
  return fills;
}

/* ------------------------------------------------------------------ 進行 */

function lastBar(state, symbol) {
  const bars = state.market.instruments[symbol].bars;
  return bars[bars.length - 1];
}

/** 架空市場：3 月・9 月の月末営業日に、年間利回りの半分を支払う */
function payDividendsSim(state, date) {
  const month = parseIso(date).getUTCMonth() + 1;
  if (!DIVIDEND_MONTHS.includes(month) || !isLastTradingDayOfMonth(date)) return [];

  const paid = [];
  for (const inst of state.instruments) {
    const qty = heldQty(state.portfolio, inst.symbol);
    if (qty === 0 || !inst.yield_) continue;
    const perShare =
      Math.round(state.market.instruments[inst.symbol].last * (inst.yield_ / 2) * 10) / 10;
    if (perShare <= 0) continue;
    paid.push(
      applyDividend(state.portfolio, { date, symbol: inst.symbol, name: inst.name, qty, perShare })
    );
  }
  return paid;
}

/** 実データ：実際の権利落ち日に、実際の 1 株あたり配当を支払う */
function payDividendsReal(state, dataset, date) {
  const paid = [];
  for (const inst of state.instruments) {
    const qty = heldQty(state.portfolio, inst.symbol);
    if (qty === 0) continue;
    const perShare = dataset.dividendAt(inst.symbol, date);
    if (!perShare) continue;
    paid.push(
      applyDividend(state.portfolio, { date, symbol: inst.symbol, name: inst.name, qty, perShare })
    );
  }
  return paid;
}

function refreshEquity(state) {
  const { equity } = snapshot(state);
  const last = state.equity[state.equity.length - 1];
  if (last && last.date === state.date) last.value = equity;
  else state.equity.push({ date: state.date, value: equity });
}

function trimBars(state) {
  for (const inst of state.instruments) {
    const m = state.market.instruments[inst.symbol];
    if (m.bars.length > MAX_BARS) m.bars = m.bars.slice(-MAX_BARS);
  }
}

/**
 * 1 営業日進める。実データモードでは dataset が必要。
 * 再生できる日が残っていなければ null を返す。
 */
export function step(state, dataset = null) {
  let date;
  let news;

  if (state.mode === 'real') {
    if (!dataset) throw new Error('実データモードには dataset が必要です');
    if (state.cursor >= dataset.calendar.length - 1) return null;
    date = dataset.calendar[++state.cursor];
    news = moversFeed(appendRealBars(state.market, state.instruments, dataset, date), date);
  } else {
    const rng = rngFor(state);
    date = nextTradingDay(state.date);
    news = stepMarket(state.market, rng, date, state.instruments);
    state.rngState = rng.getState();
  }

  state.date = date;

  const fills = fillOrders(state, date);
  const dividends =
    state.mode === 'real' ? payDividendsReal(state, dataset, date) : payDividendsSim(state, date);

  state.news.push(...news);
  if (state.news.length > 300) state.news = state.news.slice(-300);
  trimBars(state);
  refreshEquity(state);

  return { date, news, fills, dividends };
}

/** n 営業日まとめて進める。データの終端に達したらそこで止まる */
export function stepDays(state, n, dataset = null) {
  const results = [];
  for (let i = 0; i < n; i++) {
    const result = step(state, dataset);
    if (!result) break;
    results.push(result);
  }
  return results;
}

/**
 * 保存された実データモードの state を、読み直したデータセットに合わせ直す。
 * 取り込み直して日付が増えていても、日付から位置を引き直せば続きから遊べる。
 */
export function rebindDataset(state, dataset) {
  if (state.mode !== 'real') return { ok: true };
  const cursor = dataset.calendar.indexOf(state.date);
  if (cursor < 0) return { ok: false, reason: '保存時のデータと日付が合いません' };
  state.cursor = cursor;
  state.dataset = {
    source: dataset.universe.source,
    generatedAt: dataset.universe.generatedAt,
    baseCurrency: dataset.universe.baseCurrency,
    symbols: dataset.universe.symbols.length,
  };
  return { ok: true };
}
