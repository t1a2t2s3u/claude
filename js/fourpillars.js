// 四柱推命(簡易版): 年柱・日柱の干支を算出し、日干(生まれ日の十干)から
// 本質を鑑定する。月柱・時柱は節入りや出生時刻が必要なため扱わない。
// 日柱はユリウス通日(JDN)ベースの標準的な計算で、暦のうえで正確に求まる。

export const STEMS = [
  { char: '甲', yomi: 'きのえ', element: '木', yinyang: '陽' },
  { char: '乙', yomi: 'きのと', element: '木', yinyang: '陰' },
  { char: '丙', yomi: 'ひのえ', element: '火', yinyang: '陽' },
  { char: '丁', yomi: 'ひのと', element: '火', yinyang: '陰' },
  { char: '戊', yomi: 'つちのえ', element: '土', yinyang: '陽' },
  { char: '己', yomi: 'つちのと', element: '土', yinyang: '陰' },
  { char: '庚', yomi: 'かのえ', element: '金', yinyang: '陽' },
  { char: '辛', yomi: 'かのと', element: '金', yinyang: '陰' },
  { char: '壬', yomi: 'みずのえ', element: '水', yinyang: '陽' },
  { char: '癸', yomi: 'みずのと', element: '水', yinyang: '陰' },
];

export const BRANCH_CHARS = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 日干(生まれ日の十干)ごとの本質。四柱推命で「日主」と呼ばれる中心の星。
export const DAY_STEM_MEANINGS = {
  甲: {
    title: '大樹の人',
    description:
      'まっすぐ天に伸びる大木のように、芯が通った正直者。一度根を張った場所で、時間をかけて大きく成長します。曲がったことが嫌いで、周囲からの信頼は絶大です。',
  },
  乙: {
    title: '草花の人',
    description:
      '風にしなる草花のように、柔軟でしなやかな適応力の持ち主。どんな環境でも花を咲かせる粘り強さと、人の心を和ませる優しさがあります。',
  },
  丙: {
    title: '太陽の人',
    description:
      '空にひとつ輝く太陽のように、明るくエネルギッシュな存在。いるだけで場がぱっと華やぎます。裏表のないオープンな性格で、自然と人を照らします。',
  },
  丁: {
    title: '灯火の人',
    description:
      '夜道を照らすろうそくの灯のように、繊細であたたかい心の持ち主。細やかな気配りと情の深さで、身近な人の心をそっと照らします。',
  },
  戊: {
    title: '山岳の人',
    description:
      'どっしり構えた山のように、動じない安定感の持ち主。包容力があり、周囲から頼られる存在です。決めたことを着実に成し遂げる底力があります。',
  },
  己: {
    title: '大地の人',
    description:
      '作物を育てる畑の土のように、面倒見がよく育て上手。目立たなくても、周囲の才能を伸ばす縁の下の力持ちです。堅実で信頼される人柄です。',
  },
  庚: {
    title: '鋼の人',
    description:
      '鍛え抜かれた刃物のように、切れ味鋭い行動力の持ち主。決断が速く、困難に立ち向かうほど強くなります。さっぱりした気性で仲間思いです。',
  },
  辛: {
    title: '宝石の人',
    description:
      '磨かれて輝く宝石のように、繊細な美意識とプライドの持ち主。センスが良く、細部までこだわり抜きます。試練を経るほど輝きが増す人です。',
  },
  壬: {
    title: '大海の人',
    description:
      '大きな海や川のように、自由でスケールの大きい心の持ち主。発想が豊かで、どんなものも受け入れる度量があります。流れに乗るのが上手な人です。',
  },
  癸: {
    title: '雨露の人',
    description:
      '大地を潤す雨のように、静かで深い優しさの持ち主。観察眼が鋭く、知的で勉強家。じわじわと周囲に良い影響を広げていきます。',
  },
};

// 五行の相生(生み出す関係)。key が value を生む。
export const GENERATES = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
// 五行の相剋(抑える関係)。key が value を剋す。
export const OVERCOMES = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

// グレゴリオ暦の年月日からユリウス通日(JDN)を求める。
export function toJDN(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * 日柱の干支を求める(例: 2024/1/1 → 甲子)。
 * @returns {{ stem: object, branch: string, name: string }}
 */
export function getDayPillar(year, month, day) {
  const jdn = toJDN(year, month, day);
  const stem = STEMS[(jdn + 9) % 10];
  const branch = BRANCH_CHARS[(jdn + 1) % 12];
  return { stem, branch, name: `${stem.char}${branch}` };
}

/**
 * 年柱の干支を求める(暦年切り替えの簡易版。例: 1995 → 乙亥)。
 * @returns {{ stem: object, branch: string, name: string }}
 */
export function getYearPillar(year) {
  const stem = STEMS[(((year - 4) % 10) + 10) % 10];
  const branch = BRANCH_CHARS[(((year - 4) % 12) + 12) % 12];
  return { stem, branch, name: `${stem.char}${branch}` };
}

/**
 * 簡易命式(年柱・日柱と日干の鑑定)をまとめて返す。
 */
export function getFourPillars(year, month, day) {
  const yearPillar = getYearPillar(year);
  const dayPillar = getDayPillar(year, month, day);
  const dayStem = dayPillar.stem;
  return {
    yearPillar,
    dayPillar,
    dayStem,
    meaning: DAY_STEM_MEANINGS[dayStem.char],
  };
}
