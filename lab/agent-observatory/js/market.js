// 模擬市場。対象は東証上場の内国株式 全銘柄(stocks.data.js)。
// 銘柄名・証券コード・基準価格(取得時点の終値概算)は実在だが、
// 以降の値動き・ニュースはすべてシード付き乱数による架空の生成であり、
// 実際の株価・実際の報道とは一切連動しない。
// 1 tick = 模擬1時間。

import { createRng, pick, gauss } from './rng.js';
import { STOCKS, STOCKS_UPDATED } from './stocks.data.js';

export { STOCKS_UPDATED };

// 銘柄ごとの「性格」(ボラティリティ・ドリフト)は市場区分をベースに、
// 固定シードの乱数で決定的に割り当てる。セッションのシードとは独立なので、
// どのセッションでも同じ銘柄は同じ性格を持つ。
// vol / drift は1時間あたり。グロース市場ほど荒く、ごく一部に超高ボラ株がある
const VOL_RANGE = { P: [0.005, 0.013], S: [0.007, 0.019], G: [0.012, 0.04] };

export const ASSETS = (() => {
  const rng = createRng('observatory:universe-v1');
  return STOCKS.map(([code, name, seg, price]) => {
    const [lo, hi] = VOL_RANGE[seg];
    let vol = lo + rng() * (hi - lo);
    if (rng() < 0.02) vol = Math.min(0.05, vol * 1.6); // ミーム株枠
    const drift = 0.0002 + rng() * 0.0006 + vol * 0.02;
    // 価格欠損・異常値の銘柄には ¥100〜¥5,000 の疑似価格を割り当てる
    const start = price > 0 ? price : Math.round(100 * Math.pow(50, rng()));
    return { id: code, code, name, seg, vol, drift, start };
  });
})();

// ニュースの見出しテンプレート。dir: +1 = 好材料, -1 = 悪材料。
// 実在企業名につくため、企業の事実をでっち上げる文面(決算・事故など)は
// 使わず、需給・観測ベースの市況フレーバーに限定している
const EVENT_POOL = [
  { dir: 1, text: (a) => `${a.name}に買い注文が殺到、急伸` },
  { dir: 1, text: (a) => `${a.name}、好材料観測で物色が集まる` },
  { dir: 1, text: (a) => `${a.name}に海外勢の買い観測` },
  { dir: 1, text: (a) => `SNSで${a.name}への強気見通しが拡散` },
  { dir: -1, text: (a) => `${a.name}に利益確定売りが膨らむ` },
  { dir: -1, text: (a) => `${a.name}、地合い悪化で売り先行` },
  { dir: -1, text: (a) => `${a.name}から資金流出、急落` },
  { dir: -1, text: (a) => `${a.name}に弱気観測が広がる` },
];

// その週の「地合い」。全銘柄のドリフトに一律で加算される
// (1時間あたり±0.1%程度 → 1週間で±10%超の追い風・向かい風になり得る)
export function createMarket(rng) {
  const regime = gauss(rng) * 0.0009;
  return {
    regime,
    regimeLabel: regime > 0.0004 ? '強気' : regime < -0.0004 ? '弱気' : '中立',
    prices: Object.fromEntries(ASSETS.map((a) => [a.id, a.start])),
    history: Object.fromEntries(ASSETS.map((a) => [a.id, [a.start]])),
  };
}

// 1時間ぶん進める。発生したニュースの配列を返す
export function stepMarket(market, rng) {
  const news = [];
  for (const asset of ASSETS) {
    let price = market.prices[asset.id];
    price *= Math.exp(asset.drift + market.regime + asset.vol * gauss(rng));
    // ニュースは全銘柄あわせて1tickに約0.2件になる確率で発生する。
    // 好材料は+3〜15%、悪材料は−3〜11%と、わずかに上に歪ませてある
    if (rng() < 0.00006) {
      const event = pick(rng, EVENT_POOL);
      const impact = event.dir * (0.03 + rng() * (event.dir > 0 ? 0.12 : 0.08));
      price *= 1 + impact;
      news.push({ assetId: asset.id, impact, text: event.text(asset) });
    }
    market.prices[asset.id] = Math.max(1, Math.round(price * 100) / 100);
    market.history[asset.id].push(market.prices[asset.id]);
  }
  return news;
}

// 直近 n 時間の騰落率(%)。履歴が足りないときは取れる範囲で計算する
export function changePct(market, assetId, n) {
  const h = market.history[assetId];
  const from = h[Math.max(0, h.length - 1 - n)];
  return ((h[h.length - 1] - from) / from) * 100;
}

// back 時間前を終点とする n 時間の単純移動平均。
// 全銘柄を毎tick走査するため、配列コピーを作らずに計算する
export function smaAt(market, assetId, n, back = 0) {
  const h = market.history[assetId];
  const end = Math.max(1, h.length - back);
  const begin = Math.max(0, end - n);
  let sum = 0;
  for (let i = begin; i < end; i += 1) sum += h[i];
  return sum / (end - begin);
}

export function sma(market, assetId, n) {
  return smaAt(market, assetId, n, 0);
}

// 小数株(0.01株刻み)の数量表示。整数はそのまま、端株は2桁で示す
export function fmtQty(qty) {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
}
