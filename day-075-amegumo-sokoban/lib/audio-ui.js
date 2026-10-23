/** The field's audio controls only display and change audio settings. */
export function setupAudioControls(audio, {onBeforeOpen = () => {}, onAfterClose = () => {}} = {}) {
  const byId = id => document.getElementById(id);
  const dialog = byId('sound-dialog');
  const opener = byId('sound-settings-button');
  const toggles = [...document.querySelectorAll('[data-audio-toggle]')];
  const music = byId('sound-music');
  const effects = byId('sound-effects');
  const preview = byId('sound-preview');
  let busy = false;
  let notice = '';
  let previewGeneration = 0;

  const percentage = value => Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);

  function render() {
    const state = audio.snapshot();
    const playing = Boolean(state.enabled && state.ready);
    const label = !state.supported ? '音なし' : playing ? '音あり' : state.enabled ? '音をはじめる' : '音をつける';
    const action = !state.supported ? 'このブラウザでは音を再生できません' : playing ? '音をミュートする' : label;
    for (const button of toggles) {
      button.querySelector('[data-audio-label]').textContent = busy ? '準備中…' : label;
      button.setAttribute('aria-pressed', String(playing));
      button.setAttribute('aria-label', action);
      button.disabled = busy || !state.supported;
      button.dataset.audioOn = String(playing);
    }
    const musicValue = percentage(state.music);
    const effectsValue = percentage(state.effects);
    music.value = String(musicValue);
    effects.value = String(effectsValue);
    byId('sound-music-output').value = musicValue + '%';
    byId('sound-effects-output').value = effectsValue + '%';
    music.setAttribute('aria-valuetext', musicValue + 'パーセント');
    effects.setAttribute('aria-valuetext', effectsValue + 'パーセント');
    music.disabled = !state.supported;
    effects.disabled = !state.supported;
    preview.disabled = busy || !state.supported;
    const problem = !state.supported ? 'このブラウザでは音を再生できません。音なしで遊べます。'
      : state.error ? '音を始められませんでした。もう一度、音のボタンを押してください。'
      : state.saved === false ? '音の設定は保存できませんでした。この画面ではそのまま使えます。'
      : notice;
    byId('sound-status').textContent = problem;
  }

  async function enable() {
    audio.setEnabled(true);
    const ready = await audio.unlock();
    if (!ready) notice = '音を始められませんでした。もう一度お試しください。';
    return ready;
  }

  async function toggle() {
    if (busy) return;
    const state = audio.snapshot();
    if (!state.supported) return;
    notice = '';
    if (state.enabled && state.ready) {
      audio.setEnabled(false);
      render();
      return;
    }
    busy = true;
    render();
    try { await enable(); }
    catch { notice = '音を始められませんでした。もう一度お試しください。'; }
    finally { busy = false; render(); }
  }

  function open() {
    if (dialog.open) return;
    previewGeneration += 1;
    onBeforeOpen();
    opener.focus({preventScroll: true});
    render();
    dialog.showModal();
  }

  function close() {
    previewGeneration += 1;
    if (dialog.open) dialog.close();
  }

  toggles.forEach(button => button.addEventListener('click', toggle));
  opener.addEventListener('click', open);
  byId('sound-close').addEventListener('click', close);
  byId('sound-done').addEventListener('click', close);
  music.addEventListener('input', () => {
    notice = '';
    audio.setVolumes({music: Number(music.value) / 100});
    render();
  });
  effects.addEventListener('input', () => {
    notice = '';
    audio.setVolumes({effects: Number(effects.value) / 100});
    render();
  });
  preview.addEventListener('click', async () => {
    if (busy) return;
    if (audio.snapshot().effects === 0) {
      notice = '効果音の音量を上げると、開花の音を試せます。';
      render();
      return;
    }
    busy = true;
    notice = '';
    const previewVersion = ++previewGeneration;
    render();
    try {
      if (audio.snapshot().enabled && audio.snapshot().ready || await enable()) {
        if (previewVersion !== previewGeneration || !dialog.open) return;
        const played = audio.play('bloom', {variant: 0});
        notice = played === false ? '音を始められませんでした。もう一度お試しください。' : '開花の音を鳴らしました。';
      }
    } catch { notice = '音を始められませんでした。もう一度お試しください。'; }
    finally { busy = false; render(); }
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  dialog.addEventListener('close', () => {
    previewGeneration += 1;
    opener.focus({preventScroll: true});
    onAfterClose();
  });
  render();
  return {render, open};
}
