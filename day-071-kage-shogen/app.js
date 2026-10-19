import { CASES, EPILOGUE } from './lib/cases.js';
import { MAX_STARS, SNAP_MS, SOLVE_HOLD_MS, STEP } from './lib/config.js';
import { judge, readingOf, suspectsOf, witnessOf } from './lib/deduction.js';
import { emptyProgress, isUnlocked, loadProgress, recordClear, saveProgress, starsFor, totalStars } from './lib/game.js';
import { hitTest } from './lib/hit.js';
import {
  confirmSolve, createSession, describeAssessment, lampReadout, movableIds, nudge, propReadout,
  reset, select, setLamp, setPropX, toggleGuide, useHint,
} from './lib/stage.js';
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
  let coachVisible = false;
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

  function element(tag, className = '', text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    if (tag === 'button') node.type = 'button';
    return node;
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

  function persistProgress() {
    if (!saveProgress(storage, progress)) byId('storage-note').hidden = false;
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
    byId('case-list').replaceChildren(...CASES.map((caseDef, index) => {
      const li = element('li');
      const button = element('button', 'case-card');
      const unlocked = isUnlocked(progress, index);
      button.dataset.caseId = caseDef.id;
      button.dataset.locked = String(!unlocked);
      button.setAttribute('aria-disabled', String(!unlocked || !supported));
      button.append(
        element('span', 'case-no', `第${caseDef.no}夜`),
        element('span', 'case-title', caseDef.title),
        element('span', 'case-summary', caseDef.summary),
      );
      const state = element('span', 'case-state');
      if (!unlocked) {
        const note = element('span', 'lock-note');
        const icon = element('i', 'lock-icon');
        icon.setAttribute('aria-hidden', 'true');
        note.append(icon, document.createTextNode('前の夜を解決すると開く'));
        state.append(note);
      } else if (progress.cleared[caseDef.id]) {
        state.append(starsElement(progress.cleared[caseDef.id].stars));
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

  function startBriefing(index) {
    if (!supported || !isUnlocked(progress, index) || hasDialog()) return;
    stopActivity();
    caseIndex = index;
    const caseDef = CASES[index];
    session = createSession(caseDef);
    wrongAnswers = 0;
    deductionHintUsed = false;
    announcedBand = '';
    restoreDeductionMessage();
    byId('suspect-list').replaceChildren();
    byId('deduction-hint').disabled = false;
    setText('deduction-hint', '考え方を見る（★−1）');
    setText('deduction-hint-text', '');
    byId('deduction-hint-text').hidden = true;
    const witness = witnessOf(caseDef);
    setText('briefing-place', caseDef.place);
    setText('briefing-title', caseTitle());
    setText('briefing-intro', caseDef.intro);
    setText('witness-name', witness.name);
    setText('witness-role', witness.role);
    setText('witness-quote', `「${witness.quote}」`);
    progress = { ...progress, last: caseDef.id };
    persistProgress();
    showPhase('briefing');
  }

  function clueElement(kind, text) {
    const labels = { witness: '証言', scene: '現場', footprint: '足跡', rule: '決まり', stool: '踏み台', alibi: 'アリバイ', result: '再現' };
    const li = element('li', 'clue');
    li.dataset.kind = kind;
    li.append(element('span', 'clue-kind', labels[kind]), element('span', 'clue-text', text));
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
  }

  function startStage() {
    if (phase !== 'briefing' || !session || hasDialog()) return;
    const caseDef = CASES[caseIndex];
    const witness = witnessOf(caseDef);
    setText('stage-title', caseTitle());
    setText('strip-quote', `${witness.name}（${witness.role}）「${witness.quote}」`);
    byId('stage-clues').replaceChildren(
      clueElement('witness', witness.quote), clueElement('scene', caseDef.sceneNote), clueElement('footprint', caseDef.footprint),
      ...ruleClues(caseDef).map((clue) => clueElement(clue.kind, clue.text)),
    );
    byId('clues').open = caseDef.no === 1;
    setText('hint-text', '');
    byId('hint-text').hidden = true;
    setText('band-text', '');
    coachVisible = true;
    buildChips();
    showPhase('stage');
    afterChange();
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
    byId('item-readout').hidden = isLamp;
    if (!isLamp) setText('item-readout', `${itemLabel(session.selected)} 横 ${propReadout(session, session.selected)}cm`);
    const description = describeAssessment(session);
    const band = ['far', 'warm', 'near', 'match'][description.step - 1];
    const text = description.detail ? `${description.label}（${description.detail}）` : description.label;
    byId('meter').dataset.band = band;
    byId('meter').setAttribute('aria-label', `近さ：${description.label}`);
    setText('band-text', coachVisible && session.caseDef.coach ? session.caseDef.coach : text);
    for (const chip of byId('item-select').querySelectorAll('[data-item]')) {
      const selected = chip.dataset.item === session.selected;
      chip.setAttribute('aria-checked', String(selected));
      chip.tabIndex = selected ? 0 : -1;
      chip.disabled = session.status !== 'playing';
    }
    for (const [id, label, icon] of [
      ['nudge-minus', isLamp ? '下げる' : '左へ', isLamp ? 'nudge-down' : 'nudge-left'],
      ['nudge-plus', isLamp ? '上げる' : '右へ', isLamp ? 'nudge-up' : 'nudge-right'],
    ]) {
      const button = byId(id);
      button.querySelector('.nudge-label').textContent = label;
      button.querySelector('.nudge-icon').className = `nudge-icon ${icon}`;
      button.disabled = session.status !== 'playing';
    }
    byId('guide-toggle').setAttribute('aria-pressed', String(session.guideOn));
    setText('guide-toggle', session.guideOn ? 'ガイドを消す'
      : CASES[caseIndex].no === 1 && !session.usedGuide ? 'ガイドを重ねる' : 'ガイドを重ねる（★−1）');
    setText('hint', session.hintsUsed > 0 ? '次のヒント' : 'ヒント（★−1）');
    byId('guide-toggle').disabled = session.status !== 'playing';
    byId('hint').disabled = session.status !== 'playing';
    return text;
  }

  function afterChange(changed = false) {
    if (changed) coachVisible = false;
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
    setText('reveal-text', CASES[caseIndex].reveal);
    setText('reading-text', readingOf(CASES[caseIndex]));
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
      head.append(element('h3', 'suspect-name', suspect.name), element('p', 'suspect-meta', `${suspect.role}・${suspect.height}cm`), badge);
      const actions = element('div', 'suspect-actions');
      const exclude = element('button', 'button button-ghost exclude', '外す ✕');
      exclude.setAttribute('aria-pressed', 'false');
      exclude.addEventListener('click', () => {
        if (phase !== 'deduction' || hasDialog()) return;
        const excluded = card.classList.toggle('is-excluded');
        exclude.setAttribute('aria-pressed', String(excluded));
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
        card.classList.add('is-wrong');
        badge.hidden = false;
        accuse.disabled = true;
        const message = byId('deduction-message');
        card.append(message);
        message.textContent = result.message;
        message.hidden = false;
        setText('feedback', result.message);
      });
      actions.append(exclude, accuse);
      card.append(head, element('p', 'suspect-statement', `「${suspect.statement}」`), actions);
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
    setText('verdict-title', caseTitle());
    setText('verdict-text', caseDef.closing);
    const reasons = [session.usedGuide && 'ガイドを使った', hintsUsed > 0 && 'ヒントを使った', wrongAnswers > 0 && '誤った推理があった'].filter(Boolean);
    const detail = reasons.length ? reasons.join('・') : 'ガイド・ヒント・誤答なし';
    byId('verdict-stars').replaceChildren(starsElement(stars), element('span', '', `星${stars}つ（${detail}）`));
    setText('next-case', caseIndex === CASES.length - 1 ? 'エピローグへ →' : '次の夜へ →');
    showPhase('verdict');
  }

  function enterEpilogue() {
    setText('epilogue-title', EPILOGUE.title);
    setText('epilogue-text', EPILOGUE.text);
    setText('epilogue-stars', `合計 ${totalStars(progress)} / ${CASES.length * MAX_STARS}`);
    byId('epilogue-recap')?.replaceChildren(...CASES.map((caseDef) => {
      const li = element('li');
      const culprit = suspectsOf(caseDef).find((suspect) => suspect.id === caseDef.culprit);
      li.append(
        element('span', 'recap-no', `第${caseDef.no}夜`),
        element('span', 'recap-title', caseDef.title),
        element('span', 'recap-culprit', `${culprit.name}・灯り${caseDef.stage.lamp.solution}cm`),
        starsElement(progress.cleared[caseDef.id]?.stars ?? 0),
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
      pointerId: event.pointerId, id, startX: event.clientX, startY: event.clientY,
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
    const changed = drag.id === 'lamp'
      ? setLamp(session, drag.startValue - (event.clientY - drag.startY) / drag.scale)
      : setPropX(session, drag.id, drag.startValue + (event.clientX - drag.startX) / drag.scale);
    afterChange(changed);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    wall.addEventListener(type, (event) => { if (drag?.pointerId === event.pointerId) endDrag(); });
  }
  wall.addEventListener('blur', () => endDrag());
  wall.addEventListener('keydown', (event) => {
    if (!playing() || event.ctrlKey || event.metaKey || event.altKey || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const directions = session.selected === 'lamp' ? { ArrowUp: 1, ArrowDown: -1 } : { ArrowRight: 1, ArrowLeft: -1 };
    if (!directions[event.key]) return;
    endDrag(false);
    endNudge(false);
    afterChange(nudge(session, directions[event.key], event.shiftKey ? STEP.coarse : STEP.fine));
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
        afterChange(nudge(session, direction, STEP.fine));
        repeatTimer = setTimeout(tick, 60);
      };
      afterChange(nudge(session, direction, STEP.fine));
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
      afterChange(nudge(session, direction, STEP.fine));
    });
  }

  byId('guide-toggle').addEventListener('click', () => {
    if (!playing()) return;
    const wasUsed = session.usedGuide;
    toggleGuide(session);
    afterChange(true);
    if (!wasUsed && session.usedGuide) setText('feedback', 'ガイドを使ったので、この夜の星が1つ減ります');
  });
  byId('hint').addEventListener('click', () => {
    if (!playing()) return;
    const hint = useHint(session);
    const text = `ヒント${hint.index + 1}：${hint.text}`;
    setText('hint-text', text);
    byId('hint-text').hidden = false;
    afterChange(true);
    setText('feedback', text);
  });
  byId('reset-stage').addEventListener('click', () => {
    if (phase !== 'stage' || !session || hasDialog()) return;
    stopActivity();
    reset(session);
    coachVisible = true;
    afterChange();
    setText('feedback', 'はじめからにしました');
  });
  byId('deduction-hint').addEventListener('click', () => {
    if (phase !== 'deduction' || deductionHintUsed || hasDialog()) return;
    deductionHintUsed = true;
    setText('deduction-hint-text', CASES[caseIndex].deductionHint);
    byId('deduction-hint-text').hidden = false;
    byId('deduction-hint').disabled = true;
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
    persistProgress();
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
    requestRender();
  });
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) renderers.get(entry.target)?.resize();
      requestRender();
    });
    for (const canvas of renderers.keys()) observer.observe(canvas);
  }

  byId('unsupported').hidden = supported;
  byId('storage-note').hidden = storage !== null;
  renderHome();
  showPhase('home', false);
}
