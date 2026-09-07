import { getZodiacSign } from './zodiac.js';
import { getEto } from './eto.js';
import { BLOOD_TYPES } from './bloodtype.js';
import { getCompositeProfile } from './composite.js';
import { getLifePathNumber, LIFE_PATH_MEANINGS } from './numerology.js';
import { getDailyFortune, getDailyRanking } from './fortune.js';
import { getDailyTarot, getThreeCardSpread, getTarotAdvice } from './tarot.js';
import { getFourPillars } from './fourpillars.js';
import { getCompatibility } from './compatibility.js';

const CATEGORY_LABELS = [
  ['love', '💗 恋愛運'],
  ['work', '💼 仕事運'],
  ['money', '💰 金運'],
];

const form = document.getElementById('fortune-form');
const result = document.getElementById('result');
const aishouForm = document.getElementById('aishou-form');
const aishouResult = document.getElementById('aishou-result');

// --- 入力内容の保存・復元(localStorage) ---
// プライベートモードなどで使えない環境でも動くよう、失敗は握りつぶす。

const STORAGE_KEYS = {
  daily: 'hoshiyomi:daily-profile:v1',
  aishou: 'hoshiyomi:aishou-profile:v1',
};

function loadStored(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境では単に記憶されないだけにする
  }
}

function setBloodRadio(name, blood) {
  const radio = document.querySelector(`input[name="${name}"][value="${blood}"]`);
  if (radio) radio.checked = true;
}

// --- 共通ユーティリティ ---

function fillSelect(select, values, labelSuffix, selected) {
  select.innerHTML = '';
  for (const v of values) {
    const option = document.createElement('option');
    option.value = String(v);
    option.textContent = `${v}${labelSuffix}`;
    if (v === selected) option.selected = true;
    select.appendChild(option);
  }
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function setupDateSelects(yearId, monthId, dayId, defaultYear) {
  const yearSelect = document.getElementById(yearId);
  const monthSelect = document.getElementById(monthId);
  const daySelect = document.getElementById(dayId);

  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear; y >= thisYear - 100; y--) years.push(y);
  fillSelect(yearSelect, years, '年', defaultYear);
  fillSelect(monthSelect, Array.from({ length: 12 }, (_, i) => i + 1), '月', 1);

  const sync = () => {
    const max = daysInMonth(Number(yearSelect.value), Number(monthSelect.value));
    const current = Math.min(Number(daySelect.value) || 1, max);
    fillSelect(daySelect, Array.from({ length: max }, (_, i) => i + 1), '日', current);
  };
  sync();
  yearSelect.addEventListener('change', sync);
  monthSelect.addEventListener('change', sync);

  return {
    read: () => ({
      year: Number(yearSelect.value),
      month: Number(monthSelect.value),
      day: Number(daySelect.value),
    }),
    set: ({ year, month, day }) => {
      yearSelect.value = String(year);
      monthSelect.value = String(month);
      sync();
      daySelect.value = String(day);
    },
  };
}

