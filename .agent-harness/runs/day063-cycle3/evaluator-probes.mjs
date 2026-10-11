// Evaluation evidence: real source functions, mocked DOM/audio/clock/timers.
// This is not browser gameplay and does not reproduce native input or layout.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const paths = ['day-063-dark-patterns/lib/stages.js', 'day-063-dark-patterns/app.js'];
const sources = paths.map(path => readFileSync(path, 'utf8'));
const stageSource = sources[0].replaceAll('export ', '');
const appSource = sources[1]
  .replace(/^import[\s\S]*?from "\.\/lib\/stages.js";\n/, '')
  .replace(/^import[\s\S]*?from "\.\/lib\/audio.js";\n/, '')
  .replaceAll('export ', '');

function setup(index = 0, random = 0) {
  const nodes = new Map(), intervals = new Map(), created = [], opened = [];
  let now = 0, timerId = 0;
  let context;
  function element(key) {
    if (nodes.has(key)) return nodes.get(key);
    const attrs = new Map(), classes = new Set(), events = new Map();
    const el = {
      textContent: '', innerHTML: '', className: '', style: {}, checked: false,
      value: '', isConnected: true, parentNode: null, children: [],
      classList: { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)), contains: x => classes.has(x) },
      setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), hasAttribute: k => attrs.has(k),
      addEventListener: (type, fn) => { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); },
      fire: type => (events.get(type) || []).forEach(fn => fn({ cancelable: true, preventDefault() {} })),
      appendChild(child) { child.parentNode = this; this.children.push(child); },
      querySelector: selector => element(selector), querySelectorAll: () => [],
      focus() { context.document.activeElement = this; },
      remove() { this.parentNode = null; this.isConnected = false; },
    };
    nodes.set(key, el);
    return el;
  }
  const math = Object.create(Math);
  math.random = () => random;
  context = vm.createContext({
    document: { getElementById: id => element('#' + id), createElement: () => { const el = element('created-' + created.length); created.push(el); return el; } },
    window: { location: { href: 'http://example.test/' }, open: url => opened.push(url) },
    Math: math, Date: { now: () => now },
    setInterval: fn => { const id = ++timerId; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id), setTimeout: () => ++timerId, alert() {},
    ...Object.fromEntries(['playSuccessSound', 'playDisarmSound', 'playTrapHitSound', 'playClickSound', 'playInspectSound', 'playHeartbeatSound', 'playFanfareSound', 'startBgm', 'stopBgm', 'setSoundEnabled'].map(k => [k, () => {}])),
    isSoundEnabled: () => false,
  });
  vm.runInContext(stageSource + '\n' + appSource + '\nglobalThis.probe = {state, STAGES, handleTimeout, recordStageResult, retryCurrentStage, loadStage, closeModal, finishGame, nextStage, startStageTimer, calculateRank, shareToX};', context);
  const p = context.probe;
  p.state.currentStageIndex = index;
  p.loadStage(index);
  return {
    p, element, created, opened,
    advanceWall: ms => { now += ms; },
    tick: count => { for (let n = 0; n < count; n++) { now += 1000; for (const fn of [...intervals.values()]) fn(); } },
  };
}

const evidence = [];
function check(name, kind, fn) { evidence.push({ name, kind, ...fn() }); }

