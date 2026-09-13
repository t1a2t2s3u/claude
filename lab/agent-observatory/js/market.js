// 模擬市場。銘柄名・証券コードは実在の日本株20銘柄だが、
// 価格・値動き・ニュースはすべてシード付き乱数による架空の生成であり、
// 実際の株価・実際の報道とは一切連動しない(startは開発時点の概算水準)。
// 1 tick = 模擬1時間。

import { pick, gauss } from './rng.js';

// vol / drift は1時間あたり。銘柄ごとの「性格」をボラで表現している
export const ASSETS = [
  { id: 'toyota', name: 'トヨタ自動車', code: '7203', vol: 0.009, drift: 0.0005, start: 2900 },
  { id: 'sony', name: 'ソニーグループ', code: '6758', vol: 0.011, drift: 0.0007, start: 4000 },
  { id: 'nintendo', name: '任天堂', code: '7974', vol: 0.012, drift: 0.0007, start: 11000 },
  { id: 'mufg', name: '三菱UFJ', code: '8306', vol: 0.01, drift: 0.0005, start: 2000 },
  { id: 'sbg', name: 'ソフトバンクG', code: '9984', vol: 0.022, drift: 0.0012, start: 15000 },
  { id: 'ntt', name: 'NTT', code: '9432', vol: 0.006, drift: 0.0003, start: 160 },
  { id: 'kddi', name: 'KDDI', code: '9433', vol: 0.006, drift: 0.0003, start: 4900 },
  { id: 'honda', name: 'ホンダ', code: '7267', vol: 0.009, drift: 0.0004, start: 1500 },
  { id: 'nissan', name: '日産自動車', code: '7201', vol: 0.016, drift: 0.0004, start: 350 },
  { id: 'rakuten', name: '楽天グループ', code: '4755', vol: 0.018, drift: 0.0009, start: 900 },
  { id: 'mercari', name: 'メルカリ', code: '4385', vol: 0.02, drift: 0.001, start: 2200 },
  { id: 'sanrio', name: 'サンリオ', code: '8136', vol: 0.02, drift: 0.0012, start: 6500 },
  { id: 'tepco', name: '東京電力HD', code: '9501', vol: 0.018, drift: 0.0008, start: 600 },
  { id: 'eneos', name: 'ENEOS', code: '5020', vol: 0.009, drift: 0.0004, start: 850 },
  { id: 'nsteel', name: '日本製鉄', code: '5401', vol: 0.011, drift: 0.0005, start: 3300 },
  { id: 'mitsui', name: '三井物産', code: '8031', vol: 0.01, drift: 0.0005, start: 3600 },
  { id: 'jal', name: '日本航空', code: '9201', vol: 0.008, drift: 0.0004, start: 2800 },
  { id: 'metaplanet', name: 'メタプラネット', code: '3350', vol: 0.05, drift: 0.0028, start: 600 },
  { id: 'keyence', name: 'キーエンス', code: '6861', vol: 0.01, drift: 0.0006, start: 65000 },
  { id: 'tel', name: '東京エレクトロン', code: '8035', vol: 0.016, drift: 0.001, start: 25000 },
];

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
    // 1銘柄あたり毎時1%の確率でニュースが発生する(20銘柄で1tickに約0.2件)。
    // 好材料は+3〜15%、悪材料は−3〜11%と、わずかに上に歪ませてある
    if (rng() < 0.01) {
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

// 小数株(0.01株刻み)の数量表示。整数はそのまま、端株は2桁で示す
export function fmtQty(qty) {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
}