function starsHtml(score) {
  const filled = '★'.repeat(score);
  const empty = '☆'.repeat(5 - score);
  return `<span class="filled">${filled}</span><span class="empty">${empty}</span>`;
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

// --- タブ切り替え ---

function setupTabs() {
  const tabs = [
    { button: document.getElementById('tab-daily'), panel: document.getElementById('panel-daily') },
    { button: document.getElementById('tab-aishou'), panel: document.getElementById('panel-aishou') },
  ];
  for (const tab of tabs) {
    tab.button.addEventListener('click', () => {
      for (const t of tabs) {
        const active = t === tab;
        t.button.classList.toggle('is-active', active);
        t.button.setAttribute('aria-selected', String(active));
        t.panel.hidden = !active;
      }
    });
  }
}

// --- きょうの占い ---

function renderProfile(sign, eto, blood) {
  setText('sign-symbol', sign.symbol);
  setText('sign-name', sign.name);
  setText('sign-meta', `${sign.element}の星座`);
  setText('eto-emoji', eto.emoji);
  setText('eto-name', `${eto.name}年`);
  setText('blood-label-icon', blood.id);
  setText('blood-label', blood.label);

  const profile = getCompositeProfile(sign, eto, blood);
  setText('composite-catch', profile.catchphrase);

  const sections = document.getElementById('composite-sections');
  sections.innerHTML = '';
  for (const section of profile.sections) {
    const block = document.createElement('div');
    block.className = 'composite-section';
    const label = document.createElement('span');
    label.className = 'composite-label';
    label.textContent = section.label;
    const text = document.createElement('p');
    text.className = 'composite-text';
    text.textContent = section.text;
    block.append(label, text);
    sections.appendChild(block);
  }

  setText('trait-sign-title', `${sign.symbol} ${sign.name}(${sign.period})`);
  setText('sign-traits', sign.traits);
  setText('trait-eto-title', `${eto.emoji} ${eto.name}年`);
  setText('eto-traits', eto.traits);
  setText('trait-blood-title', `🩸 ${blood.label}`);
  setText('blood-traits', blood.traits);
}

const TAROT_SPREAD_SIZE = 5;

function renderTarot(tarot) {
  const { card, isReversed } = tarot;
  const spread = document.getElementById('tarot-spread');
  const tarotResult = document.getElementById('tarot-result');

  // 前回の状態をリセットし、伏せた5枚を並べ直す
  spread.classList.remove('has-picked');
  spread.innerHTML = '';
  tarotResult.hidden = true;
  setText('tarot-note', '5枚の中から、直感で今日の一枚を選んでください。');

  const meaning = isReversed ? card.reversed : card.upright;
  const advice = getTarotAdvice(card, isReversed);
  setText('tarot-result-name', card.roman ? `${card.name}(${card.roman})` : card.name);
  setText('tarot-orientation', isReversed ? '逆位置' : '正位置');
  setText('tarot-keywords', meaning.keywords);
  setText('tarot-message', meaning.message);
  setText('tarot-love', advice.love);
  setText('tarot-work', advice.work);
  setText('tarot-money', advice.money);

  document.getElementById('three-card-button').hidden = false;
  document.getElementById('three-card-result').hidden = true;

  const resultImage = document.getElementById('tarot-result-image');
  resultImage.src = card.image;
  resultImage.alt = `${card.name}のカード(ウェイト版タロット)`;
  resultImage.classList.toggle('is-reversed', isReversed);

  // どのカードを選んでも「今日のあなたの一枚」が現れる(選ぶ行為は演出)
  for (let i = 0; i < TAROT_SPREAD_SIZE; i++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tarot-pick';
    button.setAttribute('aria-label', `${i + 1}枚目のカードを選ぶ`);

    const inner = document.createElement('span');
    inner.className = 'tarot-inner';

    const back = document.createElement('span');
    back.className = 'tarot-face tarot-back';
    back.setAttribute('aria-hidden', 'true');
    back.textContent = '✦';

    const front = document.createElement('span');
    front.className = 'tarot-face tarot-front';
    if (isReversed) front.classList.add('is-reversed');
    const art = document.createElement('img');
    art.src = card.image;
    art.alt = `${card.name}のカード`;
    front.appendChild(art);

    inner.append(back, front);
    button.appendChild(inner);
    button.addEventListener('click', () => onTarotPick(button));
    spread.appendChild(button);
  }
}

function onTarotPick(button) {
  const spread = document.getElementById('tarot-spread');
  if (spread.classList.contains('has-picked')) return;
  spread.classList.add('has-picked');
  button.classList.add('is-chosen');
  setText('tarot-note', 'あなたが選んだ、今日の一枚は──');
  // 他のカードが下がってから、選んだカードをめくる
  window.setTimeout(() => button.classList.add('is-flipped'), 250);
  window.setTimeout(() => {
    document.getElementById('tarot-result').hidden = false;
  }, 1000);
}

function renderFortune(fortune) {
  const today = new Date();
  const dateText = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  for (const el of document.querySelectorAll('.js-fortune-date')) {
    el.textContent = dateText;
  }
  setText('fortune-message', fortune.message);
  document.getElementById('total-stars').innerHTML = starsHtml(fortune.scores.total);

  const list = document.getElementById('category-list');
  list.innerHTML = '';
  for (const [key, label] of CATEGORY_LABELS) {
    const block = document.createElement('div');
    block.className = 'category-block';

    const head = document.createElement('div');
    head.className = 'category-head';
    const name = document.createElement('span');
    name.className = 'category-name';
    name.textContent = label;
    const stars = document.createElement('span');
    stars.className = 'category-stars';
    stars.innerHTML = starsHtml(fortune.scores[key]);
    stars.setAttribute('aria-label', `5点満点中${fortune.scores[key]}点`);
    head.append(name, stars);

    const advice = document.createElement('p');
    advice.className = 'category-advice';
    advice.textContent = fortune.advice[key];

    block.append(head, advice);
    list.appendChild(block);
  }

  setText('lucky-color', fortune.luckyColor);
  setText('lucky-item', fortune.luckyItem);
  setText('seasonal-note', `✦ ${fortune.seasonal}`);
}

// --- 3枚引きとシェア ---

let currentReading = null; // 直近の占い結果(3枚引きとシェアに使う)
let currentCompat = null; // 直近の相性診断結果(シェアに使う)

function renderThreeCardSpread() {
  if (!currentReading) return;
  const container = document.getElementById('three-card-result');
  container.innerHTML = '';
  const spread = getThreeCardSpread(currentReading.spreadSeed);
  for (const { position, card, isReversed } of spread) {
    const block = document.createElement('div');
    block.className = 'spread-card';

    const img = document.createElement('img');
    img.src = card.image;
    img.alt = `${card.name}のカード`;
    img.className = 'spread-card-image';
    if (isReversed) img.classList.add('is-reversed');

    const position_ = document.createElement('span');
    position_.className = 'spread-position';
    position_.textContent = position;

    const name = document.createElement('span');
    name.className = 'spread-name';
    name.textContent = `${card.name}(${isReversed ? '逆位置' : '正位置'})`;

    const meaning = isReversed ? card.reversed : card.upright;
    const text = document.createElement('p');
    text.className = 'spread-text';
    text.textContent = `${meaning.keywords} — ${meaning.message}`;

    block.append(position_, img, name, text);
    container.appendChild(block);
  }
  container.hidden = false;
  document.getElementById('three-card-button').hidden = true;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2400);
}

