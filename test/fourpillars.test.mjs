import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toJDN,
  getDayPillar,
  getYearPillar,
  getFourPillars,
  STEMS,
  DAY_STEM_MEANINGS,
  GENERATES,
  OVERCOMES,
} from '../js/fourpillars.js';

test('ユリウス通日の計算が正しい', () => {
  assert.equal(toJDN(2000, 1, 1), 2451545);
  assert.equal(toJDN(1995, 8, 30), 2449960);
});

test('日柱の干支が既知の日付と一致する', () => {
  // 2024/1/1 は甲子の日(元日と甲子が重なると広く話題になった日)
  assert.equal(getDayPillar(2024, 1, 1).name, '甲子');
  // 2000/1/1 は戊午の日
  assert.equal(getDayPillar(2000, 1, 1).name, '戊午');
  // 甲子から60日周期で一巡する
  assert.equal(getDayPillar(2024, 3, 1).name, getDayPillar(2024, 1, 1).name);
});

test('年柱の干支が既知の年と一致する', () => {
  assert.equal(getYearPillar(2024).name, '甲辰');
  assert.equal(getYearPillar(1995).name, '乙亥');
  assert.equal(getYearPillar(2000).name, '庚辰');
});

test('10種すべての日干に意味が定義されている', () => {
  for (const stem of STEMS) {
    assert.ok(DAY_STEM_MEANINGS[stem.char], `${stem.char} の意味が未定義`);
  }
});

test('五行の相生・相剋が一巡する', () => {
  const elements = ['木', '火', '土', '金', '水'];
  assert.deepEqual(Object.keys(GENERATES).sort(), [...elements].sort());
  assert.deepEqual(Object.keys(OVERCOMES).sort(), [...elements].sort());
  // 相生を5回たどると元に戻る
  let e = '木';
  for (let i = 0; i < 5; i++) e = GENERATES[e];
  assert.equal(e, '木');
});

test('getFourPillars が一貫した結果を返す', () => {
  const fp = getFourPillars(1995, 8, 30);
  assert.equal(fp.yearPillar.name, '乙亥');
  assert.equal(fp.dayPillar.stem, fp.dayStem);
  assert.equal(fp.meaning, DAY_STEM_MEANINGS[fp.dayStem.char]);
});
