import { FINISH_TEXT } from './hud.js';
import { GEAR_CHOICES } from './title.js';
export const SETTING_FIELDS = Object.freeze([
  { key: 'gear', label: '滑る道具', choices: GEAR_CHOICES },
  { key: 'quality', label: '画質', choices: [['auto', '自動'], ['high', '高'], ['mid', '中'], ['low', '低']] },
  { key: 'shake', label: '視点の揺れ', choices: [['normal', 'あり'], ['less', '少なめ'], ['none', 'なし']] },
  { key: 'volume', label: '音量', type: 'range' },
  { key: 'muted', label: '消音', type: 'checkbox' },
  { key: 'hints', label: '操作の案内を表示', type: 'checkbox' },
  { key: 'stance', label: '前に出す足', choices: [['1', '左足'], ['-1', '右足']] },
]);
/** 一時停止の「区切る」の文字。on：選べる／off：選べない（理由つき） */
export const FINISH_LABEL = Object.freeze({ on: FINISH_TEXT, off: `${FINISH_TEXT}（止まると選べます）` });
export function settingChange(key, value) {
  return { [key]: key === 'volume' || key === 'stance' ? Number(value) : value };
}
const HEADINGS = { pause: '一時停止', settings: '設定' };
export function createPanels({ document, settings, onAction, onBack }) {
  const element = document.createElement('section'); element.className = 'modal-backdrop'; element.hidden = true;
  element.setAttribute('role', 'dialog'); element.setAttribute('aria-modal', 'true');
  element.innerHTML = `<div class="panel modal" tabindex="-1" data-modal><h2 data-panel-heading></h2>
    <div data-pause-menu><button class="primary" data-action="resume">つづける</button><button data-action="safe">直前の地点へ戻る</button>
    <button data-action="drop">出発地点へ戻る</button><button data-action="map">山の地図</button><button data-action="vista">景色を見る</button><button data-action="finish" disabled>${FINISH_LABEL.off}</button><button data-action="settings">設定</button><button data-action="share">このゲームを共有</button></div>
    <form data-settings><div data-fields></div><button type="button" data-action="progress-clear">進み具合を消す</button>
    <div data-clear-confirm hidden><p>進み具合を消しますか？ 元には戻せません。</p><button type="button" data-action="progress-confirm">消す</button><button type="button" data-action="progress-cancel">やめる</button></div><button type="button" data-back>戻る</button></form></div>`;
  const fields = element.querySelector('[data-fields]');
  for (const field of SETTING_FIELDS) {
    const label = document.createElement('label'); label.textContent = field.label;
    const control = document.createElement(field.choices ? 'select' : 'input');
    control.dataset.setting = field.key; control.setAttribute('aria-label', field.label);
    if (field.choices) for (const [value, text] of field.choices) {
      const option = document.createElement('option'); option.value = value; option.textContent = text; control.append(option);
    }
    else {
      control.type = field.type;
      if (field.type === 'range') { control.min = '0'; control.max = '1'; control.step = '.05'; }
    }
    control.addEventListener(field.type === 'range' ? 'input' : 'change', () => settings.set(settingChange(field.key, field.type === 'checkbox' ? control.checked : control.value)));
    label.dataset.field = field.key; label.append(control); fields.append(label);
  }
  let page = 'pause', previousFocus;
  const focusables = () => [...element.querySelectorAll('button, select, input')].filter(e => !e.disabled && !e.closest('[hidden]'));
  function update(value) {
    for (const field of SETTING_FIELDS) {
      const control = element.querySelector(`[data-setting="${field.key}"]`);
      if (field.type === 'checkbox') control.checked = value[field.key]; else control.value = String(value[field.key]);
    }
    // 「前に出す足」は、スノーボードだけの設定。スキーのときは、行ごと隠す（スキーでも出ていて、何が変わるのか分からなかった：スキーの滑りの採点 1 周目）
    element.querySelector('[data-field="stance"]').hidden = value.gear === 'ski';
  }
  function show(next) {
    if (element.hidden) previousFocus = document.activeElement;
    element.querySelector('[data-clear-confirm]').hidden = true;
    page = next; element.hidden = false; element.dataset.screen = next;
    element.setAttribute('aria-label', HEADINGS[next]);
    element.querySelector('[data-panel-heading]').textContent = HEADINGS[next];
    element.querySelector('[data-pause-menu]').hidden = next !== 'pause'; element.querySelector('[data-settings]').hidden = next !== 'settings';
    update(settings.get()); focusables()[0]?.focus();
  }
  for (const button of element.querySelectorAll('[data-action]')) button.addEventListener('click', () => {
    const action = button.dataset.action;
    const confirm = element.querySelector('[data-clear-confirm]');
    if (action === 'progress-clear') { confirm.hidden = false; confirm.querySelector('button').focus(); return; }
    if (action === 'progress-cancel' || action === 'progress-confirm') {
      confirm.hidden = true; if (action === 'progress-confirm') onAction('clearProgress'); element.querySelector('[data-action="progress-clear"]').focus(); return;
    }
    if (action === 'settings') show('settings'); else onAction(action);
  });
  element.querySelector('[data-back]').addEventListener('click', onBack);
  element.querySelector('form').addEventListener('submit', e => e.preventDefault());
  element.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (page !== 'pause') onBack(); else onAction('resume'); }
    if (e.key === 'Tab') {
      const all = focusables(), first = all[0], last = all.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
  const unsubscribe = settings.subscribe(update);
  return { element, show, // 区切りは、止まっているときだけ選べる。選べないときは、暗くするだけでなく理由を文字で出す
    setCanFinish(value) { const b = element.querySelector('[data-action="finish"]'); b.disabled = !value; b.textContent = value ? FINISH_LABEL.on : FINISH_LABEL.off; }, hide() { if (element.hidden) return; element.hidden = true; previousFocus?.focus?.(); }, dispose: unsubscribe };
}
