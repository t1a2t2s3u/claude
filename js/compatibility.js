// ふたりの相性診断。
// 星座の四元素 × 干支(三合・支合・冲) × 血液型 × 五行(日干)の4軸を
// スコア化して合算する。生年月日と血液型から決定的に決まり、日付には
// 依存しない(相性は日替わりしないのが仕様)。

import { getZodiacSign } from './zodiac.js';
import { getEto, ETO_LIST } from './eto.js';
import { BLOOD_TYPES } from './bloodtype.js';
import { getDayPillar, GENERATES, OVERCOMES } from './fourpillars.js';

// --- 星座(四元素)の相性 ---
const ELEMENT_SCORES = {
  '火火': 85, '火地': 62, '火風': 92, '火水': 58,
  '地地': 84, '地風': 60, '地水': 90,
  '風風': 82, '風水': 66,
  '水水': 88,
};

const ELEMENT_COMMENTS = {
  '火火': '情熱と情熱のぶつかり合い。一緒にいると何倍も楽しい、燃え上がる組み合わせです。',
  '火地': 'スピードの火と、じっくりの地。ペースの違いを認め合えば、互いにない強さを補えます。',
  '火風': '火に風が吹き込む最高の相性。一緒にいるだけで、どんどん夢が大きく膨らみます。',
  '火水': '熱い火と冷静な水。正反対だからこそ、相手の視点があなたの世界を広げてくれます。',
  '地地': '価値観がしっくりなじむ安定コンビ。穏やかで長続きする関係を築けます。',
  '地風': '現実的な地と自由な風。役割分担が決まると、意外なほど息の合うチームになります。',
  '地水': '地に水が染み込むように、自然に支え合える相性。安心感はピカイチです。',
  '風風': '会話が止まらない軽やかなふたり。友達のようなフラットな関係が心地よく続きます。',
  '風水': '理性の風と感性の水。じっくり対話を重ねるほど、深く理解し合えるようになります。',
  '水水': '言葉にしなくても伝わる、深い共感でつながるふたり。心の距離がとても近い相性です。',
};

// --- 干支(十二支)の相性 ---
// 支合(強い縁で結ばれるペア)
const SHIGOU_PAIRS = [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]];
// 三合(同じ志を持つグループ)
const SANGOU_GROUPS = [[8, 0, 4], [5, 9, 1], [2, 6, 10], [11, 3, 7]];

function etoRelation(indexA, indexB) {
  if (indexA === indexB) {
    return { score: 80, comment: '同じ干支同士。行動リズムが似ていて、一緒にいて楽な関係です。' };
  }
  if (SHIGOU_PAIRS.some(([a, b]) => (a === indexA && b === indexB) || (a === indexB && b === indexA))) {
    return { score: 95, comment: '干支は「支合」の間柄。古くから強い縁で結ばれるとされる特別な組み合わせです。' };
  }
  if (SANGOU_GROUPS.some((g) => g.includes(indexA) && g.includes(indexB))) {
    return { score: 90, comment: '干支は「三合」の間柄。同じ方向を目指せる、協力運の強い組み合わせです。' };
  }
  if ((indexA + 6) % 12 === indexB) {
    return { score: 55, comment: '干支は正反対の「冲」の間柄。刺激が強いぶん、磨き合える緊張感のある関係です。' };
  }
  return { score: 72, comment: '干支は穏やかな間柄。突出した縁ではないぶん、自分たちらしい関係を自由に築けます。' };
}

// --- 血液型の相性(組み合わせは順不同で10通り) ---
const BLOOD_PAIRS = {
  'A-A': { score: 82, comment: 'お互いに気配り上手。安心感は抜群ですが、たまには本音の弱音も見せ合って。' },
  'A-B': { score: 68, comment: '几帳面なA型と自由なB型。違いを面白がれた瞬間、最高の補い合いが始まります。' },
  'A-O': { score: 90, comment: '細やかなA型をおおらかなO型が包む定番の好相性。役割が自然に噛み合います。' },
  'A-AB': { score: 78, comment: '気遣いのA型とクールなAB型。ほどよい距離感が心地よい、大人の相性です。' },
  'B-B': { score: 80, comment: 'マイペース同士で束縛なし。好きなことを一緒に楽しめる気楽で愉快な関係です。' },
  'B-O': { score: 88, comment: '自由なB型を、懐の深いO型がどんと受け止める安定コンビ。笑いの絶えない相性です。' },
  'AB-B': { score: 84, comment: '独自路線のふたり。人と違う感性を認め合える、クリエイティブな組み合わせです。' },
  'O-O': { score: 76, comment: 'リーダー気質同士。張り合うより役割を分ければ、最強のタッグになります。' },
  'AB-O': { score: 74, comment: '情のO型と理のAB型。テンポは違えど、互いにない視点を持ち寄れる知的な相性です。' },
  'AB-AB': { score: 82, comment: '多面的な者同士、少ない言葉で通じ合えます。ミステリアスで飽きのこない関係です。' },
};

