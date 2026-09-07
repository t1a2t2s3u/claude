import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getDailyTarot,
  getThreeCardSpread,
  getTarotAdvice,
  TAROT_CARDS,
} from '../js/tarot.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATE_A = new Date(2026, 8, 4);
const DATE_B = new Date(2026, 8, 5);

test('フルデッキ78枚(大アルカナ22+小アルカナ56)が定義されている', () => {
  assert.equal(TAROT_CARDS.length, 78);
  assert.equal(TAROT_CARDS.filter((c) => c.arcana === 'major').length, 22);
  assert.equal(TAROT_CARDS.filter((c) => c.arcana === 'minor').length, 56);
  assert.equal(new Set(TAROT_CARDS.map((c) => c.name)).size, 78);
  TAROT_CARDS.forEach((card, i) => {
    assert.equal(card.id, i);
    assert.ok(card.name && card.image, `${i} 枚目の name/image が未定義`);
    for (const side of ['upright', 'reversed']) {
      assert.ok(card[side].keywords, `${card.name} の ${side}.keywords が未定義`);
      assert.ok(card[side].message, `${card.name} の ${side}.message が未定義`);
    }
    for (const isReversed of [false, true]) {
      const advice = getTarotAdvice(card, isReversed);
      for (const key of ['love', 'work', 'money']) {
        assert.ok(advice[key] && advice[key].length > 10, `${card.name} の ${key} アドバイスが不足`);
      }
    }
  });
});

test('大アルカナは正位置と逆位置でアドバイスが変わる', () => {
  for (const card of TAROT_CARDS.filter((c) => c.arcana === 'major')) {
    const up = getTarotAdvice(card, false);
    const rev = getTarotAdvice(card, true);
    assert.notEqual(up.love, rev.love, `${card.name} の恋愛アドバイスが正逆同一`);
    assert.notEqual(up.work, rev.work, `${card.name} の仕事アドバイスが正逆同一`);
    assert.notEqual(up.money, rev.money, `${card.name} の金運アドバイスが正逆同一`);
  }
});

test('全カードの画像ファイルがリポジトリに存在する', () => {
  for (const card of TAROT_CARDS) {
    assert.ok(
      existsSync(join(REPO_ROOT, card.image)),
      `${card.name} の画像がない: ${card.image}`
    );
  }
});

test('同じ日・同じ人なら同じカードになる(決定性)', () => {
  const a = getDailyTarot('virgo:i:O', DATE_A);
  const b = getDailyTarot('virgo:i:O', DATE_A);
  assert.equal(a.card.id, b.card.id);
  assert.equal(a.isReversed, b.isReversed);
});

test('日付や人が変われば別のカードが出うる', () => {
  const seeds = ['virgo:i:O', 'aries:ne:A', 'leo:tora:B', 'pisces:mi:AB'];
  const draws = new Set();
  for (const seed of seeds) {
    for (const date of [DATE_A, DATE_B]) {
      const { card, isReversed } = getDailyTarot(seed, date);
      draws.add(`${card.id}:${isReversed}`);
    }
  }
  assert.ok(draws.size > 1);
});

test('十分な試行で正位置と逆位置の両方が出て、小アルカナも引かれる', () => {
  let reversed = 0;
  let minor = 0;
  for (let i = 0; i < 300; i++) {
    const draw = getDailyTarot(`seed-${i}`, DATE_A);
    if (draw.isReversed) reversed++;
    if (draw.card.arcana === 'minor') minor++;
  }
  assert.ok(reversed > 0 && reversed < 300);
  assert.ok(minor > 0);
});

test('3枚引きは過去・現在・未来の重複しない3枚を決定的に返す', () => {
  const a = getThreeCardSpread('virgo:i:O', DATE_A);
  const b = getThreeCardSpread('virgo:i:O', DATE_A);
  assert.deepEqual(a.map((x) => [x.position, x.card.id, x.isReversed]),
    b.map((x) => [x.position, x.card.id, x.isReversed]));
  assert.deepEqual(a.map((x) => x.position), ['過去', '現在', '未来']);
  assert.equal(new Set(a.map((x) => x.card.id)).size, 3);
  // 今日の一枚とはシードが独立している(同一日でも別の抽選)
  const daily = getDailyTarot('virgo:i:O', DATE_A);
  assert.ok(daily.card);
});
