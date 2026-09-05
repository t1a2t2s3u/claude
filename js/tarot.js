// タロット(大アルカナ22枚)のデータと「今日の一枚」の決定的な選択。
// カードと正逆は「日付 + 引く人のシード」から決まり、同じ日・同じ人なら
// 必ず同じカードになる。

import { hashString, mulberry32, formatDateKey } from './fortune.js';

export const TAROT_CARDS = [
  {
    id: 0,
    name: '愚者',
    roman: '0',
    emoji: '🌈',
    image: 'assets/tarot/00-fool.jpg',
    upright: {
      keywords: '自由・新しい旅立ち',
      message: '心のままに一歩踏み出すとき。経験がないことこそ、あなたの伸びしろです。',
    },
    reversed: {
      keywords: '見切り発車への注意',
      message: '勢いは十分。あとは足元の準備を整えれば、安心して飛び立てます。',
    },
    love: '素直な気持ちを伝えることが、ふたりの距離を縮めます。',
    work: '前例のないやり方を試すのに向いた日。小さく始めてみましょう。',
    money: '新しいことへの自己投資が吉。学びにお金を使うと未来が育ちます。',
  },
  {
    id: 1,
    name: '魔術師',
    roman: 'I',
    emoji: '✨',
    image: 'assets/tarot/01-magician.jpg',
    upright: {
      keywords: '創造・才能の開花',
      message: '持っている道具はすべてそろっています。あなたの手で形にする番です。',
    },
    reversed: {
      keywords: '準備の見直し',
      message: 'アイデアを一度整理すると、本当に使うべき才能が見えてきます。',
    },
    love: '会話の中のひらめきが恋を動かします。言葉のキャッチボールを楽しんで。',
    work: '企画力・発信力が冴える日。アイデアはメモに残して形にしましょう。',
    money: '得意なことがお金の流れにつながる予感。スキルを磨く出費は前向きに。',
  },
  {
    id: 2,
    name: '女教皇',
    roman: 'II',
    emoji: '🌙',
    image: 'assets/tarot/02-high-priestess.jpg',
    upright: {
      keywords: '直感・静かな知性',
      message: '答えはすでに心の中に。静かな時間が、正しい判断を連れてきます。',
    },
    reversed: {
      keywords: '考えすぎの緩和',
      message: '理屈で固まった心をほぐすとき。感じたままを大切にしてみましょう。',
    },
    love: '焦らず相手を知ることが吉。聞き役に回ると信頼が深まります。',
    work: '分析や下調べが実を結ぶ日。データを味方につけましょう。',
    money: '衝動買いはひと呼吸。一晩置いてから決めると満足度が上がります。',
  },
  {
    id: 3,
    name: '女帝',
    roman: 'III',
    emoji: '🌹',
    image: 'assets/tarot/03-empress.jpg',
    upright: {
      keywords: '豊かさ・愛情',
      message: '与えた優しさが実りとなって返ってくる、豊穣のカードです。',
    },
    reversed: {
      keywords: '自分への愛情補給',
      message: '人に尽くす前に、まず自分を満たして。余裕が魅力に変わります。',
    },
    love: '包み込むような愛情が伝わる日。手料理や小さな贈り物が効果的。',
    work: 'チームを育てる働きが評価されます。後輩へのひと声を忘れずに。',
    money: '豊かさを感じる使い方が吉。暮らしを整える買い物は満足度大。',
  },
  {
    id: 4,
    name: '皇帝',
    roman: 'IV',
    emoji: '👑',
    image: 'assets/tarot/04-emperor.jpg',
    upright: {
      keywords: 'リーダーシップ・達成',
      message: '主導権を握って進めるとき。あなたの決断が周囲の指針になります。',
    },
    reversed: {
      keywords: '柔軟さのすすめ',
      message: '力で押すより、耳を傾けて。柔らかさが本当の強さになります。',
    },
    love: '頼りがいが魅力になる日。ただし相手のペースも尊重して。',
    work: '責任あるポジションで力を発揮。堂々と意見を述べましょう。',
    money: '長期的な計画を立てるのに最適。家計の柱を見直してみて。',
  },
  {
    id: 5,
    name: '法王',
    roman: 'V',
    emoji: '🕊️',
    image: 'assets/tarot/05-hierophant.jpg',
    upright: {
      keywords: '信頼・導き',
      message: '目上の人や経験者の助言が幸運の鍵。素直さが運を連れてきます。',
    },
    reversed: {
      keywords: '自分の物差しの確認',
      message: '常識にとらわれすぎていないか点検を。あなた自身の答えも大切です。',
    },
    love: '誠実さがなにより効く日。約束はきちんと守りましょう。',
    work: '先輩やメンターに相談すると道が開けます。報連相を丁寧に。',
    money: '信頼できる人の堅実なアドバイスに従うと安心です。',
  },
  {
    id: 6,
    name: '恋人',
    roman: 'VI',
    emoji: '💞',
    image: 'assets/tarot/06-lovers.jpg',
    upright: {
      keywords: 'ときめき・選択',
      message: '心が惹かれる方を選んで大丈夫。楽しい選択が正解になる日です。',
    },
    reversed: {
      keywords: '迷いの整理',
      message: '選べないのは情報不足のサイン。気持ちを書き出すと道が見えます。',
    },
    love: '恋愛運は絶好調。デートの誘いも告白も、追い風が吹いています。',
    work: 'パートナーシップが鍵。ふたりで組む仕事に幸運があります。',
    money: '好きなものへの出費は満足度高め。ただし比較検討は忘れずに。',
  },
  {
    id: 7,
    name: '戦車',
    roman: 'VII',
    emoji: '🐎',
    image: 'assets/tarot/07-chariot.jpg',
    upright: {
      keywords: '前進・勝利',
      message: 'アクセルを踏むべきとき。スピードに乗ったあなたは止まりません。',
    },
    reversed: {
      keywords: 'ペース配分',
      message: '急がば回れの日。少し速度を落とすと、かえって早く着きます。',
    },
    love: '押しの一手が効く日。会いたい気持ちは素直に行動へ。',
    work: '締め切りものは一気に片づけるが吉。集中力が武器になります。',
    money: '目標貯金がはかどるとき。ゴールを決めて走り出しましょう。',
  },
  {
    id: 8,
    name: '力',
    roman: 'VIII',
    emoji: '🦁',
    image: 'assets/tarot/08-strength.jpg',
    upright: {
      keywords: '内なる強さ・忍耐',
      message: '力ずくではなく、しなやかに。あなたの穏やかさが状況を制します。',
    },
    reversed: {
      keywords: '肩の力を抜いて',
      message: 'ひとりで抱え込まないで。弱さを見せることも強さのうちです。',
    },
    love: '焦らず相手の心を溶かすとき。あたたかい笑顔が最強の武器。',
    work: '粘り強さが評価される日。コツコツ続けてきたことに光が当たります。',
    money: '我慢のしどころ。今日守ったお金が、近い将来の余裕になります。',
  },
  {
    id: 9,
    name: '隠者',
    roman: 'IX',
    emoji: '🏮',
    image: 'assets/tarot/09-hermit.jpg',
    upright: {
      keywords: '内省・探究',
      message: 'ひとりの時間が答えをくれる日。心の声に耳を澄ませましょう。',
    },
    reversed: {
      keywords: '殻からの一歩',
      message: '考えはもう十分深まりました。誰かに話すと視界が開けます。',
    },
    love: 'ゆっくり進む恋が吉。自分の気持ちを確かめる時間も大切に。',
    work: '調査・研究・企画づくりに最適。静かな環境で集中しましょう。',
    money: '家計の棚卸しに向く日。固定費の見直しが効きます。',
  },
  {
    id: 10,
    name: '運命の輪',
    roman: 'X',
    emoji: '🎡',
    image: 'assets/tarot/10-wheel-of-fortune.jpg',
    upright: {
      keywords: '転機・チャンス',
      message: '流れが大きく動き出します。回ってきたチャンスの輪に乗って。',
    },
    reversed: {
      keywords: 'タイミング待ち',
      message: '今は次の追い風を待つとき。準備しておけば波を逃しません。',
    },
    love: '偶然の再会や出会いに注目。ピンときたら流れに乗りましょう。',
    work: '思わぬ話が舞い込む予感。フットワークを軽くしておいて。',
    money: '臨時収入やお得な情報のめぐりあわせ。アンテナを高く。',
  },
  {
    id: 11,
    name: '正義',
    roman: 'XI',
    emoji: '⚖️',
    image: 'assets/tarot/11-justice.jpg',
    upright: {
      keywords: 'バランス・公正',
      message: '筋を通した行動が信頼を生みます。フェアなあなたが輝く日。',
    },
    reversed: {
      keywords: '白黒つけない勇気',
      message: '正しさより優しさを選んでよい日。グレーのままでも前に進めます。',
    },
    love: '対等な関係づくりが鍵。言いたいことは冷静に、率直に。',
    work: '契約・交渉ごとに向く日。条件はきちんと確認しましょう。',
    money: '収支のバランスを整えると運気安定。記録をつけ始めるのに好機。',
  },
  {
    id: 12,
    name: '吊るされた男',
    roman: 'XII',
    emoji: '🙃',
    image: 'assets/tarot/12-hanged-man.jpg',
    upright: {
      keywords: '視点の転換・熟成',
      message: '止まっているようで、内側では実が熟しています。逆さから見れば発見あり。',
    },
    reversed: {
      keywords: '停滞からの解放',
      message: '我慢の時期はまもなく終わり。手放すことで身軽になれます。',
    },
    love: '相手の立場から考えると、すれ違いの理由が見えてきます。',
    work: '思い通りに進まなくても腐らずに。この経験があとで効いてきます。',
    money: '今は種まきの時期。すぐの見返りを求めない使い方が吉。',
  },
  {
    id: 13,
    name: '死神',
    roman: 'XIII',
    emoji: '🦋',
    image: 'assets/tarot/13-death.jpg',
    upright: {
      keywords: '再生・リセット',
      message: 'ひとつの区切りは、新しい始まりの合図。手放すほど軽くなります。',
    },
    reversed: {
      keywords: '再出発の助走',
      message: '変化への恐れは自然なこと。小さな整理から始めれば大丈夫です。',
    },
    love: '関係の衣替えのとき。古いパターンを手放すと新鮮さが戻ります。',
    work: 'やり方を思い切って刷新するチャンス。断捨離が効率を上げます。',
    money: '使っていないサブスクや習慣の見直しで、流れが変わります。',
  },
  {
    id: 14,
    name: '節制',
    roman: 'XIV',
    emoji: '🫖',
    image: 'assets/tarot/14-temperance.jpg',
    upright: {
      keywords: '調和・ほどよさ',
      message: '混ぜ合わせる名人になれる日。異なるものの間に立つと運が開けます。',
    },
    reversed: {
      keywords: 'バランス調整',
      message: '偏りに気づいたら整えどき。睡眠・食事・気分のバランスを大切に。',
    },
    love: 'ゆったりした時間の共有が吉。カフェでのんびり語らって。',
    work: '調整役として輝く日。橋渡しがあなたの評価を高めます。',
    money: 'ほどよい節約が続くコツ。無理のない予算を組みましょう。',
  },
  {
    id: 15,
    name: '悪魔',
    roman: 'XV',
    emoji: '🍫',
    image: 'assets/tarot/15-devil.jpg',
    upright: {
      keywords: '魅力・誘惑',
      message: '抗いがたい魅力が高まる日。楽しみは上手にコントロールして。',
    },
    reversed: {
      keywords: '悪習慣からの卒業',
      message: 'やめたかったことを断ち切る絶好のタイミングです。',
    },
    love: '色気が増す日。ただし駆け引きのしすぎには気をつけて。',
    work: '楽な方に流されそうなら、5分だけ着手を。勢いがつきます。',
    money: '誘惑の多い日。「本当に欲しい?」と3回聞いてから財布を開いて。',
  },
  {
    id: 16,
    name: '塔',
    roman: 'XVI',
    emoji: '⚡',
    image: 'assets/tarot/16-tower.jpg',
    upright: {
      keywords: '衝撃・目覚め',
      message: '予想外の出来事は、固定観念を壊すギフト。壊れた後に本物が残ります。',
    },
    reversed: {
      keywords: '軟着陸',
      message: '変化の衝撃は最小限で済みそう。備えあれば憂いなしです。',
    },
    love: 'ハプニングが本音を引き出します。ピンチはふたりの絆を試す好機。',
    work: '想定外への対応力が試される日。落ち着いた人が一番強い。',
    money: '急な出費に備えを。予備費があれば心は揺れません。',
  },
  {
    id: 17,
    name: '星',
    roman: 'XVII',
    emoji: '🌟',
    image: 'assets/tarot/17-star.jpg',
    upright: {
      keywords: '希望・インスピレーション',
      message: '願いに向かって光が差す日。理想を口に出すと現実が動きます。',
    },
    reversed: {
      keywords: '希望の再点火',
      message: '見失いかけた夢を思い出して。小さな星でも道は照らせます。',
    },
    love: '理想の関係に近づく予感。将来の話をしてみると吉。',
    work: '長期目標を描くのに最適な日。ビジョンが人を惹きつけます。',
    money: '夢のための積立を始めると、驚くほど続きます。',
  },
  {
    id: 18,
    name: '月',
    roman: 'XVIII',
    emoji: '🌕',
    image: 'assets/tarot/18-moon.jpg',
    upright: {
      keywords: '感受性・神秘',
      message: '揺らぐ気持ちも大切な情報。急がず、ゆっくり輪郭を確かめて。',
    },
    reversed: {
      keywords: '霧が晴れる',
      message: 'モヤモヤの正体がわかる日。不安は言葉にすると小さくなります。',
    },
    love: '不安になったら確かめ合って。素直な質問が誤解を解きます。',
    work: 'あいまいな指示は早めに確認を。想像で進めないのが吉。',
    money: 'うますぎる話は慎重に。今日は即決を避けましょう。',
  },
  {
    id: 19,
    name: '太陽',
    roman: 'XIX',
    emoji: '☀️',
    image: 'assets/tarot/19-sun.jpg',
    upright: {
      keywords: '成功・生命力',
      message: 'まぶしいほどの追い風。あなたの明るさがそのまま幸運になります。',
    },
    reversed: {
      keywords: '曇りのち晴れ',
      message: '本来の輝きは健在。少し休めば、すぐフルパワーに戻れます。',
    },
    love: '笑顔が最大の魅力になる日。オープンな気持ちで楽しんで。',
    work: '成果が表に出る日。堂々とアピールして大丈夫です。',
    money: '金運は上々。がんばった自分へのご褒美も、今日は◎。',
  },
  {
    id: 20,
    name: '審判',
    roman: 'XX',
    emoji: '🎺',
    image: 'assets/tarot/20-judgement.jpg',
    upright: {
      keywords: '復活・決断',
      message: '眠っていたものが目を覚ます日。過去の努力が呼び戻されます。',
    },
    reversed: {
      keywords: '過去との和解',
      message: '振り返りは今日で締めくくり。明日からは前だけを見ましょう。',
    },
    love: '復縁や関係修復に光が差します。伝えそびれた言葉を今こそ。',
    work: '以前の企画や人脈が再浮上。過去の資産を掘り起こして。',
    money: '忘れていたポイントや返金に気づくかも。整理してみて。',
  },
  {
    id: 21,
    name: '世界',
    roman: 'XXI',
    emoji: '🌍',
    image: 'assets/tarot/21-world.jpg',
    upright: {
      keywords: '完成・祝福',
      message: 'ひとつのサイクルが美しく完成します。自分を思いきり褒めてあげて。',
    },
    reversed: {
      keywords: 'あと一歩の仕上げ',
      message: 'ゴールは目前。最後のピースを丁寧にはめれば完璧です。',
    },
    love: '満ち足りた時間を過ごせる日。感謝を言葉にすると絆が完成します。',
    work: 'プロジェクトの締めくくりに最適。仕上げの確認を丁寧に。',
    money: '目標達成のご褒美はOK。次のサイクルの計画も立てましょう。',
  },
];

/**
 * 「今日の一枚」を引く。カードと正逆は日付+シードから決定的に決まる。
 * @param {string} personalSeed 引く人を表すシード(例: 'virgo:i:O')
 * @param {Date} [date] 省略時は今日
 * @returns {{ card: object, isReversed: boolean, dateKey: string }}
 */
export function getDailyTarot(personalSeed, date = new Date()) {
  const dateKey = formatDateKey(date);
  const rng = mulberry32(hashString(`${dateKey}:tarot:${personalSeed}`));
  const card = TAROT_CARDS[Math.floor(rng() * TAROT_CARDS.length)];
  const isReversed = rng() < 0.35; // 逆位置は約35%。毎日引く占いなので正位置多めに。
  return { card, isReversed, dateKey };
}
