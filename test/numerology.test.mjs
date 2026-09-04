import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLifePathNumber, LIFE_PATH_MEANINGS } from '../js/numerology.js';

test('全桁の合計を1桁まで還元する', () => {
  // 1990/1/1 → 1+9+9+0 + 1 + 1 = 21 → 3
  assert.equal(getLifePathNumber(1990, 1, 1), 3);
  // 2000/12/31 → 2 + 3 + 4 = 9
  assert.equal(getLifePathNumber(2000, 12, 31), 9);
});

test('マスターナンバーで還元が止まる', () => {
  // 1993/2/5 → (1+9+9+3) + 2 + 5 = 29 → 11 で停止
  assert.equal(getLifePathNumber(1993, 2, 5), 11);
  // 1980/11/2 → (1+9+8+0) + (1+1) + 2 = 22 で停止
  assert.equal(getLifePathNumber(1980, 11, 2), 22);
});

test('途中経過が2桁でもマスターナンバーでなければ1桁まで還元される', () => {
  // 1985/6/8 → 23 + 6 + 8 = 37 → 10 → 1
  assert.equal(getLifePathNumber(1985, 6, 8), 1);
  // 1966/3/3 → 22 + 3 + 3 = 28 → 10 → 1(年の合計が22でも合算後は還元)
  assert.equal(getLifePathNumber(1966, 3, 3), 1);
});

test('あり得る運命数すべてに意味が定義されている', () => {
  const found = new Set();
  for (let y = 1920; y <= 2030; y++) {
    for (let m = 1; m <= 12; m++) {
      for (const d of [1, 15, 28]) {
        found.add(getLifePathNumber(y, m, d));
      }
    }
  }
  for (const n of found) {
    assert.ok(LIFE_PATH_MEANINGS[n], `運命数 ${n} の意味が未定義`);
  }
});
