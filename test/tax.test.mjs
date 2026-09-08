/* 税計算の答え合わせ。すべて手計算で確かめた値を正解として置いている。
   実行： node test/tax.test.mjs
   ここが赤くなったら、税額が変わったということ。意図した変更なら正解を直す。 */
import { boot } from './harness.mjs';

let pass = 0, fail = 0;
const fails = [];
function eq(label, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if(ok) pass++;
  else { fail++; fails.push(`  ${label}\n    期待 ${JSON.stringify(want)}\n    実際 ${JSON.stringify(got)}`); }
}
function group(name, fn){ console.log('\n' + name); fn(); }

const base = { workMode:'free', filing:'blue65', hiType:'nhi', nhiPref:'akita', nhiCity:'std' };
const app = boot({ v:4, payments:[], biz:[], profile: base });

/* ---------- 部品ごと ---------- */

group('所得税の速算表（復興特別所得税込み・100円未満切捨て）', ()=>{
  eq('課税所得0',        app.incomeTaxOn(0),        0);
  eq('マイナスは0',      app.incomeTaxOn(-50000),   0);
  eq('100万円（5%）',    app.incomeTaxOn(1000000),  51000);
  eq('195万円（境目）',  app.incomeTaxOn(1950000),  99500);
  eq('195.1万円（10%）', app.incomeTaxOn(1951000),  99600);
  eq('500万円（20%）',   app.incomeTaxOn(5000000),  584500);
  eq('1000円未満切捨て', app.incomeTaxOn(1000999),  app.incomeTaxOn(1000000));
});

group('基礎控除（令和7・8年分）', ()=>{
  eq('132万円以下',   app.basicDeduction(1000000),  950000);
  eq('336万円以下',   app.basicDeduction(2000000),  880000);
  eq('489万円以下',   app.basicDeduction(4000000),  680000);
  eq('655万円以下',   app.basicDeduction(6000000),  630000);
  eq('2350万円以下',  app.basicDeduction(10000000), 580000);
  eq('2400万円以下',  app.basicDeduction(23600000), 480000);
  eq('2500万円超',    app.basicDeduction(26000000), 0);
});

group('給与所得控除（最低65万円）', ()=>{
  eq('100万円',  app.salaryDeduction(1000000), 650000);
  eq('190万円',  app.salaryDeduction(1900000), 650000);
  eq('200万円',  app.salaryDeduction(2000000), 680000);
  eq('500万円',  app.salaryDeduction(5000000), 1440000);
  eq('800万円',  app.salaryDeduction(8000000), 1900000);
  eq('900万円',  app.salaryDeduction(9000000), 1950000);
});

group('生命保険料控除（新制度・1区分ぶん）', ()=>{
  eq('所得税 2万円',  app.lifeInsDed(20000,  false), 20000);
  eq('所得税 3万円',  app.lifeInsDed(30000,  false), 25000);
  eq('所得税 4万円',  app.lifeInsDed(40000,  false), 30000);
  eq('所得税 6万円',  app.lifeInsDed(60000,  false), 35000);
  eq('所得税 8万円',  app.lifeInsDed(80000,  false), 40000);
  eq('所得税 上限',   app.lifeInsDed(200000, false), 40000);
  eq('住民税 1.2万円',app.lifeInsDed(12000,  true),  12000);
  eq('住民税 2万円',  app.lifeInsDed(20000,  true),  16000);
  eq('住民税 3.2万円',app.lifeInsDed(32000,  true),  22000);
  eq('住民税 4万円',  app.lifeInsDed(40000,  true),  24000);
  eq('住民税 5.6万円',app.lifeInsDed(56000,  true),  28000);
  eq('住民税 上限',   app.lifeInsDed(200000, true),  28000);
});

