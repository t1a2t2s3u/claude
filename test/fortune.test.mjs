import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDailyFortune,
  getDailyRanking,
  formatDateKey,
  LUCKY_COLORS,
  LUCKY_ITEMS,
} from '../js/fortune.js';
import { ZODIAC_SIGNS } from '../js/zodiac.js';

const DATE_A = new Date(2026, 8, 4); // 2026-09-04
const DATE_B = new Date(2026, 8, 5); // 2026-09-05

test('formatDateKey はローカル日付を YYYY-MM-DD にする', () => {
  assert.equal(formatDateKey(new Date(2026, 0, 9)), '2026-01-09');
});

test('同じ日・同じ星座なら同じ結果になる(決定性)', () => {
  const a = getDailyFortune('aries', DATE_A);
  const b = getDailyFortune('aries', DATE_A);
  assert.deepEqual(a, b);
});

test('日付か星座が変わると結果が変わり得る(全星座×2日で少なくとも一部が異なる)', () => {
  const sameDay = ZODIAC_SIGNS.map((s) => JSON.stringify(getDailyFortune(s.id, DATE_A)));
  const nextDay = ZODIAC_SIGNS.map((s) => JSON.stringify(getDailyFortune(s.id, DATE_B)));
  assert.notDeepEqual(sameDay, nextDay);
  // 同じ日でも星座ごとに独立した結果になっている(全部同一ではない)
  assert.ok(new Set(sameDay).size > 1);
});

test('スコアは1〜5、ラッキー要素は候補リストから選ばれる', () => {
  for (const sign of ZODIAC_SIGNS) {
    const f = getDailyFortune(sign.id, DATE_A);
    for (const v of Object.values(f.scores)) {
      assert.ok(v >= 1 && v <= 5, `score out of range: ${v}`);
    }
    assert.ok(LUCKY_COLORS.includes(f.luckyColor));
    assert.ok(LUCKY_ITEMS.includes(f.luckyItem));
    assert.equal(typeof f.message, 'string');
    assert.ok(f.message.length > 0);
  }
});

test('ランキングは12星座すべてを含み、総合スコアの降順で並ぶ', () => {
  const ranking = getDailyRanking(DATE_A);
  assert.equal(ranking.length, 12);
  assert.equal(new Set(ranking.map((r) => r.sign.id)).size, 12);
  for (let i = 1; i < ranking.length; i++) {
    assert.ok(
      ranking[i - 1].fortune.scores.total >= ranking[i].fortune.scores.total,
      '総合スコアが降順になっていない'
    );
    assert.equal(ranking[i].rank, i + 1);
  }
});
