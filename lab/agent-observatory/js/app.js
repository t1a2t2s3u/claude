// ダッシュボードのDOM制御。DOMに触れるのはこのファイルだけ。
// エンジン(sim.js)はシードから決定的に動くため、同じセッションIDを
// 再生すれば必ず同じ展開・同じ結末を再現できる。

import { createSim, stepSim, navOf, agentPnl, START_CASH, GOAL_PROFIT, TOTAL_TICKS } from './sim.js';
import { AGENTS } from './agents.js';
import { ASSETS, fmtQty } from './market.js';

const $ = (id) => document.getElementById(id);

const SPEEDS = [
  { label: '1×', ms: 700 },
  { label: '4×', ms: 180 },
  { label: '16×', ms: 45 },
];

let sim = null;
let timer = null;
let speedIndex = 0;
let running = false;
let renderedLogCount = 0;

// ── ユーティリティ ─────────────────────────

function yen(value) {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function signedYen(value) {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : '−'}¥${Math.abs(rounded).toLocaleString('ja-JP')}`;
}

function clockOf(tick) {
  const day = Math.min(7, Math.floor(tick / 24) + 1);
  const hour = tick % 24;
  return `DAY ${day} ${String(hour).padStart(2, '0')}:00`;
}

function newSeed() {
  // 表示しやすい4桁の英数字コード。シードが同じなら結末も同じ
  return `S-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ── エージェントカード ─────────────────────

function buildAgentCards() {
  const grid = $('agents-grid');
  grid.textContent = '';
  for (const agent of AGENTS) {
    const card = document.createElement('div');
    card.className = agent.kind === 'trader' ? 'agent' : 'agent special';
    card.innerHTML = `
      <div class="head"><span class="code">${agent.code}</span><span class="role">${agent.role}</span></div>
      <div class="pnl" id="agent-pnl-${agent.id}">±¥0</div>
      <div class="note" id="agent-note-${agent.id}">${agent.desc}</div>
    `;
    grid.appendChild(card);
  }
}

function renderAgents() {
  for (const agent of AGENTS) {
    const pnlEl = $(`agent-pnl-${agent.id}`);
    const noteEl = $(`agent-note-${agent.id}`);
    if (agent.kind === 'trader') {
      const pnl = agentPnl(sim, agent.id);
      pnlEl.textContent = signedYen(pnl);
      pnlEl.className = `pnl ${pnl >= 0 ? 'up' : 'down'}`;
      const last = sim.lastAction[agent.id];
      noteEl.textContent = last ? `${sim.tradeCounts[agent.id]}回売買 — ${last}` : agent.desc;
    } else if (agent.id === 'spica') {
      pnlEl.textContent = `${sim.approved}✓ ${sim.rejected}✗`;
      pnlEl.className = 'pnl';
      noteEl.textContent = `注文を審査中。承認${sim.approved}件 / 却下${sim.rejected}件`;
    } else {
      const profit = navOf(sim) - START_CASH;
      const pct = Math.max(0, Math.min(100, (profit / GOAL_PROFIT) * 100));
      pnlEl.textContent = `${pct.toFixed(0)}%`;
      pnlEl.className = 'pnl';
      noteEl.textContent = `目標達成度を監視中(地合い: ${sim.market.regimeLabel})`;
    }
  }
}

// ── 活動ログ ───────────────────────────────

const TAG_LABELS = {
  buy: 'BUY',
  sell: 'SELL',
  reject: 'VETO',
  news: 'NEWS',
  info: 'PLAN',
  success: 'CLEAR',
  fail: 'FAIL',
};

const CODE_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a.code]));

function renderLog() {
  const list = $('activity-log');
  for (let i = renderedLogCount; i < sim.log.length; i += 1) {
    const entry = sim.log[i];
    const li = document.createElement('li');
    const who = entry.agentId ? CODE_BY_ID[entry.agentId] : 'MARKET';
    li.innerHTML = `
      <span class="log-time">${clockOf(entry.tick)}</span>
      <span class="log-tag ${entry.type}">${TAG_LABELS[entry.type] ?? entry.type}</span>
      <span class="log-text"><span class="who">${who}</span>${entry.text}</span>
    `;
    list.prepend(li);
  }
  renderedLogCount = sim.log.length;
  while (list.children.length > 120) list.removeChild(list.lastChild);
  $('log-count').textContent = `${sim.log.length}件`;
}