function bloodRelation(idA, idB) {
  const key = [idA, idB].sort().join('-');
  return BLOOD_PAIRS[key];
}

// --- 五行(日干)の相性 ---
function gogyoRelation(elemA, elemB) {
  if (elemA === elemB) {
    return { score: 78, comment: `ふたりとも「${elemA}」の気質。感覚が似ていて、共感しやすい間柄です。` };
  }
  if (GENERATES[elemA] === elemB) {
    return { score: 90, comment: `五行では「${elemA}」が「${elemB}」を生み出す相生の関係。あなたが相手を自然と伸ばします。` };
  }
  if (GENERATES[elemB] === elemA) {
    return { score: 90, comment: `五行では「${elemB}」が「${elemA}」を生み出す相生の関係。相手といると自然と元気になれます。` };
  }
  if (OVERCOMES[elemA] === elemB || OVERCOMES[elemB] === elemA) {
    return { score: 60, comment: '五行では緊張感のある相剋の関係。ぶつかった数だけ、お互いを鍛え合える間柄です。' };
  }
  return { score: 72, comment: '五行では穏やかな関係。無理なく自然体でいられる組み合わせです。' };
}

// --- 総合コメント(スコア帯ごと) ---
const OVERALL_COMMENTS = [
  { min: 88, comment: '出会えたことが奇跡級の好相性!お互いの魅力を引き出し合える、理想的なふたりです。' },
  { min: 80, comment: 'とても好相性なふたり。自然体のままで、心地よい関係を長く育てていけます。' },
  { min: 72, comment: 'バランスのよい相性です。似ているところは安心に、違うところは刺激に変えられます。' },
  { min: 64, comment: '違いが多いぶん、伸びしろも大きいふたり。対話を重ねるほど絆が深まる成長型の相性です。' },
  { min: 0, comment: '正反対の魅力を持つふたり。理解し合えたとき、他の誰にも真似できない特別な関係になれます。' },
];

const AXIS_WEIGHTS = { element: 0.3, blood: 0.3, eto: 0.2, gogyo: 0.2 };

function profileOf(person) {
  const sign = getZodiacSign(person.month, person.day);
  const eto = getEto(person.year);
  const blood = BLOOD_TYPES[person.blood];
  const dayPillar = getDayPillar(person.year, person.month, person.day);
  return { sign, eto, blood, dayPillar };
}

/**
 * ふたりの相性を診断する。
 * @param {{year:number, month:number, day:number, blood:string}} personA
 * @param {{year:number, month:number, day:number, blood:string}} personB
 * @returns {{
 *   total: number,
 *   overallComment: string,
 *   profileA: object, profileB: object,
 *   axes: Array<{ key: string, label: string, score: number, comment: string }>,
 * }}
 */
export function getCompatibility(personA, personB) {
  const profileA = profileOf(personA);
  const profileB = profileOf(personB);

  const elemKeyCandidates = [
    profileA.sign.element + profileB.sign.element,
    profileB.sign.element + profileA.sign.element,
  ];
  const elemKey = elemKeyCandidates.find((k) => ELEMENT_SCORES[k] != null);

  const axes = [
    {
      key: 'element',
      label: '星座(四元素)',
      score: ELEMENT_SCORES[elemKey],
      comment: ELEMENT_COMMENTS[elemKey],
    },
    {
      key: 'blood',
      label: '血液型',
      ...bloodRelation(profileA.blood.id, profileB.blood.id),
    },
    {
      key: 'eto',
      label: '干支',
      ...etoRelation(ETO_LIST.indexOf(profileA.eto), ETO_LIST.indexOf(profileB.eto)),
    },
    {
      key: 'gogyo',
      label: '五行(日干)',
      ...gogyoRelation(profileA.dayPillar.stem.element, profileB.dayPillar.stem.element),
    },
  ];

  const total = Math.round(
    axes.reduce((sum, axis) => sum + axis.score * AXIS_WEIGHTS[axis.key], 0)
  );
  const overallComment = OVERALL_COMMENTS.find((c) => total >= c.min).comment;

  return { total, overallComment, profileA, profileB, axes };
}
