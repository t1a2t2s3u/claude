// DOM の組み立てとイベント配線。状態は engine の state ひとつに集約されている。

import {
  step,
  stepDays,
  quotes,
  snapshot,
  currentPrices,
  placeMarketOrder,
  placeLimitOrder,
  cancelOrder,
  createEngine,
  DEFAULT_CASH,
} from './engine.js';
import { commission, buyCost, heldQty } from './portfolio.js';
import { sma } from './market.js';
import { summarize } from './stats.js';
import { drawCandles, drawLine, THEME } from './chart.js';
import { yen, signedYen, price as fmtPrice, percent, number, jpDate, pnlClass } from './format.js';
import * as storage from './storage.js';

const AUTO_INTERVAL_MS = 650;

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function createApp(initialState) {
  let state = initialState;

  const ui = {
    symbol: quotes(state)[0].symbol,
    chart: 'candles',
    range: 90,
    side: 'buy',
    orderType: 'market',
    logTab: 'positions',
    autoTimer: null,
    hoverIndex: -1,
  };

  /* ------------------------------------------------------------ helpers */

  const selected = () => quotes(state).find((q) => q.symbol === ui.symbol);

  function toast(message) {
    const node = $('toast');
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      node.hidden = true;
    }, 2200);
  }

  function message(text, ok = false) {
    const node = $('order-msg');
    node.textContent = text;
    node.classList.toggle('ok', ok);
  }

  function persist() {
    storage.save(state);
  }

  /* ------------------------------------------------------------ 描画 */

  function renderKpis() {
    const snap = snapshot(state);
    $('kpi-date').textContent = jpDate(state.date);
    $('kpi-equity').textContent = yen(snap.equity);
    $('kpi-cash').textContent = yen(state.portfolio.cash);

    const unrealized = $('kpi-unrealized');
    unrealized.textContent = signedYen(snap.unrealized);
    unrealized.className = pnlClass(snap.unrealized);

    const total = $('kpi-total');
    total.textContent = `${signedYen(snap.totalPnl)} (${percent(snap.totalReturn)})`;
    total.className = pnlClass(snap.totalPnl);

    $('index-value').textContent = `指数 ${number(Math.round(state.market.index))}`;
  }

  function renderWatchlist() {
    const rows = quotes(state)
      .map((q) => {
        const cls = pnlClass(q.change);
        return `<tr data-symbol="${q.symbol}" class="${q.symbol === ui.symbol ? 'is-selected' : ''}">
          <td><div class="sym"><b>${esc(q.name)}</b><span>${q.symbol} · ${esc(q.sector)}</span></div></td>
          <td class="num">${fmtPrice(q.last)}</td>
          <td class="num ${cls}">${percent(q.change)}</td>
          <td class="num">${q.qty ? number(q.qty) : '<span class="flat">-</span>'}</td>
        </tr>`;
      })
      .join('');
    $('watchlist-body').innerHTML = rows;
  }

  function renderChart() {
    const canvas = $('chart-canvas');
    const inst = selected();

    if (ui.chart === 'equity') {
      $('chart-name').textContent = '資産推移';
      const snap = snapshot(state);
      $('chart-meta').innerHTML = `<span class="${pnlClass(snap.totalPnl)}">${signedYen(
        snap.totalPnl
      )} (${percent(snap.totalReturn)})</span> · ${state.equity.length - 1}営業日`;
      $('chart-legend').hidden = true;

      const points = ui.range > 0 ? state.equity.slice(-ui.range) : state.equity;
      drawLine(canvas, points, { baseline: state.portfolio.initialCash });
      return;
    }

    $('chart-legend').hidden = false;
    const allBars = inst.bars;
    const bars = ui.range > 0 ? allBars.slice(-ui.range) : allBars;
    const offset = allBars.length - bars.length;

    $('chart-name').textContent = `${inst.name}（${inst.symbol}）`;
    $('chart-meta').innerHTML = `${fmtPrice(inst.last)} <span class="${pnlClass(inst.change)}">${percent(
      inst.change
    )}</span> · ${esc(inst.sector)} · 配当利回り ${(inst.yield_ * 100).toFixed(1)}%`;

    const overlays = [
      { values: sma(allBars, 5).slice(offset), color: THEME.sma5 },
      { values: sma(allBars, 25).slice(offset), color: THEME.sma25 },
    ];

    const chart = drawCandles(canvas, bars, overlays);
    canvas._hitTest = (x) => {
      const i = chart.hitTest(x);
      return i < 0 ? null : bars[i];
    };
  }

  function renderPositions() {
    const snap = snapshot(state);
    if (snap.rows.length === 0) return '<p class="empty">保有銘柄はありません</p>';

    return snap.rows
      .map((row) => {
        const q = quotes(state).find((x) => x.symbol === row.symbol);
        return `<div class="row" data-symbol="${row.symbol}">
          <div class="left">
            <span class="name">${esc(q.name)}</span>
            <span class="meta">${number(row.qty)}株 · 取得 ${fmtPrice(row.avgCost)} → ${fmtPrice(row.last)}</span>
          </div>
          <div class="right">
            <div>${yen(row.value)}</div>
            <div class="${pnlClass(row.unrealized)}">${signedYen(row.unrealized)} (${percent(
              row.unrealizedRatio
            )})</div>
          </div>
        </div>`;
      })
      .join('');
  }

  function renderOrders() {
    if (state.orders.length === 0) {
      return '<p class="empty">未約定の指値注文はありません</p>';
    }
    return state.orders
      .map(
        (o) => `<div class="row">
          <div class="left">
            <span class="name"><span class="tag ${o.side}">${o.side === 'buy' ? '買' : '売'}</span>${esc(o.name)}</span>
            <span class="meta">${number(o.qty)}株 · 指値 ${fmtPrice(o.limit)} · ${o.placedAt}発注</span>
          </div>
          <div class="right"><button class="link" data-cancel="${o.id}">取消</button></div>
        </div>`
      )
      .join('');
  }

  function renderTrades() {
    const trades = [...state.portfolio.trades].reverse().slice(0, 80);
    if (trades.length === 0) return '<p class="empty">まだ取引がありません</p>';

    return trades
      .map((t) => {
        const label = t.type === 'buy' ? '買' : t.type === 'sell' ? '売' : '配';
        const detail =
          t.type === 'dividend'
            ? `${number(t.qty)}株 · 1株 ${fmtPrice(t.price)}`
            : `${number(t.qty)}株 × ${fmtPrice(t.price)} · 手数料 ${yen(t.fee)}`;
        const pnl =
          t.type === 'sell'
            ? `<div class="${pnlClass(t.pnl)}">${signedYen(t.pnl)}</div>`
            : '';
        return `<div class="row">
          <div class="left">
            <span class="name"><span class="tag ${t.type}">${label}</span>${esc(t.name)}</span>
            <span class="meta">${t.date} · ${detail}</span>
          </div>
          <div class="right"><div>${signedYen(t.amount)}</div>${pnl}</div>
        </div>`;
      })
      .join('');
  }

  function renderNews() {
    const news = [...state.news].reverse().slice(0, 60);
    if (news.length === 0) return '<p class="empty">まだニュースはありません</p>';

    return news
      .map(
        (n) => `<div class="row">
          <div class="left">
            <span class="meta">${n.date}</span>
            <span class="meta wrap" style="color:var(--text);font-size:12px">${esc(n.text)}</span>
          </div>
          <div class="right ${pnlClass(n.impact)}">${percent(n.impact, 1)}</div>
        </div>`
      )
      .join('');
  }

  function renderStats() {
    const s = summarize(state, snapshot(state));
    const pf = s.trades.profitFactor;
    const cells = [
      ['総資産', yen(s.equity), ''],
      ['累計損益', signedYen(s.totalPnl), pnlClass(s.totalPnl)],
      ['トータルリターン', percent(s.totalReturn), pnlClass(s.totalReturn)],
      ['経過営業日', `${number(s.days)}日`, ''],
      ['実現損益', signedYen(s.realized), pnlClass(s.realized)],
      ['評価損益', signedYen(s.unrealized), pnlClass(s.unrealized)],
      ['受取配当', yen(s.dividends), ''],
      ['支払手数料', yen(s.fees), ''],
      ['最大ドローダウン', percent(s.maxDrawdown.ratio), s.maxDrawdown.ratio < 0 ? 'down' : ''],
      ['年率ボラティリティ', `${(s.volatility * 100).toFixed(1)}%`, ''],
      ['シャープレシオ', s.sharpe.toFixed(2), pnlClass(s.sharpe)],
      ['勝率', `${(s.trades.winRate * 100).toFixed(0)}% (${s.trades.wins}/${s.trades.count})`, ''],
      ['平均利益', yen(s.trades.avgWin), 'up'],
      ['平均損失', yen(s.trades.avgLoss), 'down'],
      ['プロフィットファクター', Number.isFinite(pf) ? pf.toFixed(2) : '—', ''],
    ];

    return `<div class="stat-grid">${cells
      .map(
        ([label, value, cls]) =>
          `<div class="stat"><span>${label}</span><strong class="${cls}">${value}</strong></div>`
      )
      .join('')}</div>`;
  }

  function renderLogs() {
    const body = $('log-body');
    const renderers = {
      positions: renderPositions,
      orders: renderOrders,
      trades: renderTrades,
      news: renderNews,
      stats: renderStats,
    };
    body.innerHTML = renderers[ui.logTab]();
  }

  function renderOrderPanel() {
    const inst = selected();
    $('order-symbol').textContent = `${inst.name}（${inst.symbol}）`;
    $('limit-field').hidden = ui.orderType !== 'limit';

    const limitInput = $('limit-input');
    if (ui.orderType === 'limit' && limitInput.value === '') {
      limitInput.value = String(Math.round(inst.last));
    }

    const qty = Number($('qty-input').value) || 0;
    const px = ui.orderType === 'limit' ? Number(limitInput.value) || inst.last : inst.last;
    const notional = px * qty;
    const fee = qty > 0 ? commission(notional) : 0;

    $('avail-label').textContent = ui.side === 'buy' ? '買付余力' : '保有株数';
    $('avail-value').textContent =
      ui.side === 'buy' ? yen(state.portfolio.cash) : `${number(heldQty(state.portfolio, inst.symbol))}株`;
    $('est-notional').textContent = yen(notional);
    $('est-fee').textContent = yen(fee);
    $('est-total').textContent = signedYen(ui.side === 'buy' ? -(notional + fee) : notional - fee);

    const submit = $('btn-submit');
    submit.textContent = `${ui.side === 'buy' ? '買い' : '売り'}${
      ui.orderType === 'limit' ? '指値' : '成行'
    }注文を出す`;
    submit.classList.toggle('sell', ui.side === 'sell');
  }

  function render() {
    renderKpis();
    renderWatchlist();
    renderChart();
    renderOrderPanel();
    renderLogs();
  }

  /* ------------------------------------------------------------ 操作 */

  function advance(days) {
    const results = stepDays(state, days);
    const fills = results.flatMap((r) => r.fills);
    const dividends = results.flatMap((r) => r.dividends);

    for (const fill of fills) {
      if (fill.expired) {
        toast(`指値失効：${fill.order.name} ${fill.reason}`);
      } else {
        toast(
          `約定：${fill.order.name} ${fill.order.side === 'buy' ? '買' : '売'} ${number(
            fill.order.qty
          )}株 @ ${fmtPrice(fill.trade.price)}`
        );
      }
    }
    if (fills.length === 0 && dividends.length > 0) {
      const total = dividends.reduce((a, d) => a + d.amount, 0);
      toast(`配当入金：${yen(total)}`);
    }

    persist();
    render();
  }

  function toggleAuto() {
    const btn = $('btn-auto');
    if (ui.autoTimer) {
      clearInterval(ui.autoTimer);
      ui.autoTimer = null;
      btn.textContent = '自動再生';
      btn.classList.remove('is-on');
      return;
    }
    ui.autoTimer = setInterval(() => advance(1), AUTO_INTERVAL_MS);
    btn.textContent = '停止 ■';
    btn.classList.add('is-on');
  }

  function submitOrder() {
    const inst = selected();
    const qty = Number($('qty-input').value);
    const result =
      ui.orderType === 'market'
        ? placeMarketOrder(state, { symbol: inst.symbol, side: ui.side, qty })
        : placeLimitOrder(state, {
            symbol: inst.symbol,
            side: ui.side,
            qty,
            limit: Number($('limit-input').value),
          });

    if (!result.ok) {
      message(result.reason);
      return;
    }

    if (result.trade) {
      message(
        `${ui.side === 'buy' ? '買付' : '売却'}完了：${number(qty)}株 @ ${fmtPrice(result.trade.price)}`,
        true
      );
    } else {
      message(`指値注文を受け付けました（${fmtPrice(result.order.limit)}）`, true);
      ui.logTab = 'orders';
      syncTabs('log-tabs', 'log', ui.logTab);
    }

    persist();
    render();
  }

  function maxQty() {
    const inst = selected();
    if (ui.side === 'sell') return heldQty(state.portfolio, inst.symbol);

    const px =
      ui.orderType === 'limit' ? Number($('limit-input').value) || inst.last : inst.last * 1.0005;
    let lots = Math.floor(state.portfolio.cash / (px * inst.lot));
    while (lots > 0 && buyCost(px, lots * inst.lot) > state.portfolio.cash) lots--;
    return lots * inst.lot;
  }

  function syncTabs(containerId, attr, value) {
    for (const tab of $(containerId).querySelectorAll('[data-' + attr + ']')) {
      tab.classList.toggle('is-active', tab.dataset[attr] === String(value));
    }
  }

  function reset() {
    if (!confirm('シミュレーションを最初からやり直します。よろしいですか？')) return;
    if (ui.autoTimer) toggleAuto();
    storage.clear();
    state = createEngine({ cash: DEFAULT_CASH });
    ui.symbol = quotes(state)[0].symbol;
    message('');
    persist();
    render();
    toast('新しい相場で最初からスタートします');
  }

  /* ------------------------------------------------------------ 配線 */

  function bind() {
    $('btn-step1').onclick = () => advance(1);
    $('btn-step5').onclick = () => advance(5);
    $('btn-step20').onclick = () => advance(20);
    $('btn-auto').onclick = toggleAuto;
    $('btn-reset').onclick = reset;
    $('btn-submit').onclick = submitOrder;

    $('watchlist-body').onclick = (e) => {
      const tr = e.target.closest('tr[data-symbol]');
      if (!tr) return;
      ui.symbol = tr.dataset.symbol;
      $('limit-input').value = '';
      message('');
      render();
    };

    $('chart-tabs').onclick = (e) => {
      const tab = e.target.closest('[data-chart]');
      if (!tab) return;
      ui.chart = tab.dataset.chart;
      syncTabs('chart-tabs', 'chart', ui.chart);
      renderChart();
    };

    $('range-tabs').onclick = (e) => {
      const tab = e.target.closest('[data-range]');
      if (!tab) return;
      ui.range = Number(tab.dataset.range);
      syncTabs('range-tabs', 'range', ui.range);
      renderChart();
    };

    $('log-tabs').onclick = (e) => {
      const tab = e.target.closest('[data-log]');
      if (!tab) return;
      ui.logTab = tab.dataset.log;
      syncTabs('log-tabs', 'log', ui.logTab);
      renderLogs();
    };

    $('log-body').onclick = (e) => {
      const cancelBtn = e.target.closest('[data-cancel]');
      if (cancelBtn) {
        cancelOrder(state, cancelBtn.dataset.cancel);
        persist();
        render();
        toast('注文を取り消しました');
        return;
      }
      const row = e.target.closest('.row[data-symbol]');
      if (row) {
        ui.symbol = row.dataset.symbol;
        render();
      }
    };

    $('side-seg').onclick = (e) => {
      const btn = e.target.closest('[data-side]');
      if (!btn) return;
      ui.side = btn.dataset.side;
      syncTabs('side-seg', 'side', ui.side);
      message('');
      renderOrderPanel();
    };

    $('type-seg').onclick = (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      ui.orderType = btn.dataset.type;
      syncTabs('type-seg', 'type', ui.orderType);
      message('');
      renderOrderPanel();
    };

    for (const chip of document.querySelectorAll('.qty-quick .chip')) {
      chip.onclick = () => {
        const value = chip.dataset.qty;
        $('qty-input').value = String(value === 'max' ? maxQty() : Number(value));
        renderOrderPanel();
      };
    }

    $('qty-input').oninput = renderOrderPanel;
    $('limit-input').oninput = renderOrderPanel;

    // チャートのホバーで OHLC を表示
    const canvas = $('chart-canvas');
    canvas.onmousemove = (e) => {
      const tip = $('chart-tip');
      if (ui.chart !== 'candles' || !canvas._hitTest) {
        tip.hidden = true;
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const bar = canvas._hitTest(e.clientX - rect.left);
      if (!bar) {
        tip.hidden = true;
        return;
      }
      const diff = bar.close - bar.open;
      tip.innerHTML = `<b>${jpDate(bar.date)}</b>
        始値 ${fmtPrice(bar.open)}　高値 ${fmtPrice(bar.high)}<br />
        安値 ${fmtPrice(bar.low)}　終値 <span class="${pnlClass(diff)}">${fmtPrice(bar.close)}</span><br />
        出来高 ${number(bar.volume)}`;
      tip.hidden = false;
      const x = Math.min(e.clientX - rect.left + 14, rect.width - tip.offsetWidth - 8);
      tip.style.left = `${Math.max(4, x)}px`;
      tip.style.top = `${Math.min(e.clientY - rect.top + 12, rect.height - tip.offsetHeight - 8)}px`;
    };
    canvas.onmouseleave = () => {
      $('chart-tip').hidden = true;
    };

    window.addEventListener('resize', () => renderChart());

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        advance(1);
      }
      if (e.key === 'a') toggleAuto();
    });
  }

  return {
    start() {
      bind();
      syncTabs('range-tabs', 'range', ui.range);
      syncTabs('log-tabs', 'log', ui.logTab);
      render();
    },
  };
}
