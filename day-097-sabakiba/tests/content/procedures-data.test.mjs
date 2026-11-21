import test from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR_NAMES, CURVE_INFO, PIECE_IDS, SIDES, SPECIES_IDS, posesPerpendicular, validateProcedure } from '../../lib/contract.js';
import { PROCEDURES, getProcedure } from '../../lib/procedures/index.js';
import { createProcedure, resolveText, stateAt } from '../../lib/timeline.js';
import { formatStepView, getResumeEntries, tokenizeRuby } from '../../lib/ui-format.js';
import { buildTextGuideData } from '../../lib/text-guide.js';
import { SPECIES_META } from '../../lib/species/meta.js';
import safety from '../../lib/content/safety.js';
import { fakeAnatomy } from '../fixtures/fake-anatomy.js';

function allText(step) {
  return [step.title, step.summary, ...step.how, step.tip, step.mistake, step.done, step.place,
    ...(step.safety ? [step.safety] : []), ...step.hands.map(h => h.text), ...(step.labels ?? []).map(l => l.text)];
}

// 定型文にない2件だけを、調査「安全と衛生の公的な基準」の魚・条件に限定する。
const extraSafety = new Map([
  ['できたヒスタミンは加熱しても残ります。保冷が途切れて傷みが疑われる魚は食べません。', ['saba', 'katsuo']],
  ['クドアは目で見分けられません。中心75℃で5分以上の加熱が対策になります。', ['hirame']],
]);

test('入口は調査した8種を登録し、未登録の名前は空を返します', () => {
  assert.deepEqual(Object.keys(PROCEDURES).sort(), [...SPECIES_IDS].sort());
  for (const id of SPECIES_IDS) assert.equal(getProcedure(id), PROCEDURES[id]);
  for (const id of [undefined, '', 'unknown', 'toString']) assert.equal(getProcedure(id), null);
});

test('全8種の保存位置から再開でき、文章版にも全手順と使用する道具が出ます', () => {
  const progress = Object.fromEntries(SPECIES_IDS.map(id => [id, 2]));
  const resume = getResumeEntries(progress, 'aji', SPECIES_META, getProcedure);
  assert.deepEqual(resume.map(r => r.species).sort(), [...SPECIES_IDS].sort());
  for (const r of resume) {
    const proc = getProcedure(r.species);
    assert.equal(r.stepTitle, proc.steps[2].title);
    const guide = buildTextGuideData({ speciesMeta: SPECIES_META[r.species], procedure: proc, leftHanded: true });
    const usedTools = new Set(proc.steps.flatMap(s => s.tools));
    assert.deepEqual(guide.tools.map(t => t.id).sort(), [...usedTools].sort());
    assert.deepEqual(guide.steps.map(s => s.id), proc.steps.map(s => s.id));
  }
});

for (const id of SPECIES_IDS) {
  test(id + 'の題名・文章・道具・練習・表示位置が手順の契約に合います', () => {
    const raw = getProcedure(id), { steps } = raw;
    assert.deepEqual(validateProcedure(raw, { pieceIds: PIECE_IDS }), []);
    assert.ok(steps.length >= 10 && steps.length <= 16);
    assert.equal(new Set(steps.map(s => s.title)).size, steps.length);
    const prep = steps[0];
    assert.equal(prep.cuts?.length ?? 0, 0);
    assert.equal(prep.moves?.length ?? 0, 0);
    const setup = allText(prep).join('');
    for (const word of [/まな板/u, /布巾/u, /水気/u, /刃.{0,4}奥/u]) assert.match(setup, word);
    assert.ok(prep.tools.length);
    const compiled = createProcedure(raw, fakeAnatomy);
    steps.forEach((s, i) => {
      const where = id + '/' + s.id;
      assert.match(s.summary, /^[^。]+。$/u, where);
      assert.ok(posesPerpendicular(s.pose), where);
      assert.ok(s.hands.some(h => h.who === 'off'), where);
      assert.ok(s.camera.preset && s.camera.focus, where);
      for (const m of [...s.hands, ...(s.labels ?? [])]) {
        if (m.piece) assert.ok(PIECE_IDS.includes(m.piece), where);
        assert.ok(ANCHOR_NAMES.includes(m.anchor) || PIECE_IDS.some(p => m.anchor === 'piece:' + p), where);
      }
      const cuts = s.cuts ?? [];
      if (cuts.length) {
        assert.ok(cuts.some(c => c.id === s.practice?.cut), where);
        assert.ok(s.practice.tolerance > 0 && s.practice.tolerance < 3, where);
      }
      let lastEnd = 0;
      for (const c of cuts) {
        assert.ok(s.tools.includes(c.tool), where);
        assert.ok(s.highlight.some(h => h.curve === c.curve && h.side === c.side), where);
        assert.ok(CURVE_INFO[c.curve].sides ? SIDES.includes(c.side) : c.side === null, where);
        assert.ok(c.motion && c.lead && Number.isFinite(c.angleDeg), where);
        assert.equal(typeof c.through, 'boolean', where);
        assert.equal(typeof c.reverse, 'boolean', where);
        assert.ok(lastEnd <= c.window[0], where);
        lastEnd = c.window[1];
      }
      if (s.safety) assert.ok(safety.stepNotes.includes(s.safety) || extraSafety.get(s.safety)?.includes(id), where);
      const words = allText(s);
      for (const word of words) assert.doesNotMatch(word, /[左右<>]|絶対|完璧|世界初|プロ並み/u, where);
      for (const leftHanded of [false, true]) {
        const expected = words.map(w => resolveText(w, leftHanded));
        const rendered = formatStepView(s, i, steps.length, leftHanded);
        const state = stateAt(compiled, i, 0.5, { leftHanded });
        assert.deepEqual(allText(rendered), expected, where);
        assert.deepEqual(allText(state), expected, where);
        expected.forEach(w => assert.doesNotMatch(w, /[{}]/u, where));
      }
    });
    assert.ok(steps.flatMap(allText).some(s => tokenizeRuby(s).some(token => token.type === 'ruby')));
  });
}

test('料理を選ぶ時点に、保冷・丸塩焼き・生食の条件があります', () => {
  const hirameNotes = getProcedure('hirame').steps.map(s => s.safety ?? '').join('');
  assert.match(hirameNotes, /クドア.*75℃で5分以上/u);
  for (const id of ['saba', 'katsuo']) {
    const notes = getProcedure(id).steps.map(s => s.safety ?? '').join('');
    assert.match(notes, /ヒスタミン.*加熱しても残/u);
  }
  const sanma = getProcedure('sanma').steps;
  const beforeHead = sanma.slice(0, sanma.findIndex(s => s.moves?.some(m => m.piece === 'head')));
  assert.match(beforeHead.map(s => s.tip).join(''), /保冷.*すぐ丸塩焼き.*わたを残.*中心まで加熱/u);
  const katsuo = getProcedure('katsuo').steps;
  const beforeSkin = katsuo.slice(0, katsuo.findIndex(s => s.moves?.some(m => m.piece === 'skin.R')));
  assert.match(beforeSkin.flatMap(allText).join(''), /たたき用.*皮付き/u);
  assert.match(beforeSkin.flatMap(allText).join(''), /中心が生.*生食用/u);
});