async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch {
      // キャンセル時などはクリップボードにフォールバック
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('結果をコピーしました。SNSに貼り付けてシェアできます');
  } catch {
    showToast('コピーできませんでした。スクリーンショットでシェアしてください');
  }
}

function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function buildDailyShareText() {
  if (!currentReading) return '';
  const { sign, eto, blood, fortune, tarot } = currentReading;
  const today = new Date();
  return [
    `【星よみ手帳】${today.getMonth() + 1}/${today.getDate()}の運勢`,
    `${sign.symbol}${sign.name} × ${eto.emoji}${eto.name} × ${blood.label}`,
    `総合 ${stars(fortune.scores.total)}`,
    `恋愛 ${stars(fortune.scores.love)} 仕事 ${stars(fortune.scores.work)} 金運 ${stars(fortune.scores.money)}`,
    `今日の一枚: ${tarot.card.name}(${tarot.isReversed ? '逆位置' : '正位置'})`,
    `ラッキーカラー: ${fortune.luckyColor} / アイテム: ${fortune.luckyItem}`,
    '#星よみ手帳',
  ].join('\n');
}

function buildAishouShareText() {
  if (!currentCompat) return '';
  const { total, axes, profileA, profileB } = currentCompat;
  const summary = axes.map((axis) => `${axis.label} ${axis.score}点`).join(' / ');
  return [
    '【星よみ手帳】ふたりの相性診断',
    `${profileA.sign.name}×${profileA.blood.label} と ${profileB.sign.name}×${profileB.blood.label}`,
    `総合 ${total}点`,
    summary,
    '#星よみ手帳',
  ].join('\n');
}

