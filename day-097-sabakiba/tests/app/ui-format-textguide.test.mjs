// 画面整形（lib/ui-format.js）・文章ガイド（lib/text-guide.js）・補助機能の単体試験。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES_META, SPECIES_ORDER } from '../../lib/species/meta.js';
import { TOOL_LABELS } from '../../lib/contract.js';
import { getProcedure } from '../../lib/procedures/index.js';
import partsContent from '../../lib/content/parts.js';
import safetyContent from '../../lib/content/safety.js';
import {
  buildStepSpeechText, collectProcedureTools, filterSpecies, formatConfidence,
  formatPracticeResult, formatStepView, getNextSpeciesId, getResumeEntries, tokenizeRuby,
} from '../../lib/ui-format.js';
import { buildTextGuideData } from '../../lib/text-guide.js';
import { createWakeLockManager, isWakeLockSupported } from '../../lib/wake-lock.js';
import { createSpeechManager, isSpeechSupported } from '../../lib/speech.js';

test('ui-format: 方法と初心者向け（難易度1〜2）で正しく絞り込める', () => {
  const all = filterSpecies(SPECIES_ORDER, SPECIES_META, { method: 'all', beginnerOnly: false });
  assert.equal(all.length, 8);

  const beginner = filterSpecies(SPECIES_ORDER, SPECIES_META, { method: 'all', beginnerOnly: true });
  assert.ok(beginner.length > 0);
  assert.ok(beginner.every((sp) => sp.difficulty >= 1 && sp.difficulty <= 2));
  assert.deepEqual(beginner.map((s) => s.id), ['iwashi', 'aji', 'sanma']);

  const sanmai = filterSpecies(SPECIES_ORDER, SPECIES_META, { method: 'sanmai', beginnerOnly: false });
  assert.deepEqual(sanmai.map((s) => s.id), ['aji', 'sanma', 'saba', 'tai']);

  const sanmaiBeginner = filterSpecies(SPECIES_ORDER, SPECIES_META, { method: 'sanmai', beginnerOnly: true });
  assert.deepEqual(sanmaiBeginner.map((s) => s.id), ['aji', 'sanma']);

  // ヒラメは難易度5なので五枚おろし×初心者向けは0件
  const gomaiBeginner = filterSpecies(SPECIES_ORDER, SPECIES_META, { method: 'gomai', beginnerOnly: true });
  assert.equal(gomaiBeginner.length, 0);
});

test('ui-format: 全手順の文章が resolveText で左右反転でき、記号の取りこぼしがない', () => {
  const proc = getProcedure('aji');
  assert.ok(proc && proc.steps.length >= 6);

  for (let i = 0; i < proc.steps.length; i++) {
    const right = formatStepView(proc.steps[i], i, proc.steps.length, false);
    const left = formatStepView(proc.steps[i], i, proc.steps.length, true);

    const allRightTexts = [
      right.title, right.summary, right.place, ...right.how, right.tip, right.mistake, right.done,
      ...(right.safety ? [right.safety] : []),
      ...right.hands.map((h) => h.text),
      ...right.labels.map((l) => l.text),
    ];
    const allLeftTexts = [
      left.title, left.summary, left.place, ...left.how, left.tip, left.mistake, left.done,
      ...(left.safety ? [left.safety] : []),
      ...left.hands.map((h) => h.text),
      ...left.labels.map((l) => l.text),
    ];

    for (const s of [...allRightTexts, ...allLeftTexts]) {
      assert.equal(/[{}]/.test(s), false, `未解決記号が残っている: ${s}`);
    }

    // 右利きと左利きで左右が入れ替わることを確認
    // 元の文に {L}・{R} があれば、右利きと左利きで左右の語が入れ替わる
    const raw = proc.steps[i];
    const flips = (rawText, a, b) => !rawText.includes('{L}') || (a.includes('左') && b.includes('右'));
    assert.ok(flips(raw.place, right.place, left.place), `place: ${raw.place}`);
    raw.how.forEach((h, k) => assert.ok(flips(h, right.how[k], left.how[k]), `how: ${h}`));
    (raw.hands || []).forEach((h, k) => assert.ok(flips(h.text, right.hands[k].text, left.hands[k].text), `hands: ${h.text}`));
  }

  // 音声台本にも未解決記号が残らない
  const speech = buildStepSpeechText(formatStepView(proc.steps[0], 0, proc.steps.length, true));
  assert.ok(speech.includes('手順1'));
  assert.equal(/[{}]/.test(speech), false);
});

test('ui-format: 読み仮名分割（ruby）と練習結果の整形（歩留まりと言わない）', () => {
  const tokens = tokenizeRuby('血合いと腹骨を取り、鰓蓋(えらぶた)を確認します。');
  const rubies = tokens.filter((t) => t.type === 'ruby');
  assert.deepEqual(rubies, [
    { type: 'ruby', base: '血合い', rt: 'ちあい' },
    { type: 'ruby', base: '腹骨', rt: 'はらぼね' },
    { type: 'ruby', base: '鰓蓋', rt: 'えらぶた' },
  ]);

  const res = formatPracticeResult({ score: 84, accuracy: 0.86, smoothness: 0.78, coverage: 0.95, grade: 'A', comment: 'よくなぞれました。' }, 70);
  assert.equal(res.metricLabel, 'ガイドとの一致度');
  assert.equal(res.metricLabel.includes('歩留まり'), false);
  assert.equal(res.score, 84);
  assert.equal(res.accuracyPct, 86);
  assert.equal(res.smoothnessPct, 78);
  assert.equal(res.isNewBest, true);

  assert.equal(formatConfidence('sample').symbol, '△');
  assert.equal(formatConfidence('high').symbol, '◎');
});