group('住民税の調整控除', ()=>{
  eq('課税所得0',                 app.residentAdjust(0, 0),             0);
  eq('200万円以下・扶養なし',      app.residentAdjust(1000000, 0),       2500);
  eq('200万円以下・人的控除差28万',app.residentAdjust(1931000, 280000),  16500);
  eq('課税所得が差より小さい',     app.residentAdjust(30000, 0),         1500);
  eq('200万円超は下限2500円',      app.residentAdjust(3000000, 0),       2500);
  eq('200万円超・人的控除差28万',  app.residentAdjust(2100000, 280000),  11500);
});

group('配偶者控除・配偶者特別控除', ()=>{
  const s = (own, sp, old) => { const r = app.spouseDed(own, sp, !!old); return [r.it, r.rt]; };
  eq('所得500万・配偶者0',        s(5000000, 0),          [380000, 330000]);
  eq('所得500万・配偶者70歳以上', s(5000000, 0, true),    [480000, 380000]);
  eq('配偶者の所得60万（配特）',  s(5000000, 600000),     [380000, 330000]);
  eq('配偶者の所得112万',         s(5000000, 1120000),    [310000, 310000]);
  eq('配偶者の所得140万（対象外）',s(5000000, 1400000),   [0, 0]);
  eq('本人920万（2段階目）',      s(9200000, 0),          [260000, 220000]);
  eq('本人920万・配特は2/3',      s(9200000, 600000),     [253000, 220000]);
  eq('本人1100万は対象外',        s(11000000, 0),         [0, 0]);
});

/* ---------- 国民健康保険 ---------- */

function nhi(profile, income){
  const a = boot({ v:4, payments:[], biz:[], profile: Object.assign({}, base, profile) });
  return a.nhiAmount(a.$('state.profile'), income).amount;
}
group('国民健康保険（令和8年度）', ()=>{
  eq('東京23区標準・所得500万・1人',
    nhi({nhiPref:'tokyo', nhiCity:'tokyostd', nhiMembers:1}, 5000000), 550579);
  eq('秋田県標準・所得500万・1人',
    nhi({nhiPref:'akita', nhiCity:'std', nhiMembers:1}, 5000000), 446976);
  eq('秋田県標準・介護分あり',
    nhi({nhiPref:'akita', nhiCity:'std', nhiMembers:1, care40:true}, 5000000), 581923);
  eq('大阪市（平等割あり）・所得500万・1人',
    nhi({nhiPref:'osakafu', nhiCity:'osaka', nhiMembers:1}, 5000000), 679563);
  eq('賦課限度額に当たる（所得1000万）',
    nhi({nhiPref:'tokyo', nhiCity:'tokyostd', nhiMembers:1}, 10000000), 957712);
  eq('基礎控除43万円以下は所得割ゼロ',
    nhi({nhiPref:'akita', nhiCity:'std', nhiMembers:1}, 400000), 53956);
});

/* ---------- 消費税 ---------- */

function ct(method, opts){
  const a = boot({ v:4, payments:[],
    biz:[{id:'i', type:'in', name:'売上', amount:8800000, y:2026, m:6, d:30, cat:'sales'},
         {id:'e', type:'ex', name:'仕入', amount:2200000, y:2026, m:6, d:15, cat:'buy'}],
    profile: Object.assign({}, base, {invoice:true, ctMethod:method}, opts||{}) });
  return a.calcTax(2026).ct;
}
group('消費税（売上880万・経費220万すべて税込）', ()=>{
  eq('2割特例',            ct('special20'), 160000);
  eq('簡易課税 第3種70%',  ct('simple', {ctSimpleType:3}), 240000);
  eq('簡易課税 第5種50%',  ct('simple', {ctSimpleType:5}), 400000);
  eq('本則課税',           ct('standard', {ctPurchasePct:100}), 600000);
  eq('本則・課税仕入50%',  ct('standard', {ctPurchasePct:50}), 700000);
  const a = boot({ v:4, payments:[],
    biz:[{id:'i', type:'in', name:'売上', amount:8800000, y:2026, m:6, d:30, cat:'sales'}],
    profile: Object.assign({}, base, {invoice:false}) });
  eq('インボイス未登録は0円', a.calcTax(2026).ct, 0);
});

