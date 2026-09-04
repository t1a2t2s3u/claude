import { getZodiacSign } from './zodiac.js';
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

function renderSign(sign) {
  document.getElementById('sign-symbol').textContent = sign.symbol;
  document.getElementById('sign-name').textContent = sign.name;
  document.getElementById('sign-meta').textContent =
    `${sign.period} ・ ${sign.element}の星座`;
  document.getElementById('sign-traits').textContent = sign.traits;
}

function renderFortune(fortune) {
  const today = new Date();
  document.getElementById('fortune-date').textContent =
    `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  document.getElementById('fortune-message').textContent = fortune.message;

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

  document.getElementById('lucky-color').textContent = fortune.luckyColor;
  document.getElementById('lucky-item').textContent = fortune.luckyItem;
}

function renderNumerology(year, month, day) {
  const n = getLifePathNumber(year, month, day);
  const meaning = LIFE_PATH_MEANINGS[n];
  document.getElementById('life-path-number').textContent = String(n);
  document.getElementById('life-path-title').textContent =
    `運命数 ${n} — ${meaning.title}`;
  document.getElementById('life-path-description').textContent = meaning.description;
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

  const sign = getZodiacSign(month, day);
  renderSign(sign);
  renderFortune(getDailyFortune(sign.id));
  renderNumerology(year, month, day);
  renderRanking(sign.id);

  result.hidden = false;
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

setupForm();