function renderFourPillars(year, month, day) {
  const fp = getFourPillars(year, month, day);
  setText('year-pillar', fp.yearPillar.name);
  setText('day-pillar', fp.dayPillar.name);
  setText('day-stem', `${fp.dayStem.char}(${fp.dayStem.yomi})`);
  setText('day-stem-title', `${fp.dayStem.yinyang}の${fp.dayStem.element} — ${fp.meaning.title}`);
  setText('day-stem-description', fp.meaning.description);
}

function renderNumerology(year, month, day) {
  const n = getLifePathNumber(year, month, day);
  const meaning = LIFE_PATH_MEANINGS[n];
  setText('life-path-number', String(n));
  setText('life-path-title', `運命数 ${n} — ${meaning.title}`);
  setText('life-path-description', meaning.description);
}

function renderRanking(yourSignId) {
  const list = document.getElementById('ranking-list');
  list.innerHTML = '';
  for (const { sign, fortune, rank } of getDailyRanking()) {
    const li = document.createElement('li');
    if (sign.id === yourSignId) li.classList.add('is-you');

    const rankEl = document.createElement('span');
    rankEl.className = 'rank-number';
    rankEl.textContent = `${rank}位`;

    const signEl = document.createElement('span');
    signEl.className = 'rank-sign';
    signEl.textContent = `${sign.symbol} ${sign.name}${sign.id === yourSignId ? '(あなた)' : ''}`;

    const starsEl = document.createElement('span');
    starsEl.className = 'rank-stars';
    starsEl.innerHTML = starsHtml(fortune.scores.total);

    li.append(rankEl, signEl, starsEl);
    list.appendChild(li);
  }
}

// --- 相性診断 ---

function personBadgeText(profile) {
  return `${profile.sign.symbol} ${profile.sign.name}・${profile.eto.emoji} ${profile.eto.name}・${profile.blood.label}`;
}

function renderCompatibility(compat) {
  const pair = document.getElementById('aishou-pair');
  pair.innerHTML = '';
  const you = document.createElement('div');
  you.className = 'pair-person';
  you.innerHTML = `<span class="pair-role">あなた</span><span class="pair-profile">${personBadgeText(compat.profileA)}</span>`;
  const heart = document.createElement('div');
  heart.className = 'pair-heart';
  heart.textContent = '💞';
  const partner = document.createElement('div');
  partner.className = 'pair-person';
  partner.innerHTML = `<span class="pair-role">お相手</span><span class="pair-profile">${personBadgeText(compat.profileB)}</span>`;
  pair.append(you, heart, partner);

  setText('aishou-total', String(compat.total));
  setText('aishou-overall', compat.overallComment);

  const highlightsBox = document.getElementById('aishou-highlights');
  const highlightsList = document.getElementById('highlights-list');
  highlightsList.innerHTML = '';
  for (const highlight of compat.highlights) {
    const li = document.createElement('li');
    li.textContent = highlight;
    highlightsList.appendChild(li);
  }
  highlightsBox.hidden = compat.highlights.length === 0;

  const list = document.getElementById('axis-list');
  list.innerHTML = '';
  for (const axis of compat.axes) {
    const row = document.createElement('div');
    row.className = 'axis-row';

    const head = document.createElement('dt');
    head.className = 'axis-head';
    const label = document.createElement('span');
    label.textContent = axis.label;
    const relation = document.createElement('span');
    relation.className = 'axis-relation';
    relation.textContent = axis.relation;
    const score = document.createElement('span');
    score.className = 'axis-score';
    score.textContent = `${axis.score}点`;
    head.append(label, relation, score);

    const bar = document.createElement('dd');
    bar.className = 'axis-bar';
    const fill = document.createElement('span');
    fill.className = 'axis-bar-fill';
    fill.style.width = `${axis.score}%`;
    bar.appendChild(fill);

    const comment = document.createElement('dd');
    comment.className = 'axis-comment';
    comment.textContent = axis.comment;

    row.append(head, bar, comment);
    list.appendChild(row);
  }
}