// ── チャート ───────────────────────────────

function renderChart() {
  const canvas = $('nav-chart');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const navs = sim.navHistory;
  const goalNav = START_CASH + GOAL_PROFIT;
  const pad = { top: 14, right: 12, bottom: 20, left: 46 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  let yMin = Math.min(...navs, START_CASH) - 300;
  let yMax = Math.max(...navs, goalNav) + 300;
  const x = (t) => pad.left + (t / TOTAL_TICKS) * plotW;
  const y = (v) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  ctx.font = '10px "IBM Plex Mono", monospace';

  // 横グリッド(¥1,000刻みの内側だけ)
  const step = 1000;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(pad.left, y(v));
    ctx.lineTo(w - pad.right, y(v));
    ctx.stroke();
    ctx.fillStyle = '#8d87ae';
    ctx.fillText(`${(v / 1000).toFixed(0)}k`, pad.left - 8, y(v));
  }

  // 日付の目盛り(1日ごと)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let day = 1; day <= 7; day += 1) {
    const t = day * 24;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.moveTo(x(t), pad.top);
    ctx.lineTo(x(t), h - pad.bottom);
    ctx.stroke();
    ctx.fillStyle = '#8d87ae';
    ctx.fillText(`D${day}`, x(t) - (plotW / 14), h - pad.bottom + 6);
  }

  // 目標ライン(金の破線)と元手ライン
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#f6c453';
  ctx.beginPath();
  ctx.moveTo(pad.left, y(goalNav));
  ctx.lineTo(w - pad.right, y(goalNav));
  ctx.stroke();
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = 'rgba(185, 178, 216, 0.5)';
  ctx.beginPath();
  ctx.moveTo(pad.left, y(START_CASH));
  ctx.lineTo(w - pad.right, y(START_CASH));
  ctx.stroke();
  ctx.setLineDash([]);

  // 資産ライン+面
  if (navs.length > 1) {
    const area = new Path2D();
    const line = new Path2D();
    area.moveTo(x(0), y(navs[0]));
    line.moveTo(x(0), y(navs[0]));
    for (let t = 1; t < navs.length; t += 1) {
      area.lineTo(x(t), y(navs[t]));
      line.lineTo(x(t), y(navs[t]));
    }
    area.lineTo(x(navs.length - 1), h - pad.bottom);
    area.lineTo(x(0), h - pad.bottom);
    area.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    grad.addColorStop(0, 'rgba(85, 152, 231, 0.28)');
    grad.addColorStop(1, 'rgba(85, 152, 231, 0)');
    ctx.fillStyle = grad;
    ctx.fill(area);
    ctx.strokeStyle = '#5598e7';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke(line);
    ctx.lineWidth = 1;
  }

  // 現在値の強調
  const lastT = navs.length - 1;
  const lastNav = navs[lastT];
  ctx.fillStyle = '#5598e7';
  ctx.beginPath();
  ctx.arc(x(lastT), y(lastNav), 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2effa';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = x(lastT) > w - 80 ? 'right' : 'left';
  const labelX = x(lastT) + (ctx.textAlign === 'left' ? 7 : -7);
  ctx.fillText(yen(lastNav), labelX, y(lastNav) - 5);
}

// ── マーケット表 ───────────────────────────

