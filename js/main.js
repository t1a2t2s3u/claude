import { getZodiacSign } from './zodiac.js';
import { getEto } from './eto.js';
import { BLOOD_TYPES } from './bloodtype.js';
import { getCompositeProfile } from './composite.js';
import { getLifePathNumber, LIFE_PATH_MEANINGS } from './numerology.js';
import { getDailyFortune, getDailyRanking } from './fortune.js';
import { getDailyTarot } from './tarot.js';
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

  return () => ({
    year: Number(yearSelect.value),
    month: Number(monthSelect.value),
    day: Number(daySelect.value),
  });
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
  setText('composite-description', profile.description);

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
  setText('tarot-result-name', `${card.name}(${card.roman})`);
  setText('tarot-orientation', isReversed ? '逆位置' : '正位置');
  setText('tarot-keywords', meaning.keywords);
  setText('tarot-message', meaning.message);
  setText('tarot-love', card.love);
  setText('tarot-work', card.work);
  setText('tarot-money', card.money);

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

  const list = document.getElementById('axis-list');
  list.innerHTML = '';
  for (const axis of compat.axes) {
    const row = document.createElement('div');
    row.className = 'axis-row';

    const head = document.createElement('dt');
    head.className = 'axis-head';
    const label = document.createElement('span');
    label.textContent = axis.label;
    const score = document.createElement('span');
    score.className = 'axis-score';
    score.textContent = `${axis.score}点`;
    head.append(label, score);

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

const readMyDate = setupDateSelects('input-year', 'input-month', 'input-day', 1995);
const readDateA = setupDateSelects('a-year', 'a-month', 'a-day', 1995);
const readDateB = setupDateSelects('b-year', 'b-month', 'b-day', 1993);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const { year, month, day } = readMyDate();
  const bloodId = new FormData(form).get('blood');

  const sign = getZodiacSign(month, day);
  const eto = getEto(year);
  const blood = BLOOD_TYPES[bloodId];
  const personalSeed = `${eto.id}:${blood.id}`;

  renderTarot(getDailyTarot(`${sign.id}:${personalSeed}`));
  renderFortune(getDailyFortune(sign.id, new Date(), personalSeed));
  renderProfile(sign, eto, blood);
  renderFourPillars(year, month, day);
  renderNumerology(year, month, day);
  renderRanking(sign.id);

  result.hidden = false;
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

aishouForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(aishouForm);
  const personA = { ...readDateA(), blood: data.get('blood-a') };
  const personB = { ...readDateB(), blood: data.get('blood-b') };

  renderCompatibility(getCompatibility(personA, personB));

  aishouResult.hidden = false;
  aishouResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
