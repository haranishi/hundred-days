import { WORLD } from './lib/config.js';
import { createMatch, beginMatch, stepMatch, movePlayerTo, pauseMatch, resumeMatch } from './lib/match.js';
import { createRenderer } from './lib/view.js';

initializeRuntime();

function initializeRuntime() {
  const byId = (id) => document.getElementById(id);
  const canvas = byId('court');
  const renderer = createRenderer(canvas);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const keys = new Set();
  let currentMatch = createMatch();
  let pointerId = null;
  let frameId = null;
  let frameEpoch = 0;
  let previousFrameTime = null;
  let lastLandingId = null;
  let lastEventId = null;
  let displayedPhase = null;
  const dialogOrigins = new Map();

  const isRunning = () => currentMatch.phase === 'countdown' || currentMatch.phase === 'playing';
  const hasDialog = () => document.querySelector('dialog[open]') !== null;
  const axis = () => Number(keys.has('ArrowRight') || keys.has('KeyD'))
    - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
  const setText = (id, value) => {
    const element = byId(id);
    if (element.textContent !== String(value)) element.textContent = String(value);
  };

  function endPointer() {
    const releasedId = pointerId;
    pointerId = null;
    if (releasedId !== null && canvas.hasPointerCapture(releasedId)) {
      canvas.releasePointerCapture(releasedId);
    }
  }

  function clearInputs() {
    keys.clear();
    endPointer();
  }

  function stopLoop() {
    frameEpoch += 1;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    previousFrameTime = null;
  }

  function render() {
    renderer?.render(currentMatch, { reducedMotion: reducedMotion.matches });
  }

  function updateDisplay() {
    const { phase, scores, result, lastLanding, lastEvent } = currentMatch;
    const enteredResult = phase === 'result' && displayedPhase !== 'result';
    byId('app').dataset.phase = phase;
    byId('intro-panel').hidden = phase !== 'intro';
    byId('countdown').hidden = phase !== 'countdown';
    byId('pause-panel').hidden = phase !== 'paused';
    byId('result-panel').hidden = phase !== 'result';
    byId('pause').disabled = !isRunning();
    byId('start').disabled = !renderer;
    byId('unsupported').hidden = Boolean(renderer);
    setText('player-score', scores.player);
    setText('cpu-score', scores.cpu);
    setText('timer', Math.ceil((WORLD.matchMs - currentMatch.elapsedMs) / 1000));
    if (result) {
      setText('result-title', ['引き分け！', 'あなたの勝ち！', 'CPUの勝ち！'][result.winner]);
      setText('result-player', result.player);
      setText('result-cpu', result.cpu);
    }
    if (lastEvent && lastEvent.id !== lastEventId) {
      lastEventId = lastEvent.id;
      if (lastEvent.type === 'miss') {
        setText('feedback', `${lastEvent.owner === 1 ? '自分' : 'CPU'}がミス。陣地はそのまま、次のサーブへ`);
      }
    }
    if (lastLanding && lastLanding.id !== lastLandingId) {
      lastLandingId = lastLanding.id;
      setText('feedback', `${lastLanding.owner === 1 ? '自分' : 'CPU'}の着地・${lastLanding.flipped.length}マス反転 / ${lastLanding.changed.length}マス変化`);
    }
    render();
    displayedPhase = phase;
    if (enteredResult) byId('replay').focus({ preventScroll: true });
  }

  function scheduleFrame(epoch, match) {
    frameId = requestAnimationFrame((timestamp) => {
      if (epoch !== frameEpoch || match !== currentMatch) return;
      frameId = null;
      if (!isRunning()) {
        previousFrameTime = null;
        return;
      }
      const deltaMs = previousFrameTime === null ? 0 : Math.max(0, timestamp - previousFrameTime);
      previousFrameTime = timestamp;
      if (deltaMs > 0) stepMatch(currentMatch, deltaMs, hasDialog() ? 0 : axis());
      updateDisplay();
      if (isRunning()) scheduleFrame(epoch, match);
      else {
        clearInputs();
        previousFrameTime = null;
      }
    });
  }

  function startLoop() {
    if (!renderer || !isRunning() || frameId !== null) return;
    previousFrameTime = null;
    scheduleFrame(frameEpoch, currentMatch);
  }

  function startRound() {
    if (!renderer || !['intro', 'result'].includes(currentMatch.phase) || hasDialog()) return;
    stopLoop();
    clearInputs();
    lastLandingId = null;
    lastEventId = null;
    currentMatch = createMatch(Math.floor(Math.random() * 0x100000000));
    beginMatch(currentMatch);
    setText('feedback', 'ラケットを左右に動かして返球');
    updateDisplay();
    canvas.focus({ preventScroll: true });
    startLoop();
  }

  function pauseRound(focusResume = false) {
    clearInputs();
    if (!isRunning()) return;
    stopLoop();
    pauseMatch(currentMatch);
    updateDisplay();
    if (focusResume) byId('resume').focus({ preventScroll: true });
  }

  function resumeRound() {
    if (!renderer || currentMatch.phase !== 'paused' || hasDialog()) return;
    clearInputs();
    resumeMatch(currentMatch);
    updateDisplay();
    canvas.focus({ preventScroll: true });
    startLoop();
  }

  function openDialog(event, dialog) {
    if (hasDialog()) return;
    pauseRound();
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
  }

  function keyCode(event) {
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code)) return event.code;
    return { arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', a: 'KeyA', d: 'KeyD' }[event.key.toLowerCase()];
  }

  document.addEventListener('keydown', (event) => {
    const key = keyCode(event);
    if (!key || !isRunning() || hasDialog() || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
      || event.target.closest('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    if (event.repeat && !keys.has(key)) return;
    keys.add(key);
  });
  document.addEventListener('keyup', (event) => {
    const key = keyCode(event);
    if (!key) return;
    keys.delete(key);
  });

  function movePointer(event) {
    if (event.pointerId !== pointerId || currentMatch.phase !== 'playing' || hasDialog()) return;
    if (!canvas.hasPointerCapture(pointerId)) {
      endPointer();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    movePlayerTo(currentMatch, (event.clientX - rect.left) / rect.width * WORLD.width);
    render();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!renderer || currentMatch.phase !== 'playing' || hasDialog() || pointerId !== null
      || event.isPrimary === false || event.button !== 0) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    pointerId = event.pointerId;
    keys.clear();
    canvas.focus({ preventScroll: true });
    movePointer(event);
  });
  canvas.addEventListener('pointermove', movePointer);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, (event) => {
      if (event.pointerId === pointerId) endPointer();
    });
  }
  window.addEventListener('blur', () => pauseRound());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseRound();
  });
  byId('pause').addEventListener('click', () => pauseRound(true));
  byId('resume').addEventListener('click', resumeRound);
  for (const [dialogId, origins] of [['help-dialog', ['help']], ['share-dialog', ['share-open', 'result-share']]]) {
    const dialog = byId(dialogId);
    for (const origin of origins) byId(origin).addEventListener('click', (event) => openDialog(event, dialog));
    dialog.querySelector('[data-close]').addEventListener('click', () => closeDialog(dialog));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDialog(dialog);
    });
    dialog.addEventListener('close', () => {
      if (!dialog.open) restoreDialogFocus(dialog);
    });
  }
  window.addEventListener('resize', () => {
    renderer?.resize();
    render();
  });
  reducedMotion.addEventListener('change', render);
  byId('start').addEventListener('click', startRound);
  byId('replay').addEventListener('click', startRound);
  renderer?.resize();
  updateDisplay();
}
