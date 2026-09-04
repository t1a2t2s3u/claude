import { getZodiacSign } from './zodiac.js';
import { getEto } from './eto.js';
import { BLOOD_TYPES } from './bloodtype.js';
import { getCompositeProfile } from './composite.js';
import { getLifePathNumber, LIFE_PATH_MEANINGS } from './numerology.js';
import { getDailyFortune, getDailyRanking } from './fortune.js';

const SCORE_LABELS = [
  ['total', '総合運'],
  ['love', '恋愛運'],
  ['work', '仕事運'],
  ['money', '金運'],
];

const form = document.getElementById('fortune-form');
const yearSelect = document.getElementById('input-year');
const monthSelect = document.getElementById('input-month');
const daySelect = document.getElementById('input-day');
const result = document.getElementById('result');

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

function setupForm() {
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear; y >= thisYear - 100; y--) years.push(y);
  fillSelect(yearSelect, years, '年', 1995);
  fillSelect(monthSelect, Array.from({ length: 12 }, (_, i) => i + 1), '月', 1);
  syncDayOptions();

  yearSelect.addEventListener('change', syncDayOptions);
  monthSelect.addEventListener('change', syncDayOptions);
}

function syncDayOptions() {
  const year = Number(yearSelect.value);
  const month = Number(monthSelect.value);
  const max = daysInMonth(year, month);
  const current = Math.min(Number(daySelect.value) || 1, max);
  fillSelect(daySelect, Array.from({ length: max }, (_, i) => i + 1), '日', current);
}

function starsHtml(score) {
  const filled = '★'.repeat(score);
  const empty = '☆'.repeat(5 - score);
  return `<span class="filled">${filled}</span><span class="empty">${empty}</span>`;
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

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

function renderFortune(fortune) {
  const today = new Date();
  setText(
    'fortune-date',
    `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`
  );
  setText('fortune-message', fortune.message);

  const list = document.getElementById('score-list');
  list.innerHTML = '';
  for (const [key, label] of SCORE_LABELS) {
    const row = document.createElement('div');
    row.className = 'score-row';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.innerHTML = starsHtml(fortune.scores[key]);
    dd.setAttribute('aria-label', `5点満点中${fortune.scores[key]}点`);
    row.append(dt, dd);
    list.appendChild(row);
  }

  setText('lucky-color', fortune.luckyColor);
  setText('lucky-item', fortune.luckyItem);
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

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const year = Number(yearSelect.value);
  const month = Number(monthSelect.value);
  const day = Number(daySelect.value);
  const bloodId = new FormData(form).get('blood');

  const sign = getZodiacSign(month, day);
  const eto = getEto(year);
  const blood = BLOOD_TYPES[bloodId];

  renderProfile(sign, eto, blood);
  renderFortune(getDailyFortune(sign.id, new Date(), `${eto.id}:${blood.id}`));
  renderNumerology(year, month, day);
  renderRanking(sign.id);

  result.hidden = false;
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

setupForm();
