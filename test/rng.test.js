import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';

test('同じシードなら同じ系列になる', () => {
  const a = createRng(123);
  const b = createRng(123);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('シードが違えば系列も違う', () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notEqual(a.next(), b.next());
});

test('next は [0,1) に収まる', () => {
  const rng = createRng(9);
  for (let i = 0; i < 10_000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('状態を保存・復元すると続きが再現できる', () => {
  const rng = createRng(7);
  for (let i = 0; i < 50; i++) rng.next();
  const saved = rng.getState();
  const expected = [rng.next(), rng.next(), rng.next()];

  const restored = createRng(0);
  restored.setState(saved);
  assert.deepEqual([restored.next(), restored.next(), restored.next()], expected);
});

test('normal はおおむね平均0・標準偏差1', () => {
  const rng = createRng(2024);
  const n = 50_000;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = rng.normal();
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / n;
  const sd = Math.sqrt(sumSq / n - mean ** 2);
  assert.ok(Math.abs(mean) < 0.03, `mean=${mean}`);
  assert.ok(Math.abs(sd - 1) < 0.03, `sd=${sd}`);
});

test('int は範囲内の整数を返す', () => {
  const rng = createRng(5);
  for (let i = 0; i < 1000; i++) {
    const v = rng.int(3, 7);
    assert.ok(Number.isInteger(v) && v >= 3 && v <= 7);
  }
});