test('ui-format: つづきから・道具抽出・次の魚', () => {
  const proc = getProcedure('aji');
  const tools = collectProcedureTools(proc);
  const expectedTools = [...new Set(proc.steps.flatMap((st) => st.tools))].map((id) => ({ id, label: TOOL_LABELS[id] }));
  assert.deepEqual(tools, expectedTools);

  const resume = getResumeEntries({ aji: 2, saba: 1 }, 'aji', SPECIES_META, getProcedure);
  assert.equal(resume.length, 1, '手順がある魚のみ返す');
  assert.equal(resume[0].species, 'aji');
  assert.equal(resume[0].stepNumber, 3);
  assert.equal(resume[0].totalSteps, proc.steps.length);

  assert.equal(getNextSpeciesId('aji', SPECIES_ORDER, getProcedure), 'sanma');
});

test('text-guide: 全手順の文章・道具・安全・部位を1つも落とさず出力する', () => {
  const proc = getProcedure('aji');
  const rightData = buildTextGuideData({
    speciesMeta: SPECIES_META.aji,
    procedure: proc,
    partsData: partsContent.aji,
    safetyIntro: safetyContent.intro,
    leftHanded: false,
    reason: 'WebGLが使えないため文章ガイドに切り替えました。',
  });

  assert.equal(rightData.steps.length, proc.steps.length, '全手順が落ちずに出る');
  assert.equal(rightData.tools.length, collectProcedureTools(proc).length);
  assert.equal(rightData.parts.length, partsContent.aji.parts.length);
  assert.ok(rightData.keep.length > 0);
  assert.ok(rightData.reason.includes('WebGL'));

  for (let i = 0; i < proc.steps.length; i++) {
    assert.equal(rightData.steps[i].title, proc.steps[i].title);
    assert.equal(rightData.steps[i].summary, proc.steps[i].summary);
    assert.equal(rightData.steps[i].how.length, proc.steps[i].how.length);
    assert.equal(rightData.steps[i].tip, proc.steps[i].tip);
    assert.equal(rightData.steps[i].mistake, proc.steps[i].mistake);
    assert.equal(rightData.steps[i].done, proc.steps[i].done);
  }

  // 左利きでも全手順が反転して記号が残らない
  const leftData = buildTextGuideData({
    speciesMeta: SPECIES_META.aji,
    procedure: proc,
    partsData: partsContent.aji,
    safetyIntro: safetyContent.intro,
    leftHanded: true,
  });
  for (const [i, st] of leftData.steps.entries()) {
    if (proc.steps[i].place.includes('{L}')) assert.ok(st.place.includes('右'));
    assert.equal(/[{}]/.test(st.place), false);
    for (const h of st.how) assert.equal(/[{}]/.test(h), false);
  }
});

test('wake-lock と speech: 非対応環境で静かに無効化され、対応環境で visibilitychange に追従する', async () => {
  assert.equal(isWakeLockSupported(null), false);
  assert.equal(isSpeechSupported(null), false);

  const noopWake = createWakeLockManager({ nav: null, doc: null });
  assert.equal(await noopWake.setEnabled(true), false);
  assert.equal(noopWake.isActive(), false);
  noopWake.dispose();

  const noopSpeech = createSpeechManager({ win: null });
  assert.equal(noopSpeech.speak('テスト'), false);
  noopSpeech.stop();

  // 対応モックで取得・非表示解放・再表示再取得を確認
  let requests = 0;
  let releases = 0;
  const listeners = new Map();
  const fakeDoc = {
    visibilityState: 'visible',
    addEventListener: (ev, cb) => listeners.set(ev, cb),
    removeEventListener: (ev) => listeners.delete(ev),
  };
  const fakeNav = {
    wakeLock: {
      async request() {
        requests += 1;
        return {
          addEventListener() {},
          async release() { releases += 1; },
        };
      },
    },
  };
  const mgr = createWakeLockManager({ nav: fakeNav, doc: fakeDoc });
  assert.equal(mgr.isSupported(), true);
  assert.equal(await mgr.setEnabled(true), true);
  assert.equal(requests, 1);
  assert.equal(mgr.isActive(), true);

  // 非表示で解放
  fakeDoc.visibilityState = 'hidden';
  listeners.get('visibilitychange')();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(releases, 1);
  assert.equal(mgr.isActive(), false);

  // 再表示で再取得
  fakeDoc.visibilityState = 'visible';
  listeners.get('visibilitychange')();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(requests, 2);
  assert.equal(mgr.isActive(), true);

  mgr.dispose();
});
