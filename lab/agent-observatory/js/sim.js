// 模擬運用のコアエンジン(DOM非依存)。
// ¥7,000を元手に、7日間(1 tick = 1時間 × 168)でサブスク代¥3,000の
// 利益を出せるかをエージェント10体に競わせる。
// シードから完全に決定的で、同じセッションIDなら必ず同じ結末になる。

import { createRng } from './rng.js';
import { ASSETS, createMarket, stepMarket } from './market.js';
import { TRADERS, decide, reviewOrder } from './agents.js';

export const START_CASH = 7000; // 元手(円)
export const GOAL_PROFIT = 3000; // ミッション: サブスク月額ぶんの利益
export const TOTAL_TICKS = 168; // 7日 × 24時間
export const FEE_RATE = 0.001; // 売買手数料 0.1%

const ASSET_BY_ID = Object.fromEntries(ASSETS.map((a) => [a.id, a]));
const MAX_TRADES_PER_TICK = 3; // ログが読める速度に抑える

export function createSim(seed) {
  const rng = createRng(`observatory:${seed}`);
  const market = createMarket(rng);
  return {
    seed,
    rng,
    market,
    tick: 0,
    cash: START_CASH,
    // books[agentId][assetId] = { qty, cost(手数料込み平均取得単価) }
    books: Object.fromEntries(TRADERS.map((a) => [a.id, {}])),
    realized: Object.fromEntries(TRADERS.map((a) => [a.id, 0])),
    tradeCounts: Object.fromEntries(TRADERS.map((a) => [a.id, 0])),
    lastAction: {},
    log: [
      { tick: 0, agentId: 'arcturus', type: 'info', text: `ミッション開始。元手¥${START_CASH.toLocaleString()}、期限は7日後。目標利益¥${GOAL_PROFIT.toLocaleString()}` },
      { tick: 0, agentId: 'arcturus', type: 'info', text: `今週の地合いは「${market.regimeLabel}」と分析。編成10体、配置につけ` },
    ],
    navHistory: [START_CASH],
    peak: START_CASH,
    approved: 0,
    rejected: 0,
    done: false,
    result: null,
  };
}

// 全エージェント帳簿の時価総額
function holdingsValue(sim) {
  let total = 0;
  for (const book of Object.values(sim.books)) {
    for (const [assetId, pos] of Object.entries(book)) {
      total += pos.qty * sim.market.prices[assetId];
    }
  }
  return total;
}

export function navOf(sim) {
  return sim.cash + holdingsValue(sim);
}

// 特定銘柄の全帳簿合計時価(集中リスク判定用)
function exposureOf(sim, assetId) {
  let total = 0;
  for (const book of Object.values(sim.books)) {
    total += (book[assetId]?.qty ?? 0) * sim.market.prices[assetId];
  }
  return total;
}

// エージェント個別の損益(実現+含み)
export function agentPnl(sim, agentId) {
  let unrealized = 0;
  for (const [assetId, pos] of Object.entries(sim.books[agentId] ?? {})) {
    unrealized += pos.qty * (sim.market.prices[assetId] - pos.cost);
  }
  return (sim.realized[agentId] ?? 0) + unrealized;
}

function pushLog(sim, agentId, type, text) {
  sim.log.push({ tick: sim.tick, agentId, type, text });
}

function executeOrder(sim, agent, order) {
  const price = sim.market.prices[order.assetId];
  const asset = ASSET_BY_ID[order.assetId];
  const book = sim.books[agent.id];

  if (order.side === 'buy') {
    // 1回の買いは現金の30%まで(sizingで縮小可)。端数は切り捨て
    const budget = sim.cash * 0.3 * (order.sizing ?? 1);
    const qty = Math.floor(budget / (price * (1 + FEE_RATE)));
    if (qty < 1) return false;
    const cost = qty * price * (1 + FEE_RATE);
    if (cost > sim.cash) return false;
    sim.cash -= cost;
    const pos = book[order.assetId] ?? { qty: 0, cost: 0 };
    const unitCost = price * (1 + FEE_RATE);
    pos.cost = (pos.qty * pos.cost + qty * unitCost) / (pos.qty + qty);
    pos.qty += qty;
    book[order.assetId] = pos;
    pushLog(sim, agent.id, 'buy', `${asset.name} ×${qty} @¥${price.toLocaleString()} 買い — ${order.reason}`);
  } else {
    const pos = book[order.assetId];
    if (!pos || pos.qty < 1) return false;
    const qty = pos.qty;
    const proceeds = qty * price * (1 - FEE_RATE);
    sim.cash += proceeds;
    const pnl = proceeds - qty * pos.cost;
    sim.realized[agent.id] += pnl;
    delete book[order.assetId];
    const sign = pnl >= 0 ? '+' : '−';
    pushLog(sim, agent.id, 'sell', `${asset.name} ×${qty} @¥${price.toLocaleString()} 売り(${sign}¥${Math.abs(Math.round(pnl)).toLocaleString()})— ${order.reason}`);
  }
  sim.tradeCounts[agent.id] += 1;
  sim.lastAction[agent.id] = order.reason;
  return true;
}