/* ---------- 通しの計算 ---------- */

group('通し：収入32.79万・青色65万・簡易3種・健保は金額入力', ()=>{
  const a = boot({ v:4, payments:[], biz:[
      {id:'1', type:'in', name:'A', amount:242000, y:2026, m:8, d:31, cat:'sales'},
      {id:'2', type:'in', name:'B', amount:28000,  y:2026, m:8, d:27, cat:'sales'},
      {id:'3', type:'in', name:'C', amount:42900,  y:2026, m:9, d:4,  cat:'sales'},
      {id:'4', type:'in', name:'D', amount:15000,  y:2026, m:8, d:21, cat:'sales'}],
    profile: Object.assign({}, base, {invoice:true, ctMethod:'simple', ctSimpleType:3,
      hiType:'manual', hiManual:22800}) });
  const t = a.calcTax(2026);
  eq('事業の利益',      t.profit, 327900);
  eq('青色控除で所得0', t.income, 0);
  eq('社会保険',        t.social, 488640);
  eq('所得税',          t.it, 0);
  eq('住民税',          t.rt, 0);
  eq('個人事業税',      t.bt, 0);
  eq('消費税',          t.ct, 8900);
  eq('合計',            t.all, 497540);
});

group('通し：収入800万・経費200万・控除いろいろ・秋田3人世帯', ()=>{
  const a = boot({ v:4, payments:[], biz:[
      {id:'i', type:'in', name:'元請', amount:8000000, y:2026, m:6, d:30, cat:'sales'},
      {id:'e', type:'ex', name:'材料', amount:2000000, y:2026, m:6, d:15, cat:'buy'}],
    profile: Object.assign({}, base, {invoice:true, ctMethod:'simple', ctSimpleType:3,
      care40:true, nhiMembers:3, bizTaxRate:5,
      ded:{ kyosai:840000, lifeGen:80000, lifeMed:40000, lifePen:80000, quake:50000,
            spouse:true, spouseIncome:0, depGeneral:1, depSpecific:1, furusato:50000 }}) });
  const t = a.calcTax(2026);
  eq('合計所得',            t.income, 5350000);
  eq('国民健康保険',        t.nhi, 728860);
  eq('社会保険料控除',      t.social, 943900);
  eq('所得控除（所得税）',  t.ded.it, 2390000);
  eq('所得控除（住民税）',  t.ded.rt, 2045000);
  eq('人的控除の差',        t.ded.human, 280000);
  eq('基礎控除',            t.basic, 630000);
  eq('課税所得（所得税）',  t.itTaxable, 1338100);
  eq('所得税',              t.it, 68300);
  eq('課税所得（住民税）',  t.rtTaxable, 1931000);
  eq('調整控除',            t.adj, 16500);
  eq('住民税',              t.rt, 138180);
  eq('個人事業税',          t.bt, 155000);
  eq('ふるさと納税・所得控除', t.fs.itDed, 48000);
  eq('ふるさと納税・税額控除', t.fs.rtCredit, 43420);
  eq('ふるさと納税の上限目安', t.fs.limit, 47000);
  eq('上限超えの判定',      t.fs.over, true);
});

group('通し：白色・控除なしとの差（控除が効いているか）', ()=>{
  const mk = ded => boot({ v:4, payments:[], biz:[
      {id:'i', type:'in', name:'元請', amount:8000000, y:2026, m:6, d:30, cat:'sales'},
      {id:'e', type:'ex', name:'材料', amount:2000000, y:2026, m:6, d:15, cat:'buy'}],
    profile: Object.assign({}, base, {care40:true, nhiMembers:3, ded}) }).calcTax(2026);
  const none = mk({});
  const some = mk({ kyosai:840000 });
  eq('共済84万で所得税が下がる', none.it - some.it > 0, true);
  eq('共済84万で住民税が下がる', none.rt - some.rt > 0, true);
  eq('共済は国保に効かない',     none.nhi, some.nhi);
  eq('共済は合計に足されない',   none.all - some.all, (none.it-some.it) + (none.rt-some.rt));
});

