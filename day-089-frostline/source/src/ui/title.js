export const controlGuide = (device = 'keyboard') => ({
  keyboard: '左右キーで曲がる・上で低い姿勢・下で制動・空白キーでジャンプ',
  gamepad: '左スティックで曲がる・上で低い姿勢・下で制動・下のボタンでジャンプ',
  touch: '左の舵を左右へ倒して曲がる・上へ倒すと低い姿勢・下へ倒すと制動・右のボタンでジャンプ',
}[device] ?? '左右キーで曲がる・上で低い姿勢・下で制動・空白キーでジャンプ');
export function titleContent({ progress = 0, ready = false, failed = false, device } = {}) {
  const percent = Math.round(Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)) * 100);
  return { title: 'FROSTLINE', subtitle: '雪山フリーライド', disabled: !ready || failed,
    status: failed ? '雪山の準備ができませんでした。ページを読み直してください。' : ready ? '雪山の準備ができました' : `雪山を準備しています ${percent}％`,
    guide: controlGuide(device) };
}
/** 滑る道具の選択肢（題字の画面と、設定の行で、同じ並びと名前を使う） */
export const GEAR_CHOICES = Object.freeze([['board', 'スノーボード'], ['ski', 'スキー']]);
export function createTitle({ document, onStart, onSettings, onShare, onMap, onGear }) {
  const element = document.createElement('section'); element.className = 'title-screen'; element.dataset.screen = 'title';
  element.setAttribute('aria-label', 'FROSTLINE 雪山フリーライド');
  element.innerHTML = `<header class="title-mark"><h1 lang="en">FROSTLINE</h1><p>雪山フリーライド</p></header>
    <div class="title-bottom panel"><p data-title-status role="status" aria-live="polite"></p>
    <div class="gear-choice" role="radiogroup" aria-label="滑る道具">${GEAR_CHOICES.map(([value, label]) => `<button type="button" role="radio" data-gear="${value}" aria-checked="false">${label}</button>`).join('')}</div>
    <button class="primary" data-start disabled>滑りはじめる</button>
    <p class="guide" data-title-guide></p><div class="title-links"><button data-action="map" data-title-map disabled>山の地図</button><button data-title-settings>設定</button>
    <button data-title-share aria-label="このアプリを共有する">共有</button><a class="button" href="about/" target="_blank" rel="noopener" data-title-about>ゲームについて</a></div></div>`;
  element.querySelector('[data-title-map]').addEventListener('click', () => onMap?.());
  const button = element.querySelector('[data-start]');
  button.addEventListener('click', () => { if (!button.disabled) onStart(); });
  element.querySelector('[data-title-settings]').addEventListener('click', onSettings);
  element.querySelector('[data-title-share]').addEventListener('click', () => onShare?.());
  // 道具の選択：最初の画面で、スノーボードかスキーかを選べる（設定の奥だけに置くと、スキー派の人が気づけない）
  const gears = [...element.querySelectorAll('[data-gear]')];
  // マウスや指で選んだら（click の detail > 0）、焦点を「滑りはじめる」へ移す。道具のボタンに焦点が残ると、
  // 続けて押した Enter・空白キーが「もう一度その道具を選ぶ」になり、滑り出せなかった（2026-11-11 の通しの確認）
  for (const g of gears) g.addEventListener('click', e => { onGear?.(g.dataset.gear); if (e.detail > 0 && !button.disabled) button.focus(); });
  element.querySelector('.gear-choice').addEventListener('keydown', e => {
    // キーボードで選んでいるとき：Enter で、そのまま滑り出す
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!button.disabled) onStart(); return; }
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const i = gears.indexOf(e.target), next = gears[(i + (e.key === 'ArrowRight' ? 1 : gears.length - 1)) % gears.length];
    e.preventDefault(); e.stopPropagation(); next.focus(); onGear?.(next.dataset.gear);
  });
  return {
    element,
    update(options) {
      const model = titleContent(options); button.disabled = model.disabled;
      element.querySelector('[data-title-map]').disabled = model.disabled;
      element.querySelector('[data-title-status]').textContent = model.status;
      element.querySelector('[data-title-guide]').textContent = model.guide;
      const gear = options?.gear === 'ski' ? 'ski' : 'board';
      // 選んでいるほうは、橙の枠と字で示す（橙の地で塗ると、下の「滑りはじめる」と同じ強さになり、どちらが始めるボタンか迷う）
      for (const g of gears) { const on = g.dataset.gear === gear; g.setAttribute('aria-checked', String(on)); g.tabIndex = on ? 0 : -1; }
    },
  };
}