// --- 初期化 ---

setupTabs();

document.getElementById('three-card-button').addEventListener('click', renderThreeCardSpread);
document.getElementById('share-daily').addEventListener('click', () => shareText(buildDailyShareText()));
document.getElementById('share-aishou').addEventListener('click', () => shareText(buildAishouShareText()));

const myDate = setupDateSelects('input-year', 'input-month', 'input-day', 1995);
const dateA = setupDateSelects('a-year', 'a-month', 'a-day', 1995);
const dateB = setupDateSelects('b-year', 'b-month', 'b-day', 1993);

// 前回の入力を復元する
const storedDaily = loadStored(STORAGE_KEYS.daily);
if (storedDaily) {
  myDate.set(storedDaily);
  if (storedDaily.blood) setBloodRadio('blood', storedDaily.blood);
  // 相性診断の「あなた」にも同じプロフィールを入れておく
  dateA.set(storedDaily);
  if (storedDaily.blood) setBloodRadio('blood-a', storedDaily.blood);
}
const storedAishou = loadStored(STORAGE_KEYS.aishou);
if (storedAishou) {
  if (storedAishou.a) {
    dateA.set(storedAishou.a);
    if (storedAishou.a.blood) setBloodRadio('blood-a', storedAishou.a.blood);
  }
  if (storedAishou.b) {
    dateB.set(storedAishou.b);
    if (storedAishou.b.blood) setBloodRadio('blood-b', storedAishou.b.blood);
  }
}

function runDailyFortune({ scroll } = { scroll: true }) {
  const { year, month, day } = myDate.read();
  const bloodId = new FormData(form).get('blood');
  if (!bloodId) return;
  saveStored(STORAGE_KEYS.daily, { year, month, day, blood: bloodId });

  const sign = getZodiacSign(month, day);
  const eto = getEto(year);
  const blood = BLOOD_TYPES[bloodId];
  const personalSeed = `${eto.id}:${blood.id}`;
  const tarot = getDailyTarot(`${sign.id}:${personalSeed}`);
  const fortune = getDailyFortune(sign.id, new Date(), personalSeed);
  currentReading = { sign, eto, blood, fortune, tarot, spreadSeed: `${sign.id}:${personalSeed}` };

  renderTarot(tarot);
  renderFortune(fortune);
  renderProfile(sign, eto, blood);
  renderFourPillars(year, month, day);
  renderNumerology(year, month, day);
  renderRanking(sign.id);

  result.hidden = false;
  if (scroll) {
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  runDailyFortune({ scroll: true });
});

// プロフィールを記憶済みの人は、開いた瞬間に今日の結果まで自動表示する
// (タロットはお楽しみのため、カードを選ぶところから)
if (storedDaily && storedDaily.blood) {
  runDailyFortune({ scroll: false });
  showToast('記憶したプロフィールで、今日の運勢を表示しています');
}

aishouForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(aishouForm);
  const personA = { ...dateA.read(), blood: data.get('blood-a') };
  const personB = { ...dateB.read(), blood: data.get('blood-b') };
  saveStored(STORAGE_KEYS.aishou, { a: personA, b: personB });

  currentCompat = getCompatibility(personA, personB);
  renderCompatibility(currentCompat);

  aishouResult.hidden = false;
  aishouResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