group('通し：会社員＋副業', ()=>{
  const a = boot({ v:4, payments:[], biz:[
      {id:'i', type:'in', name:'副業', amount:900000, y:2026, m:5, d:20, cat:'sales'},
      {id:'e', type:'ex', name:'機材', amount:150000, y:2026, m:4, d:2,  cat:'supply'}],
    profile: Object.assign({}, base, {workMode:'side', salary:5000000}) });
  const t = a.calcTax(2026);
  eq('給与所得',        t.salIncome, 3560000);
  eq('副業の所得',      t.sideProfit, 750000);
  eq('社会保険（14.6%）', t.social, 730000);
  eq('確定申告が必要',  t.needFiling, true);
  eq('追加の住民税',    t.addRT, 75000);
});

group('決算書の集計（家事按分を科目に合流させる）', ()=>{
  const a = boot({ v:4,
    payments:[
      {id:'p1', name:'家賃',   amount:80000, day:27, cat:'home', method:'bank', freq:'monthly', bizPct:30},
      {id:'p2', name:'スマホ', amount:9000,  day:10, cat:'net',  method:'card', freq:'monthly', bizPct:50},
      {id:'p3', name:'電気',   amount:12000, day:25, cat:'util', method:'bank', freq:'monthly', bizPct:20}],
    biz:[
      {id:'i1', type:'in', name:'A', amount:4200000, y:2026, m:3, d:31, cat:'sales'},
      {id:'i2', type:'in', name:'B', amount:1800000, y:2026, m:9, d:30, cat:'sales'},
      {id:'i3', type:'in', name:'補助金', amount:200000, y:2026, m:5, d:10, cat:'inother'},
      {id:'e1', type:'ex', name:'仕入', amount:900000, y:2026, m:3,  d:10, cat:'buy'},
      {id:'e2', type:'ex', name:'外注', amount:600000, y:2026, m:4,  d:20, cat:'out'},
      {id:'e3', type:'ex', name:'高速', amount:48000,  y:2026, m:6,  d:1,  cat:'travel'},
      {id:'e4', type:'ex', name:'備品', amount:72000,  y:2026, m:7,  d:3,  cat:'supply'},
      {id:'e5', type:'ex', name:'会食', amount:33000,  y:2026, m:8,  d:9,  cat:'meet'},
      {id:'e6', type:'ex', name:'手数料', amount:4400, y:2026, m:9,  d:1,  cat:'fee'}],
    profile: Object.assign({}, base, {filing:'blue65'}) });
  const st = a.statement(2026);
  const acc = n => (st.expRows.find(r=>r.acc===n) || {amount:0}).amount;
  eq('売上',            st.inRows[0].amount, 6000000);
  eq('雑収入',          st.inRows[1].amount, 200000);
  eq('収入計',          st.income, 6200000);
  eq('仕入は売上原価へ', st.cost, 900000);
  eq('外注費→外注工賃',  acc('外注工賃'), 600000);
  eq('家賃30%→地代家賃', acc('地代家賃'), 288000);
  eq('スマホ50%→通信費', acc('通信費'), 54000);
  eq('電気20%→水道光熱費', acc('水道光熱費'), 28800);
  eq('会議交際費→接待交際費', acc('接待交際費'), 33000);
  eq('経費計',          st.expTotal, 1128200);
  eq('差引金額',        st.diff, 4171800);
  eq('青色申告特別控除', st.blue, 650000);
  eq('所得金額',        st.net, 3521800);
  eq('税金の計算と一致', st.diff, a.calcTax(2026).profit);
});

