import { WORLD } from './physics.js';

// 遊び場は論理幅288に固定。縦は画面の比から512〜624に収め、天井〜地面の420は変えない。
// 余った縦は空と屋根に、横長の余りは左右の背景に回す
export function computeLayout(vw, vh) {
  const H = Math.min(WORLD.maxH, Math.max(WORLD.minH, (WORLD.width * vh) / vw));
  const scale = Math.min(vw / WORLD.width, vh / H);
  const playW = WORLD.width * scale;
  const playH = H * scale;
  const playX = (vw - playW) / 2;
  const playY = (vh - playH) / 2;
  const groundY = H - WORLD.groundH;
  const ceilingY = groundY - WORLD.bandH;
  const view = {
    left: -playX / scale,
    right: (vw - playX) / scale,
    top: -playY / scale,
    bottom: (vh - playY) / scale,
  };
  // 横持ちのスマホは遊び場が細すぎて、画面の文字とボタンを縦に積めない。左右の余白へ振り分ける
  const side = playW < 330 && vw >= playW + 400;
  // 猫が止まる天井＝画面の上端（帯の座標）。すき間は帯420の中に置くので難しさは変わらず、
  // 帯より上の空はポールが上へ続いているので、飛べても越えられない
  const titleLift = side ? 0 : 32;
  const skyTop = view.top - ceilingY;
  return { vw, vh, H, scale, playW, playH, playX, playY, groundY, ceilingY, skyTop, view, side, titleLift };
}
