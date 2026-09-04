// 複合鑑定: 星座(四元素)× 干支 × 血液型 を組み合わせたタイプ診断。
// すべてデータからの決定的な組み立てで、乱数は使わない。

// 星座の四元素 × 血液型 の相乗効果を表す一言(4×4=16パターン)。
const ELEMENT_BLOOD_SYNERGY = {
  火: {
    A: '燃え上がる情熱を、計画性で無駄なく形にできる実行派です。',
    B: 'ひらめきと勢いが直結した、周囲を巻き込む起爆剤タイプです。',
    O: 'スケールの大きな行動力で、みんなの先頭に立つ天性のリーダーです。',
    AB: '熱さと冷静さを切り替えながら、勝負どころを見極める戦略家です。',
  },
  地: {
    A: '堅実さに丁寧さが重なった、誰からも信頼される縁の下の力持ちです。',
    B: '現実的な土台の上で自由な発想を活かせる、堅実なアイデアパーソンです。',
    O: 'どっしり構えた包容力で、周囲に安心感を与えるまとめ役です。',
    AB: '現実感覚と客観性をあわせ持つ、頼れる参謀タイプです。',
  },
  風: {
    A: '軽やかな社交性ときめ細かさを両立した、気配り上手なつなぎ役です。',
    B: '好奇心と発想力が掛け合わさった、流行の一歩先を行くトレンドメーカーです。',
    O: 'フットワークとおおらかさで、どんな輪にもすっと溶け込むムードメーカーです。',
    AB: '情報力と分析力を武器に、スマートに答えを導くブレーンタイプです。',
  },
  水: {
    A: '深い共感力と誠実さで、大切な人にとことん寄り添える癒し手です。',
    B: '豊かな感性が独自の世界観を生む、唯一無二のアーティストタイプです。',
    O: '情の深さと度量の大きさで、人の心を大きく受け止める港のような人です。',
    AB: '繊細な感受性と冷静な視点を行き来する、ミステリアスな魅力の持ち主です。',
  },
};

/**
 * 星座・干支・血液型から複合プロフィールを生成する。
 * @param {object} sign ZODIAC_SIGNS の要素
 * @param {object} eto ETO_LIST の要素
 * @param {object} blood BLOOD_TYPES の値
 * @returns {{ catchphrase: string, synergy: string, description: string }}
 */
export function getCompositeProfile(sign, eto, blood) {
  const catchphrase = `「${sign.keyword}」×「${eto.keyword}」×「${blood.keyword}」`;
  const synergy = ELEMENT_BLOOD_SYNERGY[sign.element][blood.id];
  const description =
    `${sign.name}の${sign.keyword}を土台に、${eto.name}年生まれらしい` +
    `${eto.keyword}と、${blood.label}ならではの${blood.keyword}が重なった個性の持ち主。` +
    `${synergy}3つの要素がそろったとき、あなたの魅力は最大限に発揮されます。`;
  return { catchphrase, synergy, description };
}
