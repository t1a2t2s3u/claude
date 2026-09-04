import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCompositeProfile } from '../js/composite.js';
import { ZODIAC_SIGNS } from '../js/zodiac.js';
import { ETO_LIST } from '../js/eto.js';
import { BLOOD_TYPES, BLOOD_TYPE_IDS } from '../js/bloodtype.js';

test('血液型は4タイプ定義されている', () => {
  assert.deepEqual(Object.keys(BLOOD_TYPES).sort(), [...BLOOD_TYPE_IDS].sort());
});

test('全組み合わせ(12星座×12支×4血液型)でプロフィールを生成できる', () => {
  for (const sign of ZODIAC_SIGNS) {
    for (const eto of ETO_LIST) {
      for (const bloodId of BLOOD_TYPE_IDS) {
        const p = getCompositeProfile(sign, eto, BLOOD_TYPES[bloodId]);
        assert.ok(p.catchphrase.includes(sign.keyword));
        assert.ok(p.catchphrase.includes(eto.keyword));
        assert.ok(p.description.length > 0);
        assert.ok(p.synergy.length > 0, `${sign.element}×${bloodId} の相乗コメントが空`);
      }
    }
  }
});

test('同じ入力からは常に同じプロフィールが生成される(決定性)', () => {
  const a = getCompositeProfile(ZODIAC_SIGNS[0], ETO_LIST[0], BLOOD_TYPES.A);
  const b = getCompositeProfile(ZODIAC_SIGNS[0], ETO_LIST[0], BLOOD_TYPES.A);
  assert.deepEqual(a, b);
});
