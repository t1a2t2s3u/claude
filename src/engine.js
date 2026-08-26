// シミュレーション本体。市場・ポートフォリオ・注文・履歴をまとめて 1 日ずつ進める。

import { createRng } from './rng.js';
import { createMarketState, stepMarket, changeRatio } from './market.js';
import { INSTRUMENTS, findInstrument } from './instruments.js';
import { nextTradingDay, isLastTradingDayOfMonth, parseIso } from './calendar.js';
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

export const SAVE_VERSION = 1;
export const DEFAULT_CASH = 3_000_000;
// ウォームアップ 60 営業日ぶんの足を作ると、ちょうど 2024-01-04 が取引開始日になる
export const HISTORY_START = '2023-10-05';
const WARMUP_DAYS = 60; // 開始前に用意しておく過去の足の本数
const MAX_BARS = 750; // 1 銘柄あたりに保持する足の上限
const SLIPPAGE = 0.0005; // 成行注文のスリッページ
const DIVIDEND_MONTHS = [3, 9]; // 権利確定月（各回、年間利回りの半分を支払う）

let orderSeq = 0;

export function createEngine({ seed = Math.floor(Math.random() * 1e9), cash = DEFAULT_CASH, startDate = HISTORY_START } = {}) {
  const rng = createRng(seed);
  const market = createMarketState();

  // ウォームアップ：開始日にたどり着くまでの過去チャートを先に作っておく
  let date = startDate;
  const warmupDates = [];
  for (let i = 0; i < WARMUP_DAYS; i++) warmupDates.push((date = nextTradingDay(date)));
  for (const d of warmupDates) stepMarket(market, rng, d);

  const portfolio = createPortfolio(cash);
  const state = {
    version: SAVE_VERSION,
    seed,
    rngState: rng.getState(),
    date,
    startDate: date,
    market,
    portfolio,
    orders: [], // 未約定の指値注文
    news: [],
    equity: [{ date, value: cash }],
  };
  return state;
}

function rngFor(state) {
  const rng = createRng(state.seed);
  rng.setState(state.rngState);
  return rng;
}

/** symbol -> 現在値 */
export function currentPrices(state) {
  const prices = {};
  for (const inst of INSTRUMENTS) prices[inst.symbol] = state.market.instruments[inst.symbol].last;
  return prices;
}

export function snapshot(state) {
  return evaluate(state.portfolio, currentPrices(state));
}

/** 銘柄一覧（現在値・前日比・保有株数つき） */
export function quotes(state) {
  return INSTRUMENTS.map((inst) => {
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

/* ------------------------------------------------------------------ 注文 */

/** 成行注文。その場で約定させる（スリッページあり） */
export function placeMarketOrder(state, { symbol, side, qty }) {
  const inst = findInstrument(symbol);
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
  const inst = findInstrument(symbol);
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
    const inst = findInstrument(order.symbol);
    const hit =
      order.side === 'buy' ? bar.low <= order.limit : bar.high >= order.limit;

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

function payDividends(state, date) {
  const month = parseIso(date).getUTCMonth() + 1;
  if (!DIVIDEND_MONTHS.includes(month) || !isLastTradingDayOfMonth(date)) return [];

  const paid = [];
  for (const inst of INSTRUMENTS) {
    const qty = heldQty(state.portfolio, inst.symbol);
    if (qty === 0 || inst.yield_ <= 0) continue;
    const perShare = Math.round(state.market.instruments[inst.symbol].last * (inst.yield_ / 2) * 10) / 10;
    if (perShare <= 0) continue;
    paid.push(applyDividend(state.portfolio, { date, symbol: inst.symbol, name: inst.name, qty, perShare }));
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
  for (const inst of INSTRUMENTS) {
    const m = state.market.instruments[inst.symbol];
    if (m.bars.length > MAX_BARS) m.bars = m.bars.slice(-MAX_BARS);
  }
}

/** 1 営業日進める */
export function step(state) {
  const rng = rngFor(state);
  const date = nextTradingDay(state.date);

  const news = stepMarket(state.market, rng, date);
  state.rngState = rng.getState();
  state.date = date;

  const fills = fillOrders(state, date);
  const dividends = payDividends(state, date);

  state.news.push(...news);
  if (state.news.length > 300) state.news = state.news.slice(-300);
  trimBars(state);
  refreshEquity(state);

  return { date, news, fills, dividends };
}

/** n 営業日まとめて進める */
export function stepDays(state, n) {
  const results = [];
  for (let i = 0; i < n; i++) results.push(step(state));
  return results;
}
