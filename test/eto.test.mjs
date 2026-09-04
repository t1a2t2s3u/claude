import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEto, ETO_LIST } from '../js/eto.js';

test('十二支が12種類定義されている', () => {
  assert.equal(ETO_LIST.length, 12);
  assert.equal(new Set(ETO_LIST.map((e) => e.id)).size, 12);
});

test('代表的な年の干支が正しい', () => {
  assert.equal(getEto(2020).id, 'ne'); // 子
  assert.equal(getEto(1995).id, 'i'); // 亥
  assert.equal(getEto(2000).id, 'tatsu'); // 辰
  assert.equal(getEto(1988).id, 'tatsu'); // 辰
  assert.equal(getEto(2026).id, 'uma'); // 午
  assert.equal(getEto(1900).id, 'ne'); // 子(古い年でも正しく計算できる)
});

test('12年周期で同じ干支に戻る', () => {
  for (let y = 1950; y < 1962; y++) {
    assert.equal(getEto(y).id, getEto(y + 12).id);
    assert.equal(getEto(y).id, getEto(y + 120).id);
  }
});
