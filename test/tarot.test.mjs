import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDailyTarot, TAROT_CARDS } from '../js/tarot.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DATE_A = new Date(2026, 8, 4);
const DATE_B = new Date(2026, 8, 5);

test('大アルカナ22枚がすべて定義されている', () => {
  assert.equal(TAROT_CARDS.length, 22);
  TAROT_CARDS.forEach((card, i) => {
    assert.equal(card.id, i);
    for (const field of ['name', 'roman', 'emoji', 'image', 'love', 'work', 'money']) {
      assert.ok(card[field], `${card.name} の ${field} が未定義`);
    }
    for (const side of ['upright', 'reversed']) {
      assert.ok(card[side].keywords, `${card.name} の ${side}.keywords が未定義`);
      assert.ok(card[side].message, `${card.name} の ${side}.message が未定義`);
    }
  });
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

test('十分な試行で正位置と逆位置の両方が出る', () => {
  let reversed = 0;
  for (let i = 0; i < 200; i++) {
    if (getDailyTarot(`seed-${i}`, DATE_A).isReversed) reversed++;
  }
  assert.ok(reversed > 0 && reversed < 200);
});
