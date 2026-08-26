import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTradingDay, nextTradingDay, isLastTradingDayOfMonth, parseIso } from '../src/calendar.js';

test('土日は営業日ではない', () => {
  assert.equal(isTradingDay(parseIso('2024-01-06')), false); // 土
  assert.equal(isTradingDay(parseIso('2024-01-07')), false); // 日
  assert.equal(isTradingDay(parseIso('2024-01-05')), true); // 金
});

test('固定祝日は休場', () => {
  assert.equal(isTradingDay(parseIso('2024-01-01')), false);
  assert.equal(isTradingDay(parseIso('2024-05-03')), false);
});

test('金曜の翌営業日は月曜', () => {
  assert.equal(nextTradingDay('2024-01-05'), '2024-01-08');
});

test('年末年始をまたぐと 1/4 に着地する', () => {
  assert.equal(nextTradingDay('2023-12-29'), '2024-01-04');
});

test('月末営業日の判定', () => {
  assert.equal(isLastTradingDayOfMonth('2024-01-31'), true);
  assert.equal(isLastTradingDayOfMonth('2024-01-30'), false);
  // 3/31 は日曜なので 3/29(金) が月末営業日
  assert.equal(isLastTradingDayOfMonth('2024-03-29'), true);
});

test('連続して呼んでも必ず営業日を返す', () => {
  let d = '2024-01-04';
  for (let i = 0; i < 500; i++) {
    d = nextTradingDay(d);
    assert.ok(isTradingDay(parseIso(d)), d);
  }
});
