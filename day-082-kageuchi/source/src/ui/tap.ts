// OWNER: core
// 画面のボタンの「タップ」。2026-11-03 スマホ対応（体験の採点 第2周）で新設。
// 他の指が画面に触れたままのとき（左の親指がスティックに乗ったまま、右の親指で「再開する」を押す、など）、2本目以降の指のタップを、
// ブラウザは click にしない（複数の指の操作としてタップに数えない）。ボタンが「効かない」ように見えるので、
// touch の2本目以降の指は pointerup で動かす。続けて click が来るブラウザでも二重に動かないよう、短い間だけ画面全体で click を飲み込む
// （画面が切り替わったあと、同じ場所にある別のボタンへ click が落ちないように、でもある）。

/** この時刻（performance.now()）まで、画面全体の click を飲み込む。 */
let swallowUntil = 0;
let guarded = false;

/** 飲み込む間（ms）。pointerup から click までは同じタスクか、数十 ms 以内。 */
const SWALLOW_MS = 500;

function guardClicks(): void {
  if (guarded) return;
  guarded = true;
  window.addEventListener(
    'click',
    (e) => {
      if (performance.now() < swallowUntil) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true,
  );
}

/** ボタンのタップ：ふつうは click、touch の2本目以降の指は pointerup で fn を呼ぶ。 */
export function onTap(target: HTMLElement, fn: (e: Event) => void): void {
  guardClicks();
  target.addEventListener('click', fn);
  target.addEventListener('pointerup', (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || e.isPrimary) return;
    swallowUntil = performance.now() + SWALLOW_MS;
    fn(e);
  });
}
