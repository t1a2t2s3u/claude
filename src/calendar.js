// 営業日カレンダー。土日と主要な祝日（固定日のみ）を休場として扱う。
// 実在のカレンダーを厳密に再現するのが目的ではなく、
// 「毎日は動かない」という感覚を出すための簡易版。

const FIXED_HOLIDAYS = new Set([
  '01-01', '01-02', '01-03', // 年末年始
  '02-11', '02-23',
  '04-29', '05-03', '05-04', '05-05',
  '08-11', '11-03', '11-23',
  '12-31',
]);

export function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isHoliday(date) {
  const md = `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
  return FIXED_HOLIDAYS.has(md);
}

export function isTradingDay(date) {
  return !isWeekend(date) && !isHoliday(date);
}

/** ISO 文字列 (YYYY-MM-DD) → Date(UTC) */
export function parseIso(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

export function toIso(date) {
  return date.toISOString().slice(0, 10);
}

/** 与えた日付の翌営業日を ISO 文字列で返す */
export function nextTradingDay(iso) {
  const d = parseIso(iso);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (!isTradingDay(d));
  return toIso(d);
}

/** iso が「その月の最後の営業日」かどうか */
export function isLastTradingDayOfMonth(iso) {
  const d = parseIso(iso);
  const month = d.getUTCMonth();
  return parseIso(nextTradingDay(iso)).getUTCMonth() !== month;
}
