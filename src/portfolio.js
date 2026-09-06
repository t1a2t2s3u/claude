// 保有ポジションと現金の管理。取得単価は移動平均法で更新する。
//
// 建玉は符号付きの qty ひとつで持つ（正＝現物の買い、負＝空売りの売建）。
// ひとつの注文でゼロをまたぐ（ドテンする）ことは禁止し、検証側で弾く。

import { roundMoney } from './format.js';

// 空売りの建玉上限。保証金率 30% ＝ 総資産の約 3.3 倍まで建てられる
export const MARGIN_RATIO = 0.3;

// 手数料は通貨ごとに下限・上限が違う（円は 55〜1,100 円、ドルは 0.5〜8 ドル）。
// 最小単位（円 / セント）への丸めは format.js の roundMoney に一元化している
export const FEES = {
  JPY: { rate: 0.001, min: 55, max: 1100 },
  USD: { rate: 0.001, min: 0.5, max: 8 },
};

export function commission(notional, currency = 'JPY') {
  const fee = FEES[currency] ?? FEES.JPY;
  return roundMoney(Math.min(fee.max, Math.max(fee.min, notional * fee.rate)), currency);
}

export function createPortfolio(cash) {
  return {
    initialCash: cash,
    cash,
    positions: {}, // symbol -> { symbol, qty, avgCost }
    realized: 0, // 実現損益（手数料控除前）
    fees: 0, // 支払手数料の累計
    dividends: 0, // 受取配当の累計
    trades: [], // 約定・入出金の履歴（新しいものが末尾）
  };
}

export function getPosition(portfolio, symbol) {
  return portfolio.positions[symbol] ?? null;
}

export function heldQty(portfolio, symbol) {
  return portfolio.positions[symbol]?.qty ?? 0;
}

/** 買付に必要な総額（約定代金＋手数料） */
export function buyCost(price, qty, currency = 'JPY') {
  const notional = price * qty;
  return notional + commission(notional, currency);
}

/** 買えるか検証する。ok:false のときは reason に日本語の理由が入る */
export function validateBuy(portfolio, { symbol, price, qty, lot = 100, currency = 'JPY' }) {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: '数量を入力してください' };
  if (qty % lot !== 0) return { ok: false, reason: `売買単位は${lot}株です` };
  if (!(price > 0)) return { ok: false, reason: 'この日はまだ取引できません' };

  // 売建がある銘柄の買いは買い戻し。ひとつの注文でドテン（売建→買建）はしない
  const held = symbol ? heldQty(portfolio, symbol) : 0;
  if (held < 0 && qty > -held) {
    return { ok: false, reason: `買い戻せるのは売建の${-held}株までです` };
  }

  const cost = buyCost(price, qty, currency);
  if (cost > portfolio.cash) return { ok: false, reason: '現金が不足しています' };
  return { ok: true };
}

export function validateSell(portfolio, { symbol, qty, lot = 100 }) {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: '数量を入力してください' };
  if (qty % lot !== 0) return { ok: false, reason: `売買単位は${lot}株です` };
  if (qty > Math.max(0, heldQty(portfolio, symbol))) {
    return { ok: false, reason: '保有株数が不足しています' };
  }
  return { ok: true };
}

/**
 * 空売りの検証。equity と shortTotal（既存の売建の想定元本）は
 * 時価が要るので呼び出し側（engine）で計算して渡す
 */
export function validateShort(portfolio, { symbol, price, qty, lot = 100, equity, shortTotal }) {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: '数量を入力してください' };
  if (qty % lot !== 0) return { ok: false, reason: `売買単位は${lot}株です` };
  if (!(price > 0)) return { ok: false, reason: 'この日はまだ取引できません' };
  if (heldQty(portfolio, symbol) > 0) {
    return { ok: false, reason: '現物を保有中の銘柄は空売りできません（先に売却してください）' };
  }
  if (shortTotal + price * qty > shortCapacity(equity)) {
    return { ok: false, reason: '保証金が不足しています（売建の上限を超えます）' };
  }
  return { ok: true };
}

/** 総資産に対して建てられる売建の上限（想定元本ベース） */
export function shortCapacity(equity) {
  return Math.max(0, equity) / MARGIN_RATIO;
}

/** 既存の売建の想定元本の合計。prices は symbol -> 現在値 */
export function shortNotional(portfolio, prices) {
  let total = 0;
  for (const pos of Object.values(portfolio.positions)) {
    if (pos.qty < 0) total += -pos.qty * (prices[pos.symbol] ?? pos.avgCost);
  }
  return total;
}

