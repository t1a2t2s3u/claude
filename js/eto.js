// 十二支(干支)の定義と、生まれ年からの判定。
// 一般的な慣習に合わせて元日切り替えの暦年で判定する(旧暦・立春は考慮しない)。

export const ETO_LIST = [
  {
    id: 'ne',
    name: '子(ね)',
    animal: 'ねずみ',
    emoji: '🐭',
    keyword: '機転',
    traits: '頭の回転が速く、環境の変化にすばやく適応する働き者。人脈づくりの才能があります。',
  },
  {
    id: 'ushi',
    name: '丑(うし)',
    animal: 'うし',
    emoji: '🐮',
    keyword: '粘り強さ',
    traits: '一歩一歩着実に進む努力家。時間がかかっても最後には大きな成果を手にします。',
  },
  {
    id: 'tora',
    name: '寅(とら)',
    animal: 'とら',
    emoji: '🐯',
    keyword: '勇気',
    traits: '正義感が強く度胸のあるチャレンジャー。ここぞという場面で頼りになる存在です。',
  },
  {
    id: 'u',
    name: '卯(う)',
    animal: 'うさぎ',
    emoji: '🐰',
    keyword: '柔和さ',
    traits: '物腰がやわらかく、場の空気を和ませる平和主義者。愛され上手で敵をつくりません。',
  },
  {
    id: 'tatsu',
    name: '辰(たつ)',
    animal: 'たつ',
    emoji: '🐲',
    keyword: 'スケール',
    traits: '理想が高くエネルギッシュ。大きな夢を掲げ、周囲を巻き込みながら突き進みます。',
  },
  {
    id: 'mi',
    name: '巳(み)',
    animal: 'へび',
    emoji: '🐍',
    keyword: '探究心',
    traits: '物事を深く見つめる知性派。一度決めたことを静かに、確実にやり遂げます。',
  },
  {
    id: 'uma',
    name: '午(うま)',
    animal: 'うま',
    emoji: '🐴',
    keyword: '行動力',
    traits: '明るく社交的なスピード派。フットワークの軽さで、次々とチャンスをつかみます。',
  },
  {
    id: 'hitsuji',
    name: '未(ひつじ)',
    animal: 'ひつじ',
    emoji: '🐑',
    keyword: '思いやり',
    traits: '穏やかで人情に厚い調整役。グループの中で安心感をもたらす存在です。',
  },
  {
    id: 'saru',
    name: '申(さる)',
    animal: 'さる',
    emoji: '🐵',
    keyword: '器用さ',
    traits: '多才で要領がよく、ユーモアのセンスも抜群。どんな環境でも器用に活躍できます。',
  },
  {
    id: 'tori',
    name: '酉(とり)',
    animal: 'とり',
    emoji: '🐔',
    keyword: '先見性',
    traits: '勘が鋭く、細かいところによく気がつく世話好き。時代の流れを読む力があります。',
  },
  {
    id: 'inu',
    name: '戌(いぬ)',
    animal: 'いぬ',
    emoji: '🐶',
    keyword: '誠実さ',
    traits: '義理堅く、一度信頼した相手にはとことん尽くす忠義の人。約束を必ず守ります。',
  },
  {
    id: 'i',
    name: '亥(い)',
    animal: 'いのしし',
    emoji: '🐗',
    keyword: '一直線',
    traits: '目標に向かってまっすぐ突き進む純粋な情熱家。裏表がなく、信頼を集めます。',
  },
];

/**
 * 西暦年から十二支を返す。
 * 子年を基準にした剰余計算(例: 2020年 → 子)。
 * @param {number} year 例: 1995
 * @returns {object} ETO_LIST の要素
 */
export function getEto(year) {
  return ETO_LIST[(((year - 4) % 12) + 12) % 12];
}