group('純損失の繰越控除（青色・3年）', ()=>{
  const mk = (biz, filing) => boot({ v:4, payments:[], biz,
    profile: Object.assign({}, base, {filing: filing||'blue65', hiType:'manual', hiManual:0}) });
  const yr = (y, inV, exV) => [
    {id:'i'+y, type:'in', name:'収入', amount:inV, y, m:6, d:30, cat:'sales'},
    {id:'e'+y, type:'ex', name:'経費', amount:exV, y, m:6, d:15, cat:'buy'}];

  // 2024に100万の赤字、2025は記録なし、2026は300万の黒字
  const a = mk([...yr(2024, 1000000, 2000000), ...yr(2026, 4000000, 1000000)]);
  eq('繰り越せる赤字',   a.lossCarry(2026).avail, 1000000);
  const t = a.calcTax(2026);
  eq('赤字を使った額',   t.carryUsed, 1000000);
  eq('所得は繰越後',     t.income, 3000000 - 650000 - 1000000);

  // 白色は繰り越せない
  const w = mk([...yr(2024, 1000000, 2000000), ...yr(2026, 4000000, 1000000)], 'white');
  eq('白色は繰越なし',   w.calcTax(2026).carryUsed, 0);

  // 4年前の赤字は消える（2022の赤字は2026では使えない）
  const old4 = mk([...yr(2022, 1000000, 2000000), ...yr(2026, 4000000, 1000000)]);
  eq('4年前の赤字は期限切れ', old4.calcTax(2026).carryUsed, 0);

  // 途中の黒字が赤字を食う
  const eaten = mk([...yr(2024, 1000000, 2000000), ...yr(2025, 2400000, 2000000),
                    ...yr(2026, 4000000, 1000000)]);
  eq('間の黒字40万が赤字を消費', eaten.calcTax(2026).carryUsed, 600000);

  // 個人事業税にも効く
  const bt = mk([...yr(2024, 1000000, 6000000), ...yr(2026, 9000000, 1000000)]);
  const tb = bt.calcTax(2026);
  eq('事業税も繰越後で計算', tb.bt,
    Math.round(Math.max(0, 8000000 - tb.carryUsed - 2900000) * 5/100));
});

group('予定納税（前年の所得税が15万円以上）', ()=>{
  const mk = (prevIn, curIn) => boot({ v:4, payments:[], biz:[
      {id:'p', type:'in', name:'前年', amount:prevIn, y:2025, m:6, d:30, cat:'sales'},
      {id:'c', type:'in', name:'今年', amount:curIn,  y:2026, m:6, d:30, cat:'sales'}],
    profile: Object.assign({}, base, {filing:'white', hiType:'manual', hiManual:0}) });

  const small = mk(2000000, 2000000);
  eq('前年の所得税が少なければ予定納税なし', small.calcTax(2026).prepaid, 0);

  const big = mk(9000000, 9000000);
  const t = big.calcTax(2026);
  eq('前年の所得税を拾えている', t.prevIt > 150000, true);
  eq('1期あたりは3分の1',       t.prepayEach, Math.floor(t.prevIt/3/100)*100);
  eq('2回ぶん前払い',           t.prepaid, t.prepayEach*2);
  eq('確定申告は差額だけ',       t.itDue, t.it - t.prepaid);

  // 前年が多く今年が少なければ還付
  const refund = mk(9000000, 2000000);
  eq('還付になる', refund.calcTax(2026).itDue < 0, true);

  const sched = big.taxSchedule(big.calcTax(2026), 2026).map(r=>r.date);
  eq('納付スケジュールは日付順', sched.slice().sort().join('|'), sched.join('|'));
});

/* ---------- 結果 ---------- */
console.log('\n' + '─'.repeat(48));
if(fail){
  console.log(`${pass} 件成功 / ${fail} 件失敗\n`);
  console.log(fails.join('\n'));
  process.exit(1);
}
console.log(`${pass} 件すべて成功`);
