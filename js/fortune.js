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

// カテゴリ別アドバイス。スコア帯(高: 4-5 / 中: 3 / 低: 1-2)ごとの候補。
const CATEGORY_ADVICE = {
  love: {
    high: [
      '恋愛運は絶好調。気になる人には自分から連絡してみて。素直さが一番の魅力になります。',
      '愛される日。ほめ言葉は照れずに受け取ると、さらに良い流れがやってきます。',
      'ふたりの距離がぐっと縮まる予感。次に会う約束を今日のうちに決めるのが吉。',
    ],
    mid: [
      '穏やかな恋愛運。焦らず、日常の小さな「ありがとう」を積み重ねるのが吉です。',
      '聞き役に回ると魅力が伝わる日。相手の話に丁寧に相づちを打ってみて。',
    ],
    low: [
      '今日は自分磨きに向く日。好きな服や香りで、自分の機嫌を先に取りましょう。',
      '恋を急がない方がうまくいく日。返信はゆっくりでも大丈夫です。',
    ],
  },
  work: {
    high: [
      '仕事運は上昇気流。挑戦したかった仕事に手を挙げると、追い風が吹きます。',
      '集中力が冴える日。一番重たいタスクを午前中に片づけると波に乗れます。',
      'あなたの提案が通りやすい日。温めていたアイデアを出すなら今日です。',
    ],
    mid: [
      '安定した仕事運。ルーティンを丁寧にこなすことが、明日の信頼につながります。',
      '整理整頓が運気を助ける日。机とメールの受信箱を片づけてみて。',
    ],
    low: [
      '無理は禁物の日。確認を念入りに、締め切りには余裕を持たせましょう。',
      '頑張りすぎないのが正解。今日は6割の力で流し、明日に備えて。',
    ],
  },
  money: {
    high: [
      '金運は好調。お得な情報が舞い込みやすい日なので、アンテナを高くして。',
      '使いどころが冴える日。長く使うものへの投資は今日が買いどきです。',
    ],
    mid: [
      '金運は安定。予算内でのやりくりが楽しくなる日です。',
      '小さな節約が効く日。コンビニに寄る回数を1回減らすと流れが良くなります。',
    ],
    low: [
      '財布のひもは固めに。「今日は見るだけ」と決めてウィンドウショッピングを。',
      '大きな買い物は明日以降に。今日は貯める日と割り切ると運気が守られます。',
    ],
  },
};

function adviceBand(score) {
  if (score >= 4) return 'high';
  if (score === 3) return 'mid';
  return 'low';
}

// mulberry32: シード付きの軽量な擬似乱数生成器。
export function mulberry32(seed) {
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
export function hashString(str) {
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
    advice: {
      love: pick(rng, CATEGORY_ADVICE.love[adviceBand(scores.love)]),
      work: pick(rng, CATEGORY_ADVICE.work[adviceBand(scores.work)]),
      money: pick(rng, CATEGORY_ADVICE.money[adviceBand(scores.money)]),
    },
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
