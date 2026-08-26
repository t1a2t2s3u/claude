// 表示用のフォーマッタ。UI とテストの双方から使う。
// 通貨は state から渡す（既定は円）。モジュールに状態は持たない。

const CURRENCIES = {
  JPY: { symbol: '¥', decimals: 0, priceDecimals: 1, plainPriceFrom: 1000 },
  USD: { symbol: '$', decimals: 2, priceDecimals: 2, plainPriceFrom: Infinity },
};

function spec(currency) {
  return CURRENCIES[currency] ?? CURRENCIES.JPY;
}

function group(value, decimals) {
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** ¥1,234,567 / $1,234.56 */
export function money(value, currency = 'JPY') {
  const { symbol, decimals } = spec(currency);
  return `${symbol}${group(roundMoney(value, currency), decimals)}`;
}

/** 符号付き金額。0 は符号なし */
export function signedMoney(value, currency = 'JPY') {
  const { symbol, decimals } = spec(currency);
  const rounded = roundMoney(value, currency);
  if (rounded === 0) return `${symbol}${group(0, decimals)}`;
  return `${rounded > 0 ? '+' : '-'}${symbol}${group(Math.abs(rounded), decimals)}`;
}

/** 金額をその通貨の最小単位（円 / セント）に丸める */
export function roundMoney(value, currency = 'JPY') {
  const f = 10 ** spec(currency).decimals;
  return Math.round(value * f) / f;
}

/** 株価。円は 1,000 円以上で小数を落とし、ドルは常にセントまで出す */
export function price(value, currency = 'JPY') {
  const { priceDecimals, plainPriceFrom } = spec(currency);
  return value >= plainPriceFrom ? group(Math.round(value), 0) : group(value, priceDecimals);
}

/** 株価をその通貨の刻みに丸める */
export function roundPrice(value, currency = 'JPY') {
  const f = 10 ** spec(currency).priceDecimals;
  return Math.round(value * f) / f;
}

/** +1.23% 形式。丸めて 0 になる値には符号を付けない */
export function percent(ratio, digits = 2) {
  const pct = ratio * 100;
  const rounded = Number(pct.toFixed(digits));
  if (rounded === 0) return `${(0).toFixed(digits)}%`;
  return `${rounded > 0 ? '+' : ''}${pct.toFixed(digits)}%`;
}

export function number(value) {
  return value.toLocaleString('ja-JP', { maximumFractionDigits: 0 });
}

/** ISO 日付文字列 (YYYY-MM-DD) → 2024/01/04(木) */
export function jpDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const week = '日月火水木金土'[d.getUTCDay()];
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(
    d.getUTCDate()
  ).padStart(2, '0')}(${week})`;
}

/** 損益の符号からクラス名を返す */
export function pnlClass(value) {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}
