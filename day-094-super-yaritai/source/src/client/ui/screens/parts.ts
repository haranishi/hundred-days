// 画面どうしで使い回す部品：メニューの枠（上に店の日よけ、左上に「もどる」）・キャラ選び。

import { PLAYER_CHARACTERS } from '../../contracts';
import type { ModelKey } from '../../../shared/view';
import { type Child, button, h } from './dom';
import { faceImg, icon } from './looks';
import { loadChoice, saveString } from './store';

/** 店の日よけ（赤白のしま＋波の縁）。飾りなので読み上げない */
export function awning(): HTMLElement {
  return h('div', { class: 'sy-awning', 'aria-hidden': 'true' }, h('div', { class: 'sy-awning-cloth' }), h('div', { class: 'sy-awning-edge' }));
}

export interface MenuPageOptions {
  name: string;
  title: string;
  /** 左上のボタン。仮の画面と同じ data-a を付ける */
  back: { label: string; a: string; onClick: () => void; icon?: 'back' | 'door' };
  body: Child[];
  /** 広い画面で2段組みにする */
  wide?: boolean;
  /** .sy-page に足すクラス（下に貼りつける列がある画面は sy-page--bar） */
  pageClass?: string;
  /** 背の高い画面で、中身を縦の中央に寄せる */
  center?: boolean;
}

/** メニューの画面の枠。上に日よけ、見出しの横に「もどる」 */
export function menuPage(opts: MenuPageOptions): HTMLElement {
  const back = button([icon(opts.back.icon ?? 'back', 22), h('span', null, opts.back.label)], {
    cls: 'sy-btn--ghost sy-back',
    a: opts.back.a,
    onClick: opts.back.onClick,
  });
  return h(
    'div',
    { class: 'sy-layer sy-layer--menu', 'data-screen': opts.name },
    awning(),
    h(
      'div',
      { class: `sy-page${opts.wide ? ' sy-page--wide' : ''}${opts.center ? ' sy-page--center' : ''}${opts.pageClass ? ` ${opts.pageClass}` : ''}` },
      h('header', { class: 'sy-bar' }, back, h('h1', { class: 'sy-h1' }, opts.title)),
      h('div', { class: 'sy-body' }, ...opts.body),
    ),
  );
}

const CHAR_KEYS = PLAYER_CHARACTERS.map((c) => c.key);

/** 前に選んだキャラ（無ければ最初の1体） */
export function savedCharacter(): ModelKey {
  return loadChoice('character', CHAR_KEYS, CHAR_KEYS[0] ?? 'ch/character-female-b');
}

let pickerSeq = 0;

/** キャラ選び（ラジオボタンの組。矢印キーで選べる）。選んだキャラは端末に覚える */
export function charPicker(onChange?: (key: ModelKey) => void): { el: HTMLElement; value(): ModelKey } {
  let current = savedCharacter();
  const group = `sy-char-${++pickerSeq}`;
  const items = PLAYER_CHARACTERS.map((c) => {
    const input = h('input', {
      type: 'radio',
      name: group,
      value: c.key,
      class: 'sy-char-input',
      checked: c.key === current,
      'aria-label': c.label,
      on: {
        change: () => {
          current = c.key;
          saveString('character', c.key);
          onChange?.(c.key);
        },
      },
    });
    return h(
      'label',
      { class: 'sy-char' },
      input,
      h(
        'span',
        { class: 'sy-char-box' },
        h('span', { class: 'sy-char-check', 'aria-hidden': 'true' }, '✓'),
        faceImg(c.key, 64),
        h('span', { class: 'sy-char-name' }, c.label),
      ),
    );
  });
  const el = h('fieldset', { class: 'sy-chars' }, h('legend', { class: 'sy-h2' }, 'キャラを選ぶ'), h('div', { class: 'sy-chars-grid' }, ...items));
  return { el, value: () => current };
}
