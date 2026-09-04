// 日替わり運勢の生成。
// 「日付 + 星座」から決定的にスコアを算出するため、同じ日に同じ星座で引けば
// 必ず同じ結果になり、日付が変わると結果も変わる。

import { ZODIAC_SIGNS } from './zodiac.js';

export const LUCKY_COLORS = [
  'レッド',
  'オレンジ',
  'イエロー',
  'グリーン',
  'ターコイズ',
  'ブルー',
  'ネイビー',
  'パープル',
  'ピンク',
  'ホワイト',
  'ゴールド',
  'シルバー',
];

export const LUCKY_ITEMS = [
  'コーヒー',
  '観葉植物',
  'ハンカチ',
  '腕時計',
  '本',
  'イヤホン',
  'マグカップ',
  'キーホルダー',
  '折りたたみ傘',
  'ノート',
  'チョコレート',
  'スニーカー',
];

// 総合運のスコア(1〜5)ごとのメッセージ候補。
const MESSAGES = {
  5: [
    '最高の追い風が吹く一日。迷っていたことがあるなら、今日が動くべきタイミングです。',
    '努力が実を結ぶ絶好調の日。新しい挑戦も、思い切った決断も、今日のあなたなら大丈夫。',
    '運気は最高潮。出会いやチャンスが向こうからやってくるので、フットワークを軽くして。',
  ],
  4: [
    '好調な流れの中にいます。周囲への感謝を言葉にすると、さらに運気がアップします。',
    'やりたかったことを一歩進めるのに向いた日。小さな行動が大きな成果につながります。',
    '直感が冴える日。ピンときたことは、深く考えすぎずに試してみましょう。',
  ],
  3: [
    '穏やかな運気の日。無理に攻めるより、目の前のことを丁寧にこなすのが吉です。',
    '平常運転の一日。ルーティンを整えたり、身の回りを片付けたりすると運が育ちます。',
    '大きな波はない日。気になっていた人に連絡してみると、うれしい展開があるかも。',
  ],
  2: [
    '少し空回りしやすい日。予定を詰め込みすぎず、余裕を持って行動しましょう。',
    '慎重さが吉と出る日。即断せず、一晩置いてから決めるとうまくいきます。',
    '疲れがたまりやすいとき。好きな音楽や温かい飲み物で、自分をいたわって。',
  ],
  1: [
    '今日は充電日。頑張るより休むことが、明日以降の運気を引き上げます。',
    '思い通りに進みにくい日ですが、焦りは禁物。ゆっくり構えれば流れは戻ってきます。',
    'ミスが出やすい日なので確認は念入りに。無事に終えられたら、それだけで花丸です。',
  ],
};

// mulberry32: シード付きの軽量な擬似乱数生成器。
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 文字列を32bit整数ハッシュに変換する(FNV-1a)。
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Date を YYYY-MM-DD 形式(ローカル時刻基準)にする。
 */
export function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function score(rng) {
  return 1 + Math.floor(rng() * 5);
}

/**
 * 指定した日付・星座の運勢を生成する。
 * personalSeed に干支や血液型などを渡すと、同じ星座でも人ごとに
 * 異なる「パーソナル運勢」になる(決定性は保たれる)。
 * @param {string} signId 星座ID(例: 'aries')
 * @param {Date} [date] 省略時は今日
 * @param {string} [personalSeed] 追加のシード(例: 'ne:A')
 * @returns {{
 *   dateKey: string,
 *   scores: { total: number, love: number, work: number, money: number },
 *   luckyColor: string,
 *   luckyItem: string,
 *   message: string,
 * }}
 */
export function getDailyFortune(signId, date = new Date(), personalSeed = '') {
  const dateKey = formatDateKey(date);
  const seedKey = personalSeed
    ? `${dateKey}:${signId}:${personalSeed}`
    : `${dateKey}:${signId}`;
  const rng = mulberry32(hashString(seedKey));

  const scores = {
    total: score(rng),
    love: score(rng),
    work: score(rng),
    money: score(rng),
  };

  return {
    dateKey,
    scores,
    luckyColor: pick(rng, LUCKY_COLORS),
    luckyItem: pick(rng, LUCKY_ITEMS),
    message: pick(rng, MESSAGES[scores.total]),
  };
}

/**
 * その日の12星座ランキングを返す(1位から順)。
 * 総合スコアで比較し、同点は恋愛・仕事・金運の合計、それでも同点なら
 * 日付ごとに決まるタイブレーク値で順位を安定させる。
 * @param {Date} [date] 省略時は今日
 * @returns {Array<{ sign: object, fortune: object, rank: number }>}
 */
export function getDailyRanking(date = new Date()) {
  const dateKey = formatDateKey(date);
  const entries = ZODIAC_SIGNS.map((sign) => {
    const fortune = getDailyFortune(sign.id, date);
    const sub = fortune.scores.love + fortune.scores.work + fortune.scores.money;
    const tieBreak = hashString(`${dateKey}:rank:${sign.id}`);
    return { sign, fortune, sub, tieBreak };
  });

  entries.sort(
    (a, b) =>
      b.fortune.scores.total - a.fortune.scores.total ||
      b.sub - a.sub ||
      b.tieBreak - a.tieBreak
  );

  return entries.map((e, i) => ({ sign: e.sign, fortune: e.fortune, rank: i + 1 }));
}
