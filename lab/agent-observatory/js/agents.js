// AIエージェント10体の編成と売買判断ロジック。
// トレーダー8体+承認ゲート(SPICA)+司令塔(ARCTURUS)。
// decide() は市場と自分の帳簿だけを見て注文案を返す純関数で、DOMに触れない。

import { ASSETS, changePct, sma } from './market.js';

// ボラティリティで銘柄を役割分けする(銘柄リストが変わっても追従する)
const BY_VOL = [...ASSETS].sort((a, b) => b.vol - a.vol);
const HYPE = BY_VOL[0]; // 最も荒い銘柄。DENEBの主戦場
const CALM_IDS = BY_VOL.slice(-3).map((a) => a.id); // 低ボラ3銘柄。POLARISの積み立て先

export const AGENTS = [
  { id: 'orion', code: 'ORION', role: '順張り', desc: '直近3時間の上昇に乗る', kind: 'trader' },
  { id: 'cassiopeia', code: 'CASSIOPEIA', role: '逆張り', desc: '売られすぎた銘柄を拾う', kind: 'trader' },
  { id: 'vega', code: 'VEGA', role: 'トレンド', desc: '24時間移動平均の上抜けを追う', kind: 'trader' },
  { id: 'altair', code: 'ALTAIR', role: 'スキャル', desc: '小さな値動きを高速に刻む', kind: 'trader' },
  { id: 'sirius', code: 'SIRIUS', role: 'バリュー', desc: '基準価格から下げた銘柄を仕込む', kind: 'trader' },
  { id: 'lyra', code: 'LYRA', role: 'イベント', desc: 'ニュース速報に即応する', kind: 'trader' },
  { id: 'deneb', code: 'DENEB', role: 'ボラ職人', desc: '最高ボラ銘柄の乱高下だけを狙う', kind: 'trader' },
  { id: 'polaris', code: 'POLARIS', role: '安定運用', desc: '低ボラ銘柄で手堅く積む', kind: 'trader' },
  { id: 'spica', code: 'SPICA', role: '承認ゲート', desc: '全注文をリスク審査する', kind: 'gate' },
  { id: 'arcturus', code: 'ARCTURUS', role: '司令塔', desc: '進捗を監視し日次報告する', kind: 'commander' },
];

export const TRADERS = AGENTS.filter((a) => a.kind === 'trader');

