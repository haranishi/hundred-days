// 画面整形（lib/ui-format.js）・文章ガイド（lib/text-guide.js）・補助機能の単体試験。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES_META, SPECIES_ORDER } from '../../lib/species/meta.js';
import { METHODS, resolveText, TOOL_LABELS } from '../../lib/contract.js';
import { getProcedure } from '../../lib/procedures/index.js';
import partsContent from '../../lib/content/parts.js';
import safetyContent from '../../lib/content/safety.js';
import {
  buildStepSpeechText, collectProcedureTools, filterSpecies, formatConfidence,
  formatPracticeResult, formatStepView, getNextSpeciesId, getResumeEntries, tokenizeRuby,
} from '../../lib/ui-format.js';
import { buildTextGuideData, renderTextGuide } from '../../lib/text-guide.js';
import { appendRubyText, h } from '../../lib/ui-icons.js';
import { renderHome } from '../../lib/ui-home.js';
import { mountGuideView } from '../../lib/ui-guide.js';
import { renderParts, renderSafety } from '../../lib/ui-pages.js';
import { createInitialState } from '../../lib/app-state.js';
import glossary from '../../lib/content/glossary.js';
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
    for (const hand of raw.hands || []) {
      for (const [view, leftHanded] of [[right, false], [left, true]]) {
        assert.ok(view.hands.some(row => row.who === hand.who && row.text === resolveText(hand.text, leftHanded)), hand.text);
      }
    }
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

  const resume = getResumeEntries({ aji: 2, saba: 1, fugu: 4 }, 'aji', SPECIES_META, getProcedure);
  assert.equal(resume.length, 2, '手順がある魚（アジ・サバ）だけ返す。存在しない魚は捨てる');
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

test('手の注意は手の役割と本文の組でまとめ、別の手・別の文・3Dの二つの位置を保つ', () => {
  const original = getProcedure('aji').steps[12];
  const step = { ...original, hands: [...original.hands,
    { ...original.hands[0], who: 'dom' }, { ...original.hands[0], text: '{L}手で身を支えます。' }] };
  for (const left of [false, true]) {
    const [off, other, different, ...extra] = formatStepView(step, 0, 1, left).hands;
    assert.equal(off.anchor, original.hands[0].anchor);
    assert.equal(off.whoLabel, left ? '右手（押さえ）' : '左手（押さえ）');
    assert.equal(other.text, off.text);
    assert.notEqual(other.whoLabel, off.whoLabel);
    assert.equal(different.whoLabel, off.whoLabel);
    assert.notEqual(different.text, off.text);
    assert.deepEqual(extra, []);
    const guide = buildTextGuideData({ speciesMeta: SPECIES_META.aji, procedure: getProcedure('aji'), leftHanded: left });
    for (const st of guide.steps.slice(11, 14)) assert.equal(st.hands.length, 1);
  }
  assert.equal(original.hands.length, 2);
  assert.notEqual(original.hands[0].piece, original.hands[1].piece);
});

test('コツ・やりがち・目印は同じ欄の初出を参照し、原文と利き手ごとの表示を保つ', () => {
  const proc = getProcedure('aji');
  const checks = [[1, [null, null, null]], [2, [null, null, null]], [3, [2, 2, 2]],
    [10, [8, 8, 8]], [11, [9, 9, null]]];
  for (const left of [false, true]) {
    const { steps } = buildTextGuideData({ procedure: proc, leftHanded: left });
    for (const [n, references] of checks) {
      const step = steps[n - 1];
      assert.deepEqual([step.tipSameAs, step.mistakeSameAs, step.doneSameAs], references);
      for (const key of ['tip', 'mistake', 'done']) assert.equal(step[key], resolveText(proc.steps[n - 1][key], left));
    }
  }
  const first = proc.steps[0];
  const sequence = [first, first, { ...first, mistake: first.tip, done: first.done + '。' }];
  const third = formatStepView(sequence[2], 2, 3, false, sequence);
  assert.deepEqual([third.tipSameAs, third.mistakeSameAs, third.doneSameAs], [1, null, null]);
});