// 1時間ぶん進める。sim を破壊的に更新し、done になったら true を返す
export function stepSim(sim) {
  if (sim.done) return true;
  sim.tick += 1;
  const news = stepMarket(sim.market, sim.rng);
  for (const n of news) {
    pushLog(sim, null, 'news', n.text);
  }

  const navBefore = navOf(sim);
  const drawdown = sim.peak > 0 ? (sim.peak - navBefore) / sim.peak : 0;

  // tickごとに評価順をローテーションし、実行は最大3件まで
  let executed = 0;
  for (let i = 0; i < TRADERS.length && executed < MAX_TRADES_PER_TICK; i += 1) {
    const agent = TRADERS[(sim.tick + i) % TRADERS.length];
    const view = { market: sim.market, book: sim.books[agent.id], cash: sim.cash, nav: navBefore, news };
    const order = decide(agent.id, view);
    if (!order) continue;

    const price = sim.market.prices[order.assetId];
    const budget = order.side === 'buy' ? sim.cash * 0.3 * (order.sizing ?? 1) : 0;
    const verdict = reviewOrder(order, {
      nav: navBefore,
      cashAfter: sim.cash - budget,
      exposureAfter: exposureOf(sim, order.assetId) + budget,
      drawdown,
      price,
    });
    if (!verdict.ok) {
      sim.rejected += 1;
      pushLog(sim, 'spica', 'reject', `${agent.code}の${ASSET_BY_ID[order.assetId].name}買いを却下 — ${verdict.reason}`);
      continue;
    }
    if (executeOrder(sim, agent, order)) {
      sim.approved += 1;
      executed += 1;
    }
  }

  const nav = navOf(sim);
  sim.navHistory.push(Math.round(nav * 100) / 100);
  sim.peak = Math.max(sim.peak, nav);

  // 目標額に到達した時点でミッション達成(期限を待たずに利益を確保して終了)
  if (nav >= START_CASH + GOAL_PROFIT) {
    sim.done = true;
    const finalNav = Math.round(nav);
    const profit = finalNav - START_CASH;
    sim.result = { finalNav, profit, achieved: true, tick: sim.tick };
    const day = Math.ceil(sim.tick / 24);
    pushLog(sim, 'arcturus', 'success', `${day}日目、資産¥${finalNav.toLocaleString()}(+¥${profit.toLocaleString()})で目標到達。全員撤収、サブスク代を確保。解約は回避された`);
    return true;
  }

  // ARCTURUS の日次報告
  if (sim.tick % 24 === 0 && sim.tick < TOTAL_TICKS) {
    const day = sim.tick / 24;
    const profit = Math.round(nav - START_CASH);
    const sign = profit >= 0 ? '+' : '−';
    const pace = profit >= (GOAL_PROFIT * day) / 7 ? '順調' : '遅れ気味';
    pushLog(sim, 'arcturus', 'info', `${day}日目終了。損益${sign}¥${Math.abs(profit).toLocaleString()}(目標比: ${pace})。残り${7 - day}日`);
  }

  if (sim.tick >= TOTAL_TICKS) {
    sim.done = true;
    const finalNav = Math.round(nav);
    const profit = finalNav - START_CASH;
    sim.result = { finalNav, profit, achieved: false, tick: sim.tick };
    pushLog(sim, 'arcturus', 'fail', `期限切れ。最終資産¥${finalNav.toLocaleString()}(${profit >= 0 ? '+' : '−'}¥${Math.abs(profit).toLocaleString()})。目標未達……解約が近い`);
  }
  return sim.done;
}
