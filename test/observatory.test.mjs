import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSim,
  stepSim,
  navOf,
  agentPnl,
  START_CASH,
  GOAL_PROFIT,
  TOTAL_TICKS,
} from '../lab/agent-observatory/js/sim.js';
import { AGENTS, TRADERS } from '../lab/agent-observatory/js/agents.js';
import { ASSETS } from '../lab/agent-observatory/js/market.js';

function runToEnd(seed) {
  const sim = createSim(seed);
  while (!stepSim(sim)) {
    // 完走するまで進める
  }
  return sim;
}

test('編成は10体(トレーダー8+承認ゲート+司令塔)、銘柄は上場内国株の全ユニバース', () => {
  assert.equal(AGENTS.length, 10);
  assert.equal(TRADERS.length, 8);
  assert.equal(AGENTS.filter((a) => a.kind === 'gate').length, 1);
  assert.equal(AGENTS.filter((a) => a.kind === 'commander').length, 1);
  assert.ok(ASSETS.length > 3000, `銘柄数が少なすぎる: ${ASSETS.length}`);
  const codes = new Set();
  for (const asset of ASSETS) {
    // 通常は4桁(英字含む)。優先株式など一部に5桁コードがある
    assert.match(asset.code, /^[0-9A-Z]{4,5}$/, `${asset.name} の証券コードが不正`);
    assert.ok(!codes.has(asset.code), `証券コード重複: ${asset.code}`);
    codes.add(asset.code);
    assert.ok(asset.start > 0 && asset.vol > 0 && asset.name.length > 0);
    assert.ok(['P', 'S', 'G'].includes(asset.seg));
  }
});

test('同じシードなら相場も売買も結末も完全に一致する(決定性)', () => {
  const a = runToEnd('session-001');
  const b = runToEnd('session-001');
  assert.deepEqual(a.navHistory, b.navHistory);
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(a.result, b.result);
});

test('シードが変われば展開も変わる', () => {
  const a = runToEnd('session-001');
  const b = runToEnd('session-002');
  assert.notDeepEqual(a.navHistory, b.navHistory);
});

test('毎tickの会計整合: 現金は負にならず、資産履歴は現金+時価と一致する', () => {
  const sim = createSim('session-001');
  while (!stepSim(sim)) {
    assert.ok(sim.cash >= 0, `tick ${sim.tick} で現金が負`);
    const nav = navOf(sim);
    assert.ok(
      Math.abs(sim.navHistory[sim.navHistory.length - 1] - nav) < 0.01,
      `tick ${sim.tick} で資産履歴と時価が不一致`,
    );
  }
  assert.equal(sim.navHistory.length, sim.tick + 1);
});

test('終了すると結果が確定し、判定は目標利益と整合する', () => {
  const sim = runToEnd('session-001');
  assert.equal(sim.done, true);
  assert.ok(sim.tick <= TOTAL_TICKS);
  assert.equal(sim.result.profit, sim.result.finalNav - START_CASH);
  assert.equal(sim.result.achieved, sim.result.profit >= GOAL_PROFIT);
  // 目標到達前に期限が来た場合だけ未達になる
  if (sim.tick < TOTAL_TICKS) assert.equal(sim.result.achieved, true);
  // 終了後にさらに進めても状態は変わらない
  const navAfter = sim.navHistory.slice();
  stepSim(sim);
  assert.deepEqual(sim.navHistory, navAfter);
});

test('目標到達で早期終了するセッションと期限切れのセッションの両方が存在する', () => {
  // 決定的なので、達成・未達それぞれの既知シードを直接検証する
  // (バランス調整でエンジンを変えたときは、このシードも取り直すこと)
  const achieved = runToEnd('session-003');
  assert.equal(achieved.result.achieved, true);
  assert.ok(achieved.tick < TOTAL_TICKS, '達成セッションは早期終了するはず');
  const failed = runToEnd('session-001');
  assert.equal(failed.result.achieved, false);
  assert.equal(failed.tick, TOTAL_TICKS);
});

test('エージェントは実際に売買し、承認ゲートも機能している', () => {
  // 複数シードを合算して、売買・承認・却下が一通り発生することを確認する
  const seeds = ['session-001', 'session-002'];
  let trades = 0;
  let rejected = 0;
  for (const seed of seeds) {
    const sim = runToEnd(seed);
    trades += sim.approved;
    rejected += sim.rejected;
    // 個別損益の合計+現金の増減が全体損益と大きく乖離しないこと
    const totalPnl = TRADERS.reduce((sum, a) => sum + agentPnl(sim, a.id), 0);
    const navPnl = navOf(sim) - START_CASH;
    assert.ok(Math.abs(totalPnl - navPnl) < 1, `${seed}: 個別損益の合計と全体損益が不一致`);
  }
  assert.ok(trades > 20, '売買がほとんど発生していない');
  assert.ok(rejected > 0, '承認ゲートが一度も却下していない');
});