/** 建玉に符号付きの数量変化を適用し、決済ぶんの実現損益を返す（ゼロまたぎは検証済み前提） */
function applyDelta(portfolio, symbol, delta, price) {
  const pos = portfolio.positions[symbol] ?? { symbol, qty: 0, avgCost: 0 };
  let pnl = 0;

  if (pos.qty === 0 || Math.sign(delta) === Math.sign(pos.qty)) {
    // 新規・積み増し：平均建値を更新する
    const size = Math.abs(pos.qty) + Math.abs(delta);
    pos.avgCost = (pos.avgCost * Math.abs(pos.qty) + price * Math.abs(delta)) / size;
    pos.qty += delta;
  } else {
    // 決済：買建なら (売値 - 建値)、売建なら (建値 - 買値) が実現損益になる
    pnl = (price - pos.avgCost) * Math.abs(delta) * Math.sign(pos.qty);
    pos.qty += delta;
  }

  if (pos.qty === 0) delete portfolio.positions[symbol];
  else portfolio.positions[symbol] = pos;
  return pnl;
}

/** 買い約定を反映する。売建があれば買い戻し（決済）になる。呼ぶ前に validateBuy を通すこと */
export function applyBuy(portfolio, { date, symbol, name, qty, price, currency = 'JPY' }) {
  const notional = price * qty;
  const fee = commission(notional, currency);
  const covering = (portfolio.positions[symbol]?.qty ?? 0) < 0;

  // セント刻みの積み重ねで現金に浮動小数点の誤差が残ると、
  // 表示上は足りる注文が資金不足で弾かれるため、毎回最小単位に丸め直す
  portfolio.cash = roundMoney(portfolio.cash - (notional + fee), currency);
  portfolio.fees += fee;

  const pnl = applyDelta(portfolio, symbol, qty, price);
  portfolio.realized += pnl;

  const trade = {
    date,
    type: covering ? 'cover' : 'buy',
    symbol,
    name,
    qty,
    price,
    amount: -(notional + fee),
    fee,
    pnl,
  };
  portfolio.trades.push(trade);
  return trade;
}

/**
 * 売り約定を反映する。買建があれば現物の売却、なければ空売りの新規建てになる。
 * 呼ぶ前に validateSell（現物売り）か validateShort（空売り）を通すこと
 */
export function applySell(portfolio, { date, symbol, name, qty, price, currency = 'JPY' }) {
  const notional = price * qty;
  const fee = commission(notional, currency);
  const closing = (portfolio.positions[symbol]?.qty ?? 0) > 0;

  portfolio.cash = roundMoney(portfolio.cash + (notional - fee), currency);
  portfolio.fees += fee;

  const pnl = applyDelta(portfolio, symbol, -qty, price);
  portfolio.realized += pnl;

  const trade = {
    date,
    type: closing ? 'sell' : 'short',
    symbol,
    name,
    qty,
    price,
    amount: notional - fee,
    fee,
    pnl,
  };
  portfolio.trades.push(trade);
  return trade;
}

/** 配当の入出金。qty が負（売建）のときは配当落調整金として支払う側になる */
export function applyDividend(portfolio, { date, symbol, name, qty, perShare, currency = 'JPY' }) {
  const amount = roundMoney(perShare * qty, currency);
  portfolio.cash = roundMoney(portfolio.cash + amount, currency);
  portfolio.dividends += amount;
  const trade = { date, type: 'dividend', symbol, name, qty, price: perShare, amount, fee: 0, pnl: 0 };
  portfolio.trades.push(trade);
  return trade;
}

/**
 * 時価評価。prices は symbol -> 現在値。
 * qty が負の売建でも value/basis が符号付きで効くので、
 * equity = cash + Σ value、評価損益 = value - basis がそのまま成り立つ
 */
export function evaluate(portfolio, prices) {
  let marketValue = 0;
  let cost = 0;
  const rows = [];

  for (const pos of Object.values(portfolio.positions)) {
    const last = prices[pos.symbol] ?? pos.avgCost;
    const value = last * pos.qty;
    const basis = pos.avgCost * pos.qty;
    marketValue += value;
    cost += basis;
    rows.push({
      symbol: pos.symbol,
      qty: pos.qty,
      avgCost: pos.avgCost,
      last,
      value,
      unrealized: value - basis,
      unrealizedRatio: basis === 0 ? 0 : (value - basis) / Math.abs(basis),
    });
  }

  const equity = portfolio.cash + marketValue;
  return {
    rows: rows.sort((a, b) => b.value - a.value),
    marketValue,
    cost,
    equity,
    unrealized: marketValue - cost,
    totalPnl: equity - portfolio.initialCash,
    totalReturn: portfolio.initialCash === 0 ? 0 : equity / portfolio.initialCash - 1,
  };
}
