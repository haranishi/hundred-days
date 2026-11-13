import type { BrowserContext, Page } from '@playwright/test';

// OSのカーソルへ届かせず、ページには通常の許可・拒否を返す。
const script = `(() => {
  if (window.__pointerLockGuard) return;
  window.__pointerLockGuard = 'pretend';
  const now = performance.now.bind(performance);
  const GRANT_AFTER = 2;  // 許可を出す（イベントとPromiseの結果を返す）までの時間（ms）。本物はブラウザ本体からの通知で、実測 1〜5ms
  const READ_AFTER = 0.5; // 別のタスクから状態を読まれた時に「許可済み」と見せ始める時間（ms）。要求と同じタスクの中（数十マイクロ秒）は、まだ許可前に見せる
  let target = null;      // 要求した（または固定中の）要素。許可待ちの間も入っている（本物の内部の持ち方と同じ）
  let waiting = null;     // 許可待ちの状態 { at, cancelled, resolve, promise }。ある間、document.pointerLockElement は null に見せる
  let selfExit = false;   // ページ自身がロックを外したことがあるか（本物のChromeは、そのあとの取り直しを、操作が無くても許す）
  const fire = (type) => document.dispatchEvent(new Event(type));
  const later = (type) => setTimeout(() => fire(type), 0);
  const active = () => !navigator.userActivation || navigator.userActivation.isActive;
  const refuse = (name, message) => { later('pointerlockerror'); return Promise.reject(new DOMException(message, name)); };
  const due = () => waiting !== null && !waiting.cancelled && now() - waiting.at >= READ_AFTER;
  // 許可を出す。タイマーでも、READ_AFTER が過ぎたあとに誰かが状態を読んだ時でも、1回だけ働く。
  // 本物の許可は、あとから届く試験の読み取り（CDP）より先に処理される。タイマーだけに頼ると、要求の直後にページが忙しいとき（最初の描画など）
  // や、読み取りが要求の約2ms後に走るとき（クリック直後の waitForFunction → state の2往復）に追い越されて結果が変わる
  // （2026-11-03 に総合検査で実測。読み取りは要求の1.8ms後で、2msのしきい値の手前だった）。
  const grant = (w) => {
    if (waiting !== w) return;
    waiting = null;
    if (w.cancelled) { target = null; fire('pointerlockchange'); w.resolve(); return; }   // 本物は、許可の前に解除しても「許可→すぐ失う」の形で change と resolve が届く
    w.resolve(); later('pointerlockchange');
  };
  try {
    Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get() { if (due()) grant(waiting); return waiting ? null : target; } });
    Element.prototype.requestPointerLock = function () {
      const el = this;
      if (due()) grant(waiting);
      if (!el.isConnected) return refuse('WrongDocumentError', 'The root document of this element is not valid for pointer lock.');
      // 固定中・許可待ちの再要求は、本物もブラウザ本体へ聞き直さず（＝操作の有無を見ず）、すぐ成功にして change を出し、要素を差し替える
      if (target) { target = el; later('pointerlockchange'); return Promise.resolve(); }
      if (!selfExit && !active()) return refuse('NotAllowedError', 'A user gesture is required to request pointer lock.');
      target = el;
      const w = waiting = { at: now(), cancelled: false, resolve: null, promise: null };
      w.promise = new Promise((resolve) => { w.resolve = resolve; });
      setTimeout(() => grant(w), GRANT_AFTER);
      return w.promise;
    };
    Document.prototype.exitPointerLock = function () {
      if (due()) grant(waiting);
      if (waiting) { waiting.cancelled = true; return; }
      if (target) { target = null; selfExit = true; later('pointerlockchange'); }
    };
  } catch (e) { /* 差し替えに失敗しても、ページは動かし続ける */ }
})();`;

export async function guardPointerLock(target: BrowserContext | Page): Promise<void> {
  await target.addInitScript(script);
}
