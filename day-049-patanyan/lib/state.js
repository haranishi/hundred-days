// 画面の流れ：title（待機）→ flying → crashing → result → title。
// 「そのタップが何を意味するか」をここで一か所に決め、DOMの配線と切り離してテストする
export const TIMING = Object.freeze({
  inputLock: 0.5,
  resumeGrace: 1.0,
});

export function initialUi() {
  return { screen: 'title', panel: null, paused: false, graceUntil: 0, resultAt: 0, crashAt: 0 };
}

// ボタン以外への入力（タップ・クリック・Space・↑・W）
export function onTap(ui, now) {
  if (ui.panel) return { ui, action: 'none' };
  if (ui.paused) {
    if (ui.graceUntil) return { ui, action: 'none' };
    return { ui: { ...ui, graceUntil: now + TIMING.resumeGrace }, action: 'grace' };
  }
  switch (ui.screen) {
    case 'title':
      return { ui: { ...ui, screen: 'flying' }, action: 'start' };
    case 'flying':
      return { ui, action: 'flap' };
    case 'result':
      // 墜落直後の連打で即やり直しにならないよう、結果が出てから0.5秒は受けない
      if (now - ui.resultAt < TIMING.inputLock) return { ui, action: 'none' };
      return { ui: { ...ui, screen: 'title' }, action: 'retry' };
    default:
      return { ui, action: 'none' };
  }
}

// ボタンは画面遷移だけを起こし、再挑戦のタップとしては数えない
export function onButton(ui, name, now) {
  switch (name) {
    case 'retry':
      if (ui.screen !== 'result' || now - ui.resultAt < TIMING.inputLock) return { ui, action: 'none' };
      return { ui: { ...ui, screen: 'title', panel: null }, action: 'retry' };
    case 'share':
      if (ui.screen !== 'result') return { ui, action: 'none' };
      return { ui: { ...ui, panel: 'share' }, action: 'open-share' };
    case 'cats':
      if (ui.screen !== 'result' && ui.screen !== 'title') return { ui, action: 'none' };
      return { ui: { ...ui, panel: 'cats' }, action: 'open-cats' };
    case 'app-share':
      // 100日チャレンジ共通の共有欄（このゲームそのものを紹介する）。結果のシェアとは別で、タイトルからだけ開く
      if (ui.screen !== 'title') return { ui, action: 'none' };
      return { ui: { ...ui, panel: 'app-share' }, action: 'open-app-share' };
    case 'close':
      return { ui: { ...ui, panel: null }, action: 'close-panel' };
    default:
      return { ui, action: 'none' };
  }
}

export function onCrash(ui, now) {
  if (ui.screen !== 'flying') return ui;
  return { ...ui, screen: 'crashing', crashAt: now };
}

export function onResult(ui, now) {
  if (ui.screen !== 'crashing') return ui;
  return { ...ui, screen: 'result', resultAt: now };
}

export function isResultReady(ui, now) {
  return ui.screen === 'result' && now - ui.resultAt >= TIMING.inputLock;
}

// タブが隠れたら飛行中だけ止める。待機や結果は止めるものがない
export function onHide(ui) {
  if (ui.screen !== 'flying' || ui.paused) return ui;
  return { ...ui, paused: true, graceUntil: 0 };
}

export function onTick(ui, now) {
  if (ui.paused && ui.graceUntil && now >= ui.graceUntil) {
    return { ui: { ...ui, paused: false, graceUntil: 0 }, action: 'resume' };
  }
  return { ui, action: 'none' };
}
