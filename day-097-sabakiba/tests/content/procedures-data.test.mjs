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

// 共通の注意以外は調査で確認した文に限り、料理を選ぶ手順に表示されることも確かめる。
const histamine = 'できたヒスタミンは加熱しても残ります。保冷が途切れて傷みが疑われる魚は食べません。';
const extraSafety = new Map([
  ['saba/prep', histamine], ['katsuo/prep', histamine],
  ['aji/peel', '刺身には「生食用」の表示がある身か、アニサキス対策の冷凍処理を確かめた身だけを使います。'],
  ['hirame/prep', 'クドアは目で見分けられません。加熱は中心75℃で5分以上です。刺身は生食用の表示か両方の冷凍条件を確かめた身に限ります。'],
  ['hirame/peel', 'クドア対策は−20℃で4時間以上冷凍します。アニサキス対策は−20℃以下で魚全体が完全に凍ってから24時間以上です。'],
  ['katsuo/trim-bloodline', '表面だけをあぶるたたきは中心が生のままです。生食用で寄生虫対策を確認した魚を使います。'],
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
      if (i === 0) assert.deepEqual(s.hands, [], where);
      else assert.ok(s.hands.some(h => h.who === 'off'), where);
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
      if (extraSafety.has(where)) assert.equal(s.safety, extraSafety.get(where), where);
      else if (s.safety) assert.ok(safety.stepNotes.includes(s.safety), where);
      const words = allText(s);
      for (const word of words) assert.doesNotMatch(word, /[左右<>]|絶対|完璧|世界初|プロ並み/u, where);
      for (const leftHanded of [false, true]) {
        const expected = words.map(w => resolveText(w, leftHanded));
        const rendered = formatStepView(s, i, steps.length, leftHanded);
        const state = stateAt(compiled, i, 0.5, { leftHanded });
        const handLines = s.hands.map(h => [h.who, resolveText(h.text, leftHanded)].join(':'));
        assert.deepEqual(rendered.hands.map(h => [h.who, h.text].join(':')), [...new Set(handLines)], where);
        assert.deepEqual(allText({ ...rendered, hands: [] }),
          allText({ ...s, hands: [] }).map(w => resolveText(w, leftHanded)), where);
        assert.deepEqual(allText(state), expected, where);
        expected.forEach(w => assert.doesNotMatch(w, /[{}]/u, where));
      }
    });
    assert.ok(steps.flatMap(allText).some(s => tokenizeRuby(s).some(token => token.type === 'ruby')));
  });
}

test('料理を選ぶ時点に、保冷・丸塩焼き・生食の条件があります', () => {
  for (const id of ['aji', 'iwashi', 'sanma']) {
    const prep = getProcedure(id).steps[0];
    assert.match([prep.tip, prep.safety].join(''), /冷やしたまま持ち帰/u, id);
  }
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
  const trim = beforeSkin.find(s => s.id === 'trim-bloodline');
  assert.match(trim.safety, /中心が生.*生食用.*寄生虫対策/u);
  assert.doesNotMatch(trim.mistake, /寄生虫|生食用/u);
});

test('ヒラメの準備と皮引きは、それぞれの手順だけで生食用の表示と二つの冷凍条件を確認できます', () => {
  const steps = getProcedure('hirame').steps;
  assert.match(steps[0].safety, /クドア.*中心75℃で5分以上/u);
  for (const step of [steps[0], steps.at(-1)]) {
    const text = allText(step).join('\n');
    assert.match(text, /生食用の表示[^。]*か[^。]*冷凍条件/u);
    assert.match(text, /クドア[^。]*−20℃で4時間以上/u);
    assert.match(text, /アニサキス[^。]*−20℃以下で魚全体が完全に凍ってから24時間以上/u);
  }
});

test('裏返す手順は上に向ける面を示し、キスの水洗いは首の切り口から行います', () => {
  for (const [id, number, face] of [
    ['tai', 10, /皮を上/u], ['katsuo', 8, /背びれの脇にまだ切れ目がない面を上/u], ['katsuo', 9, /最初に背びれの脇を切った面を上/u],
  ]) {
    const { summary, how } = getProcedure(id).steps[number - 1];
    assert.match(summary, /返し/u);
    assert.match([summary, ...how].join(''), face);
  }
  const wash = getProcedure('kisu').steps[5];
  assert.match(wash.summary, /首の切り口.*中骨の下/u);
  assert.doesNotMatch(wash.summary, /腹を広げ/u);
});

test('アジの二枚の頭側は腹骨と小骨を取るときは逆向きで、薄皮をむくときは同じ向きです', () => {
  const steps = getProcedure('aji').steps;
  for (const leftHanded of [false, true]) {
    const first = leftHanded ? '右' : '左', second = leftHanded ? '左' : '右';
    for (const s of steps.slice(11, 13)) {
      const place = resolveText(s.place, leftHanded);
      assert.match(place, /皮を下.*腹の縁を手前/u);
      assert.match(place, new RegExp('一枚目が' + first + '、二枚目が' + second));
    }
    const skinUp = resolveText(steps[13].place, leftHanded);
    assert.match(skinUp, new RegExp('皮を上.*頭側を' + first + 'にそろえ'));
    assert.match(skinUp, /一枚目は背、二枚目は腹を手前/u);
  }
});

test('魚別に切っ先と血合いが初めて出る手順では、本文かコツに意味があります', () => {
  for (const id of SPECIES_IDS) {
    const { steps } = getProcedure(id);
    for (const [term, meaning] of [['切っ先', /刃の先端/u], ['血合い', /濃い赤色の筋肉/u]]) {
      const first = steps.find(s => allText(s).some(t => t.includes(term)));
      if (first) assert.match([...first.how, first.tip].join(''), meaning, id + '/' + first.id);
    }
  }
});
