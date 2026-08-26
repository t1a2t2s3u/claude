// DOM の組み立てとイベント配線。状態は engine の state ひとつに集約されている。

import {
  stepDays,
  quotes,
  snapshot,
  placeMarketOrder,
  placeLimitOrder,
  cancelOrder,
  createEngine,
  createRealEngine,
} from './engine.js';
import { loadDataset, DATA_BASE } from './dataset.js';
import { commission, buyCost, heldQty } from './portfolio.js';
import { sma } from './market.js';
import { summarize } from './stats.js';
import { drawCandles, drawLine, THEME } from './chart.js';
import {
  money as fmtMoney,
  signedMoney as fmtSignedMoney,
  price as fmtPriceRaw,
  percent,
  number,
  jpDate,
  pnlClass,
} from './format.js';
import * as storage from './storage.js';

const AUTO_INTERVAL_MS = 650;

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function createApp({ state: initialState, dataset: initialDataset = null }) {
  let state = initialState;
  let dataset = initialDataset;

  const ui = {
    symbol: quotes(state)[0].symbol,
    filter: '',
    chart: 'candles',
    range: 90,
    side: 'buy',
    orderType: 'market',
    logTab: 'positions',
    autoTimer: null,
    hoverIndex: -1,
  };

  /* ------------------------------------------------------------ helpers */

  // 表示通貨は state から引く（架空市場は円、実データは取り込み時の基準通貨）
  const cur = () => state.currency ?? 'JPY';
  const money = (v) => fmtMoney(v, cur());
  const signedMoney = (v) => fmtSignedMoney(v, cur());
  const priceFmt = (v) => fmtPriceRaw(v, cur());

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
    $('kpi-equity').textContent = money(snap.equity);
    $('kpi-cash').textContent = money(state.portfolio.cash);

    const unrealized = $('kpi-unrealized');
    unrealized.textContent = signedMoney(snap.unrealized);
    unrealized.className = pnlClass(snap.unrealized);

    const total = $('kpi-total');
    total.textContent = `${signedMoney(snap.totalPnl)} (${percent(snap.totalReturn)})`;
    total.className = pnlClass(snap.totalPnl);

    $('index-value').textContent = `指数 ${number(Math.round(state.market.index))}`;
  }

  function renderSource() {
    const info = $('source-info');
    $('start-field').hidden = state.mode !== 'real';

    if (state.mode !== 'real') {
      info.textContent = '架空の相場を乱数で生成中';
      return;
    }

    const d = state.dataset;
    const range = dataset ? `${dataset.calendar[0]} 〜 ${dataset.lastDate}` : '';
    info.innerHTML =
      `<span class="badge">実データ</span>${esc(d.source)} · ${d.symbols}銘柄 · ${range}` +
      ` · ${d.generatedAt.slice(0, 10)}取込`;
  }

  function renderWatchlist() {
    const keyword = ui.filter.trim().toLowerCase();
    const all = quotes(state);
    const list = keyword
      ? all.filter(
          (q) => q.symbol.toLowerCase().includes(keyword) || q.name.toLowerCase().includes(keyword)
        )
      : all;

    const rows = list
      .map((q) => {
        const listed = q.last > 0;
        const cls = pnlClass(q.change);
        return `<tr data-symbol="${q.symbol}" class="${q.symbol === ui.symbol ? 'is-selected' : ''}">
          <td><div class="sym"><b>${esc(q.name)}</b><span>${q.symbol} · ${esc(q.sector)}</span></div></td>
          <td class="num">${listed ? priceFmt(q.last) : '<span class="flat">—</span>'}</td>
          <td class="num ${cls}">${listed && q.bars.length > 1 ? percent(q.change) : '<span class="flat">—</span>'}</td>
          <td class="num">${q.qty ? number(q.qty) : '<span class="flat">-</span>'}</td>
        </tr>`;
      })
      .join('');
    $('watchlist-body').innerHTML =
      rows || '<tr><td colspan="4" class="empty">該当する銘柄がありません</td></tr>';
    $('watchlist-count').textContent = keyword ? `${list.length}/${all.length}銘柄` : `${all.length}銘柄`;
  }

  function renderChart() {
    const canvas = $('chart-canvas');
    const inst = selected();

    if (ui.chart === 'equity') {
      $('chart-name').textContent = '資産推移';
      const snap = snapshot(state);
      $('chart-meta').innerHTML = `<span class="${pnlClass(snap.totalPnl)}">${signedMoney(
        snap.totalPnl
      )} (${percent(snap.totalReturn)})</span> · ${state.equity.length - 1}営業日`;
      $('chart-legend').hidden = true;

      const points = ui.range > 0 ? state.equity.slice(-ui.range) : state.equity;
      drawLine(canvas, points, { baseline: state.portfolio.initialCash });
      return;
    }

    $('chart-legend').hidden = false;
    const allBars = inst.bars;
    if (allBars.length === 0) {
      $('chart-name').textContent = `${inst.name}（${inst.symbol}）`;
      $('chart-meta').textContent = 'この時点ではまだ上場していません（日を進めるとデータが始まります）';
      drawCandles(canvas, []);
      canvas._hitTest = null;
      return;
    }
    const bars = ui.range > 0 ? allBars.slice(-ui.range) : allBars;
    const offset = allBars.length - bars.length;

    $('chart-name').textContent = `${inst.name}（${inst.symbol}）`;
    const tail =
      state.mode === 'real'
        ? `${esc(inst.market ?? '')} · 単元${number(inst.lot)}株`
        : `配当利回り ${(inst.yield_ * 100).toFixed(1)}%`;
    $('chart-meta').innerHTML = `${priceFmt(inst.last)} <span class="${pnlClass(inst.change)}">${percent(
      inst.change
    )}</span> · ${esc(inst.sector)} · ${tail}`;

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
            <span class="meta">${number(row.qty)}株 · 取得 ${priceFmt(row.avgCost)} → ${priceFmt(row.last)}</span>
          </div>
          <div class="right">
            <div>${money(row.value)}</div>
            <div class="${pnlClass(row.unrealized)}">${signedMoney(row.unrealized)} (${percent(
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
            <span class="meta">${number(o.qty)}株 · 指値 ${priceFmt(o.limit)} · ${o.placedAt}発注</span>
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
            ? `${number(t.qty)}株 · 1株 ${priceFmt(t.price)}`
            : `${number(t.qty)}株 × ${priceFmt(t.price)} · 手数料 ${money(t.fee)}`;
        const pnl =
          t.type === 'sell'
            ? `<div class="${pnlClass(t.pnl)}">${signedMoney(t.pnl)}</div>`
            : '';
        return `<div class="row">
          <div class="left">
            <span class="name"><span class="tag ${t.type}">${label}</span>${esc(t.name)}</span>
            <span class="meta">${t.date} · ${detail}</span>
          </div>
          <div class="right"><div>${signedMoney(t.amount)}</div>${pnl}</div>
        </div>`;
      })
      .join('');
  }

  function renderNews() {
    const news = [...state.news].reverse().slice(0, 60);
    if (news.length === 0) {
      return state.mode === 'real'
        ? '<p class="empty">日を進めると、大きく動いた銘柄がここに出ます</p>'
        : '<p class="empty">まだニュースはありません</p>';
    }

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
      ['総資産', money(s.equity), ''],
      ['累計損益', signedMoney(s.totalPnl), pnlClass(s.totalPnl)],
      ['トータルリターン', percent(s.totalReturn), pnlClass(s.totalReturn)],
      ['経過営業日', `${number(s.days)}日`, ''],
      ['実現損益', signedMoney(s.realized), pnlClass(s.realized)],
      ['評価損益', signedMoney(s.unrealized), pnlClass(s.unrealized)],
      ['受取配当', money(s.dividends), ''],
      ['支払手数料', money(s.fees), ''],
      ['最大ドローダウン', percent(s.maxDrawdown.ratio), s.maxDrawdown.ratio < 0 ? 'down' : ''],
      ['年率ボラティリティ', `${(s.volatility * 100).toFixed(1)}%`, ''],
      ['シャープレシオ', s.sharpe.toFixed(2), pnlClass(s.sharpe)],
      ['勝率', `${(s.trades.winRate * 100).toFixed(0)}% (${s.trades.wins}/${s.trades.count})`, ''],
      ['平均利益', money(s.trades.avgWin), 'up'],
      ['平均損失', money(s.trades.avgLoss), 'down'],
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

  function renderModeUi() {
    syncTabs('mode-tabs', 'mode', state.mode);
    $('log-tabs').querySelector('[data-log="news"]').textContent =
      state.mode === 'real' ? '値動き' : 'ニュース';
  }

  /** 単元株数に応じて数量入力とクイックボタンを組み替える */
  function syncQtyControls(lot) {
    const input = $('qty-input');
    if (Number(input.step) !== lot) {
      input.step = String(lot);
      input.min = String(lot);
      const current = Number(input.value) || 0;
      input.value = String(Math.max(lot, Math.round(current / lot) * lot));
    }

    const presets = lot === 1 ? [1, 10, 100] : [lot, lot * 5, lot * 10];
    const chips = document.querySelectorAll('.qty-quick .chip:not([data-qty="max"])');
    chips.forEach((chip, i) => {
      chip.dataset.qty = String(presets[i]);
      chip.textContent = number(presets[i]);
    });
  }

  function renderOrderPanel() {
    const inst = selected();
    syncQtyControls(inst.lot);
    $('order-symbol').textContent = `${inst.name}（${inst.symbol}）`;
    $('limit-field').hidden = ui.orderType !== 'limit';

    const limitInput = $('limit-input');
    if (ui.orderType === 'limit' && limitInput.value === '') {
      limitInput.value = String(Math.round(inst.last));
    }

    limitInput.step = cur() === 'JPY' ? '0.1' : '0.01';
    const qty = Number($('qty-input').value) || 0;
    const px = ui.orderType === 'limit' ? Number(limitInput.value) || inst.last : inst.last;
    const notional = px * qty;
    const fee = qty > 0 && notional > 0 ? commission(notional, cur()) : 0;

    $('avail-label').textContent = ui.side === 'buy' ? '買付余力' : '保有株数';
    $('avail-value').textContent =
      ui.side === 'buy' ? money(state.portfolio.cash) : `${number(heldQty(state.portfolio, inst.symbol))}株`;
    $('est-notional').textContent = money(notional);
    $('est-fee').textContent = money(fee);
    $('est-total').textContent = signedMoney(ui.side === 'buy' ? -(notional + fee) : notional - fee);

    const submit = $('btn-submit');
    submit.textContent = `${ui.side === 'buy' ? '買い' : '売り'}${
      ui.orderType === 'limit' ? '指値' : '成行'
    }注文を出す`;
    submit.classList.toggle('sell', ui.side === 'sell');
  }

  function render() {
    renderKpis();
    renderSource();
    renderModeUi();
    renderWatchlist();
    renderChart();
    renderOrderPanel();
    renderLogs();
  }

  /* ------------------------------------------------------------ 操作 */

  function advance(days) {
    const results = stepDays(state, days, dataset);
    if (results.length === 0) {
      stopAuto();
      toast('取り込んだデータの最終日です（npm run fetch で更新できます）');
      return;
    }
    const fills = results.flatMap((r) => r.fills);
    const dividends = results.flatMap((r) => r.dividends);

    for (const fill of fills) {
      if (fill.expired) {
        toast(`指値失効：${fill.order.name} ${fill.reason}`);
      } else {
        toast(
          `約定：${fill.order.name} ${fill.order.side === 'buy' ? '買' : '売'} ${number(
            fill.order.qty
          )}株 @ ${priceFmt(fill.trade.price)}`
        );
      }
    }
    if (fills.length === 0 && dividends.length > 0) {
      const total = dividends.reduce((a, d) => a + d.amount, 0);
      toast(`配当入金：${money(total)}`);
    }

    persist();
    render();
  }

  function stopAuto() {
    if (!ui.autoTimer) return;
    clearInterval(ui.autoTimer);
    ui.autoTimer = null;
    const btn = $('btn-auto');
    btn.textContent = '自動再生';
    btn.classList.remove('is-on');
  }

  function toggleAuto() {
    if (ui.autoTimer) {
      stopAuto();
      return;
    }
    ui.autoTimer = setInterval(() => advance(1), AUTO_INTERVAL_MS);
    const btn = $('btn-auto');
    btn.textContent = '停止 ■';
    btn.classList.add('is-on');
  }

  /* ------------------------------------------------------------ モード切替 */

  function startIndex() {
    const back = Number($('start-select').value);
    if (!dataset) return undefined;
    return back === 0 ? 1 : Math.max(1, dataset.calendar.length - back);
  }

  function showDataHelp(visible, detail = '') {
    $('data-help').hidden = !visible;
    $('data-help-detail').textContent = detail;
  }

  async function switchMode(mode) {
    if (mode === state.mode) {
      showDataHelp(false); // 取り込み案内を出したまま元のモードに戻ってきたとき
      return;
    }
    stopAuto();

    if (mode === 'sim') {
      state = createEngine();
      showDataHelp(false);
    } else {
      try {
        toast('実データを読み込んでいます…');
        dataset =
          dataset ??
          (await loadDataset(DATA_BASE, {
            onProgress: (done, total) => toast(`実データ読み込み中… ${done}/${total} 銘柄`),
          }));
        state = createRealEngine(dataset, { startIndex: startIndex() });
        showDataHelp(false);
        toast(`${state.dataset.symbols}銘柄の実データを読み込みました`);
      } catch (e) {
        showDataHelp(true, `読み込みに失敗しました: ${e.message}`);
        syncTabs('mode-tabs', 'mode', state.mode);
        return;
      }
    }

    ui.symbol = quotes(state)[0].symbol;
    $('limit-input').value = '';
    message('');
    syncTabs('mode-tabs', 'mode', state.mode);
    persist();
    render();
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
        `${ui.side === 'buy' ? '買付' : '売却'}完了：${number(qty)}株 @ ${priceFmt(result.trade.price)}`,
        true
      );
    } else {
      message(`指値注文を受け付けました（${priceFmt(result.order.limit)}）`, true);
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
    if (!(px > 0)) return 0;
    let lots = Math.floor(state.portfolio.cash / (px * inst.lot));
    while (lots > 0 && buyCost(px, lots * inst.lot, cur()) > state.portfolio.cash) lots--;
    return lots * inst.lot;
  }

  function syncTabs(containerId, attr, value) {
    for (const tab of $(containerId).querySelectorAll('[data-' + attr + ']')) {
      tab.classList.toggle('is-active', tab.dataset[attr] === String(value));
    }
  }

  function reset() {
    if (!confirm('シミュレーションを最初からやり直します。よろしいですか？')) return;
    stopAuto();
    storage.clear();
    state =
      state.mode === 'real' && dataset
        ? createRealEngine(dataset, { startIndex: startIndex() })
        : createEngine();
    ui.symbol = quotes(state)[0].symbol;
    message('');
    persist();
    render();
    toast(state.mode === 'real' ? '実データを最初から再生します' : '新しい相場で最初からスタートします');
  }

  /* ------------------------------------------------------------ 配線 */

  function bind() {
    $('btn-step1').onclick = () => advance(1);
    $('btn-step5').onclick = () => advance(5);
    $('btn-step20').onclick = () => advance(20);
    $('btn-auto').onclick = toggleAuto;
    $('btn-reset').onclick = reset;
    $('btn-submit').onclick = submitOrder;

    $('mode-tabs').onclick = (e) => {
      const tab = e.target.closest('[data-mode]');
      if (tab) switchMode(tab.dataset.mode);
    };

    $('data-help-close').onclick = () => showDataHelp(false);

    $('start-select').onchange = () => {
      if (state.mode !== 'real' || !dataset) return;
      if (!confirm('開始時点を変えると、いまの取引はリセットされます。よろしいですか？')) {
        renderSource();
        return;
      }
      stopAuto();
      state = createRealEngine(dataset, { startIndex: startIndex() });
      ui.symbol = quotes(state)[0].symbol;
      persist();
      render();
    };

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

    $('filter-input').oninput = (e) => {
      ui.filter = e.target.value;
      renderWatchlist();
    };

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
        始値 ${priceFmt(bar.open)}　高値 ${priceFmt(bar.high)}<br />
        安値 ${priceFmt(bar.low)}　終値 <span class="${pnlClass(diff)}">${priceFmt(bar.close)}</span><br />
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
