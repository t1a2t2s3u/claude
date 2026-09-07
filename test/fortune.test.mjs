import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDailyFortune,
  getDailyRanking,
  formatDateKey,
  LUCKY_COLORS,
  LUCKY_ITEMS,
  MESSAGE_POOLS,
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

test('パーソナルシードつきでも決定的で、シードが違えば結果が変わり得る', () => {
  const a1 = getDailyFortune('aries', DATE_A, 'ne:A');
  const a2 = getDailyFortune('aries', DATE_A, 'ne:A');
  assert.deepEqual(a1, a2);

  // 干支×血液型48通りのシードで全て同一結果になることはない
  const etoIds = ['ne', 'ushi', 'tora', 'u', 'tatsu', 'mi', 'uma', 'hitsuji', 'saru', 'tori', 'inu', 'i'];
  const variants = new Set();
  for (const eto of etoIds) {
    for (const blood of ['A', 'B', 'O', 'AB']) {
      variants.add(JSON.stringify(getDailyFortune('aries', DATE_A, `${eto}:${blood}`)));
    }
  }
  assert.ok(variants.size > 1);
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

test('メッセージプールの体裁(最低本数・空文字なし)が保たれている', () => {
  const { MESSAGES, CATEGORY_ADVICE, SEASONAL_NOTES } = MESSAGE_POOLS;
  for (const score of [1, 2, 3, 4, 5]) {
    assert.ok(MESSAGES[score].length >= 5, `総合運スコア${score}のメッセージが5本未満`);
    for (const m of MESSAGES[score]) assert.ok(m.length >= 15, `短すぎる: ${m}`);
  }
  for (const category of ['love', 'work', 'money']) {
    for (const band of ['high', 'mid', 'low']) {
      const pool = CATEGORY_ADVICE[category][band];
      assert.ok(pool.length >= 3, `${category}/${band} のアドバイスが3本未満`);
      for (const m of pool) assert.ok(m.length >= 15, `短すぎる: ${m}`);
    }
  }
  for (let month = 1; month <= 12; month++) {
    assert.ok(SEASONAL_NOTES[month]?.length >= 2, `${month}月の季節のひとことが2本未満`);
  }
});

test('季節のひとことは月に応じたものが選ばれる', () => {
  const { SEASONAL_NOTES } = MESSAGE_POOLS;
  const f = getDailyFortune('aries', new Date(2026, 11, 24)); // 12月
  assert.ok(SEASONAL_NOTES[12].includes(f.seasonal));
});

test('恋愛・仕事・金運のカテゴリ別アドバイスが含まれる', () => {
  for (const sign of ZODIAC_SIGNS) {
    const f = getDailyFortune(sign.id, DATE_A, 'ne:A');
    for (const key of ['love', 'work', 'money']) {
      assert.equal(typeof f.advice[key], 'string');
      assert.ok(f.advice[key].length > 0, `${sign.id} の ${key} アドバイスが空`);
    }
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