test('一列用の置き方は両手とも22字以内で、二枚の身の表裏・手前・左右を保つ', () => {
  for (const leftHanded of [false, true]) {
    for (const id of SPECIES_ORDER) {
      const { steps } = buildTextGuideData({ procedure: getProcedure(id), leftHanded });
      for (const step of steps) assert.ok([...(step.compactPlace ?? step.place)].length <= 22, id + step.id);
      if (id !== 'aji') continue;
      const first = leftHanded ? '右' : '左', second = leftHanded ? '左' : '右';
      for (const step of steps.slice(11, 13)) {
        assert.equal(step.compactPlace, `皮は下、腹の縁は手前、頭側は①${first}・②${second}です。`);
        assert.match(step.place, /一枚目.*二枚目/u);
      }
      assert.equal(steps[13].compactPlace, `皮は上、頭側は${first}、手前は①背・②腹です。`);
    }
  }
});

// 本番と同じ描画関数に、要素・テキスト・クリックを扱える小さなDOMを渡します。
class TestElement extends EventTarget {
  constructor(tag, doc) {
    super();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.nodeType = 1;
    this.childNodes = [];
    this.className = '';
    this.dataset = {};
    this.attributes = {};
  }
  get lastChild() { return this.childNodes.at(-1); }
  get textContent() { return this.childNodes.map(child => child.textContent).join(''); }
  set textContent(value) { this.replaceChildren(this.ownerDocument.createTextNode(value)); }
  append(...children) { this.childNodes.push(...children); }
  replaceChildren(...children) { this.childNodes = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  focus() { this.ownerDocument.activeElement = this; }
  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.childNodes) {
      if (child.nodeType !== 1) continue;
      if (selector.startsWith('.') ? child.className.split(' ').includes(selector.slice(1))
        : child.tagName === selector.toUpperCase()) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function installDocument(t) {
  const doc = new EventTarget();
  doc.createElement = tag => new TestElement(tag, doc);
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  doc.createTextNode = value => ({ nodeType: 3, textContent: String(value) });
  doc.body = doc.createElement('body');
  const main = doc.createElement('main');
  doc.body.append(main);
  doc.getElementById = id => id === 'main' ? main : null;
  t.after(() => { delete globalThis.document; });
  globalThis.document = doc;
  return main;
}

test('ルビを含む本文は、手の注意・チップ・ラベル・ボタン・置き方で一つの要素になる', t => {
  installDocument(t);
  const sentence = '左手で小骨の脇を支えます。';
  for (const [tag, cls] of [['p', 'hand-row'], ['li', 'chip'], ['span', 'badge'], ['button', 'chip-btn'], ['p', 'place-bar']]) {
    const marker = h('strong');
    const parent = h(tag, { class: cls }, [marker]);
    assert.equal(appendRubyText(parent, sentence), parent);
    assert.deepEqual(parent.childNodes.map(n => n.tagName), ['STRONG', 'SPAN']);
    const segments = parent.lastChild.childNodes;
    assert.deepEqual(segments.map(n => n.tagName || n.textContent), ['左手で', 'RUBY', 'の脇を支えます。']);
    assert.equal(segments[1].querySelector('rt').textContent, 'こぼね');
  }
});

test('両ガイドで重複の本文を初出番号に置き換え、手の行・説明の順・進捗の末尾を保つ', t => {
  const container = installDocument(t);
  const procedure = getProcedure('aji');
  const view = mountGuideView(container, { speciesId: 'aji', procedure, actions: {} });
  for (const leftHanded of [false, true]) {
    for (const [n, references] of [[2, []], [3, [2, 2, 2]], [10, [8, 8, 8]], [11, [9, 9]], [13, []], [15, []]]) {
      view.update({ state: createInitialState({ step: n - 1, leftHanded }), speechSupported: true });
      const card = container.querySelector('.step-card');
      const tools = procedure.steps[n - 1].tools.length ? ['tools-row'] : [];
      assert.deepEqual(card.childNodes.map(el => el.className),
        ['step-title', 'step-summary', 'place-bar', 'step-block', 'hand-box', ...tools, 'step-notes']);
      assert.deepEqual(card.querySelectorAll('.note-reference').map(el => el.textContent), references.map(i => `手順${i}と同じです。`));
      assert.equal(card.querySelectorAll('.hand-row').length, 1);
      assert.equal(card.querySelector('.hand-row').lastChild.tagName, 'SPAN');
      const dots = container.querySelectorAll('.step-dot');
      assert.equal(dots.length, procedure.steps.length);
      assert.equal(dots[n - 1].dataset.state, 'current');
    }
  }
  view.update({ state: createInitialState({ step: 2, mode: 'practice' }) });
  assert.match(container.querySelector('.practice-inst').textContent, /朱色の線/u);
  const fullLength = { steps: Array.from({ length: 16 }, () => procedure.steps[0]) };
  const longView = mountGuideView(container, { speciesId: 'aji', procedure: fullLength, actions: {} });
  longView.update({ state: createInitialState({ step: 15 }), speechSupported: true });
  assert.equal(container.querySelectorAll('.step-dot')[15].dataset.state, 'current');

  renderTextGuide(container, buildTextGuideData({ procedure, speciesMeta: SPECIES_META.aji, leftHanded: true }));
  const steps = container.querySelectorAll('.text-step');
  assert.deepEqual(steps[2].querySelectorAll('.note-reference').map(el => el.textContent), Array(3).fill('手順2と同じです。'));
  assert.equal(steps[12].querySelectorAll('.hand-row').length, 1);
  assert.equal(steps[12].querySelector('.hand-row').lastChild.tagName, 'SPAN');
  assertSafetyIntro(container.querySelector('.callout-body'));
  assert.equal(container.querySelector('.text-guide-reason').textContent, 'この端末では3Dを表示できないため、文章で手順をご案内します。');
});

function assertSafetyIntro(intro) {
  const paragraphs = intro.querySelectorAll('p');
  assert.equal(paragraphs.length, 2);
  const text = paragraphs.map(p => p.textContent).join('\n');
  assert.match(text, /^釣ったフグはさばかず、持ち帰らないでください。/u);
  for (const term of ['自己責任', '公開資料']) assert.equal(text.split(term).length - 1, 1, term);
}

test('安全の冒頭を2段落にまとめ、魚ごとの用語を共通の用語より先に表示する', t => {
  const root = installDocument(t);
  renderSafety(root);
  assertSafetyIntro(root.querySelector('.callout-body'));
  assert.match(root.textContent, /フグなど毒のある魚のさばき方は資格が必要なため、このアプリでは扱っていません。/u);
  for (const id of SPECIES_ORDER) {
    renderParts(root, { speciesId: id });
    const terms = root.querySelectorAll('.glossary-term').map(el => el.querySelector('ruby')?.childNodes[0].textContent || el.textContent);
    const common = glossary.filter(entry => !entry.species).map(entry => entry.term);
    assert.deepEqual(terms.slice(-common.length), common);
    assert.equal(terms[0], METHODS[SPECIES_META[id].method]);
    for (const name of ['有眼側', '無眼側', 'エンガワ', '五枚おろし']) assert.equal(terms.includes(name), id === 'hirame', id + name);
    assert.equal(terms.includes('ぜいご'), id === 'aji');
  }
});

test('入口は7つの絞り込みを同じ列に置き、結果の更新後も操作位置と選択を保つ', t => {
  const root = installDocument(t);
  const changes = [];
  renderHome(root, { state: createInitialState(), filter: { method: 'all', beginnerOnly: false }, onFilterChange: value => changes.push(value) });
  const strip = root.querySelector('.filter-chips');
  const buttons = strip.querySelectorAll('button');
  assert.equal(buttons.length, Object.keys(METHODS).length + 2);
  assert.equal(root.querySelectorAll('.species-card').length, 8);
  const names = root.querySelectorAll('.species-name');
  assert.ok(names.every(name => name.querySelector('rt')));
  // 「初心者向け」は、見落とされないよう「すべて」の隣（2番目）に置く。
  const beginner = buttons[1];
  assert.equal(beginner.dataset.testid, 'filter-beginner');
  assert.equal(buttons[0].dataset.testid, 'filter-method-all');
  strip.scrollLeft = 120;
  beginner.focus();
  beginner.dispatchEvent(new Event('click'));
  assert.equal(root.querySelector('.filter-chips'), strip);
  assert.equal(strip.scrollLeft, 120);
  assert.equal(document.activeElement, beginner);
  assert.equal(beginner.attributes['aria-pressed'], 'true');
  assert.equal(root.querySelectorAll('.species-card').length, 3);
  assert.match(root.querySelector('.filter-count').textContent, /8種のうち 3種/u);
  buttons.find(btn => btn.dataset.testid === 'filter-method-gomai').dispatchEvent(new Event('click'));
  assert.equal(root.querySelectorAll('.species-card').length, 0);
  root.querySelector('.empty-state').querySelector('button').dispatchEvent(new Event('click'));
  assert.equal(root.querySelectorAll('.species-card').length, 8);
  assert.equal(document.activeElement, buttons[0]);
  assert.deepEqual(changes.at(-1), { method: 'all', beginnerOnly: false });
});

test('アプリの初回表示とハッシュ変更で、履歴とクエリを保ったまま表示手順と住所をそろえる', async t => {
  const main = installDocument(t);
  const win = new EventTarget();
  const location = new URL('file:///app/?gl=off&debug=1#/fish/aji/99?hand=L');
  const replacements = [];
  win.location = location;
  win.history = { state: { entry: 1 }, replaceState(state, _, hash) {
    assert.deepEqual(state, this.state);
    replacements.push(hash);
    location.hash = hash;
  } };
  win.scrollTo = () => {};
  t.after(() => { delete globalThis.window; });
  globalThis.window = win;
  await import('../../app.js');
  assert.equal(win.__sabaki.state().step, 14);
  assert.equal(location.hash, '#/fish/aji/15?hand=L');
  assert.equal(win.__sabaki.state().leftHanded, true);
  assert.equal(main.querySelector('.text-guide-reason').textContent, '3D表示を切っているため、文章で手順をご案内します。');
  for (const [path, n] of [['7', 7], ['abc', 1], ['0', 1], ['-1', 1]]) {
    location.hash = '#/fish/aji/' + path;
    win.dispatchEvent(new Event('hashchange'));
    assert.equal(location.hash, '#/fish/aji/' + n);
    assert.equal(win.__sabaki.state().step, n - 1);
  }
  location.hash = '#/fish/unknown/4';
  win.dispatchEvent(new Event('hashchange'));
  assert.equal(location.hash, '#/');
  assert.equal(document.body.dataset.route, 'home');
  assert.equal(location.search, '?gl=off&debug=1');
  assert.deepEqual(replacements, ['#/fish/aji/15?hand=L', '#/fish/aji/1', '#/fish/aji/1', '#/fish/aji/1', '#/']);
});

test('WebGLを開始できない端末では、理由と魚の全手順を文章で表示する', async t => {
  const main = installDocument(t);
  const win = new EventTarget();
  win.location = new URL('file:///app/?debug=1#/fish/aji/4');
  win.scrollTo = () => {};
  document.defaultView = win;
  const createElement = document.createElement;
  const attempts = [];
  document.createElement = tag => {
    const element = createElement(tag);
    if (tag === 'canvas') element.getContext = kind => { attempts.push(kind); return null; };
    return element;
  };
  t.after(() => { delete globalThis.window; });
  globalThis.window = win;
  await import('../../app.js?unavailable-webgl');
  await win.__sabaki.ready();
  assert.deepEqual(attempts, ['webgl2']);
  assert.equal(win.__sabaki.stats().gl, 'off');
  assert.equal(main.querySelector('.text-guide-reason').textContent, 'この端末では3Dを表示できないため、文章で手順をご案内します。');
  assert.equal(main.querySelectorAll('.text-step').length, getProcedure('aji').steps.length);
});
