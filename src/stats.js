// 成績指標の計算。equity は [{ date, value }] の時系列。

const TRADING_DAYS = 252;

export function dailyReturns(equity) {
  const out = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1].value;
    if (prev > 0) out.push(equity[i].value / prev - 1);
  }
  return out;
}

/** 最大ドローダウン（比率、負の値）と、その底の日付 */
export function maxDrawdown(equity) {
  let peak = -Infinity;
  let worst = 0;
  let date = null;
  for (const point of equity) {
    peak = Math.max(peak, point.value);
    if (peak <= 0) continue;
    const dd = point.value / peak - 1;
    if (dd < worst) {
      worst = dd;
      date = point.date;
    }
  }
  return { ratio: worst, date };
}

/** 年率換算ボラティリティ */
export function volatility(returns) {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * TRADING_DAYS);
}

/** シャープレシオ（無リスク金利 0% とみなす簡易版） */
export function sharpe(returns) {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const vol = volatility(returns);
  return vol === 0 ? 0 : (mean * TRADING_DAYS) / vol;
}

/** 売却済みトレードの勝敗集計 */
export function tradeStats(trades) {
  const closed = trades.filter((t) => t.type === 'sell');
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));

  return {
    count: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length === 0 ? 0 : wins.length / closed.length,
    avgWin: wins.length === 0 ? 0 : grossWin / wins.length,
    avgLoss: losses.length === 0 ? 0 : grossLoss / losses.length,
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss,
  };
}

export function summarize(state, snapshot) {
  const returns = dailyReturns(state.equity);
  return {
    equity: snapshot.equity,
    totalPnl: snapshot.totalPnl,
    totalReturn: snapshot.totalReturn,
    days: state.equity.length - 1,
    maxDrawdown: maxDrawdown(state.equity),
    volatility: volatility(returns),
    sharpe: sharpe(returns),
    trades: tradeStats(state.portfolio.trades),
    fees: state.portfolio.fees,
    dividends: state.portfolio.dividends,
    realized: state.portfolio.realized,
    unrealized: snapshot.unrealized,
  };
}