check('stage_order', 'improvement', () => {
  const { p } = setup();
  const titles = Array.from(p.STAGES, s => s.title);
  assert.deepEqual(titles, ['罪悪感の押し売りモーダル', '隠された年額自動更新', '偽の緊急性と閲覧者数', 'お試し500円の罠', '迷宮の退会アンケート']);
  return { titles };
});
for (let index = 0; index < 5; index++) {
  check('stage' + (index + 1) + '_timeout', 'improvement', () => {
    const { p, element, tick } = setup(index);
    tick(p.STAGES[index].timeLimit);
    const expected = index === 4 ? 1980 : 0;
    assert.equal(p.state.totalDamage, expected);
    assert.equal(p.state.stageResults[0].isTimeout, true);
    assert.equal(element('#modal-title').textContent, '時間切れ！ミッション失敗！');
    return { damage: expected, isTimeout: true, title: element('#modal-title').textContent, detail: element('#modal-stage-detail').innerHTML.trim() };
  });
}
for (const index of [1, 2, 3]) {
  check('stage' + (index + 1) + '_safe_unconfirmed_timeout', 'improvement', () => {
    const { p, element } = setup(index);
    element('#chk-safe-plan').checked = true;
    element('input[name="hotel-plan"]:checked').value = 'freecancel';
    element('#chk-opt-sub').checked = false;
    element('#chk-opt-warranty').checked = false;
    p.handleTimeout();
    assert.equal(p.state.totalDamage, 0);
    assert.equal(p.state.stageResults[0].isTimeout, true);
    return { damage: 0, isTimeout: true };
  });
}
for (const [index, selector, expected] of [[0, '#btn-accept-coupon', 980], [1, '#btn-sub-start', 12800], [2, '#btn-hotel-submit', 18000], [3, '#btn-stage1-subtle', 5530], [4, '#btn-cancel-stay', 1980]]) {
  check('stage' + (index + 1) + '_unsafe_commit', 'observation', () => {
    const { p, element } = setup(index);
    element('input[name="hotel-plan"]:checked').value = 'nonrefundable';
    element('#chk-opt-sub').checked = true;
    element('#chk-opt-warranty').checked = true;
    element(selector).fire('click');
    assert.equal(p.state.totalDamage, expected);
    return { damage: expected, selector };
  });
}
for (const [index, selector] of [[0, '#btn-reject-confirmshame'], [1, '#btn-sub-start'], [2, '#btn-hotel-submit'], [3, '#btn-stage1-subtle']]) {
  check('stage' + (index + 1) + '_safe_commit', 'improvement', () => {
    const { p, element } = setup(index);
    element('#chk-safe-plan').checked = true;
    element('input[name="hotel-plan"]:checked').value = 'freecancel';
    element('#chk-opt-sub').checked = false;
    element('#chk-opt-warranty').checked = false;
    element(selector).fire('click');
    assert.equal(p.state.totalDamage, 0);
    assert.equal(p.state.stageResults[0].isTimeout, false);
    return { damage: 0, selector };
  });
}
check('stage5_safe_commit', 'improvement', () => {
  const { p, element } = setup(4);
  element('input[name="double-neg"]:checked').value = 'leave';
  element('#btn-real-cancel').fire('click');
  element('#btn-final-leave').fire('click');
  assert.equal(p.state.totalDamage, 0);
  assert.equal(p.state.stageResults.length, 1);
  return { damage: 0 };
});
check('duplicate_resolution', 'improvement', () => {
  const { p, element } = setup(3);
  p.recordStageResult(5530);
  p.recordStageResult(5530);
  p.handleTimeout();
  assert.equal(p.state.totalDamage, 5530);
  assert.equal(p.state.stageResults.length, 1);
  assert.equal(element('#screen-game').hasAttribute('inert'), true);
  return { damage: 5530, results: 1, inert: true };
});
for (const [index, damage] of [[0, 980], [3, 5530], [4, 1980]]) {
  check('stage' + (index + 1) + '_retry', 'improvement', () => {
    const { p, element, tick } = setup(index);
    p.state.totalDamage = 1480;
    p.state.stageResults.push({ stageId: 99, damage: 1480 });
    tick(3);
    p.recordStageResult(damage);
    element('#btn-retry-stage').fire('click');
    assert.equal(p.state.totalDamage, 1480);
    assert.equal(p.state.stageResults.length, 1);
    assert.equal(p.state.stageResolved, false);
    assert.equal(p.state.activePlaySeconds, 3);
    assert.equal(element('#screen-game').hasAttribute('inert'), false);
    return { priorDamage: 1480, results: 1, retainedPlaySeconds: 3, remainingSeconds: p.state.remainingSeconds };
  });
}
check('explanation_60_seconds_excluded', 'improvement', () => {
  const run = wait => {
    const { p, tick, advanceWall, element } = setup();
    tick(3); p.recordStageResult(0); advanceWall(wait); p.finishGame();
    return { seconds: p.state.activePlaySeconds, display: element('#result-total-time').textContent, rank: element('#result-rank-letter').textContent };
  };
  const immediate = run(0), delayed = run(60000);
  assert.deepEqual(immediate, delayed);
  return { immediate, delayed, note: 'Isolated finishGame probe; five-stage completion is not asserted here.' };
});
check('fractional_time_lost', 'remaining_defect', () => {
  const { p, advanceWall, element } = setup();
  for (let i = 0; i < 5; i++) { advanceWall(900); p.recordStageResult(0); p.closeModal(); p.nextStage(); }
  assert.equal(p.state.activePlaySeconds, 0);
  assert.equal(element('#result-total-time').textContent, '1 秒（実捜査時間）');
  return { simulatedPlayMs: 4500, recordedSeconds: 0, displayedSeconds: 1 };
});
check('timeout_result_and_share_disagree', 'remaining_defect', () => {
  const { p, element, tick, opened } = setup();
  tick(20); p.closeModal(); p.nextStage();
  for (let i = 1; i < 5; i++) { p.recordStageResult(0); p.closeModal(); p.nextStage(); }
  const visibleRank = element('#result-rank-letter').textContent;
  const firstRow = element('#result-stage-list').children[0].innerHTML.trim();
  p.shareToX(); // window.open is a mock: no external action.
  const shareText = new URL(opened[0]).searchParams.get('text');
  assert.equal(visibleRank, 'B');
  assert.ok(firstRow.includes('¥0 (回避)'));
  assert.ok(shareText.includes('特務UI捜査官（神の洞察眼）'));
  return { visibleRank, firstRow, sharedTitle: '特務UI捜査官（神の洞察眼）', externalWindowOpened: false };
});
check('hotel_shuffle_always_preselects_first', 'remaining_defect', () => {
  const variants = [0, 0.99].map(random => {
    const { created } = setup(2, random);
    const html = created.find(e => e.className === 'hotel-stage-box').innerHTML;
    const radios = [...html.matchAll(/<input type="radio" name="hotel-plan" value="([^"]+)"\s*(checked)?/g)];
    assert.equal(radios.length, 2);
    assert.equal(radios[0][2], 'checked');
    assert.equal(radios[1][2], undefined);
    return { random, first: radios[0][1], firstChecked: true };
  });
  assert.notEqual(variants[0].first, variants[1].first);
  return { variants, note: 'Generated HTML inspected; native radio grouping is not simulated.' };
});
check('basket_wording_and_charges', 'remaining_defect', () => {
  const variants = [0, 0.99].map(random => {
    const { p, element, created } = setup(3, random);
    const html = created.find(e => e.className === 'ec-stage-box').innerHTML;
    assert.ok(html.includes('上記内容に同意して単品購入を確定'));
    element('#chk-opt-sub').checked = true; element('#chk-opt-warranty').checked = true;
    element('#btn-stage1-subtle').fire('click');
    const expected = random === 0 ? 5530 : 7930;
    assert.equal(p.state.totalDamage, expected);
    return { random, damage: expected, button: '上記内容に同意して単品購入を確定', breakdown: p.state.stageResults[0].breakdown };
  });
  return { variants };
});
check('random_prices_and_positions_exist', 'improvement', () => {
  const low = setup(3, 0), high = setup(3, 0.99);
  const htmlLow = low.created.find(e => e.className === 'ec-stage-box').innerHTML;
  const htmlHigh = high.created.find(e => e.className === 'ec-stage-box').innerHTML;
  assert.notEqual(htmlLow, htmlHigh);
  assert.equal(low.p.STAGES[3].traps[0].cost, 4980);
  assert.equal(high.p.STAGES[3].traps[0].cost, 6980);
  assert.notEqual(htmlLow.indexOf('id="lbl-sub"') < htmlLow.indexOf('id="lbl-warranty"'), htmlHigh.indexOf('id="lbl-sub"') < htmlHigh.indexOf('id="lbl-warranty"'));
  return { lowSubCost: 4980, highSubCost: 6980, optionOrderChanges: true };
});

const output = {
  scope: 'Source evaluation in Node VM; mocked DOM/audio/clock/timers; not browser gameplay',
  sourceSha256: Object.fromEntries(paths.map((path, i) => [path, createHash('sha256').update(sources[i]).digest('hex')])),
  checks: evidence.length,
  note: 'Assertions verify observations, including remaining defects. Completion is not a product pass.',
  evidence,
};
writeFileSync(new URL('./evaluator-probes.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ checks: evidence.length, evidenceFile: '.agent-harness/runs/day063-cycle3/evaluator-probes.json', observationsVerified: true }));
