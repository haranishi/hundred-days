// タイトル〜結果の画面（ScreensAPI）。ゲームの芯の app.ts は createScreens(#screens) を呼ぶだけ。
// - 画面は1枚ずつ。show〜 で前の画面を外して次を置く。hide() で全部外す（試合中は HUD の担当）
// - トーストは画面とは別の層に出す（試合中でも出る）
// - 画面が出ている間、#screens に data-screen（いまの画面の名前）を付ける。試合の側はこれで「画面が開いている」とわかる
// - Esc は画面が受け取る（一時停止なら「つづける」、ほかは「もどる」）。ゲームの操作へは通さない
// - ボタンを押したら「ポチ」と鳴らす（音は currentAudio() から。無ければ鳴らさない）

import '../styles/screens.css';
import type { ScreensAPI } from '../../contracts';
import { currentAudio } from '../../audio';
import { PALETTE } from '../../render/palette';
import { focusEl, focusHeading, h, phraseify } from './dom';
import { inkDefs } from './looks';
import { howToScreen } from './howto';
import { lobbyScreen, matchmakingScreen } from './online';
import { connectingScreen, createToasts, errorScreen, pauseScreen } from './overlays';
import { resultsScreen } from './results';
import { friendScreen, soloScreen } from './setup';
import { titleScreen } from './title';

interface Mounted {
  el: HTMLElement;
  /** キーボードで操作している人のための、最初に押すボタン */
  focus?: HTMLElement | null;
  /** 窓（一時停止・エラー・接続中）は、指で操作していても最初のボタンへ焦点を置く */
  dialog?: boolean;
  escape?: () => void;
}

export function createScreens(root: HTMLElement): ScreensAPI {
  root.classList.add('sy-root');
  // 色は render/palette.ts から流し込む（CSS に書いた値は、読めなかったときの控え）
  const colors: Record<string, string> = {
    cream: PALETTE.cream,
    ink: PALETTE.ink,
    red: PALETTE.red,
    'red-dark': PALETTE.redDark,
    blue: PALETTE.blue,
    yellow: PALETTE.yellow,
    green: PALETTE.green,
    mint: PALETTE.floorB,
  };
  for (const [name, value] of Object.entries(colors)) root.style.setProperty(`--${name}`, value);
  const host = h('div', { class: 'sy-host' });
  const toasts = createToasts();
  // ハンコのかすれのフィルタ（#sy-kasure）は、画面の外に1つだけ置く
  root.append(host, toasts.el, inkDefs());
  let current: Mounted | null = null;
  // 最後の操作がキーボードか。指やマウスの人には、開いたとたんの焦点の枠を見せない。
  // Safari のキーボード操作は Option+Tab なので、Alt つきも数える（Cmd・Ctrl つきはショートカットなので数えない）
  let keyboardMode = false;
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.metaKey && !e.ctrlKey) keyboardMode = true;
    },
    true,
  );
  window.addEventListener('pointerdown', () => (keyboardMode = false), true);

  const mount = (name: string, m: Mounted): void => {
    // 読み込み中の表示（index.html の .boot）は最初の画面を出したときに外す
    root.querySelector(':scope > .boot')?.remove();
    // 日本語の文は、どの画面も文節で折る（「ダッ／シュしない」のような折れ方をなくす）
    phraseify(m.el);
    // 同じ画面を出し直したとき（消音の切り替えでタイトルを描き直すなど）は、押していたボタンに焦点を戻す
    const active = document.activeElement;
    const sameA = root.dataset.screen === name && active instanceof HTMLElement && host.contains(active) ? active.dataset.a : undefined;
    host.replaceChildren(m.el);
    current = m;
    root.dataset.screen = name;
    root.classList.toggle('is-game', false);
    const again = sameA ? Array.from(m.el.querySelectorAll<HTMLElement>('[data-a]')).find((el) => el.dataset.a === sameA) : undefined;
    if (again) return focusEl(again);
    // 新しい画面へ焦点を移す（消えた要素に焦点が残ると、キーボードの位置がわからなくなる）。
    // 見出しへ移すと、読み上げが画面の名前を読む。Tab で次は最初のボタン
    if (m.focus && (m.dialog || keyboardMode)) focusEl(m.focus);
    else focusHeading(m.el);
  };

  // ボタンの「ポチ」（画面の中のボタンとリンク）
  host.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target.closest('.sy-btn, .sy-char') : null;
    if (target && target.getAttribute('aria-disabled') !== 'true') currentAudio()?.play('button');
  });

  // Esc は画面が受け取り、ゲームへは通さない
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || e.isComposing || !current?.escape) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      current.escape();
    },
    true,
  );

  return {
    showTitle(hd) {
      const t = titleScreen(hd);
      mount('title', { el: t.el, focus: t.focus });
    },
    showHowTo(hd) {
      mount('howto', { el: howToScreen(hd.onBack).el, escape: hd.onBack });
    },
    showSoloSetup(hd) {
      const s = soloScreen(hd);
      mount('solo', { el: s.el, focus: null, escape: hd.onBack });
    },
    showFriendMenu(hd) {
      const s = friendScreen(hd);
      mount('friends', { el: s.el, focus: s.focus, escape: hd.onBack });
    },
    showMatchmaking(hd) {
      const s = matchmakingScreen(hd);
      mount('matchmaking', { el: s.el, focus: null, escape: hd.onCancel });
      return {
        setState(state, secondsLeft) {
          if (s.el.isConnected) s.setState(state, secondsLeft);
        },
      };
    },
    showLobby(model, hd) {
      const s = lobbyScreen(model, hd);
      // 待合室の Esc は何もしない（うっかり部屋を抜けないように）
      mount('lobby', { el: s.el, focus: null });
      return {
        update(next) {
          if (s.el.isConnected) s.update(next);
        },
      };
    },
    showConnecting(text, onCancel) {
      const s = connectingScreen(text, onCancel);
      mount('connecting', { ...s, dialog: true });
    },
    showError(text, onBack) {
      const s = errorScreen(text, onBack);
      mount('error', { ...s, dialog: true });
    },
    showPause(hd) {
      const s = pauseScreen(hd);
      mount('pause', { ...s, dialog: true });
    },
    showResults(result, hd) {
      const s = resultsScreen(result, hd);
      mount('results', { el: s.el, focus: s.focus });
    },
    hide() {
      host.replaceChildren();
      current = null;
      delete root.dataset.screen;
      root.classList.toggle('is-game', true);
    },
    toast(text) {
      toasts.show(text);
    },
  };
}
