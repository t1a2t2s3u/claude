// ふたりの相性診断。
// 西洋占星術のアスペクト(星座間の角度)、干支の合冲刑害、血液型、
// 四柱推命の命式(日干の干合・相生相剋と日支の関係)の4軸をスコア化して
// 合算する。生年月日と血液型から決定的に決まり、日付には依存しない
// (相性は日替わりしないのが仕様)。

import { getZodiacSign, ZODIAC_SIGNS } from './zodiac.js';
import { getEto, ETO_LIST } from './eto.js';
import { BLOOD_TYPES } from './bloodtype.js';
import { getDayPillar, BRANCH_CHARS, GENERATES, OVERCOMES } from './fourpillars.js';

function clampScore(score) {
  return Math.max(30, Math.min(100, score));
}

// --- 星座: アスペクト(角距離)判定 ---
// 太陽星座間の離角(30度刻み)で7種のアスペクトに分類する。
const ASPECTS = {
  0: {
    name: 'コンジャンクション(0度)',
    score: 84,
    comment:
      '同じ星座に太陽を持つふたり。長所も短所も鏡写しで、説明のいらない楽さがあります。似ているからこそ、譲る練習だけ意識しておくと安定します。',
  },
  1: {
    name: 'セミセクスタイル(30度)',
    score: 68,
    comment:
      '隣り合う星座同士。価値観の前提が少し違うため、最初は「なぜそうする?」が続きますが、隣人ゆえに学べることが最も多い間柄でもあります。',
  },
  2: {
    name: 'セクスタイル(60度)',
    score: 86,
    comment:
      '60度の調和角。火と風、地と水のように気質が支え合う配置で、一緒に何かに取り組むほど噛み合っていく、育てがいのある好相性です。',
  },
  3: {
    name: 'スクエア(90度)',
    score: 60,
    comment:
      '90度の緊張角。行動原理がぶつかりやすい配置ですが、摩擦の分だけ互いを成長させる「砥石の関係」。ケンカのあとに強くなるふたりです。',
  },
  4: {
    name: 'トライン(120度)',
    score: 94,
    comment:
      '120度の大調和角。同じ四元素に属する星座同士で、努力しなくても波長が合う伝統的な最良配置です。心地よさに甘えて言葉を省略しすぎないことだけご注意を。',
  },
  5: {
    name: 'クインカンクス(150度)',
    score: 64,
    comment:
      '150度の調整角。共通点が見つけにくい配置ですが、だからこそ相手が自分にない世界を持っています。歩み寄りの工夫が実る、職人的な相性です。',
  },
  6: {
    name: 'オポジション(180度)',
    score: 76,
    comment:
      '真向かいの180度。正反対ゆえに強く引かれ合う、緊張と魅力が同居する配置です。相手はあなたに欠けた半分を持っている、と考えると噛み合います。',
  },
};

function zodiacAspect(signA, signB) {
  const diff = Math.abs(ZODIAC_SIGNS.indexOf(signA) - ZODIAC_SIGNS.indexOf(signB));
  const distance = Math.min(diff, 12 - diff);
  const aspect = ASPECTS[distance];
  return { relation: aspect.name, score: aspect.score, comment: aspect.comment };
}

// --- 干支(年支): 合・冲・刑・害の判定 ---
// 支のインデックスは 子=0 … 亥=11。
const SHIGOU_PAIRS = [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]];
const SANGOU_GROUPS = [
  { branches: [8, 0, 4], name: '水局' },
  { branches: [5, 9, 1], name: '金局' },
  { branches: [2, 6, 10], name: '火局' },
  { branches: [11, 3, 7], name: '木局' },
];
const KEI_PAIRS = [
  { pair: [0, 3], name: '無礼の刑' },
  { pair: [2, 5], name: '無恩の刑' },
  { pair: [5, 8], name: '無恩の刑' },
  { pair: [2, 8], name: '無恩の刑' },
  { pair: [1, 10], name: '恃勢の刑' },
  { pair: [10, 7], name: '恃勢の刑' },
  { pair: [1, 7], name: '恃勢の刑' },
];
const GAI_PAIRS = [[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]];
const SELF_KEI = new Set([4, 6, 9, 11]); // 辰・午・酉・亥は自刑

