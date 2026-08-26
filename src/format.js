// 表示用のフォーマッタ。UI とテストの双方から使う。

const jpy = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
const jpy1 = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 1,234,567 円 */
export function yen(value) {
  return `¥${jpy.format(Math.round(value))}`;
}

/** 符号付き金額。0 は符号なし */
export function signedYen(value) {
  const rounded = Math.round(value);
  if (rounded === 0) return '¥0';
  return `${rounded > 0 ? '+' : '-'}¥${jpy.format(Math.abs(rounded))}`;
}

/** 株価。1000 円未満は小数第 1 位まで出す */
export function price(value) {
  return value < 1000 ? jpy1.format(value) : jpy.format(Math.round(value));
}

/** +1.23% 形式 */
export function percent(ratio, digits = 2) {
  const pct = ratio * 100;
  const rounded = Number(pct.toFixed(digits));
  // 丸めて 0 になる値に符号を付けると -0.00% のような表示になってしまう
  if (rounded === 0) return `${(0).toFixed(digits)}%`;
  return `${rounded > 0 ? '+' : ''}${pct.toFixed(digits)}%`;
}

export function number(value) {
  return jpy.format(value);
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
