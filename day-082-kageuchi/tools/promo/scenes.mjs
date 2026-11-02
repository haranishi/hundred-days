// 撮る場面（capture.mjs が流す）。どれも ?autostart=1 の本物の遊びの画面を、道順の台本と自動操作の口だけで動かす。
// 縦の窓（720×1280 の CSS ピクセル・倍率 1.5 → 1080×1920）でそのまま描く（README の「縦の作り方」）。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DAY } from './lib/harness.mjs';

export const VIEWPORT = { width: 720, height: 1280 };
export const DPR = 1.5;

/**
 * 撮影のときだけ隠す HUD（配信物は変えない）：操作キーの一覧（縦の窓では折り返して下中央の案内と重なる）、
 * 視点をつかむ案内、目的の細かい説明、経過時間。目的・攻略段階・レーダー・明るさ・構え・小石・その場でできること（E など）は残す。
 */
export const PROMO_CSS = `
  .kg-keys, .kg-lockhint, .kg-objective-detail, .kg-objective-clear, .kg-mission-hint, .kg-time { display: none !important; }
`;

const ROUTES = path.join(DAY, 'source', 'tools', 'routes');
export const loadRoute = (n) => JSON.parse(readFileSync(path.join(ROUTES, `${n}.json`), 'utf8'));

const maxS = (s, ids) => Math.max(...s.g.filter((g) => !ids || ids.includes(g.id)).map((g) => g.s));
const guard = (s, id) => s.g.find((g) => g.id === id);

/** 小石を投げる：Q を押して狙い（向き deg・距離 dist m）を合わせ、離して投げる。 */
async function throwStone(d, deg, dist) {
  await d.route([{ do: 'face', deg }], 'face');
  await d.frame(2);
  await d.input(() => window.__input.down('KeyQ'));
  await d.frame(8);
  // 狙いの距離は、狙っている間の上下の動き 1px で 0.04m（CAMERA.aimPerPixel）。始めは 8m
  await d.input((dy) => window.__input.look(0, dy), -(dist - 8) / 0.04);
  await d.frame(16);
  await d.input(() => window.__input.up('KeyQ'));
}

export const SCENES = {
  /** 下見：表門。暗い通りをしゃがんで進み、灯りへ出て「？」を溜め、闇へ戻る。小石で門番を釣り、背後から当て身。 */
  gate: {
    query: 'autostart=1&seed=1',
    async run(d) {
      d.rec(true);
      await d.route([
        { do: 'goto', x: -8, z: 36.5, move: 'crouch' },
        { do: 'goto', x: -3.2, z: 33.4, move: 'walk', tol: 0.15 },
      ]);
      await d.until((s) => maxS(s, ['omote-l', 'omote-r']) >= 0.3, 30, '灯りで「？」');
      d.mark('suspicious');
      await d.route([{ do: 'goto', x: -7, z: 35.6, move: 'crouch' }, { do: 'goto', x: -9.5, z: 36.8, move: 'crouch' }]);
      await d.until((s) => s.pilot === 'done', 20, '闇へ戻る');
      d.mark('back-dark');
      await d.until((s) => maxS(s, ['omote-l', 'omote-r']) <= 0.01 && guard(s, 'omote-l').st === 'post' && guard(s, 'omote-r').st === 'post', 40, '門番が持ち場へ');
      d.mark('calm');
      d.mark('aim');
      await throwStone(d, 280, 11);
      d.mark('thrown');
      await d.until((s) => s.stonesUsed >= 1, 3, '投げた');
      await d.frame(12);
      // 釣られた門番を見せるため、カメラだけを固定の構図にする（ゲームの調べ用の口 look。状態は変えない）
      await d.input(() => window.__game.look({ target: [-4.5, 1.0, 28.0], yawDeg: 90, pitchDeg: 45, distance: 15, fov: 50 }));
      d.mark('lure-cam');
      await d.until((s) => guard(s, 'omote-l').st === 'investigate', 6, '門番が小石へ');
      d.mark('lured');
      await d.frame(30 * 5);
      d.rec(false);
    },
  },

  /** 裏門の提灯持ちを、折り返しで先を見ている間に背後から当て身。 */
  atemi: {
    query: 'autostart=1&seed=1',
    async run(d) {
      const ura = loadRoute('ura');
      await d.route([
        ...ura.steps.slice(0, 2),
        { do: 'waitUntil', until: { guard: 'ura-patrol', z: [8.5, 11], view: [60, 120] }, timeout: 60, note: '提灯持ちが裏門の前を南へ過ぎる' },
        { do: 'goto', x: -36.6, z: 9.6, move: 'walk', note: '塀の外は土で、歩いても届かない' },
        { do: 'goto', x: -34.6, z: 9.6, move: 'crouch', note: '裏門をくぐる' },
        { do: 'goto', x: -32.7, z: 13.5, move: 'crouch' },
        { do: 'goto', x: -32.6, z: 17.7, move: 'crouch', tol: 0.25, timeout: 12 },
        { do: 'waitUntil', until: { prompt: 'takedown' }, timeout: 3 },
        { do: 'tap', code: 'KeyE', note: '当て身' },
      ], 'atemi');
      await d.until((s) => s.pilotStep >= 3, 40, '裏門の前');
      d.rec(true);
      await d.until((s) => s.takedowns >= 1 || s.pilot === 'failed', 25, '当て身');
      d.mark('down');
      await d.frame(45);
      d.rec(false);
      if (d.last.pilot === 'failed') throw new Error('自動操作が失敗した');
    },
  },

  /** 台本 ura（裏門の道）をそのまま流し、奥庭と討ち取り・炎上を録る。ゲームの題字（本能寺の変）だけ隠し、終わりの画面の題名と重ねない。 */
  ura: {
    query: 'autostart=1&seed=1',
    css: '.kg-finale-title { display: none !important; }',
    async run(d) {
      await d.route(loadRoute('ura').steps, 'ura');
      await d.until((s) => s.t >= 38, 60, '竹林の手前');
      d.rec(true);
      await d.until((s) => s.t >= 52, 60, '奥庭の南');
      d.rec(false);
      // 信長の南西でしゃがんで待つ間（台本の手順 16。動かないので、カメラを固定しても操作に響かない）だけ、
      // 光秀の背中越しに信長・蘭丸・書院の障子を見る構図にする（カメラだけ。ゲームの調べ用の口 look）
      await d.until((s) => s.pilotStep === 16 && s.t >= 71, 40, '信長の南西で待つ');
      await d.input(() => window.__game.look({ target: [0.9, 0.9, -17.6], yawDeg: 292, pitchDeg: 34, distance: 10.5, fov: 50 }));
      d.mark('garden-cam');
      d.rec(true);
      await d.until((s) => s.t >= 80 || s.pilotStep !== 16, 20, '待つ間');
      d.rec(false);
      if (d.last.pilotStep !== 16) throw new Error('固定の構図のうちに台本が動き出した');
      await d.input(() => window.__game.look(null));
      d.mark('follow-cam');
      await d.until((s) => s.t >= 84 || s.pilotStep !== 16, 20, '信長の手前');
      d.rec(true);
      await d.until((s) => s.screen === 'finale', 30, '討ち取り');
      d.mark('finale');
      await d.until((s) => s.screen === 'result', 30, '演出の終わり');
      d.mark('result');
      d.rec(false);
    },
  },
};
