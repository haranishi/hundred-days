// Evaluation evidence only: actual app functions in a VM with mocked DOM/audio/timers.
// This does not simulate browser layout, native checkbox behavior, or real input latency.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const stageSource = readFileSync('day-063-dark-patterns/lib/stages.js', 'utf8').replaceAll('export ', '');
const appSource = readFileSync('day-063-dark-patterns/app.js', 'utf8')
  .replace(/^import[\s\S]*?from "\.\/lib\/stages.js";\n/, '')
  .replace(/^import[\s\S]*?from "\.\/lib\/audio.js";\n/, '')
  .replaceAll('export ', '');

function setup(stageIndex = 0) {
  const nodes = new Map();
  let now = 0;
  let timerId = 0;
  const intervals = new Map();
  function element(key) {
    if (nodes.has(key)) return nodes.get(key);
    const attrs = new Map();
    const classes = new Set();
    const events = new Map();
    const el = {
      textContent: '', innerHTML: '', className: '', style: {}, checked: false,
      value: '', isConnected: true, parentNode: null, children: [],
      classList: { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)), contains: x => classes.has(x) },
      setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), hasAttribute: k => attrs.has(k),
      addEventListener: (type, fn) => { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); },
      fire: type => (events.get(type) || []).forEach(fn => fn({ cancelable: true, preventDefault() {} })),
      appendChild(child) { child.parentNode = this; this.children.push(child); },
      querySelector: selector => element(selector), querySelectorAll: () => [],
      focus() { context.document.activeElement = this; }, remove() { this.parentNode = null; this.isConnected = false; },
    };
    nodes.set(key, el);
    return el;
  }
  const context = vm.createContext({
    document: { getElementById: id => element('#' + id), createElement: () => element('created-' + nodes.size) },
    window: { location: { href: 'http://example.test/' }, open() {} },
    Date: { now: () => now },
    setInterval: fn => { const id = ++timerId; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id), setTimeout: () => ++timerId,
    alert() {},
    ...Object.fromEntries(['playSuccessSound', 'playDisarmSound', 'playTrapHitSound', 'playClickSound', 'playInspectSound', 'playHeartbeatSound', 'playFanfareSound', 'startBgm', 'stopBgm', 'setSoundEnabled'].map(k => [k, () => {}])),
    isSoundEnabled: () => false,
  });
  vm.runInContext(stageSource + '\n' + appSource + '\nglobalThis.probe = {state, handleTimeout, recordStageResult, retryCurrentStage, loadStage, closeModal, finishGame, nextStage, startStageTimer, calculateRank};', context);
  const p = context.probe;
  p.state.currentStageIndex = stageIndex;
  p.loadStage(stageIndex);
  return { p, element, advanceWall: ms => { now += ms; }, tick: count => { for (let n = 0; n < count; n++) { now += 1000; for (const fn of [...intervals.values()]) fn(); } } };
}

const evidence = [];
function check(name, fn) { evidence.push({ name, ...fn() }); }

check('stage1_both_disarmed_timeout', () => {
  const { p, element } = setup();
  element('#chk-opt-sub').checked = false;
  element('#chk-opt-warranty').checked = false;
  p.handleTimeout();
  assert.equal(p.state.totalDamage, 0);
  assert.equal(p.state.stageResults[0].breakdown.length, 2);
  return { damage: p.state.totalDamage, title: element('#modal-title').textContent };
});
check('stage1_partial_disarm_timeout', () => {
  const { p, element } = setup();
  element('#chk-opt-warranty').checked = true;
  p.handleTimeout();
  assert.equal(p.state.totalDamage, 550);
  return { damage: p.state.totalDamage };
});
for (const [name, index, selector, value, checked, expected] of [
  ['stage3_safe_unconfirmed_timeout', 2, 'input[name="hotel-plan"]:checked', 'freecancel', false, 0],
  ['stage3_unsafe_unconfirmed_timeout', 2, 'input[name="hotel-plan"]:checked', 'nonrefundable', false, 18000],
  ['stage5_safe_unconfirmed_timeout', 4, '#chk-safe-plan', '', true, 0],
  ['stage5_unstarted_timeout', 4, '#chk-safe-plan', '', false, 14800],
]) {
  check(name, () => {
    const { p, element } = setup(index);
    Object.assign(element(selector), { value, checked });
    p.handleTimeout();
    assert.equal(p.state.totalDamage, expected);
    return { damage: p.state.totalDamage, title: element('#modal-title').textContent };
  });
}
check('stage2_no_acceptance_timeout', () => {
  const { p } = setup(1);
  p.handleTimeout();
  assert.equal(p.state.totalDamage, 980);
  return { damage: p.state.totalDamage };
});
check('explicit_no_options_button_with_checked_options', () => {
  const { p, element } = setup();
  element('#chk-opt-sub').checked = true;
  element('#chk-opt-warranty').checked = true;
  element('#btn-stage1-subtle').fire('click');
  assert.equal(p.state.totalDamage, 5530);
  return { damage: p.state.totalDamage };
});
check('duplicate_result_guard_and_background_inert', () => {
  const { p, element } = setup();
  p.recordStageResult(5530);
  p.recordStageResult(5530);
  p.handleTimeout();
  assert.equal(p.state.totalDamage, 5530);
  assert.equal(p.state.stageResults.length, 1);
  assert.equal(element('#screen-game').hasAttribute('inert'), true);
  return { damage: p.state.totalDamage, results: p.state.stageResults.length, inert: true };
});
for (const [index, damage] of [[0, 5530], [3, 1980]]) {
  check('retry_stage' + (index + 1) + '_preserves_prior_results', () => {
    const { p, element, tick } = setup(index);
    p.state.totalDamage = 980;
    p.state.stageResults.push({ stageId: 99, damage: 980 });
    tick(3);
    p.recordStageResult(damage);
    element('#btn-retry-stage').fire('click');
    assert.equal(p.state.totalDamage, 980);
    assert.equal(p.state.stageResults.length, 1);
    assert.equal(p.state.currentStageIndex, index);
    assert.equal(p.state.stageResolved, false);
    assert.equal(p.state.activePlaySeconds, 3);
    assert.equal(element('#screen-game').hasAttribute('inert'), false);
    return { damage: p.state.totalDamage, results: 1, activePlaySeconds: 3, remainingSeconds: p.state.remainingSeconds };
  });
}
check('explanation_60_seconds_excluded', () => {
  const run = wait => {
    const { p, tick, advanceWall, element } = setup();
    tick(3);
    p.recordStageResult(0);
    advanceWall(wait);
    p.finishGame();
    return { seconds: p.state.activePlaySeconds, display: element('#result-total-time').textContent, rank: element('#result-rank-letter').textContent };
  };
  const fast = run(0), slow = run(60000);
  assert.deepEqual(fast, slow);
  return fast;
});
check('fractional_stage_time_is_lost', () => {
  const { p, advanceWall, element } = setup();
  for (let index = 0; index < 5; index++) {
    advanceWall(900);
    p.recordStageResult(0);
    p.closeModal();
    p.nextStage();
  }
  assert.equal(p.state.activePlaySeconds, 0);
  assert.equal(element('#result-total-time').textContent, '1 秒（実捜査時間）');
  return { simulatedWallPlayMs: 4500, activePlaySeconds: 0, display: element('#result-total-time').textContent };
});

console.log(JSON.stringify({ scope: 'VM/mocked DOM; not browser gameplay', checks: evidence.length, evidence }, null, 2));
