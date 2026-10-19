import { CASES, EPILOGUE } from './lib/cases.js';
import { MAX_STARS, SNAP_MS, SOLVE_HOLD_MS, STEP } from './lib/config.js';
import { judge, readingOf, suspectsOf, witnessOf } from './lib/deduction.js';
import { emptyProgress, isUnlocked, loadProgress, nextIndex, recordClear, saveProgress, starsFor, totalStars } from './lib/game.js';
import { hitTest } from './lib/hit.js';
import {
  confirmSolve, createSession, describeAssessment, lampReadout, movableIds, nudge, propReadout,
  reset, select, setLamp, setPropX, toggleGuide, useHint,
} from './lib/stage.js';
import { nowrapSegments } from './lib/text.js';
import { createTransform } from './lib/transform.js';
import { createSideRenderer, createSketchRenderer, createWallRenderer } from './lib/view.js';

initializeRuntime();

function initializeRuntime() {
  const byId = (id) => document.getElementById(id);
  const app = byId('app');
  const wall = byId('wall');
  const panels = [...document.querySelectorAll('[data-panel]')];
  const wallRenderer = createWallRenderer(wall);
  const sketchRenderer = createSketchRenderer(byId('sketch'));
  const briefRenderer = createSketchRenderer(byId('sketch-brief'));
  const resultRenderer = createWallRenderer(byId('wall-result'));
  const sideRenderer = createSideRenderer(byId('side-view'));
  const renderers = new Map([
    [wall, wallRenderer], [byId('sketch'), sketchRenderer], [byId('sketch-brief'), briefRenderer],
    [byId('wall-result'), resultRenderer], [byId('side-view'), sideRenderer],
  ]);
  const supported = [...renderers.values()].every(Boolean);
  let storage = null;
  try { storage = window.localStorage; } catch { /* 保存できなくても遊べる。 */ }
  let progress = loadProgress(storage);
  let phase = null;
  let caseIndex = -1;
  let session = null;
  let wrongAnswers = 0;
  let deductionHintUsed = false;
  let drag = null;
  let heldNudge = null;
  let repeatTimer = null;
  let solveTimer = null;
  let feedbackTimer = null;
  let renderFrame = null;
  let motionFrame = null;
  let activityEpoch = 0;
  let windowBlurred = false;
  let visual = null;
  let flash = 0;
  let announcedBand = '';
  // 注記の欄に出しているヒント（null ならその夜の一言）。{ tag: 「ヒントN：」（「ここまで」には付けない）, text }。
  // 操作しても消さず、次のヒント・はじめから・夜の出入りで替わる。
  let noteHint = null;
  // 動かない向きの矢印キーを押したときの案内（4秒だけ注記の欄に出す。ヒントが出ているときは出さない）。
  let axisNotice = '';
  let axisTimer = null;
  // 夜ごとの補助の使用歴（ガイド・ヒント・誤答・考え方）。夜を出て入り直しても、解決するまで星の計算に使う。
  // ページを開いている間だけ（端末には保存しない）。解決したとき・進行をリセットしたときに消す。
  const usage = new Map();
  const dialogOrigins = new Map();
  const hasDialog = () => document.querySelector('dialog[open]') !== null;
  const active = () => !windowBlurred && !document.hidden && !hasDialog();
  const playing = () => phase === 'stage' && session?.status === 'playing' && active();
  const caseTitle = () => `第${CASES[caseIndex].no}夜　${CASES[caseIndex].title}`;
  const itemLabel = (id) => id === 'lamp' ? '灯り' : session.stage.props.find((prop) => prop.id === id).label;
  const setText = (id, value) => {
    const node = byId(id);
    if (node.textContent !== String(value)) node.textContent = String(value);
  };
  // ボタンの文言（折り返してよい所で区切った配列）と、星の代償「（★−1）」（少し小さい字）。textContent は「ヒント（★−1）」のまま。
  // 狭い列でボタンが縮むときは、代償を次の行へ送り、文言は区切りの所（<wbr>）でだけ折り返す。
  const setLabel = (id, parts, cost = '') => {
    const node = byId(id);
    const text = parts.join('');
    if (node.textContent === text + cost && node.firstElementChild?.className === 'label') return;
    const label = element('span', 'label');
    parts.forEach((part, index) => label.append(...(index > 0 ? [document.createElement('wbr')] : []), part));
    node.replaceChildren(label, ...(cost ? [element('span', 'cost', cost)] : []));
  };

  function element(tag, className = '', text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    if (tag === 'button') node.type = 'button';
    return node;
  }

  // 数字を含む文：数字・単位・式の途中で折り返さない範囲を span.nb で包む（textContent は元の文のまま）。
  function richNodes(text) {
    return nowrapSegments(text).map((segment) => (segment.keep ? element('span', 'nb', segment.text) : document.createTextNode(segment.text)));
  }

  function richElement(tag, className, text) {
    const node = element(tag, className);
    node.append(...richNodes(text));
    return node;
  }

  // 短い文（20字まで）は文ごとに折り返さず、句の途中（「影は／嘘をつかない」）で割れないようにする。
  function sentenceNodes(text) {
    return (String(text).match(/[^。]+。?/gu) ?? [String(text)])
      .flatMap((sentence) => (Array.from(sentence).length <= 20 ? [element('span', 'nb', sentence)] : richNodes(sentence)));
  }

  const richTexts = new WeakMap();
  function setRich(target, value) {
    const node = typeof target === 'string' ? byId(target) : target;
    const text = String(value);
    if (node.textContent === text && richTexts.get(node) === text) return;
    node.replaceChildren(...richNodes(text));
    richTexts.set(node, text);
  }

  function starsElement(stars) {
    const node = element('span', 'stars');
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', `星${MAX_STARS}つ中${stars}つ`);
    for (let i = 0; i < MAX_STARS; i += 1) {
      const star = element('i', `star${i < stars ? ' is-on' : ''}`);
      star.setAttribute('aria-hidden', 'true');
      node.append(star);
    }
    return node;
  }

  // 星の並びと、星の数の文字（「2/3」。読み上げは星の並びの aria-label に任せる）。
  function starRow(stars) {
    const row = element('span', 'star-row');
    const count = element('span', 'star-count', `${stars}/${MAX_STARS}`);
    count.setAttribute('aria-hidden', 'true');
    row.append(starsElement(stars), count);
    return row;
  }

  // 保存済みの進行と統合して書き、別のタブで進んだ分も取り込む。リセットだけは置き換える。
  function persistProgress({ replace = false } = {}) {
    if (!saveProgress(storage, progress, { replace })) {
      byId('storage-note').hidden = false;
      return;
    }
    progress = loadProgress(storage);
  }

  function requestRender() {
    if (!supported || renderFrame !== null) return;
    const epoch = activityEpoch;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = null;
      if (epoch !== activityEpoch || !session) return;
      if (phase === 'briefing') briefRenderer.render(session.stage);
      if (phase === 'stage') {
        sketchRenderer.render(session.stage);
        wallRenderer.render({
          stage: session.stage, arrangement: visual ?? session.arrangement,
          selected: session.selected, guideOn: session.guideOn, flash,
        });
      }
      if (phase === 'solved') {
        resultRenderer.render({ stage: session.stage, arrangement: session.arrangement, selected: null, guideOn: true, flash: 0 });
        sideRenderer.render({ stage: session.stage, caseDef: CASES[caseIndex], arrangement: session.arrangement });
      }
    });
  }

  function endDrag(update = true) {
    if (!drag) return;
    const { pointerId } = drag;
    drag = null;
    if (wall.hasPointerCapture(pointerId)) wall.releasePointerCapture(pointerId);
    if (update && playing()) afterChange();
  }

  function endNudge(update = true) {
    clearTimeout(repeatTimer);
    repeatTimer = null;
    const wasHeld = heldNudge !== null;
    heldNudge = null;
    if (update && wasHeld && playing()) afterChange();
  }

  function stopActivity() {
    activityEpoch += 1;
    clearTimeout(solveTimer);
    clearTimeout(feedbackTimer);
    solveTimer = null;
    feedbackTimer = null;
    if (renderFrame !== null) cancelAnimationFrame(renderFrame);
    if (motionFrame !== null) cancelAnimationFrame(motionFrame);
    renderFrame = null;
    motionFrame = null;
    endDrag(false);
    endNudge(false);
    visual = null;
    flash = 0;
  }

  function restoreDeductionMessage() {
    const message = byId('deduction-message');
    message.hidden = true;
    byId('suspect-list').after(message);
  }

  function showPhase(name, moveFocus = true) {
    stopActivity();
    if (phase === 'deduction') restoreDeductionMessage();
    phase = name;
    app.dataset.phase = name;
    app.dataset.case = session?.caseId ?? '';
    for (const panel of panels) panel.hidden = panel.dataset.panel !== name;
    byId('back').hidden = name === 'home';
    for (const renderer of renderers.values()) renderer?.resize();
    requestRender();
    const focusIds = {
      home: 'home-title', briefing: 'briefing-title', stage: 'wall', solved: 'to-deduction',
      deduction: 'deduction-title', verdict: 'next-case', epilogue: 'epilogue-title',
    };
    if (moveFocus) byId(focusIds[name]).focus();
  }

  function renderHome() {
    const next = nextIndex(progress);
    byId('case-list').replaceChildren(...CASES.map((caseDef, index) => {
      const li = element('li');
      const button = element('button', 'case-card');
      const unlocked = isUnlocked(progress, index);
      const cleared = progress.cleared[caseDef.id];
      button.dataset.caseId = caseDef.id;
      button.dataset.locked = String(!unlocked);
      button.setAttribute('aria-disabled', String(!unlocked || !supported));
      button.append(
        element('span', 'case-no', `第${caseDef.no}夜`),
        element('span', 'case-title', caseDef.title),
        richElement('span', 'case-summary', caseDef.summary),
      );
      const state = element('span', 'case-state');
      if (!unlocked) {
        const note = element('span', 'lock-note');
        const icon = element('i', 'lock-icon');
        icon.setAttribute('aria-hidden', 'true');
        note.append(icon, document.createTextNode('前の夜を解決すると開く'));
        state.append(note);
      } else if (cleared) {
        button.classList.add('is-solved');
        state.append(starRow(cleared.stars));
      } else if (index === next && supported) {
        // 次に開く夜：琥珀の枠と「はじめる →」（琥珀の強調はこのカードだけ。描画できない環境では開けないので出さない）。
        button.classList.add('is-next');
        const label = element('span', 'next-label', 'はじめる ');
        const arrow = element('span', '', '→');
        arrow.setAttribute('aria-hidden', 'true');
        label.append(arrow);
        state.append(label);
      } else state.textContent = '未解決';
      button.append(state);
      button.addEventListener('click', () => {
        if (!isUnlocked(progress, index)) setText('feedback', '前の夜を解決すると開きます');
        else startBriefing(index);
      });
      li.append(button);
      return li;
    }));
    setText('total-stars', totalStars(progress));
  }

  function goHome() {
    stopActivity();
    session = null;
    caseIndex = -1;
    renderHome();
    showPhase('home');
  }

  // 使用歴を覚える（補助を使うたびに呼ぶ）。
  function rememberUsage() {
    if (!session) return;
    usage.set(session.caseId, {
      usedGuide: session.usedGuide, hintsUsed: session.hintsUsed, shownHints: [...session.shownHints], wrongAnswers, deductionHintUsed,
    });
  }

  function startBriefing(index) {
    if (!supported || !isUnlocked(progress, index) || hasDialog()) return;
    stopActivity();
    caseIndex = index;
    const caseDef = CASES[index];
    session = createSession(caseDef);
    wrongAnswers = 0;
    deductionHintUsed = false;
    // 入り直した夜：画面は初めからにするが、使った補助は星の計算と「次のヒント」・ヒントの重複防止に引き継ぐ。
    const saved = usage.get(caseDef.id);
    if (saved) {
      session.usedGuide = saved.usedGuide;
      session.hintsUsed = saved.hintsUsed;
      session.shownHints = [...saved.shownHints];
      wrongAnswers = saved.wrongAnswers;
      deductionHintUsed = saved.deductionHintUsed;
    }
    announcedBand = '';
    restoreDeductionMessage();
    byId('suspect-list').replaceChildren();
    byId('deduction-hint').disabled = deductionHintUsed;
    setText('deduction-hint', '考え方を見る（★−1）');
    if (deductionHintUsed) setRich('deduction-hint-text', caseDef.deductionHint);
    else setText('deduction-hint-text', '');
    byId('deduction-hint-text').hidden = !deductionHintUsed;
    const witness = witnessOf(caseDef);
    setText('briefing-place', caseDef.place);
    setText('briefing-title', caseTitle());
    setRich('briefing-intro', caseDef.intro);
    setText('witness-name', witness.name);
    setText('witness-role', witness.role);
    setRich('witness-quote', `「${witness.quote}」`);
    progress = { ...progress, last: caseDef.id };
    persistProgress();
    showPhase('briefing');
  }

  function clueElement(kind, text) {
    const labels = { witness: '証言', scene: '現場', footprint: '足跡', rule: '決まり', stool: '踏み台', alibi: 'アリバイ', result: '再現' };
    const li = element('li', 'clue');
    li.dataset.kind = kind;
    li.append(element('span', 'clue-kind', labels[kind]), richElement('span', 'clue-text', text));
    return li;
  }

  function ruleClues(caseDef) {
    return ['rule', 'stool', 'alibi'].flatMap((kind) => caseDef.clues.filter((clue) => clue.kind === kind));
  }

  function buildChips() {
    byId('item-select').replaceChildren(...movableIds(session).map((id) => {
      const button = element('button', 'chip', itemLabel(id));
      button.dataset.item = id;
      button.setAttribute('role', 'radio');
      button.addEventListener('click', () => chooseItem(id));
      button.addEventListener('keydown', (event) => {
        if (!playing() || event.ctrlKey || event.metaKey || event.altKey) return;
        const direction = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
        if (!direction) return;
        event.preventDefault();
        const ids = movableIds(session);
        const next = ids[(ids.indexOf(id) + direction + ids.length) % ids.length];
        chooseItem(next);
        byId('item-select').querySelector(`[data-item="${next}"]`).focus({ preventScroll: true });
      });
      return button;
    }));
    revealedChip = null;
    updateChipOverflow();
  }

  // 狭い画面のチップは1段の横スクロール。続きがある側を data-more で示し（CSS が端をぼかす）、選んだチップは見える所まで送る。
  // ページは縦にスクロールさせない（scrollIntoView を使わず、列の scrollLeft だけを動かす）。
  let revealedChip = null;
  function updateChipOverflow() {
    const row = byId('item-select');
    const more = [];
    if (row.scrollLeft > 1) more.push('left');
    if (row.scrollLeft + row.clientWidth < row.scrollWidth - 1) more.push('right');
    const value = more.join(' ');
    if (row.dataset.more !== value) row.dataset.more = value;
  }

  function revealSelectedChip() {
    if (!session || revealedChip === session.selected) return;
    revealedChip = session.selected;
    const row = byId('item-select');
    const chip = row.querySelector(`[data-item="${session.selected}"]`);
    if (chip && row.scrollWidth > row.clientWidth + 1) {
      const area = row.getBoundingClientRect();
      const box = chip.getBoundingClientRect();
      const margin = 28; // 端のぼかしの幅より内側に入れる
      if (box.left < area.left + margin) row.scrollLeft -= area.left + margin - box.left;
      else if (box.right > area.right - margin) row.scrollLeft += box.right - (area.right - margin);
    }
    updateChipOverflow();
  }

  function startStage() {
    if (phase !== 'briefing' || !session || hasDialog()) return;
    const caseDef = CASES[caseIndex];
    const witness = witnessOf(caseDef);
    setText('stage-title', caseTitle());
    setRich('strip-quote', `${witness.name}（${witness.role}）「${witness.quote}」`);
    setStripOpen(false);
    byId('stage-clues').replaceChildren(
      clueElement('witness', witness.quote), clueElement('scene', caseDef.sceneNote), clueElement('footprint', caseDef.footprint),
      ...ruleClues(caseDef).map((clue) => clueElement(clue.kind, clue.text)),
    );
    byId('clues').open = caseDef.no === 1;
    noteHint = null;
    clearAxisNotice();
    buildChips();
    byId('item-select').scrollLeft = 0;
    showPhase('stage');
    afterChange();
    updateChipOverflow();
  }

  function clearAxisNotice() {
    clearTimeout(axisTimer);
    axisTimer = null;
    axisNotice = '';
  }

  // 動かない向きの矢印キー：何も起きないままにせず、動く向きと選び方を4秒だけ伝える。ヒントが出ているときは読み上げだけ。
  function showAxisNotice() {
    const onlyLamp = movableIds(session).length === 1;
    const message = session.selected !== 'lamp'
      ? '道具は左右だけ動きます。灯りは、選ぶ札から選べます。'
      : onlyLamp ? '灯りは上下だけ動きます。↑↓キーで動かそう。' : '灯りは上下だけ動きます。道具は、選ぶ札（←→キー）から選べます。';
    setText('feedback', message);
    if (noteHint) return;
    clearAxisNotice();
    axisNotice = message;
    updateNote();
    const current = session;
    axisTimer = setTimeout(() => {
      axisTimer = null;
      axisNotice = '';
      if (session === current && phase === 'stage') updateNote();
    }, 4000);
  }

  // 証言ストリップの開閉。開くと引用の全文と、大きいスケッチ。夜に入るたびに閉じる。
  function setStripOpen(open) {
    const strip = byId('witness-strip');
    const toggle = byId('strip-toggle');
    strip.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.strip-toggle-label').textContent = open ? 'たたむ' : '全文を読む';
    toggle.querySelector('.strip-toggle-mark').textContent = open ? '▴' : '▾';
    requestRender();
  }

  // 注記の欄：ヒントを押したあとはヒントの文、矢印キーの案内（4秒）、それ以外はその夜の一言
  // （ガイドを消している夜1は、消したとき用の一言）。文は内側の span に入れ、欄の縦の中央に置く。
  function updateNote() {
    const caseDef = session.caseDef;
    const note = byId('note-text');
    const coach = caseDef.guide === 'on' && !session.guideOn && caseDef.coachNoGuide ? caseDef.coachNoGuide : caseDef.coach;
    const kind = noteHint ? 'hint' : axisNotice ? 'notice' : 'coach';
    const tag = noteHint?.tag ?? '';
    const text = noteHint?.text ?? (axisNotice || coach);
    if (note.dataset.kind === kind && note.textContent === tag + text) return;
    note.dataset.kind = kind;
    const body = element('span', 'note-body');
    body.append(...(tag ? [element('strong', 'note-tag', tag)] : []), ...richNodes(text));
    note.replaceChildren(body);
  }

  function chooseItem(id) {
    if (!playing()) return;
    endNudge(false);
    if (!select(session, id)) return;
    afterChange();
    setText('feedback', `${itemLabel(id)}を選びました`);
  }

  function updateStageDisplay() {
    const lamp = lampReadout(session);
    const strong = byId('lamp-readout').querySelector('strong');
    strong.textContent = String(lamp);
    byId('lamp-readout').dataset.ly = String(lamp);
    const isLamp = session.selected === 'lamp';
    const itemReadout = byId('item-readout');
    itemReadout.hidden = isLamp;
    if (!isLamp) {
      const label = itemLabel(session.selected);
      const value = String(propReadout(session, session.selected));
      if (itemReadout.textContent !== `${label} 横 ${value}cm`) {
        itemReadout.replaceChildren(`${label} 横 `, element('strong', '', value), 'cm');
      }
    }
    // 近さ：言葉（左）とメーター（右）。理由があれば、言葉のあとに小さく添える。メーターは段の中の位置まで連続して満たす。
    const description = describeAssessment(session);
    const band = ['far', 'warm', 'near', 'match'][description.step - 1];
    const text = description.detail ? `${description.label}（${description.detail}）` : description.label;
    const meter = byId('meter');
    meter.dataset.band = band;
    meter.setAttribute('aria-label', `近さ：${description.label}`);
    description.fills.forEach((fill, index) => {
      const value = String(Math.round(Math.max(0, Math.min(1, fill)) * 1000) / 1000);
      const tick = meter.children[index];
      if (tick.style.getPropertyValue('--fill') !== value) tick.style.setProperty('--fill', value);
    });
    const bandText = byId('band-text');
    if (bandText.textContent !== text) {
      bandText.replaceChildren(description.label, ...(description.detail ? [element('span', 'band-detail', `（${description.detail}）`)] : []));
    }
    updateNote();
    for (const chip of byId('item-select').querySelectorAll('[data-item]')) {
      const selected = chip.dataset.item === session.selected;
      chip.setAttribute('aria-checked', String(selected));
      chip.tabIndex = selected ? 0 : -1;
      chip.disabled = session.status !== 'playing';
    }
    revealSelectedChip();
    for (const [id, label, icon] of [
      ['nudge-minus', isLamp ? '下げる' : '左へ', isLamp ? 'nudge-down' : 'nudge-left'],
      ['nudge-plus', isLamp ? '上げる' : '右へ', isLamp ? 'nudge-up' : 'nudge-right'],
    ]) {
      const button = byId(id);
      button.querySelector('.nudge-label').textContent = label;
      button.querySelector('.nudge-icon').className = `nudge-icon ${icon}`;
      button.disabled = session.status !== 'playing';
    }
    // ガイド：夜1は練習用で星を減らさないので「ガイドを重ねる」、夜2以降は代償を書いて短く「ガイド（★−1）」。
    byId('guide-toggle').setAttribute('aria-pressed', String(session.guideOn));
    const practice = session.caseDef.guide === 'on';
    setLabel('guide-toggle', session.guideOn ? ['ガイドを', '消す'] : practice ? ['ガイドを', '重ねる'] : ['ガイド'], session.guideOn || practice ? '' : '（★−1）');
    // 2回目以降のヒントは星を追加で減らさない。見た目は「次のヒント」のまま、説明を title と読み上げに持たせる。
    const hintButton = byId('hint');
    setLabel('hint', session.hintsUsed > 0 ? ['次の', 'ヒント'] : ['ヒント'], session.hintsUsed > 0 ? '' : '（★−1）');
    if (session.hintsUsed > 0) {
      const note = 'ヒントは最初の1回で星が1つ減ります。2回目以降は追加で減りません';
      if (hintButton.title !== note) {
        hintButton.title = note;
        hintButton.setAttribute('aria-label', `次のヒント。${note}`);
      }
    } else if (hintButton.hasAttribute('title')) {
      hintButton.removeAttribute('title');
      hintButton.removeAttribute('aria-label');
    }
    byId('guide-toggle').disabled = session.status !== 'playing';
    hintButton.disabled = session.status !== 'playing';
    return text;
  }

  function afterChange() {
    const text = updateStageDisplay();
    requestRender();
    clearTimeout(solveTimer);
    clearTimeout(feedbackTimer);
    solveTimer = null;
    feedbackTimer = null;
    if (!playing() || drag || heldNudge) return;
    const epoch = activityEpoch;
    const current = session;
    if (text !== announcedBand) {
      feedbackTimer = setTimeout(() => {
        feedbackTimer = null;
        if (epoch !== activityEpoch || current !== session || !playing() || drag || heldNudge) return;
        announcedBand = text;
        setText('feedback', text);
      }, 250);
    }
    if (session.assessment.success) {
      solveTimer = setTimeout(() => {
        solveTimer = null;
        if (epoch === activityEpoch && current === session) commitSolve();
      }, SOLVE_HOLD_MS);
    }
  }

  function commitSolve() {
    if (!playing() || !session.assessment.success || drag || heldNudge) return;
    const from = { ly: session.arrangement.ly, xs: { ...session.arrangement.xs } };
    if (!confirmSolve(session)) return;
    updateStageDisplay();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      enterSolved();
      return;
    }
    const epoch = activityEpoch;
    const current = session;
    const to = session.arrangement;
    const started = performance.now();
    function animate(time) {
      motionFrame = null;
      if (epoch !== activityEpoch || current !== session || phase !== 'stage' || !active()) return;
      const elapsed = Math.max(0, time - started);
      if (elapsed < SNAP_MS) {
        const eased = 1 - (1 - elapsed / SNAP_MS) ** 3;
        visual = {
          ly: from.ly + (to.ly - from.ly) * eased,
          xs: Object.fromEntries(Object.keys(to.xs).map((id) => [id, from.xs[id] + (to.xs[id] - from.xs[id]) * eased])),
        };
      } else {
        visual = null;
        flash = Math.max(0, 1 - (elapsed - SNAP_MS) / 600);
        if (flash === 0) {
          enterSolved();
          return;
        }
      }
      requestRender();
      motionFrame = requestAnimationFrame(animate);
    }
    motionFrame = requestAnimationFrame(animate);
  }

  function enterSolved() {
    if (phase !== 'stage' || session?.status !== 'solved') return;
    setRich('reveal-text', CASES[caseIndex].reveal);
    setRich('reading-text', readingOf(CASES[caseIndex]));
    showPhase('solved');
    setText('feedback', '再現できた');
  }

  function enterDeduction() {
    if (phase !== 'solved' || hasDialog()) return;
    const caseDef = CASES[caseIndex];
    byId('deduction-clues').replaceChildren(
      ...ruleClues(caseDef).map((clue) => clueElement(clue.kind, clue.text)),
      clueElement('result', readingOf(caseDef)),
    );
    restoreDeductionMessage();
    byId('suspect-list').replaceChildren(...suspectsOf(caseDef).map((suspect) => {
      const card = element('li', 'suspect');
      card.dataset.suspectId = suspect.id;
      const head = element('div', 'suspect-head');
      const badge = element('span', 'suspect-badge', 'ちがう');
      badge.hidden = true;
      head.append(element('h3', 'suspect-name', suspect.name), richElement('p', 'suspect-meta', `${suspect.role}・${suspect.height}cm`), badge);
      const actions = element('div', 'suspect-actions');
      // 外す：自分用の印（判定には使わない。外した人も「この人だ」で選べる）。押したあとは「✕ 外した（戻す）」。
      const exclude = element('button', 'button button-ghost exclude');
      const setExcludeLabel = (excluded) => {
        const mark = element('span', '', '✕');
        mark.setAttribute('aria-hidden', 'true');
        exclude.replaceChildren(...(excluded ? [mark, ' 外した（戻す）'] : ['外す ', mark]));
        exclude.setAttribute('aria-pressed', String(excluded));
      };
      setExcludeLabel(false);
      exclude.addEventListener('click', () => {
        if (phase !== 'deduction' || hasDialog()) return;
        setExcludeLabel(card.classList.toggle('is-excluded'));
      });
      const accuse = element('button', 'button button-primary accuse', 'この人だ');
      accuse.addEventListener('click', () => {
        if (phase !== 'deduction' || hasDialog() || accuse.disabled) return;
        const result = judge(caseDef, suspect.id);
        if (result.correct) {
          finishCase();
          return;
        }
        wrongAnswers += 1;
        rememberUsage();
        card.classList.add('is-wrong');
        badge.hidden = false;
        accuse.disabled = true;
        const message = byId('deduction-message');
        card.append(message);
        setRich(message, result.message);
        message.hidden = false;
        setText('feedback', result.message);
      });
      actions.append(exclude, accuse);
      card.append(head, richElement('p', 'suspect-statement', `「${suspect.statement}」`), actions);
      return card;
    }));
    showPhase('deduction');
  }

  function finishCase() {
    if (phase !== 'deduction') return;
    const caseDef = CASES[caseIndex];
    const hintsUsed = session.hintsUsed + Number(deductionHintUsed);
    const stars = starsFor({ usedGuide: session.usedGuide, hintsUsed, wrongAnswers });
    progress = recordClear(progress, caseDef.id, stars);
    persistProgress();
    // 星を決めたので、この夜の使用歴は消す（遊び直すときは、補助なしから始まる）。
    usage.delete(caseDef.id);
    setText('verdict-title', caseTitle());
    setRich('verdict-text', caseDef.closing);
    // 理由は1つずつ折り返さない範囲にし、あいだの「・」でだけ折り返す（「誤った推理があ／った」と割れない）。
    const reasons = [session.usedGuide && 'ガイドを使った', hintsUsed > 0 && 'ヒントを使った', wrongAnswers > 0 && '誤った推理があった'].filter(Boolean);
    const reasonNodes = reasons.length
      ? reasons.flatMap((reason, index) => [...(index > 0 ? ['・'] : []), element('span', 'nb', reason)])
      : [element('span', 'nb', 'ガイド・ヒント・誤答なし')];
    const summary = element('span', 'stars-reason');
    summary.append(...richNodes(`星${stars}つ`), '（', ...reasonNodes, '）');
    byId('verdict-stars').replaceChildren(starsElement(stars), summary);
    setText('next-case', caseIndex === CASES.length - 1 ? 'エピローグへ →' : '次の夜へ →');
    showPhase('verdict');
  }

  function enterEpilogue() {
    setText('epilogue-title', EPILOGUE.title);
    byId('epilogue-text').replaceChildren(...sentenceNodes(EPILOGUE.text));
    setRich('epilogue-stars', `合計 ${totalStars(progress)} / ${CASES.length * MAX_STARS}`);
    byId('epilogue-recap')?.replaceChildren(...CASES.map((caseDef) => {
      const li = element('li');
      const culprit = suspectsOf(caseDef).find((suspect) => suspect.id === caseDef.culprit);
      li.append(
        element('span', 'recap-no', `第${caseDef.no}夜`),
        element('span', 'recap-title', caseDef.title),
        richElement('span', 'recap-culprit', `${culprit.name}・灯り${caseDef.stage.lamp.solution}cm`),
        starRow(progress.cleared[caseDef.id]?.stars ?? 0),
      );
      return li;
    }));
    showPhase('epilogue');
  }

  function resumeActivity() {
    if (!active()) return;
    requestRender();
    if (phase !== 'stage' || !session) return;
    if (session.status === 'solved') enterSolved();
    else afterChange();
  }

  function openDialog(event, dialog) {
    if (hasDialog()) return;
    stopActivity();
    // 確定済みの演出を中断してもstageに閉じ込めず、閉じたときの焦点は開いた操作へ戻す。
    if (phase === 'stage' && session?.status === 'solved') enterSolved();
    dialogOrigins.set(dialog, event.currentTarget);
    dialog.showModal();
    updateMoreHint(dialog);
  }

  // ダイアログの中身が画面に入らないときだけ、下端に「↓ 続きがあります」を出す（最後までスクロールしたら消す）。
  function updateMoreHint(dialog) {
    const hint = dialog.querySelector('.more-hint');
    if (!hint) return;
    const more = dialog.open && dialog.scrollHeight - dialog.clientHeight - dialog.scrollTop > 8;
    if (hint.hidden === more) hint.hidden = !more;
  }

  function restoreDialogFocus(dialog) {
    const origin = dialogOrigins.get(dialog);
    dialogOrigins.delete(dialog);
    origin?.focus({ preventScroll: true });
  }

  function closeDialog(dialog) {
    dialog.close();
    restoreDialogFocus(dialog);
    resumeActivity();
  }

  // ドラッグの途中で壁の大きさが変わったら（端末の回転・ウィンドウの変更）、いまの位置と新しい倍率から基準を取り直す。
  // 取り直さないと、描画は新しい倍率なのに、動きは開始時の倍率のままになり、指の動きと影の動きがずれる。
  function rebaseDrag() {
    if (!drag || !session) return;
    const rect = wall.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const { scale } = createTransform(rect.width, rect.height);
    if (scale === drag.scale) return;
    drag.startValue = drag.id === 'lamp' ? session.arrangement.ly : session.arrangement.xs[drag.id];
    drag.startX = drag.lastX;
    drag.startY = drag.lastY;
    drag.scale = scale;
  }

  wall.addEventListener('pointerdown', (event) => {
    if (!playing() || drag || event.isPrimary === false || event.button !== 0) return;
    const rect = wall.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const transform = createTransform(rect.width, rect.height);
    const id = hitTest(transform, session.stage, session.arrangement, event.clientX - rect.left, event.clientY - rect.top);
    if (id === null) return;
    endNudge(false);
    select(session, id);
    drag = {
      pointerId: event.pointerId, id, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY,
      startValue: id === 'lamp' ? session.arrangement.ly : session.arrangement.xs[id], scale: transform.scale,
    };
    wall.setPointerCapture(event.pointerId);
    event.preventDefault();
    wall.focus({ preventScroll: true });
    afterChange();
    setText('feedback', `${itemLabel(id)}を選びました`);
  });
  wall.addEventListener('pointermove', (event) => {
    if (!playing() || !drag || drag.pointerId !== event.pointerId) return;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (drag.id === 'lamp') setLamp(session, drag.startValue - (event.clientY - drag.startY) / drag.scale);
    else setPropX(session, drag.id, drag.startValue + (event.clientX - drag.startX) / drag.scale);
    afterChange();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    wall.addEventListener(type, (event) => { if (drag?.pointerId === event.pointerId) endDrag(); });
  }
  wall.addEventListener('blur', () => endDrag());
  wall.addEventListener('keydown', (event) => {
    if (!playing() || event.ctrlKey || event.metaKey || event.altKey || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const directions = session.selected === 'lamp' ? { ArrowUp: 1, ArrowDown: -1 } : { ArrowRight: 1, ArrowLeft: -1 };
    if (!directions[event.key]) {
      showAxisNotice();
      return;
    }
    endDrag(false);
    endNudge(false);
    nudge(session, directions[event.key], event.shiftKey ? STEP.coarse : STEP.fine);
    afterChange();
  });

  for (const [id, direction] of [['nudge-minus', -1], ['nudge-plus', 1]]) {
    const button = byId(id);
    button.addEventListener('pointerdown', (event) => {
      if (!playing() || heldNudge || event.isPrimary === false || event.button !== 0) return;
      event.preventDefault();
      endDrag(false);
      button.focus({ preventScroll: true });
      const held = { button, pointerId: event.pointerId };
      heldNudge = held;
      const epoch = activityEpoch;
      const current = session;
      const tick = () => {
        if (epoch !== activityEpoch || current !== session || heldNudge !== held || !playing()) return;
        nudge(session, direction, STEP.fine);
        afterChange();
        repeatTimer = setTimeout(tick, 60);
      };
      nudge(session, direction, STEP.fine);
      afterChange();
      repeatTimer = setTimeout(tick, 400);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      button.addEventListener(type, (event) => {
        if (heldNudge?.button === button && heldNudge.pointerId === event.pointerId) endNudge();
      });
    }
    button.addEventListener('blur', () => { if (heldNudge?.button === button) endNudge(); });
    button.addEventListener('click', (event) => {
      if (event.detail !== 0 || !playing()) return;
      nudge(session, direction, STEP.fine);
      afterChange();
    });
  }

  byId('guide-toggle').addEventListener('click', () => {
    if (!playing()) return;
    const wasUsed = session.usedGuide;
    toggleGuide(session);
    rememberUsage();
    afterChange();
    if (!wasUsed && session.usedGuide) setText('feedback', 'ガイドを使ったので、この夜の星が1つ減ります');
  });
  // ヒント：押すたびに、まだ出していない文を1つ（いまのずれの名指し → その夜の考え方 → 「ここまで」）、
  // 注記の欄（壁の下・操作の上）へ出す。「ここまで」には番号を振らない。
  byId('hint').addEventListener('click', () => {
    if (!playing()) return;
    const hint = useHint(session);
    noteHint = hint.kind === 'end' ? { tag: '', text: hint.text } : { tag: `ヒント${hint.index + 1}：`, text: hint.text };
    clearAxisNotice();
    rememberUsage();
    afterChange();
    setText('feedback', noteHint.tag + noteHint.text);
  });
  byId('reset-stage').addEventListener('click', () => {
    if (phase !== 'stage' || !session || hasDialog()) return;
    stopActivity();
    reset(session);
    noteHint = null;
    clearAxisNotice();
    afterChange();
    setText('feedback', 'はじめからにしました');
  });
  byId('item-select').addEventListener('scroll', updateChipOverflow, { passive: true });
  byId('reload').addEventListener('click', () => location.reload());
  byId('strip-toggle').addEventListener('click', () => {
    if (phase !== 'stage' || hasDialog()) return;
    setStripOpen(byId('witness-strip').dataset.open !== 'true');
  });
  byId('deduction-hint').addEventListener('click', () => {
    if (phase !== 'deduction' || deductionHintUsed || hasDialog()) return;
    deductionHintUsed = true;
    rememberUsage();
    const answer = byId('deduction-hint-text');
    setRich(answer, CASES[caseIndex].deductionHint);
    answer.hidden = false;
    byId('deduction-hint').disabled = true;
    // 答えはボタンの下に出るので、画面の外なら見える所まで送る（動きを減らす設定では瞬時に）。
    answer.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  byId('start-case').addEventListener('click', startStage);
  byId('to-deduction').addEventListener('click', enterDeduction);
  byId('next-case').addEventListener('click', () => {
    if (phase !== 'verdict' || hasDialog()) return;
    if (caseIndex < CASES.length - 1) startBriefing(caseIndex + 1);
    else enterEpilogue();
  });
  for (const id of ['back', 'to-home', 'restart']) byId(id).addEventListener('click', () => { if (!hasDialog()) goHome(); });

  for (const [dialogId, origins] of [
    ['help-dialog', ['help']], ['share-dialog', ['share-open', 'epilogue-share']], ['reset-dialog', ['reset-progress']],
  ]) {
    const dialog = byId(dialogId);
    for (const origin of origins) byId(origin).addEventListener('click', (event) => openDialog(event, dialog));
    dialog.addEventListener('scroll', () => updateMoreHint(dialog), { passive: true });
    dialog.querySelector('[data-close]').addEventListener('click', () => closeDialog(dialog));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDialog(dialog);
    });
    dialog.addEventListener('close', () => {
      if (!dialog.open && dialogOrigins.has(dialog)) {
        restoreDialogFocus(dialog);
        resumeActivity();
      }
    });
  }
  byId('reset-cancel').addEventListener('click', () => closeDialog(byId('reset-dialog')));
  byId('reset-confirm').addEventListener('click', () => {
    if (!byId('reset-dialog').open) return;
    stopActivity();
    progress = emptyProgress();
    persistProgress({ replace: true });
    usage.clear();
    goHome();
    closeDialog(byId('reset-dialog'));
  });

  window.addEventListener('blur', () => {
    windowBlurred = true;
    stopActivity();
  });
  window.addEventListener('focus', () => {
    windowBlurred = false;
    resumeActivity();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopActivity();
    else resumeActivity();
  });
  window.addEventListener('resize', () => {
    for (const renderer of renderers.values()) renderer?.resize();
    rebaseDrag();
    requestRender();
    for (const dialog of document.querySelectorAll('dialog[open]')) updateMoreHint(dialog);
    if (phase === 'stage') {
      revealedChip = null;
      if (session) revealSelectedChip();
    }
  });
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) renderers.get(entry.target)?.resize();
      rebaseDrag();
      requestRender();
    });
    for (const canvas of renderers.keys()) observer.observe(canvas);
  }

  byId('unsupported').hidden = supported;
  byId('storage-note').hidden = storage !== null;
  renderHome();
  showPhase('home', false);
}
