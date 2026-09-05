import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCompatibility } from '../js/compatibility.js';

const A = { year: 1995, month: 8, day: 30, blood: 'O' };
const B = { year: 1993, month: 4, day: 2, blood: 'A' };

test('相性診断は決定的で、日付に依存しない', () => {
  const r1 = getCompatibility(A, B);
  const r2 = getCompatibility(A, B);
  assert.deepEqual(r1.total, r2.total);
  assert.deepEqual(r1.axes, r2.axes);
});

test('入れ替えても総合スコアは同じ(対称性)', () => {
  const ab = getCompatibility(A, B);
  const ba = getCompatibility(B, A);
  assert.equal(ab.total, ba.total);
});

test('4軸すべてにスコアとコメントがあり、総合は0〜100に収まる', () => {
  const r = getCompatibility(A, B);
  assert.equal(r.axes.length, 4);
  for (const axis of r.axes) {
    assert.ok(axis.label);
    assert.ok(axis.score >= 0 && axis.score <= 100, `${axis.label} のスコア異常: ${axis.score}`);
    assert.ok(axis.comment.length > 0, `${axis.label} のコメントが空`);
  }
  assert.ok(r.total >= 0 && r.total <= 100);
  assert.ok(r.overallComment.length > 0);
});

test('全血液型ペア×代表的な生年月日で診断が成立する', () => {
  const bloods = ['A', 'B', 'O', 'AB'];
  const dates = [
    { year: 1990, month: 1, day: 1 },
    { year: 1988, month: 6, day: 15 },
    { year: 2001, month: 12, day: 31 },
  ];
  for (const ba of bloods) {
    for (const bb of bloods) {
      for (const da of dates) {
        for (const db of dates) {
          const r = getCompatibility({ ...da, blood: ba }, { ...db, blood: bb });
          assert.ok(Number.isFinite(r.total), `total が数値でない: ${ba}-${bb}`);
          assert.ok(r.axes.every((axis) => axis.comment));
        }
      }
    }
  }
});

test('支合ペア(子×丑)の干支スコアは高い', () => {
  // 1996年=子年, 1997年=丑年
  const r = getCompatibility(
    { year: 1996, month: 5, day: 5, blood: 'A' },
    { year: 1997, month: 5, day: 5, blood: 'A' }
  );
  const eto = r.axes.find((axis) => axis.key === 'eto');
  assert.equal(eto.score, 95);
  assert.match(eto.comment, /支合/);
});

test('冲ペア(子×午)の干支スコアは低め', () => {
  // 1996年=子年, 1990年=午年
  const r = getCompatibility(
    { year: 1996, month: 5, day: 5, blood: 'A' },
    { year: 1990, month: 5, day: 5, blood: 'A' }
  );
  const eto = r.axes.find((axis) => axis.key === 'eto');
  assert.equal(eto.score, 55);
  assert.match(eto.comment, /冲/);
});
