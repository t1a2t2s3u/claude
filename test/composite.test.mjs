import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCompositeProfile } from '../js/composite.js';
import { ZODIAC_SIGNS } from '../js/zodiac.js';
import { ETO_LIST } from '../js/eto.js';
import { BLOOD_TYPES, BLOOD_TYPE_IDS } from '../js/bloodtype.js';

test('血液型は4タイプ定義されている', () => {
  assert.deepEqual(Object.keys(BLOOD_TYPES).sort(), [...BLOOD_TYPE_IDS].sort());
});

test('全組み合わせ(12星座×12支×4血液型)で4パートの鑑定が生成される', () => {
  const expectedLabels = ['本質', '人とのかかわり', '内に秘めたもの', '開運のヒント'];
  for (const sign of ZODIAC_SIGNS) {
    for (const eto of ETO_LIST) {
      for (const bloodId of BLOOD_TYPE_IDS) {
        const p = getCompositeProfile(sign, eto, BLOOD_TYPES[bloodId]);
        assert.ok(p.catchphrase.includes(sign.keyword));
        assert.ok(p.catchphrase.includes(eto.keyword));
        assert.deepEqual(p.sections.map((s) => s.label), expectedLabels);
        for (const section of p.sections) {
          assert.ok(
            section.text && section.text.length >= 40,
            `${sign.id}×${eto.id}×${bloodId} の「${section.label}」が短すぎるか未定義`
          );
        }
      }
    }
  }
});

test('要素が違えば対応するパートの文章も変わる', () => {
  const eto = ETO_LIST[0];
  const blood = BLOOD_TYPES.A;
  // 星座が違えば「本質」が変わる
  const essences = new Set(
    ZODIAC_SIGNS.map((sign) => getCompositeProfile(sign, eto, blood).sections[0].text)
  );
  assert.equal(essences.size, 12);
  // 干支が違えば「人とのかかわり」が変わる
  const relations = new Set(
    ETO_LIST.map((e) => getCompositeProfile(ZODIAC_SIGNS[0], e, blood).sections[1].text)
  );
  assert.equal(relations.size, 12);
  // 血液型が違えば「内に秘めたもの」と「開運のヒント」が変わる
  const inners = new Set(
    BLOOD_TYPE_IDS.map(
      (id) => getCompositeProfile(ZODIAC_SIGNS[0], eto, BLOOD_TYPES[id]).sections[2].text
    )
  );
  assert.equal(inners.size, 4);
});

test('同じ入力からは常に同じプロフィールが生成される(決定性)', () => {
  const a = getCompositeProfile(ZODIAC_SIGNS[0], ETO_LIST[0], BLOOD_TYPES.A);
  const b = getCompositeProfile(ZODIAC_SIGNS[0], ETO_LIST[0], BLOOD_TYPES.A);
  assert.deepEqual(a, b);
});
