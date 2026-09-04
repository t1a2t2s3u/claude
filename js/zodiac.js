// 12星座の定義と、生年月日からの星座判定。
// 日付範囲は一般的な区分(例: 牡羊座 3/21〜4/19)を採用している。

export const ZODIAC_SIGNS = [
  {
    id: 'aries',
    name: '牡羊座',
    symbol: '♈',
    element: '火',
    period: '3/21〜4/19',
    traits: '行動力とチャレンジ精神にあふれるパイオニア。思い立ったら即行動する情熱家です。',
  },
  {
    id: 'taurus',
    name: '牡牛座',
    symbol: '♉',
    element: '地',
    period: '4/20〜5/20',
    traits: '五感が鋭くマイペースな安定志向。一度決めたことを着実にやり遂げる粘り強さがあります。',
  },
  {
    id: 'gemini',
    name: '双子座',
    symbol: '♊',
    element: '風',
    period: '5/21〜6/21',
    traits: '好奇心旺盛で頭の回転が速いコミュニケーター。流行や情報のキャッチが得意です。',
  },
  {
    id: 'cancer',
    name: '蟹座',
    symbol: '♋',
    element: '水',
    period: '6/22〜7/22',
    traits: '情が深く面倒見のよい世話役。身近な人を守る力と豊かな感受性を持っています。',
  },
  {
    id: 'leo',
    name: '獅子座',
    symbol: '♌',
    element: '火',
    period: '7/23〜8/22',
    traits: '華やかで堂々としたリーダータイプ。人を惹きつけるカリスマ性と誇り高さが魅力です。',
  },
  {
    id: 'virgo',
    name: '乙女座',
    symbol: '♍',
    element: '地',
    period: '8/23〜9/22',
    traits: '緻密で分析力に優れた完璧主義者。細やかな気配りで周囲から信頼されます。',
  },
  {
    id: 'libra',
    name: '天秤座',
    symbol: '♎',
    element: '風',
    period: '9/23〜10/23',
    traits: 'バランス感覚と社交性の持ち主。争いを好まず、美しいものを愛する平和主義者です。',
  },
  {
    id: 'scorpio',
    name: '蠍座',
    symbol: '♏',
    element: '水',
    period: '10/24〜11/22',
    traits: '深い洞察力と集中力を秘めた探究者。一途で、決めたことを最後までやり抜きます。',
  },
  {
    id: 'sagittarius',
    name: '射手座',
    symbol: '♐',
    element: '火',
    period: '11/23〜12/21',
    traits: '自由を愛する冒険家。楽観的でフットワークが軽く、未知の世界へ飛び込んでいきます。',
  },
  {
    id: 'capricorn',
    name: '山羊座',
    symbol: '♑',
    element: '地',
    period: '12/22〜1/19',
    traits: '努力と忍耐の人。現実的に目標を立て、時間をかけて確実に頂上へ登りつめます。',
  },
  {
    id: 'aquarius',
    name: '水瓶座',
    symbol: '♒',
    element: '風',
    period: '1/20〜2/18',
    traits: '独創的で自由な発想を持つ改革者。型にはまらず、自分らしさを大切にします。',
  },
  {
    id: 'pisces',
    name: '魚座',
    symbol: '♓',
    element: '水',
    period: '2/19〜3/20',
    traits: 'ロマンチストで共感力の高い癒し系。想像力が豊かで、人の痛みに寄り添えます。',
  },
];

// 暦順(1月から)に並べた各星座の開始日。値は 月*100+日 で比較する。
// 山羊座(12/22〜1/19)だけ年をまたぐため、判定関数で先に処理する。
const SIGN_STARTS_IN_CALENDAR_ORDER = [
  { start: 120, index: 10 }, // 1/20 水瓶座
  { start: 219, index: 11 }, // 2/19 魚座
  { start: 321, index: 0 }, // 3/21 牡羊座
  { start: 420, index: 1 }, // 4/20 牡牛座
  { start: 521, index: 2 }, // 5/21 双子座
  { start: 622, index: 3 }, // 6/22 蟹座
  { start: 723, index: 4 }, // 7/23 獅子座
  { start: 823, index: 5 }, // 8/23 乙女座
  { start: 923, index: 6 }, // 9/23 天秤座
  { start: 1024, index: 7 }, // 10/24 蠍座
  { start: 1123, index: 8 }, // 11/23 射手座
];

/**
 * 月日から星座を返す。
 * @param {number} month 1〜12
 * @param {number} day 1〜31
 * @returns {object} ZODIAC_SIGNS の要素
 */
export function getZodiacSign(month, day) {
  const value = month * 100 + day;
  if (value >= 1222 || value <= 119) {
    return ZODIAC_SIGNS[9]; // 山羊座
  }
  for (let i = SIGN_STARTS_IN_CALENDAR_ORDER.length - 1; i >= 0; i--) {
    const { start, index } = SIGN_STARTS_IN_CALENDAR_ORDER[i];
    if (value >= start) {
      return ZODIAC_SIGNS[index];
    }
  }
  // 1/19 以前は山羊座として処理済みのため、ここには到達しない。
  throw new Error(`invalid date: month=${month}, day=${day}`);
}
