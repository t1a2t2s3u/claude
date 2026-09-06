import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCompatibility } from '../js/compatibility.js';

const A = { year: 1995, month: 8, day: 30, blood: 'O' };
const B = { year: 1993, month: 4, day: 2, blood: 'A' };

function axis(result, key) {
  return result.axes.find((a) => a.key === key);
}

test('相性診断は決定的で、日付に依存しない', () => {
  const r1 = getCompatibility(A, B);
  const r2 = getCompatibility(A, B);
  assert.deepEqual(r1, r2);
});

test('入れ替えても総合スコアは同じ(対称性)', () => {
  assert.equal(getCompatibility(A, B).total, getCompatibility(B, A).total);
});

test('4軸すべてに判定名・スコア・コメントがあり、値域に収まる', () => {
  const r = getCompatibility(A, B);
  assert.deepEqual(r.axes.map((a) => a.key), ['aspect', 'blood', 'eto', 'meishiki']);
  for (const a of r.axes) {
    assert.ok(a.relation.length > 0, `${a.label} の判定名が空`);
    assert.ok(a.score >= 30 && a.score <= 100, `${a.label} のスコア異常: ${a.score}`);
    assert.ok(a.comment.length > 0, `${a.label} のコメントが空`);
  }
  assert.ok(r.total >= 30 && r.total <= 100);
  assert.ok(Array.isArray(r.highlights));
});

test('星座のアスペクトが角距離から正しく判定される', () => {
  // 牡羊座(4/1)×獅子座(8/1): 4サイン差 = トライン(120度)
  const trine = getCompatibility(
    { year: 1990, month: 4, day: 1, blood: 'A' },
    { year: 1991, month: 8, day: 1, blood: 'A' }
  );
  assert.match(axis(trine, 'aspect').relation, /トライン/);
  assert.equal(axis(trine, 'aspect').score, 94);

  // 同じ星座 = コンジャンクション(0度)
  const conj = getCompatibility(
    { year: 1990, month: 4, day: 1, blood: 'A' },
    { year: 1991, month: 4, day: 10, blood: 'A' }
  );
  assert.match(axis(conj, 'aspect').relation, /コンジャンクション/);

  // 牡羊座×天秤座: 6サイン差 = オポジション(180度)
  const opp = getCompatibility(
    { year: 1990, month: 4, day: 1, blood: 'A' },
    { year: 1991, month: 10, day: 1, blood: 'A' }
  );
  assert.match(axis(opp, 'aspect').relation, /オポジション/);
});

test('年支の合・冲・刑が正しく判定される', () => {
  const shigou = getCompatibility(
    { year: 1996, month: 5, day: 5, blood: 'A' }, // 子
    { year: 1997, month: 5, day: 5, blood: 'A' } // 丑
  );
  assert.equal(axis(shigou, 'eto').relation, '支合');
  assert.equal(axis(shigou, 'eto').score, 96);
  assert.ok(shigou.highlights.some((h) => h.includes('支合')));

  const chuu = getCompatibility(
    { year: 1996, month: 5, day: 5, blood: 'A' }, // 子
    { year: 1990, month: 5, day: 5, blood: 'A' } // 午
  );
  assert.equal(axis(chuu, 'eto').relation, '冲');
  assert.equal(axis(chuu, 'eto').score, 52);

  const kei = getCompatibility(
    { year: 1996, month: 5, day: 5, blood: 'A' }, // 子
    { year: 1999, month: 5, day: 5, blood: 'A' } // 卯
  );
  assert.match(axis(kei, 'eto').relation, /刑\(無礼の刑\)/);

  const sangou = getCompatibility(
    { year: 1996, month: 5, day: 5, blood: 'A' }, // 子
    { year: 1992, month: 5, day: 5, blood: 'A' } // 申
  );
  assert.match(axis(sangou, 'eto').relation, /三合\(水局\)/);
});

test('日干の干合が検出され、特別な縁として表示される', () => {
  // 2024/1/1 = 甲子、2024/1/6 = 己巳 → 甲己の干合(土)
  const r = getCompatibility(
    { year: 2024, month: 1, day: 1, blood: 'A' },
    { year: 2024, month: 1, day: 6, blood: 'A' }
  );
  assert.match(axis(r, 'meishiki').relation, /干合/);
  assert.match(axis(r, 'meishiki').comment, /甲子/);
  assert.ok(r.highlights.some((h) => h.includes('干合')));
});

test('日支(配偶者の宮)の冲が命式スコアに反映される', () => {
  // 2024/1/1 = 甲子(子)、2024/1/7 = 庚午(午): 甲×庚は相剋(同陽)58、日支は子午の冲で-8
  const r = getCompatibility(
    { year: 2024, month: 1, day: 1, blood: 'A' },
    { year: 2024, month: 1, day: 7, blood: 'A' }
  );
  assert.equal(axis(r, 'meishiki').relation, '相剋');
  assert.equal(axis(r, 'meishiki').score, 50);
  assert.match(axis(r, 'meishiki').comment, /冲/);
});

test('全血液型ペア×代表的な生年月日で診断が成立する', () => {
  const bloods = ['A', 'B', 'O', 'AB'];
  const dates = [
    { year: 1990, month: 1, day: 1 },
    { year: 1988, month: 6, day: 15 },
    { year: 2001, month: 12, day: 31 },
    { year: 1996, month: 2, day: 29 },
  ];
  for (const ba of bloods) {
    for (const bb of bloods) {
      for (const da of dates) {
        for (const db of dates) {
          const r = getCompatibility({ ...da, blood: ba }, { ...db, blood: bb });
          assert.ok(Number.isFinite(r.total), `total が数値でない: ${ba}-${bb}`);
          assert.ok(r.total >= 30 && r.total <= 100);
          assert.ok(r.axes.every((a) => a.comment && a.relation));
        }
      }
    }
  }
});
