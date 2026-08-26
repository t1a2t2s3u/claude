// 保有ポジションと現金の管理。取得単価は移動平均法で更新する。

// 手数料は通貨ごとに下限・上限が違う（円は 55〜1,100 円、ドルは 0.5〜8 ドル）
export const FEES = {
  JPY: { rate: 0.001, min: 55, max: 1100, unit: 1 },
  USD: { rate: 0.001, min: 0.5, max: 8, unit: 0.01 },
};

export function commission(notional, currency = 'JPY') {
  const fee = FEES[currency] ?? FEES.JPY;
  const raw = Math.min(fee.max, Math.max(fee.min, notional * fee.rate));
  return Math.round(raw / fee.unit) * fee.unit;
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
export function validateBuy(portfolio, { price, qty, lot = 100, currency = 'JPY' }) {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: '数量を入力してください' };
  if (qty % lot !== 0) return { ok: false, reason: `売買単位は${lot}株です` };
  if (!(price > 0)) return { ok: false, reason: 'この日はまだ取引できません' };
  const cost = buyCost(price, qty, currency);
  if (cost > portfolio.cash) return { ok: false, reason: '現金が不足しています' };
  return { ok: true };
}

export function validateSell(portfolio, { symbol, qty, lot = 100 }) {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: '数量を入力してください' };
  if (qty % lot !== 0) return { ok: false, reason: `売買単位は${lot}株です` };
  if (qty > heldQty(portfolio, symbol)) return { ok: false, reason: '保有株数が不足しています' };
  return { ok: true };
}

/** 買い約定を反映する。呼ぶ前に validateBuy を通すこと */
export function applyBuy(portfolio, { date, symbol, name, qty, price, currency = 'JPY' }) {
  const notional = price * qty;
  const fee = commission(notional, currency);

  portfolio.cash -= notional + fee;
  portfolio.fees += fee;

  const pos = portfolio.positions[symbol];
  if (pos) {
    pos.avgCost = (pos.avgCost * pos.qty + notional) / (pos.qty + qty);
    pos.qty += qty;
  } else {
    portfolio.positions[symbol] = { symbol, qty, avgCost: price };
  }

  const trade = { date, type: 'buy', symbol, name, qty, price, amount: -(notional + fee), fee, pnl: 0 };
  portfolio.trades.push(trade);
  return trade;
}

/** 売り約定を反映する。呼ぶ前に validateSell を通すこと */
export function applySell(portfolio, { date, symbol, name, qty, price, currency = 'JPY' }) {
  const notional = price * qty;
  const fee = commission(notional, currency);
  const pos = portfolio.positions[symbol];
  const pnl = (price - pos.avgCost) * qty;

  portfolio.cash += notional - fee;
  portfolio.fees += fee;
  portfolio.realized += pnl;

  pos.qty -= qty;
  if (pos.qty === 0) delete portfolio.positions[symbol];

  const trade = { date, type: 'sell', symbol, name, qty, price, amount: notional - fee, fee, pnl };
  portfolio.trades.push(trade);
  return trade;
}

/** 配当の入金 */
export function applyDividend(portfolio, { date, symbol, name, qty, perShare, currency = 'JPY' }) {
  const unit = (FEES[currency] ?? FEES.JPY).unit;
  const amount = Math.round((perShare * qty) / unit) * unit;
  portfolio.cash += amount;
  portfolio.dividends += amount;
  const trade = { date, type: 'dividend', symbol, name, qty, price: perShare, amount, fee: 0, pnl: 0 };
  portfolio.trades.push(trade);
  return trade;
}

/** 時価評価。prices は symbol -> 現在値 */
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
      unrealizedRatio: basis === 0 ? 0 : value / basis - 1,
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