function renderHoldings() {
  const body = $('holdings-body');
  body.textContent = '';
  for (const asset of ASSETS) {
    const price = sim.market.prices[asset.id];
    const h = sim.market.history[asset.id];
    const from = h[Math.max(0, h.length - 1 - 24)];
    const change = ((price - from) / from) * 100;
    let qty = 0;
    for (const book of Object.values(sim.books)) qty += book[asset.id]?.qty ?? 0;
    qty = Math.round(qty * 100) / 100;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${asset.name} <span class="code-num">${asset.code}</span></td>
      <td>${yen(price)}</td>
      <td class="${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '+' : ''}${change.toFixed(1)}%</td>
      <td>${qty === 0 ? '—' : `×${fmtQty(qty)}`}</td>
      <td>${qty === 0 ? '—' : yen(qty * price)}</td>
    `;
    body.appendChild(row);
  }
}

// ── サマリー・ミッション ───────────────────

function renderStats() {
  const nav = navOf(sim);
  const pnl = nav - START_CASH;
  $('stat-nav').textContent = yen(nav);
  $('stat-cash').textContent = `現金 ${yen(sim.cash)}`;
  const pnlEl = $('stat-pnl');
  pnlEl.textContent = signedYen(pnl);
  pnlEl.className = `v ${pnl >= 0 ? 'up' : 'down'}`;
  const pctEl = $('stat-pnl-pct');
  pctEl.textContent = `${pnl >= 0 ? '+' : '−'}${Math.abs((pnl / START_CASH) * 100).toFixed(1)}%`;
  pctEl.className = `s ${pnl >= 0 ? 'up' : 'down'}`;
  $('stat-clock').textContent = clockOf(sim.tick);
  const remaining = Math.max(0, TOTAL_TICKS - sim.tick);
  $('stat-remaining').textContent = sim.done ? 'ミッション終了' : `残り ${Math.floor(remaining / 24)}日 ${remaining % 24}h`;
  $('stat-gate-detail').textContent = `承認 ${sim.approved} / 却下 ${sim.rejected}`;
  $('mission-fill').style.width = `${Math.max(0, Math.min(100, (pnl / GOAL_PROFIT) * 100))}%`;
}

function renderAll() {
  renderStats();
  renderChart();
  renderLog();
  renderAgents();
  renderHoldings();
}

// ── 実行制御 ───────────────────────────────

function setBadge(state) {
  const badge = $('live-badge');
  badge.classList.toggle('running', state === 'LIVE');
  $('live-label').textContent = state;
}

function finish() {
  stopTimer();
  setBadge('COMPLETE');
  $('btn-toggle').textContent = '▶ 再開';
  const verdict = $('verdict');
  verdict.hidden = false;
  verdict.className = `verdict ${sim.result.achieved ? 'ok' : 'ng'}`;
  $('verdict-headline').textContent = sim.result.achieved
    ? '🎉 ミッション達成 — サブスク代を確保。解約は回避された'
    : '📉 目標未達 — 「……解約します」';
  $('verdict-detail').textContent = `最終資産 ${yen(sim.result.finalNav)}(${signedYen(sim.result.profit)})/ ${clockOf(sim.tick)} 時点 / 売買 ${sim.approved}回・却下 ${sim.rejected}回`;
}

function tickOnce() {
  const done = stepSim(sim);
  renderAll();
  if (done) finish();
}

function startTimer() {
  if (sim.done) return;
  stopTimer();
  running = true;
  setBadge('LIVE');
  $('btn-toggle').textContent = '⏸ 一時停止';
  timer = setInterval(tickOnce, SPEEDS[speedIndex].ms);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
  if (!sim?.done) {
    setBadge('PAUSED');
    $('btn-toggle').textContent = '▶ 再開';
  }
}

function boot(seed) {
  stopTimer();
  sim = createSim(seed);
  renderedLogCount = 0;
  $('activity-log').textContent = '';
  $('verdict').hidden = true;
  $('session-label').textContent = `SESSION ${seed}`;
  const url = new URL(window.location.href);
  url.searchParams.set('session', seed);
  history.replaceState(null, '', url);
  buildAgentCards();
  renderAll();
  startTimer();
}

$('btn-toggle').addEventListener('click', () => {
  if (sim.done) return;
  if (running) stopTimer();
  else startTimer();
});

$('btn-speed').addEventListener('click', () => {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  $('btn-speed').textContent = SPEEDS[speedIndex].label;
  if (running) startTimer();
});

$('btn-new').addEventListener('click', () => boot(newSeed()));
$('btn-new2').addEventListener('click', () => boot(newSeed()));
$('btn-replay').addEventListener('click', () => boot(sim.seed));

window.addEventListener('resize', () => {
  if (sim) renderChart();
});

const params = new URLSearchParams(window.location.search);
boot(params.get('session') || newSeed());