function hasPair(pairs, a, b) {
  return pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function branchRelation(indexA, indexB) {
  if (hasPair(SHIGOU_PAIRS, indexA, indexB)) {
    return {
      relation: '支合',
      score: 96,
      comment:
        'ふたつの支が結び合う「支合」。古来、離れてもまた縁がつながるとされる特別な組み合わせで、一緒にいるほど互いの角が取れていきます。',
      special: '支合 — 結び合う縁',
    };
  }
  const sangou = SANGOU_GROUPS.find(
    (g) => g.branches.includes(indexA) && g.branches.includes(indexB)
  );
  if (sangou && indexA !== indexB) {
    return {
      relation: `三合(${sangou.name})`,
      score: 90,
      comment:
        `同じ${sangou.name}を成す「三合」の間柄。目指す方向が自然とそろい、協力すると一人のときの何倍もの成果が出る、チームとして強い縁です。`,
      special: `三合${sangou.name} — 志を同じくする縁`,
    };
  }
  if ((indexA + 6) % 12 === indexB) {
    return {
      relation: '冲',
      score: 52,
      comment:
        '真向かいでぶつかり合う「冲」。価値観の衝突は起きやすいものの、そのぶん現状を壊して前へ進める起爆力を持つ、刺激の強い縁です。衝突したら一晩置くのがコツ。',
    };
  }
  const kei = KEI_PAIRS.find(({ pair: [x, y] }) =>
    (x === indexA && y === indexB) || (x === indexB && y === indexA)
  );
  if (kei) {
    return {
      relation: `刑(${kei.name})`,
      score: 58,
      comment:
        '干支では「刑」にあたる、遠慮がなくなりやすい間柄。近くなるほど礼儀を忘れがちなので、親しき仲にも小さな「ありがとう」を挟むと途端にうまく回ります。',
    };
  }
  if (hasPair(GAI_PAIRS, indexA, indexB)) {
    return {
      relation: '害',
      score: 62,
      comment:
        '干支では「害」と呼ばれる、すれ違いの起きやすい間柄。悪意のない一言が引っかかりやすいだけなので、大事な話は文字より顔を合わせてするのが吉です。',
    };
  }
  if (indexA === indexB) {
    if (SELF_KEI.has(indexA)) {
      return {
        relation: '同支(自刑)',
        score: 66,
        comment:
          '同じ干支同士で、しかも「自刑」を持つ支。似た者同士ゆえに、自分の嫌なところまで映し合うことがあります。相手を許すことが、そのまま自分を許す練習になります。',
      };
    }
    return {
      relation: '同支',
      score: 78,
      comment:
        '同じ干支のふたり。行動のリズムや節目の巡りが重なりやすく、一緒にいて楽な間柄です。似ているぶん、役割分担だけ決めておくとさらに快適です。',
    };
  }
  return {
    relation: '平(特別な合冲なし)',
    score: 72,
    comment:
      '合も冲もない、しがらみのないフラットな間柄。型に縛られないぶん、ふたりの関係はふたりの積み重ねだけで決まります。それはむしろ自由の証です。',
  };
}

// --- 血液型 ---
const BLOOD_PAIRS = {
  'A-A': { score: 82, comment: 'お互いに気配り上手で、安心感は抜群。ただし両方が我慢役に回りがちなので、たまには本音の弱音も見せ合って。' },
  'A-B': { score: 68, comment: '几帳面なA型と自由なB型。イラッとした瞬間こそ相性の入口で、違いを面白がれたとき最高の補い合いが始まります。' },
  'A-O': { score: 90, comment: '細やかなA型をおおらかなO型が包む、定番の好相性。細部はA型、大枠はO型と、役割が自然に噛み合います。' },
  'A-AB': { score: 78, comment: '気遣いのA型とクールなAB型。ほどよい距離感を保てる、大人の相性です。踏み込むときはAB型のペースに合わせて。' },
  'B-B': { score: 80, comment: 'マイペース同士で束縛なし。好きなことを並走して楽しめる、気楽で愉快な関係です。予定の共有だけはお忘れなく。' },
  'AB-B': { score: 84, comment: '独自路線のふたり。人と違う感性を認め合える、クリエイティブな組み合わせです。互いの世界観に土足で入らないのが暗黙のルール。' },
  'B-O': { score: 88, comment: '自由なB型を、懐の深いO型がどんと受け止める安定コンビ。笑いの絶えない、風通しのよい相性です。' },
  'O-O': { score: 76, comment: 'リーダー気質同士。主導権を張り合うより、領域を分ければ最強のタッグに。「ここはあなたの担当」が魔法の言葉です。' },
  'AB-O': { score: 74, comment: '情のO型と理のAB型。テンポは違えど、互いにない視点を持ち寄れる知的な相性。結論を急かさないのがコツです。' },
  'AB-AB': { score: 82, comment: '多面的な者同士、少ない言葉で通じ合えます。ミステリアスで飽きのこない、外からは謎めいて見えるふたりです。' },
};

function bloodRelation(idA, idB) {
  const key = [idA, idB].sort().join('-');
  const { score, comment } = BLOOD_PAIRS[key];
  return { relation: `${idA}型 × ${idB}型`, score, comment };
}

// --- 命式(四柱推命): 日干の関係 + 日支(配偶者の宮)の関係 ---
// 干合: 特定の十干同士が引き合い、新たな五行に化するとされる特別な組み合わせ。
const KANGOU = [
  { pair: ['甲', '己'], goka: '土' },
  { pair: ['乙', '庚'], goka: '金' },
  { pair: ['丙', '辛'], goka: '水' },
  { pair: ['丁', '壬'], goka: '木' },
  { pair: ['戊', '癸'], goka: '火' },
];

function dayStemRelation(stemA, stemB) {
  const kangou = KANGOU.find(
    ({ pair: [x, y] }) =>
      (x === stemA.char && y === stemB.char) || (x === stemB.char && y === stemA.char)
  );
  if (kangou) {
    return {
      relation: `干合(${kangou.pair[0]}${kangou.pair[1]}の合・${kangou.goka})`,
      score: 96,
      comment:
        `日干の${stemA.char}と${stemB.char}は「干合」。十干の中でこの5組だけが引き合い、結びつくと${kangou.goka}の気に化するとされる、四柱推命で最も縁が深いと読む組み合わせです。`,
      special: `干合 — ${kangou.pair[0]}と${kangou.pair[1]}は引かれ合う十干`,
    };
  }
  const sameYinYang = stemA.yinyang === stemB.yinyang;
  if (GENERATES[stemA.element] === stemB.element || GENERATES[stemB.element] === stemA.element) {
    const giver = GENERATES[stemA.element] === stemB.element ? 'あなた' : 'お相手';
    if (!sameYinYang) {
      return {
        relation: '相生(有情の生)',
        score: 90,
        comment:
          `五行では${giver}が相手を生み出す「相生」、しかも陰と陽の組み合わせなので情が通いやすい「有情の生」です。支え支えられる流れが自然に生まれます。`,
      };
    }
    return {
      relation: '相生',
      score: 84,
      comment:
        `五行では${giver}が相手を生み出す「相生」の関係。与える側と受け取る側の流れがはっきりしているので、ときどき役割を入れ替えると長続きします。`,
    };
  }
  if (OVERCOMES[stemA.element] === stemB.element || OVERCOMES[stemB.element] === stemA.element) {
    if (!sameYinYang) {
      return {
        relation: '相剋(有情の剋)',
        score: 66,
        comment:
          '五行では剋し合う配置ですが、陰と陽の組み合わせのため角が丸くなる「有情の剋」。ほどよい緊張感が、なれ合いを防ぐスパイスになります。',
      };
    }
    return {
      relation: '相剋',
      score: 58,
      comment:
        '五行では真っ向から剋し合う配置。主導権の綱引きが起きやすい間柄ですが、勝ち負けを決めない話し合いを覚えたふたりは、誰より鍛え合えます。',
    };
  }
  if (stemA.char === stemB.char) {
    return {
      relation: '比肩(同じ日干)',
      score: 76,
      comment:
        `ふたりとも日干が${stemA.char}。感じ方の癖まで似た「比肩」の間柄で、わかり合うのは速い反面、譲るのはどちらも苦手。先に譲ったほうが勝ち、と決めておきましょう。`,
    };
  }
  return {
    relation: '劫財(同五行・陰陽違い)',
    score: 80,
    comment:
      `同じ${stemA.element}の五行を、陰と陽から分け合う間柄。根っこの気質が同じで、表現だけ違うふたりです。「言い方は違うが言いたいことは同じ」がよく起こります。`,
  };
}

// 日支は四柱推命で「配偶者の宮」と読む場所。日支同士の関係を加点減点する。
function dayBranchModifier(branchCharA, branchCharB) {
  const a = BRANCH_CHARS.indexOf(branchCharA);
  const b = BRANCH_CHARS.indexOf(branchCharB);
  if (hasPair(SHIGOU_PAIRS, a, b)) {
    return {
      delta: 6,
      note: `さらに、配偶者の宮である日支(${branchCharA}と${branchCharB})が支合しており、暮らしの相性のよさを補強しています。`,
      special: '日支の支合 — 配偶者の宮が結ばれる縁',
    };
  }
  if (SANGOU_GROUPS.some((g) => g.branches.includes(a) && g.branches.includes(b)) && a !== b) {
    return {
      delta: 4,
      note: `日支(${branchCharA}と${branchCharB})が三合の間柄で、生活のリズムが重なりやすい後押しがあります。`,
    };
  }
  if ((a + 6) % 12 === b) {
    return {
      delta: -8,
      note: `一方で日支(${branchCharA}と${branchCharB})は冲の配置。生活習慣の違いが出やすいので、暮らしのルールは早めにすり合わせを。`,
    };
  }
  if (KEI_PAIRS.some(({ pair: [x, y] }) => (x === a && y === b) || (x === b && y === a)) || hasPair(GAI_PAIRS, a, b)) {
    return {
      delta: -4,
      note: `日支(${branchCharA}と${branchCharB})には刑・害の絡みがあり、近づきすぎたときの遠慮のなさにだけ注意が必要です。`,
    };
  }
  return { delta: 0, note: '' };
}

// --- 総合 ---
const OVERALL_COMMENTS = [
  { min: 90, comment: '複数の吉配置が重なる、めったにない好相性。出会えたこと自体がひとつの答えです。お互いの魅力を引き出し合える、理想的なふたりと言えます。' },
  { min: 82, comment: '土台のしっかりした好相性。自然体のままで心地よい関係を長く育てていけます。吉配置の軸を意識して伸ばすと、さらに揺るがなくなります。' },
  { min: 74, comment: '調和と刺激のバランスがよい相性。似ているところは安心に、違うところは学びに変えられます。スコアの高い軸が、ふたりの得意な戦い方です。' },
  { min: 66, comment: '磨き合いの要素が多めのふたり。ぶつかる配置は、裏を返せば影響し合える証拠です。低めの軸のコメントにある工夫が、そのまま処方箋になります。' },
  { min: 0, comment: '正反対の魅力を持つふたり。楽な相性ではないぶん、理解し合えたときには他の誰にも真似できない特別な関係になります。焦らず、軸ごとのコツを一つずつ。' },
];

const AXIS_WEIGHTS = { aspect: 0.25, blood: 0.25, eto: 0.2, meishiki: 0.3 };

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
 *   axes: Array<{ key: string, label: string, relation: string, score: number, comment: string }>,
 *   highlights: string[],
 * }}
 */
