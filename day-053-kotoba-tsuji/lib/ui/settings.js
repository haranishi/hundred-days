// しつらえ（設定）。効果音・一問ごとの判定・動き・記録を消す
import { h, fuda } from './dom.js';
import { TEXT } from './copy.js';
import { openDialog } from './dialog.js';
import { phrased } from './wrap.js';

export function mountSettings(app) {
  const T = TEXT.settings;
  const s = app.settings();
  const el = h('section', { class: 'screen screen-settings', 'data-screen': 'settings', tabindex: '-1' });

  const group = (key, label, options, note) => {
    const seg = h('div', { class: 'seg' });
    for (const o of options) {
      const id = `set-${key}-${o.value}`;
      const input = h('input', { type: 'radio', name: `set-${key}`, id, value: String(o.value), checked: s[key] === o.value, 'data-setting': key });
      input.addEventListener('change', () => {
        if (input.checked) app.saveSettings({ [key]: o.value });
      });
      // 札の字は印（●）と分けて置く（見える字そのものを押せるように）
      seg.append(h('label', { class: 'seg-opt', for: id }, input, h('span', {}, h('i', { class: 'seg-dot', 'aria-hidden': 'true' }, '●'), h('b', { class: 'seg-lbl' }, o.label))));
    }
    return h('fieldset', { class: 'set-group', 'data-group': key }, h('legend', {}, label), seg, note ? h('p', { class: 'note' }, phrased(note)) : null);
  };

  el.append(h('div', { class: 'col' },
    h('h1', { class: 'screen-head' }, T.head),
    h('div', { class: 'settings' },
      group('sound', T.sound, [{ value: true, label: T.soundOn }, { value: false, label: T.soundOff }]),
      group('autoCheck', T.autoCheck, [{ value: true, label: T.autoCheckOn }, { value: false, label: T.autoCheckOff }], T.autoCheckNote),
      group('motion', T.motion, [{ value: 'auto', label: T.motionAuto }, { value: 'reduce', label: T.motionReduce }]),
      app.store.canPersist() ? null : h('p', { class: 'note', 'data-nostore': '' }, T.noStore)),
    // 「閉じる」を上に、消す操作は画面の下へ遠ざける（v2-r3）
    h('div', { class: 'back-row' }, fuda(T.close, { size: 'sm', act: 'close', onclick: () => app.go('title') })),
    h('div', { class: 'set-reset' },
      fuda([h('span', { class: 'mini-in', 'aria-hidden': 'true' }, '注'), T.reset], { size: 'sm', act: 'reset', cls: 'is-danger', onclick: askReset }))));

  async function askReset() {
    const v = await openDialog({
      name: 'reset',
      text: T.resetAsk,
      buttons: [
        { label: T.resetYes, value: 'yes' },
        { label: T.resetNo, value: null, primary: true, focus: true },
      ],
    });
    if (v !== 'yes') return;
    app.store.resetRecords();
    app.annai.say(T.resetDone);
  }

  // PC の Esc でも閉じる（札が開いているときは札が先に受け取る）
  const onKey = (e) => {
    if (e.key === 'Escape' && !document.querySelector('[data-dialog]')) app.go('title');
  };
  return {
    el,
    show: () => document.addEventListener('keydown', onKey),
    destroy: () => document.removeEventListener('keydown', onKey),
  };
}
