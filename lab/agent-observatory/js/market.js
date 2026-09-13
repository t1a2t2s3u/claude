// 模擬市場。実在の銘柄・市場データは一切使わない架空5銘柄を、
// シード付きの幾何ブラウン運動+ニュースイベントで動かす。
// 1 tick = 模擬1時間。

import { pick, gauss } from './rng.js';

// vol / drift は1時間あたり。ミーム興業だけ極端に荒い値動きにしてある
export const ASSETS = [
  { id: 'hoshi', name: 'ホシ重工', vol: 0.011, drift: 0.0006, start: 420 },
  { id: 'tsuki', name: 'ツキ電機', vol: 0.008, drift: 0.0005, start: 264 },
  { id: 'nova', name: 'ノヴァ製薬', vol: 0.02, drift: 0.0012, start: 176 },
  { id: 'meme', name: 'ミーム興業', vol: 0.05, drift: 0.0028, start: 58 },
  { id: 'suisei', name: '彗星運輸', vol: 0.015, drift: 0.0007, start: 132 },
];

// ニュースの見出しテンプレート。dir: +1 = 好材料, -1 = 悪材料
const EVENT_POOL = [
  { dir: 1, text: (a) => `${a.name}、新製品発表がSNSで急拡散` },
  { dir: 1, text: (a) => `${a.name}、想定を上回る決算速報` },
  { dir: 1, text: (a) => `${a.name}に大型提携の観測報道` },
  { dir: 1, text: (a) => `著名投資家が${a.name}の保有を公表` },
  { dir: -1, text: (a) => `${a.name}、出荷遅延の噂で売り先行` },
  { dir: -1, text: (a) => `${a.name}に業績下方修正の観測` },
  { dir: -1, text: (a) => `${a.name}、主力製品のリコール報道` },
  { dir: -1, text: (a) => `大口保有者が${a.name}を一部売却との観測` },
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
    // 1銘柄あたり毎時4%の確率でニュースが発生する。
    // 好材料は+3〜15%、悪材料は−3〜11%と、わずかに上に歪ませてある
    if (rng() < 0.04) {
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

// 直近 n 時間の単純移動平均
export function sma(market, assetId, n) {
  const h = market.history[assetId];
  const slice = h.slice(-n);
  return slice.reduce((sum, p) => sum + p, 0) / slice.length;
}
