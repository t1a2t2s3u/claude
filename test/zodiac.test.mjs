import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getZodiacSign, ZODIAC_SIGNS } from '../js/zodiac.js';

test('12星座が定義されている', () => {
  assert.equal(ZODIAC_SIGNS.length, 12);
});

test('各星座の開始日と終了日で正しく判定される', () => {
  const boundaries = [
    ['aries', [3, 21], [4, 19]],
    ['taurus', [4, 20], [5, 20]],
    ['gemini', [5, 21], [6, 21]],
    ['cancer', [6, 22], [7, 22]],
    ['leo', [7, 23], [8, 22]],
    ['virgo', [8, 23], [9, 22]],
    ['libra', [9, 23], [10, 23]],
    ['scorpio', [10, 24], [11, 22]],
    ['sagittarius', [11, 23], [12, 21]],
    ['capricorn', [12, 22], [1, 19]],
    ['aquarius', [1, 20], [2, 18]],
    ['pisces', [2, 19], [3, 20]],
  ];
  for (const [id, [sm, sd], [em, ed]] of boundaries) {
    assert.equal(getZodiacSign(sm, sd).id, id, `${id} の開始日 ${sm}/${sd}`);
    assert.equal(getZodiacSign(em, ed).id, id, `${id} の終了日 ${em}/${ed}`);
  }
});

test('年をまたぐ山羊座が正しく判定される', () => {
  assert.equal(getZodiacSign(12, 31).id, 'capricorn');
  assert.equal(getZodiacSign(1, 1).id, 'capricorn');
});