function fmtPct(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

// 保有中で条件に合う最初のポジションを探す
function findHolding(book, test) {
  for (const [assetId, pos] of Object.entries(book)) {
    if (pos.qty > 0 && test(assetId, pos)) return assetId;
  }
  return null;
}

// view: { market, book, cash, nav, news }
// 戻り値: { side: 'buy' | 'sell', assetId, reason, sizing } または null
// sizing は買い予算の係数(1 = 標準)。数量確定と資金チェックは sim 側で行う
const DECIDERS = {
  orion(view) {
    const held = findHolding(view.book, (id) => changePct(view.market, id, 3) < -1.5);
    if (held) {
      return { side: 'sell', assetId: held, reason: `直近3hで${fmtPct(changePct(view.market, held, 3))}。流れが切れたので手仕舞い` };
    }
    let best = null;
    for (const a of ASSETS) {
      const c = changePct(view.market, a.id, 3);
      if (c > 1.5 && (!best || c > best.c)) best = { id: a.id, c };
    }
    if (best) {
      return { side: 'buy', assetId: best.id, reason: `直近3hで${fmtPct(best.c)}。上昇の初動に順張り` };
    }
    return null;
  },

  cassiopeia(view) {
    const held = findHolding(view.book, (id, pos) => view.market.prices[id] >= pos.cost * 1.08);
    if (held) {
      return { side: 'sell', assetId: held, reason: 'リバウンドで+8%到達。逆張り分を利確' };
    }
    let worst = null;
    for (const a of ASSETS) {
      const c = changePct(view.market, a.id, 24);
      if (c < -6 && (!worst || c < worst.c)) worst = { id: a.id, c };
    }
    if (worst && !view.book[worst.id]?.qty) {
      return { side: 'buy', assetId: worst.id, reason: `24hで${fmtPct(worst.c)}。売られすぎと判断し逆張り` };
    }
    return null;
  },

  vega(view) {
    const held = findHolding(view.book, (id) => view.market.prices[id] < sma(view.market, id, 24) * 0.985);
    if (held) {
      return { side: 'sell', assetId: held, reason: '24h移動平均を下抜け。トレンド終了とみて撤退' };
    }
    for (const a of ASSETS) {
      const h = view.market.history[a.id];
      if (h.length < 30 || view.book[a.id]?.qty) continue;
      const now = sma(view.market, a.id, 24);
      const before = sma({ ...view.market, history: { ...view.market.history, [a.id]: h.slice(0, -6) } }, a.id, 24);
      if (view.market.prices[a.id] > now * 1.005 && now > before) {
        return { side: 'buy', assetId: a.id, reason: '24h移動平均が上向きで価格が上抜け。トレンド入り' };
      }
    }
    return null;
  },

  altair(view) {
    const win = findHolding(view.book, (id, pos) => view.market.prices[id] >= pos.cost * 1.015);
    if (win) return { side: 'sell', assetId: win, reason: '+1.5%で即利確。小さく速く刻む' };
    const lose = findHolding(view.book, (id, pos) => view.market.prices[id] <= pos.cost * 0.99);
    if (lose) return { side: 'sell', assetId: lose, reason: '-1%で機械的に損切り' };
    for (const a of ASSETS) {
      const c = changePct(view.market, a.id, 1);
      if (c > 0.8 && !view.book[a.id]?.qty) {
        return { side: 'buy', assetId: a.id, sizing: 0.5, reason: `1hで${fmtPct(c)}の初速。小ロットでスキャル` };
      }
    }
    return null;
  },

  sirius(view) {
    const held = findHolding(view.book, (id, pos) => view.market.prices[id] >= pos.cost * 1.2);
    if (held) return { side: 'sell', assetId: held, reason: '想定価格まで戻った(+20%)。バリュー分を売却' };
    let cheapest = null;
    for (const a of ASSETS) {
      const disc = ((view.market.prices[a.id] - a.start) / a.start) * 100;
      if (disc < -8 && (!cheapest || disc < cheapest.disc)) cheapest = { id: a.id, disc };
    }
    if (cheapest && !view.book[cheapest.id]?.qty) {
      return { side: 'buy', assetId: cheapest.id, reason: `基準価格から${fmtPct(cheapest.disc)}。割安とみて仕込み` };
    }
    return null;
  },

  lyra(view) {
    for (const n of view.news) {
      if (n.impact < 0 && view.book[n.assetId]?.qty > 0) {
        return { side: 'sell', assetId: n.assetId, reason: '悪材料の速報を検知。即座に売り抜け' };
      }
      if (n.impact > 0.05 && !view.book[n.assetId]?.qty) {
        return { side: 'buy', assetId: n.assetId, reason: '好材料の速報を検知。ニュースに飛び乗り' };
      }
    }
    const stale = findHolding(view.book, (id, pos) => view.market.prices[id] >= pos.cost * 1.1);
    if (stale) return { side: 'sell', assetId: stale, reason: 'イベント後の上昇一服。+10%で利確' };
    return null;
  },

  deneb(view) {
    const pos = view.book[HYPE.id];
    const c2 = changePct(view.market, HYPE.id, 2);
    if (pos?.qty > 0 && (view.market.prices[HYPE.id] >= pos.cost * 1.15 || c2 > 9)) {
      return { side: 'sell', assetId: HYPE.id, reason: `${HYPE.name}が急騰(2hで${fmtPct(c2)})。高値に売りつける` };
    }
    if (pos?.qty > 0 && view.market.prices[HYPE.id] <= pos.cost * 0.9) {
      return { side: 'sell', assetId: HYPE.id, reason: '想定より深い下げ。-10%で撤退' };
    }
    if (!pos?.qty && c2 < -5) {
      return { side: 'buy', assetId: HYPE.id, reason: `${HYPE.name}が2hで${fmtPct(c2)}の急落。反発を狙って拾う` };
    }
    return null;
  },

  polaris(view) {
    const held = findHolding(view.book, (id, pos) => view.market.prices[id] >= pos.cost * 1.05);
    if (held) return { side: 'sell', assetId: held, reason: '+5%を確保。欲張らずに積み上げる' };
    for (const id of CALM_IDS) {
      const c = changePct(view.market, id, 6);
      if (!view.book[id]?.qty && Math.abs(c) < 1) {
        return { side: 'buy', assetId: id, sizing: 0.7, reason: '値動きが落ち着いた低ボラ銘柄を定期積み立て' };
      }
    }
    return null;
  },
};

export function decide(agentId, view) {
  const decider = DECIDERS[agentId];
  return decider ? decider(view) : null;
}

// SPICA(承認ゲート)。注文を審査して { ok, reason } を返す。
// 売り(リスク縮小)は常に通し、買いは現金余力・集中度・ドローダウンで絞る
export function reviewOrder(order, ctx) {
  if (order.side === 'sell') return { ok: true, reason: 'リスク縮小のため即時承認' };
  if (ctx.cashAfter < ctx.nav * 0.05) {
    return { ok: false, reason: '現金比率が5%を下回るため却下' };
  }
  if (ctx.exposureAfter > ctx.nav * 0.45) {
    return { ok: false, reason: '1銘柄への集中が45%を超えるため却下' };
  }
  if (ctx.drawdown > 0.15) {
    return { ok: false, reason: 'ドローダウン15%超。新規買いを凍結中' };
  }
  return { ok: true, reason: 'リスク基準内。承認' };
}
