// 価格生成エンジン。
//
// 1 日のリターンを次の 3 要素に分解して積み上げる（簡易マルチファクターモデル）。
//   r = 固有ドリフト + β × 市場要因 + γ × セクター要因 + 固有ノイズ + イベント
// 終値は r を指数に載せて幾何ブラウン運動的に更新し、
// 始値・高値・安値は終値まわりのノイズから作る。

import { INSTRUMENTS } from './instruments.js';

const TRADING_DAYS = 252;
const SECTOR_LOAD = 0.35; // セクター要因への感応度（全銘柄共通）

const MARKET_DRIFT = 0.045; // 市場全体の年率期待リターン
const MARKET_VOL = 0.17; // 市場全体の年率ボラティリティ
const SECTOR_VOL = 0.12;

const NEWS_TEMPLATES = {
  good: [
    { text: '{name}が通期業績予想を上方修正', impact: [0.03, 0.09] },
    { text: '{name}に大口受注、取引先と長期契約', impact: [0.02, 0.06] },
    { text: '{name}が自社株買いを発表', impact: [0.02, 0.05] },
    { text: '{name}の新製品が想定超えの初動', impact: [0.02, 0.07] },
    { text: '{name}、増配を決定', impact: [0.01, 0.04] },
  ],
  bad: [
    { text: '{name}が通期業績予想を下方修正', impact: [-0.09, -0.03] },
    { text: '{name}で品質問題、一部製品を回収', impact: [-0.07, -0.02] },
    { text: '{name}の主力工場が一時停止', impact: [-0.06, -0.02] },
    { text: '{name}、大株主の売り出しを発表', impact: [-0.05, -0.01] },
    { text: '{name}に対する投資判断が引き下げ', impact: [-0.04, -0.01] },
  ],
  sector: [
    { text: '{sector}セクターに追い風、業界指標が改善', impact: [0.015, 0.04] },
    { text: '{sector}セクターに逆風、規制強化の観測', impact: [-0.04, -0.015] },
  ],
  market: [
    { text: '海外市場が大幅高、リスク選好が強まる', impact: [0.015, 0.035] },
    { text: '金融引き締め観測で全体に売り圧力', impact: [-0.035, -0.015] },
    { text: '好材料出尽くしで主要指数が反落', impact: [-0.03, -0.01] },
    { text: '景気指標が市場予想を上回る', impact: [0.01, 0.03] },
  ],
};

/** 初期状態を作る。bars は空で、最初の 1 本は engine 側の step で生まれる */
export function createMarketState() {
  const instruments = {};
  for (const spec of INSTRUMENTS) {
    instruments[spec.symbol] = {
      symbol: spec.symbol,
      last: spec.start,
      bars: [], // { date, open, high, low, close, volume }
      baseVolume: 180_000 + Math.round((3000 / spec.start) * 90_000),
    };
  }
  return { instruments, index: 1000 };
}

function sample(rng, [lo, hi]) {
  return lo + rng.next() * (hi - lo);
}

/**
 * 1 営業日分のイベント（ニュース）を抽選する。
 * 返り値は { marketShock, sectorShocks, symbolShocks, news[] }。
 */
export function rollEvents(rng, date) {
  const news = [];
  let marketShock = 0;
  const sectorShocks = {};
  const symbolShocks = {};

  if (rng.chance(0.1)) {
    const t = rng.pick(NEWS_TEMPLATES.market);
    marketShock = sample(rng, t.impact);
    news.push({ date, scope: 'market', text: t.text, impact: marketShock });
  }

  if (rng.chance(0.14)) {
    const inst = rng.pick(INSTRUMENTS);
    const t = rng.pick(NEWS_TEMPLATES.sector);
    const shock = sample(rng, t.impact);
    sectorShocks[inst.sector] = (sectorShocks[inst.sector] ?? 0) + shock;
    news.push({
      date,
      scope: 'sector',
      sector: inst.sector,
      text: t.text.replace('{sector}', inst.sector),
      impact: shock,
    });
  }

  for (const inst of INSTRUMENTS) {
    if (!rng.chance(0.018)) continue;
    const good = rng.chance(0.5);
    const t = rng.pick(good ? NEWS_TEMPLATES.good : NEWS_TEMPLATES.bad);
    const shock = sample(rng, t.impact);
    symbolShocks[inst.symbol] = (symbolShocks[inst.symbol] ?? 0) + shock;
    news.push({
      date,
      scope: 'symbol',
      symbol: inst.symbol,
      text: t.text.replace('{name}', inst.name),
      impact: shock,
    });
  }

  return { marketShock, sectorShocks, symbolShocks, news };
}

/**
 * 1 営業日進めて、全銘柄の新しい足を確定させる。
 * market は破壊的に更新し、生成したニュースを返す。
 */
export function stepMarket(market, rng, date) {
  const events = rollEvents(rng, date);

  const marketReturn =
    MARKET_DRIFT / TRADING_DAYS +
    (MARKET_VOL / Math.sqrt(TRADING_DAYS)) * rng.normal() +
    events.marketShock;

  const sectorReturns = {};
  for (const sector of new Set(INSTRUMENTS.map((i) => i.sector))) {
    sectorReturns[sector] =
      (SECTOR_VOL / Math.sqrt(TRADING_DAYS)) * rng.normal() + (events.sectorShocks[sector] ?? 0);
  }

  let indexReturnSum = 0;

  for (const spec of INSTRUMENTS) {
    const state = market.instruments[spec.symbol];
    const prev = state.last;

    const idio = (spec.vol / Math.sqrt(TRADING_DAYS)) * rng.normal();
    const ret =
      spec.drift / TRADING_DAYS +
      spec.beta * marketReturn +
      SECTOR_LOAD * sectorReturns[spec.sector] +
      idio +
      (events.symbolShocks[spec.symbol] ?? 0);

    const close = Math.max(1, prev * Math.exp(ret));

    // 始値は前日終値からのギャップ、高安は日中のブレとして作る
    const open = Math.max(1, prev * Math.exp((spec.vol / Math.sqrt(TRADING_DAYS)) * 0.4 * rng.normal()));
    const wick = Math.abs(ret) * 0.6 + (spec.vol / Math.sqrt(TRADING_DAYS)) * 0.7;
    const high = Math.max(open, close) * (1 + wick * rng.next());
    const low = Math.min(open, close) * (1 - wick * rng.next());

    const volume = Math.round(
      state.baseVolume * (0.55 + rng.next() * 0.9) * (1 + Math.min(6, Math.abs(ret) * 28))
    );

    state.bars.push({
      date,
      open: round1(open),
      high: round1(Math.max(high, open, close)),
      low: round1(Math.min(low, open, close)),
      close: round1(close),
      volume,
    });
    state.last = round1(close);
    indexReturnSum += ret;
  }

  market.index = round1(market.index * Math.exp(indexReturnSum / INSTRUMENTS.length));
  return events.news;
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

/** 直近 n 本の終値の単純移動平均を、足と同じ長さの配列で返す（不足分は null） */
export function sma(bars, n) {
  const out = new Array(bars.length).fill(null);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= n) sum -= bars[i - n].close;
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** 前日比（直近の足と 1 本前の終値の比） */
export function changeRatio(bars) {
  if (bars.length < 2) return 0;
  const prev = bars[bars.length - 2].close;
  return prev === 0 ? 0 : bars[bars.length - 1].close / prev - 1;
}