export function getCompatibility(personA, personB) {
  const profileA = profileOf(personA);
  const profileB = profileOf(personB);
  const highlights = [];

  const aspect = zodiacAspect(profileA.sign, profileB.sign);
  if (aspect.score >= 90) highlights.push('トライン — 星座が描く大調和の角度');

  const etoRel = branchRelation(
    ETO_LIST.indexOf(profileA.eto),
    ETO_LIST.indexOf(profileB.eto)
  );
  if (etoRel.special) highlights.push(etoRel.special);

  const bloodRel = bloodRelation(profileA.blood.id, profileB.blood.id);

  const stemRel = dayStemRelation(profileA.dayPillar.stem, profileB.dayPillar.stem);
  if (stemRel.special) highlights.push(stemRel.special);
  const branchMod = dayBranchModifier(profileA.dayPillar.branch, profileB.dayPillar.branch);
  if (branchMod.special) highlights.push(branchMod.special);

  const meishikiComment =
    `あなたの日柱は${profileA.dayPillar.name}、お相手は${profileB.dayPillar.name}。` +
    stemRel.comment +
    (branchMod.note ? branchMod.note : '');

  const axes = [
    {
      key: 'aspect',
      label: '星座(アスペクト)',
      relation: aspect.relation,
      score: clampScore(aspect.score),
      comment: aspect.comment,
    },
    {
      key: 'blood',
      label: '血液型',
      relation: bloodRel.relation,
      score: clampScore(bloodRel.score),
      comment: bloodRel.comment,
    },
    {
      key: 'eto',
      label: '干支(年支)',
      relation: etoRel.relation,
      score: clampScore(etoRel.score),
      comment: etoRel.comment,
    },
    {
      key: 'meishiki',
      label: '命式(四柱推命)',
      relation: stemRel.relation,
      score: clampScore(stemRel.score + branchMod.delta),
      comment: meishikiComment,
    },
  ];

  const total = Math.round(
    axes.reduce((sum, axis) => sum + axis.score * AXIS_WEIGHTS[axis.key], 0)
  );
  const overallComment = OVERALL_COMMENTS.find((c) => total >= c.min).comment;

  return { total, overallComment, profileA, profileB, axes, highlights };
}
