// 「スーパーやりたい放題」縦型プロモ動画の撮影・合成スクリプト（1080×1920・30fps・30秒）
// 公開ビルド dist/client をローカル静的配信（外部通信完全遮断）し、仮想クロック凍結＋ window.__SY__.camera() で
// 全テイクを実ゲームの物理・寄って低いカメラワークで撮影して ffmpeg で合成する。
//
// 使い方:
//   node tools/promo/render-promo.mjs --frames-dir frames/promo --out-dir out/promo --mux a,b
//   オプション: --only pyramid,sweep,cart,bowling,banana,samples,freezer,combo,chase,results,showdown,overlay
//               --compose-only / --no-compose / --clean / --port 4399
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  BPM, CARD_TIMES, DURATION_SECONDS, END_CARD, FLASHES, FPS,
  ONOMATOPOEIA, PRESSES, PUBLIC_URL, RULE_PILLS, STAMP_AT, STORYBOARD, TAKES,
  frameAt, takeForTime,
} from './timeline.mjs';
import {
  CLOCK_SCRIPT, DPR, GPU_ARGS, ROOT, VIEW, checkLocalText as sharedCheckLocalText, cleanDir, chromium,
  evalCameraPose, ffmpeg, ffprobe, openMatch as sharedOpenMatch, startDistServer, takeFramesCount, tick,
} from './shared.mjs';

const arg = (name, fb) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fb; };
const flag = (name) => process.argv.includes(name);
const need = (val, label) => { if (!val) throw new Error(`${label} を指定してください`); return resolve(val); };

const framesDir = need(arg('--frames-dir', process.env.PROMO_FRAMES_DIR), '--frames-dir');
const outDir = need(arg('--out-dir', process.env.PROMO_OUT_DIR), '--out-dir');
const port = Number(arg('--port', 4399));
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const fontBlack = process.env.PROMO_FONT_BLACK || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Black.ttf');
const TOTAL = Math.round(DURATION_SECONDS * FPS);
const OUT_NAME = (v) => `Day094_super-yaritai_promo_${v}.mp4`;
const only = (arg('--only', '') || '').split(',').filter(Boolean);
const wanted = (name) => !flag('--compose-only') && (!only.length || only.includes(name));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fname = (take, k) => join(framesDir, take, `f${String(k).padStart(5, '0')}.jpg`);

const stats = { requests: 0, local: 0, blocked: [], warnings: [], takes: {}, frames: {}, localAddressSeen: [] };
let origin = `http://127.0.0.1:${port}`;
const openMatch = (browser, take, opts = {}) => sharedOpenMatch(browser, origin, take, { compactBanner: true, ...opts, stats });
const checkLocalText = (page, take, k) => sharedCheckLocalText(page, take, k, stats);

async function setCam(page, pose) {
  await page.evaluate((p) => {
    window.__SY__.camera(p);
    window.__promoStep(0);
  }, pose);
}

async function captureTake(page, take, nFrames, perFrameFn, clip = null) {
  const dir = cleanDir(join(framesDir, take));
  let lastSt = null;
  for (let k = 0; k < nFrames; k++) {
    const res = await perFrameFn(k);
    if (res && typeof res === 'object' && 'st' in res) {
      lastSt = res.st;
      if (res.pose) await setCam(page, res.pose);
    } else {
      lastSt = res;
    }
    const shotOpts = { path: join(dir, `f${String(k).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92, timeout: 60_000 };
    if (clip) shotOpts.clip = clip;
    await page.screenshot(shotOpts);
    if (k === 0 || k === nFrames - 1) await checkLocalText(page, take, k);
  }
  stats.frames[take] = nFrames;
  return lastSt;
}

// 1) ピラミッド爆散 (0.00–4.00s = 120f): f0 から既に缶が飛び散り、2.00–4.00s はスロー崩壊で S1 の背景へ繋ぐ
async function shootPyramid(browser) {
  const n = takeFramesCount('pyramid'); // 120
  const { ctx, page } = await openMatch(browser, 'pyramid');
  try {
    // 冒頭で缶の山の上に出る「積み直しまで25秒」ラベルが字幕に重なるため撮影中だけ非表示にする
    await page.addStyleTag({ content: '[data-testid="hud-wait-pyramid"] { display: none !important; }' });
    await page.evaluate(() => {
      window.__SY__.teleport(0, 3.5, 5.55);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, 14.5, -5.0);
    });
    await tick(page, null, 2);
    for (let i = 0; i < 6; i++) await tick(page, { moveZ: -1, dash: true }, 2);
    await tick(page, { action: true, actionPressed: true }, 1);
    await tick(page, null, 8); // 1コマ目(k=0)から缶が放射状に飛び散り主役の顔が抜けるタイミングを作る

    const last = await captureTake(page, 'pyramid', n, async (k) => {
      const ticks = k < 24 || k >= 60 ? 1 : 2;
      const st = await tick(page, null, ticks);
      let pose;
      if (k <= 32) {
        // 角度1: 少し低めに寄りつつ見下ろしを抑えて、缶と主役を下半分へ入れ床の空きを約25%以下に抑える
        pose = evalCameraPose(k / 32, [3.5, 0.02, 3.6], {
          startOffset: [0.95, 1.15, -3.05],
          endOffset: [0.80, 1.10, -2.75],
          startLook: [0, 0.72, 0.15],
          endLook: [0, 0.70, 0.20],
          startFov: 60,
          endFov: 58,
          impactAtK: 0,
          impactFrames: 8,
          fovPunch: 4.5,
          shakeAmp: 0.12,
        }, k);
      } else if (k <= 59) {
        // 角度2: x=1棚([0.4,1.6])を避けて通路内[2.1, 5.0]の北西低角から見せる
        pose = evalCameraPose((k - 33) / 26, [3.5, 0.02, 3.6], {
          startOffset: [-1.15, 1.5, -2.4],
          endOffset: [-0.85, 1.4, -2.0],
          startLook: [0.05, 0.68, 0.4],
          endLook: [0.05, 0.68, 0.35],
          startFov: 58,
          endFov: 60,
        }, k);
      } else {
        // S1 背景用 (2.00–4.00s): 通路内の北側をゆっくり回り込み、棚・看板の被りを防ぐ
        pose = evalCameraPose((k - 60) / 59, [3.5, 0.02, 3.6], {
          startOffset: [-1.1, 1.65, -2.45],
          endOffset: [1.35, 1.65, -2.55],
          startLook: [0, 0.65, 0.2],
          endLook: [0, 0.65, 0.2],
          startFov: 56,
          endFov: 58,
        }, k);
      }
      return { st, pose };
    });
    stats.takes.pyramid = { collapsed: last.stations.pyramid.collapsed, score: last.players[0].score, achieved: last.players[0].achieved };
    if (!last.stations.pyramid.collapsed) throw new Error('pyramid テイクで缶が崩れていません');
  } finally {
    await ctx.close();
  }
}

// 2) 棚なぎ払い (4.00–6.00s = 60f): 手前遮蔽ゼロ・頭上看板を字幕裏に入れない通路中央の低角追い
async function shootSweep(browser) {
  const n = takeFramesCount('sweep');
  const { ctx, page } = await openMatch(browser, 'sweep');
  try {
    // まず奥(z=-6.5)の東棚を払って基礎点を稼ぎ、カメラ視野外に置く
    await page.evaluate(() => {
      window.__SY__.teleport(0, 4.65, -6.5);
      window.__SY__.face(0, Math.PI / 2);
      window.__SY__.teleport(1, 14.5, -5.0);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 16);
    // 本番位置(x=2.05, z=0.4)へ移動し、西棚を正面から払い始めた瞬間にk=0へ入る
    await page.evaluate(() => {
      window.__SY__.teleport(0, 2.05, 0.4);
      window.__SY__.face(0, -Math.PI / 2);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 4);
    const last = await captureTake(page, 'sweep', n, async (k) => {
      const hitStart = k === 12 || k === 28 || k === 42;
      const inHit = (k >= 12 && k <= 15) || (k >= 28 && k <= 31) || (k >= 42 && k <= 45);
      if (hitStart) await page.evaluate(() => window.__SY__.face(0, -Math.PI / 2));
      const inp = inHit
        ? { action: true, actionPressed: hitStart }
        : k < 48
          ? { moveX: -0.35, moveZ: -0.94, dash: true }
          : { moveX: -0.25, moveZ: 0.25, dash: false };
      const st = await tick(page, inp, 2);
      const me = st.players[0].pos;
      const pose = k < 30
        ? evalCameraPose(k / 29, [me.x, 0.02, me.z], {
            startOffset: [1.55, 1.65, -3.2],
            endOffset: [1.3, 1.55, -2.75],
            startLook: [-0.35, 0.65, 0.25],
            endLook: [-0.35, 0.65, 0.25],
            startFov: 60,
            endFov: 58,
            impactAtK: k >= 18 ? 18 : 2,
            impactFrames: 7,
            fovPunch: 4,
            shakeAmp: 0.1,
          }, k)
        : evalCameraPose((k - 30) / 29, [me.x, 0.02, me.z], {
            startOffset: [1.4, 1.8, -2.85],
            endOffset: [1.15, 1.65, -2.4],
            startLook: [-0.35, 0.52, 0.2],
            endLook: [-0.35, 0.52, 0.2],
            startFov: 58,
            endFov: 60,
            impactAtK: 34,
            impactFrames: 7,
            fovPunch: 4,
            shakeAmp: 0.09,
          }, k);
      return { st, pose };
    });
    stats.takes.sweep = { score: last.players[0].score, achieved: last.players[0].achieved, damage: last.damage };
    if (last.players[0].score < 350) throw new Error(`sweep 得点が小さすぎます: ${last.players[0].score}`);
  } finally {
    await ctx.close();
  }
}

// 3) カート爆走 (6.00–8.00s = 60f): 軌道を調整し、赤缶ピラミッド/棚端へ正面突入する姿を前3/4低角で撮る
async function shootCart(browser) {
  const n = takeFramesCount('cart');
  const { ctx, page } = await openMatch(browser, 'cart');
  try {
    await page.evaluate(() => {
      window.__SY__.teleport(0, 8.75, 11.4);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, 14.5, -5.0);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 6);
    const mounted = await page.evaluate(() => window.__SY__.state().players[0].ridingCart);
    if (mounted == null) throw new Error('cart に乗れません');
    // サービスカウンター看板(-0.6, 2.5, 11.3)を完全に過ぎたプラザ中央 (z<=5.2) まで加速してから撮り始める
    for (let i = 0; i < 26; i++) await tick(page, { moveZ: -1, moveX: -0.24, dash: true }, 2);

    let prevScore = (await page.evaluate(() => window.__SY__.state())).players[0].score;
    let crashK = null;
    const last = await captureTake(page, 'cart', n, async (k) => {
      // オープンプラザ(z=3.4..5.2)上を保ち、赤缶ピラミッド(3.5, 3.6)から西へ抜ける（x=1棚へ入らない）
      const inp = k < 24 ? { moveX: -0.94, moveZ: -0.34, dash: true } : { moveX: -0.98, moveZ: 0.22, dash: true };
      const st = await tick(page, inp, 2);
      if (crashK === null && st.players[0].score - prevScore >= 20) crashK = k;
      prevScore = st.players[0].score;
      const me = st.players[0].pos;
      const pose = evalCameraPose(k / (n - 1), [me.x, 0.02, Math.max(3.6, me.z)], {
        startOffset: [-2.75, 1.75, 2.3],
        endOffset: [-2.4, 1.65, 1.95],
        startLook: [-0.25, 0.72, -0.1],
        endLook: [-0.2, 0.72, -0.05],
        startFov: 60,
        endFov: 58,
        impactAtK: crashK,
        impactFrames: 8,
        fovPunch: 4.5,
        shakeAmp: 0.1,
      }, k);
      return { st, pose };
    });
    stats.takes.cart = { ridingCart: last.players[0].ridingCart, crashK, score: last.players[0].score, achieved: last.players[0].achieved };
    if (last.players[0].score <= 0) throw new Error('cart テイクで得点が入っていません');
  } finally {
    await ctx.close();
  }
}

// 4) スイカボウリング (8.00–12.00s = 120f): 投球→スイカ追従スロー→10.00sストライク着弾(2角度)
async function shootBowling(browser) {
  const n = takeFramesCount('bowling');
  const throwF = frameAt(TAKES.bowling.throwAt) - frameAt(TAKES.bowling.from); // 15
  const impactF = frameAt(TAKES.bowling.impactAt) - frameAt(TAKES.bowling.from); // 60
  let hitTick = null;
  const { ctx, page } = await openMatch(browser, 'bowling');
  try {
    hitTick = await page.evaluate(() => {
      window.__SY__.teleport(0, 8.5, 4.9);
      window.__SY__.face(0, Math.PI);
      for (let i = 0; i < 4; i++) window.__promoStep(1000 / 60);
      window.__SY__.input({ action: true, actionPressed: true }, 1);
      for (let i = 0; i < 4; i++) window.__promoStep(1000 / 60);
      window.__SY__.teleport(0, 8.5, 0.5);
      window.__SY__.face(0, Math.PI);
      for (let i = 0; i < 4; i++) window.__promoStep(1000 / 60);
      window.__SY__.input({ action: true, actionPressed: true }, 1);
      for (let t = 1; t <= 180; t++) {
        window.__promoStep(1000 / 60);
        if (window.__SY__.state().stations.bowling.pinsDown >= 2) return t;
      }
      return null;
    });
    if (!hitTick) throw new Error('bowling ドライランでピンに命中しません');
  } finally {
    await ctx.close();
  }

  const { ctx: ctx2, page: p2 } = await openMatch(browser, 'bowling');
  try {
    await p2.evaluate(() => {
      window.__SY__.teleport(0, 8.5, 4.9);
      window.__SY__.face(0, Math.PI);
    });
    await tick(p2, null, 2);
    await tick(p2, { action: true, actionPressed: true }, 3);
    await p2.evaluate(() => {
      window.__SY__.teleport(0, 8.5, 2.0);
      window.__SY__.face(0, Math.PI);
    });
    await tick(p2, null, 2);

    let doneTicks = 0;
    const flightFrames = impactF - throwF;
    const lastSt = await captureTake(p2, 'bowling', n, async (k) => {
      let st;
      if (k < throwF - 1) {
        st = await tick(p2, { moveZ: -1, dash: true }, 2);
      } else if (k === throwF - 1) {
        await p2.evaluate(() => {
          window.__SY__.teleport(0, 8.5, 0.5);
          window.__SY__.face(0, Math.PI);
        });
        st = await tick(p2, { action: true, actionPressed: true }, 1);
      } else if (k <= impactF) {
        const target = Math.round(((k - (throwF - 1)) / flightFrames) * hitTick);
        const delta = Math.max(0, target - doneTicks);
        doneTicks += delta;
        st = await tick(p2, null, Math.max(0, delta));
      } else {
        // 10.00s直後18コマは1tick/frameスローで10本のピンが舞う画を見せる
        st = await tick(p2, null, k < impactF + 18 ? 1 : 2);
      }

      const me = st.players[0].pos;
      let pose;
      if (k < throwF) {
        pose = evalCameraPose(k / (throwF - 1), [me.x, 0.02, me.z], {
          startOffset: [0.95, 1.35, -2.9],
          endOffset: [0.85, 1.25, -2.5],
          startLook: [0, 0.72, 0.1],
          endLook: [0, 0.72, 0.1],
          startFov: 58,
          endFov: 60,
        }, k);
      } else if (k < impactF) {
        // スイカを至近・低角で追う（床の空白を抑える）
        const u = (k - throwF) / (impactF - throwF);
        const melonZ = 0.2 + u * (-6.7 - 0.2);
        pose = evalCameraPose(u, [8.5, 0.22, melonZ], {
          startOffset: [0.72, 0.95, -2.45],
          endOffset: [0.6, 0.9, -2.25],
          startLook: [0, 0.25, 0.1],
          endLook: [0, 0.25, 0.15],
          startFov: 60,
          endFov: 62,
        }, k);
      } else if (k < impactF + 30) {
        // ストライク角度1: 通路中央寄り(x~8.85)からピン爆発を受け止め、左の冷凍庫・棚のめり込みを防ぐ
        pose = evalCameraPose((k - impactF) / 29, [8.5, 0.65, -7.0], {
          startOffset: [0.35, 1.35, -3.2],
          endOffset: [0.25, 1.25, -2.8],
          startLook: [0, 0.15, 0.4],
          endLook: [0, 0.18, 0.5],
          startFov: 60,
          endFov: 58,
          impactAtK: impactF,
          impactFrames: 9,
          fovPunch: 5.0,
          shakeAmp: 0.12,
        }, k);
      } else {
        // ストライク角度2: 通路内の南西側から紙吹雪と飛び散るピン・主役を煽る
        pose = evalCameraPose((k - (impactF + 30)) / (n - 1 - (impactF + 30)), [8.5, 0.65, -7.0], {
          startOffset: [-0.55, 1.35, 3.1],
          endOffset: [-0.45, 1.25, 2.7],
          startLook: [0, 0.18, -0.4],
          endLook: [0, 0.22, -0.5],
          startFov: 58,
          endFov: 62,
        }, k);
      }
      return { st, pose };
    });
    stats.takes.bowling = { dryHitTick: hitTick, pinsDown: lastSt.stations.bowling.pinsDown, score: lastSt.players[0].score };
    if (lastSt.stations.bowling.pinsDown < 5) throw new Error(`ストライク本数不足: ${lastSt.stations.bowling.pinsDown}`);
  } finally {
    await ctx2.close();
  }
}

// 5) バナナの皮で転倒 (12.00–14.00s = 60f): 転倒の瞬間から始まるよう事前ステップを進め、宙に浮く瞬間をスローと中寄りの構図で撮る
async function shootBanana(browser) {
  const n = takeFramesCount('banana');
  async function prepBanana(page) {
    return page.evaluate(() => {
      window.__SY__.teleport(0, -14.3, -5.2);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, 14.5, -5.0);
      for (let i = 0; i < 4; i++) window.__promoStep(1000 / 60);
      window.__SY__.input({ action: true, actionPressed: true }, 1);
      window.__promoStep(1000 / 60);
      window.__SY__.teleport(0, 14.0, -9.0);
      for (let t = 0; t < 1600; t++) {
        window.__promoStep(1000 / 60);
        const c = window.__SY__.state().npcs.find((npc) => npc.id === 0);
        if (c && Math.abs(c.pos.x + 12.0) < 0.7 && c.pos.z > -8.2 && c.pos.z < -5.8) break;
      }
      const c0 = window.__SY__.state().npcs.find((npc) => npc.id === 0);
      const peelZ = c0.pos.z + 4.3;
      const peelX = -12.0;
      const standZ = peelZ - 0.55;
      window.__SY__.teleport(0, peelX, standZ);
      window.__SY__.face(0, Math.PI);
      window.__promoStep(1000 / 60);
      window.__SY__.input({ action: true, actionPressed: true }, 1);
      window.__promoStep(1000 / 60);
      window.__SY__.teleport(0, 14.0, -9.0);
      window.__SY__.heat(0, 0);
      for (let w = 0; w < 54; w++) window.__promoStep(1000 / 60);
      const cNow = window.__SY__.state().npcs.find((npc) => npc.id === 0);
      const dz = peelZ - cNow.pos.z;
      const stepDir = dz >= 0 ? 1 : -1;
      const targetZ = Math.max(-9.8, Math.min(3.5, peelZ + stepDir * 2.6));
      window.__SY__.teleport(0, peelX, targetZ);
      window.__SY__.face(0, stepDir > 0 ? Math.PI : 0);
      window.__SY__.heat(0, 95);
      return { clerkPos: cNow.pos, peelPos: { x: peelX, z: peelZ } };
    });
  }

  // ドライランで厳密なスリップ発生ティック数を測る
  let slipTick = null;
  const { ctx: probeCtx, page: probePage } = await openMatch(browser, 'banana', { skipFriendly: true });
  try {
    await prepBanana(probePage);
    for (let t = 1; t <= 120; t++) {
      const st = await tick(probePage, null, 1);
      if (st.npcs.some((npc) => npc.state === 'slipped' || npc.anim === 'slip') || st.players[0].secrets?.includes('secret-staff-slip')) {
        slipTick = t;
        break;
      }
    }
    if (slipTick === null) throw new Error('banana ドライランでスリップが発生しません');
  } finally {
    await probeCtx.close();
  }

  const { ctx, page } = await openMatch(browser, 'banana', { skipFriendly: true });
  try {
    const { clerkPos, peelPos } = await prepBanana(page);
    // スリップ発生の約10ティック（5フレーム＝0.17秒）手前まで先に進めておき、踏み込み→宙浮きを最初から捉える
    const preSkip = Math.max(0, slipTick - 10);
    if (preSkip > 0) await tick(page, null, preSkip);
    let slipFrame = null;
    const last = await captureTake(page, 'banana', n, async (k) => {
      const ticks = k >= 4 && k < 28 ? 1 : 2;
      const st = await tick(page, null, ticks);
      if (slipFrame === null && (st.npcs.some((npc) => npc.state === 'slipped' || npc.anim === 'slip') || st.players[0].secrets?.includes('secret-staff-slip'))) {
        slipFrame = k;
      }
      const clerk = st.npcs.find((npc) => npc.id === 0) ?? st.players[0];
      const pose = evalCameraPose(k / (n - 1), [clerk.pos.x, 0.9, clerk.pos.z], {
        startOffset: [1.75, 6.2, 6.8],
        endOffset: [1.45, 5.3, 5.7],
        startLook: [0, 0, 0.2],
        endLook: [0, 0, 0.1],
        startFov: 50,
        endFov: 48,
        maxY: 8.0,
        impactAtK: slipFrame,
        impactFrames: 7,
        fovPunch: 4,
        shakeAmp: 0.1,
      }, k);
      return { st, pose };
    });
    stats.takes.banana = {
      slipped: slipFrame !== null,
      slipTick,
      slipFrame,
      clerkStart: clerkPos,
      peelPos,
      secrets: last.players[0].secrets,
      score: last.players[0].score,
    };
    if (slipFrame === null) throw new Error(`banana 店員スリップ未発生: ${JSON.stringify(stats.takes.banana)}`);
  } finally {
    await ctx.close();
  }
}

// 6a) 試食を食べ尽くす (14.00–15.00s = 30f): 西南側の近く低い視点で上半分の空白を抑える
async function shootSamples(browser) {
  const n = takeFramesCount('samples');
  const { ctx, page } = await openMatch(browser, 'samples');
  try {
    await page.evaluate(() => {
      window.__SY__.teleport(0, 15.0, -8.7);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, 0.0, 5.0);
    });
    await tick(page, null, 2);
    for (let i = 0; i < 5; i++) await tick(page, { action: true, actionPressed: true }, 12);
    const last = await captureTake(page, 'samples', n, async (k) => {
      const press = k === 3 || k === 12 || k === 20;
      const st = await tick(page, press ? { action: true, actionPressed: true } : null, 2);
      const me = st.players[0].pos;
      const pose = evalCameraPose(k / (n - 1), [me.x, 0.02, me.z], {
        startOffset: [-2.8, 2.45, 2.3],
        endOffset: [-2.3, 2.25, 1.9],
        startLook: [0, 0.9, -0.5],
        endLook: [0, 0.9, -0.6],
        startFov: 58,
        endFov: 56,
        impactAtK: k >= 20 ? 20 : null,
        impactFrames: 6,
        fovPunch: 4,
        shakeAmp: 0.09,
      }, k);
      return { st, pose };
    });
    stats.takes.samples = { left: last.stations.samples.left, score: last.players[0].score, achieved: last.players[0].achieved };
  } finally {
    await ctx.close();
  }
}

// 6b) 冷凍ケースで涼む (15.00–16.00s = 30f): 近く低い視点で飛び込み着地〜冷気＆+100点を映す
async function shootFreezer(browser) {
  const n = takeFramesCount('freezer');
  const { ctx, page } = await openMatch(browser, 'freezer');
  try {
    await page.evaluate(() => {
      window.__SY__.teleport(0, 0.1, -10.5);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, 14.5, 5.0);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 3);
    await tick(page, { action: true }, 44);
    const last = await captureTake(page, 'freezer', n, async (k) => {
      const st = await tick(page, { action: true }, 2);
      const me = st.players[0].pos;
      const pose = evalCameraPose(k / (n - 1), [me.x, 0.25, me.z], {
        startOffset: [-3.25, 2.35, 2.95],
        endOffset: [-2.85, 2.15, 2.6],
        startLook: [0, 0.6, 0],
        endLook: [0, 0.6, 0],
        startFov: 58,
        endFov: 56,
      }, k);
      return { st, pose };
    });
    stats.takes.freezer = { freezerSlots: last.stations.freezerSlots, score: last.players[0].score };
  } finally {
    await ctx.close();
  }
}

// 6c) 悪事をつないで最高倍率×3.0＋紙吹雪 (16.00–18.00s = 60f): 近く低い視点
async function shootCombo(browser) {
  const n = takeFramesCount('combo');
  const { ctx, page } = await openMatch(browser, 'combo');
  try {
    await page.evaluate(() => {
      window.__SY__.teleport(0, 3.5, 5.15);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, 14.5, -5.0);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 4);
    await page.evaluate(() => {
      window.__SY__.teleport(0, 2.35, -0.3);
      window.__SY__.face(0, -Math.PI / 2);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 4);
    await page.evaluate(() => {
      window.__SY__.teleport(0, 15.0, -8.7);
      window.__SY__.face(0, Math.PI);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 4);
    await page.evaluate(() => {
      window.__SY__.teleport(0, -0.6, 9.78);
      window.__SY__.face(0, 0);
    });
    await tick(page, null, 2);
    for (let b = 0; b < 15; b++) await tick(page, { action: true, actionPressed: true }, 6);
    const last = await captureTake(page, 'combo', n, async (k) => {
      const ding = k % 5 === 0 && k < 40;
      const st = await tick(page, ding ? { action: true, actionPressed: true } : null, 2);
      const me = st.players[0].pos;
      const pose = evalCameraPose(k / (n - 1), [me.x, 0.02, me.z], {
        startOffset: [3.2, 1.75, -1.25],
        endOffset: [2.75, 1.6, -1.0],
        startLook: [0, 0.85, 0.25],
        endLook: [0, 0.85, 0.25],
        startFov: 60,
        endFov: 58,
        impactAtK: k >= 25 ? 25 : null,
        impactFrames: 7,
        fovPunch: 4,
        shakeAmp: 0.08,
      }, k);
      return { st, pose };
    });
    stats.takes.combo = { combo: last.players[0].combo, score: last.players[0].score, achieved: last.players[0].achieved };
  } finally {
    await ctx.close();
  }
}

// 7) 店員追走「！」→ 20.80s (f84) 逮捕「こらー！」＆スロー＆揺れ (18.00–22.00s = 120f)
async function shootChase(browser) {
  const n = takeFramesCount('chase');
  const caughtF = frameAt(TAKES.chase.caughtAt) - frameAt(TAKES.chase.from); // 84
  let bestStopK = 42;
  let bestTicksBefore = 0;
  let bestCatchF = null;
  const { ctx: probeCtx, page: probePage } = await openMatch(browser, 'chase', { skipFriendly: true });
  try {
    const res = await probePage.evaluate(() => {
      let extra = 0;
      for (let t = 0; t < 1600; t++) {
        window.__promoStep(1000 / 60);
        extra++;
        const c = window.__SY__.state().npcs.find((npc) => npc.id === 1);
        if (c && c.pos.x > 12.8 && c.pos.z > -7.5 && c.pos.z < -3.0) break;
      }
      const c1 = window.__SY__.state().npcs.find((npc) => npc.id === 1);
      window.__SY__.teleport(0, c1.pos.x, c1.pos.z + 3.2);
      window.__SY__.face(0, 0);
      window.__SY__.heat(0, 98);
      let caughtAtK = null;
      for (let k = 0; k < 120; k++) {
        for (let i = 0; i < 2; i++) {
          if (k < 40) window.__SY__.input({ moveZ: 1, dash: true }, 1);
          window.__promoStep(1000 / 60);
        }
        if (caughtAtK === null && window.__SY__.state().players[0].caught > 0) {
          caughtAtK = k;
          break;
        }
      }
      return { extra, caughtAtK };
    });
    bestTicksBefore = res.extra;
    bestCatchF = res.caughtAtK;
    if (res.caughtAtK !== null) bestStopK = Math.max(15, Math.min(72, 40 + Math.round((caughtF - res.caughtAtK) * 0.85)));
  } finally {
    await probeCtx.close();
  }

  const { ctx, page } = await openMatch(browser, 'chase', { skipFriendly: true });
  try {
    await page.evaluate((extra) => {
      for (let t = 0; t < extra; t++) window.__promoStep(1000 / 60);
      const c1 = window.__SY__.state().npcs.find((npc) => npc.id === 1);
      window.__SY__.teleport(0, c1.pos.x, c1.pos.z + 3.2);
      window.__SY__.face(0, 0);
      window.__SY__.heat(0, 98);
    }, bestTicksBefore);
    let catchFrame = null;
    const last = await captureTake(page, 'chase', n, async (k) => {
      const inp = k < bestStopK ? { moveZ: 1, dash: true } : null;
      const ticks = catchFrame !== null ? 1 : 2; // 逮捕瞬間からスロー
      const st = await tick(page, inp, ticks);
      if (catchFrame === null && st.players[0].caught > 0) catchFrame = k;
      const me = st.players[0].pos;
      const pose = k < (catchFrame ?? 999)
        ? evalCameraPose(k / caughtF, [me.x, 0.02, me.z], {
            startOffset: [1.0, 1.55, 3.3],
            endOffset: [0.9, 1.45, 2.8],
            startLook: [0, 0.9, -0.8],
            endLook: [0, 0.9, -0.8],
            startFov: 60,
            endFov: 58,
          }, k)
        : evalCameraPose((k - catchFrame) / Math.max(1, n - 1 - catchFrame), [me.x, 0.02, me.z], {
            startOffset: [0.9, 1.45, 2.8],
            endOffset: [0.75, 1.35, 2.35],
            startLook: [0, 0.9, -0.55],
            endLook: [0, 0.88, -0.5],
            startFov: 58,
            endFov: 56,
            impactAtK: catchFrame,
            impactFrames: 9,
            fovPunch: 4.5,
            shakeAmp: 0.12,
          }, k);
      return { st, pose };
    });
    stats.takes.chase = {
      catchFrame,
      probeCatchFrame: bestCatchF,
      stopK: bestStopK,
      expectedCatchFrame: caughtF,
      clerksChasing: last.npcs.filter((x) => x.state === 'chase' || x.state === 'carry').length,
      finalCaught: last.players[0].caught,
    };
    if (catchFrame === null) throw new Error(`chase 捕獲未発生: ${JSON.stringify(stats.takes.chase)}`);
  } finally {
    await ctx.close();
  }
}

// 8a) 結果画面 (22.00–23.50s = 45f): CPU(ユイ)にも数百点以上入っている状態で1Pが勝ち、内訳は隠す
async function shootResults(browser) {
  const n = takeFramesCount('results');
  const { ctx, page } = await openMatch(browser, 'results', { hideHud: true, level: 'hard', cpuOn: true });
  try {
    await page.addStyleTag({ content: '.sy-breakdown { display: none !important; }' });
    await page.evaluate(() => {
      window.__SY__.teleport(0, 3.5, 5.55);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, -6.5, -2.0);
      window.__SY__.face(1, Math.PI / 2);
    });
    await tick(page, null, 2);
    for (let i = 0; i < 6; i++) await tick(page, { moveZ: -1, dash: true }, 1);
    await tick(page, { action: true, actionPressed: true }, 4);
    await page.evaluate(() => {
      window.__SY__.teleport(0, 8.5, 4.9);
      window.__SY__.face(0, Math.PI);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 4);
    await page.evaluate(() => {
      window.__SY__.teleport(0, 8.5, 0.5);
      window.__SY__.face(0, Math.PI);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 2);
    await tick(page, null, 58);
    await page.evaluate(() => {
      window.__SY__.teleport(0, 15.0, -8.7);
      window.__SY__.face(0, Math.PI);
    });
    await tick(page, null, 2);
    for (let i = 0; i < 8; i++) await tick(page, { action: true, actionPressed: true }, 12);
    await page.evaluate(() => {
      window.__SY__.teleport(0, -0.6, 9.78);
      window.__SY__.face(0, 0);
    });
    await tick(page, null, 2);
    for (let b = 0; b < 20; b++) await tick(page, { action: true, actionPressed: true }, 6);
    for (let wait = 0; wait < 900; wait += 30) {
      const s = await page.evaluate(() => window.__SY__.state());
      if ((s.players[1]?.score ?? 0) >= 700) break;
      await tick(page, null, 30);
    }
    const preSt = await page.evaluate(() => window.__SY__.state());
    if (preSt.players[0].score < 2500) throw new Error(`results 1Pスコア不足: ${preSt.players[0].score}`);
    if ((preSt.players[1]?.score ?? 0) < 300) throw new Error(`results 2P(CPU)スコア不足: ${preSt.players[1]?.score ?? 0}`);
    if (preSt.players[0].score <= preSt.players[1].score) throw new Error(`results 1Pが勝っていません: ${preSt.players[0].score} <= ${preSt.players[1].score}`);

    await page.evaluate(() => window.__SY__.forceEnd());
    for (let i = 0; i < 260; i++) {
      await tick(page, null, 1);
      if (await page.evaluate(() => window.__SY__.state().screen === 'results')) break;
    }
    const endScreen = await page.evaluate(() => window.__SY__.state().screen);
    if (endScreen !== 'results') throw new Error(`results 画面へ遷移せず: ${endScreen}`);
    await page.addStyleTag({ content: '.sy-detail, .sy-breakdown { display: none !important; }' });
    await captureTake(page, 'results', n, () => tick(page, null, 2));
    const fin = await page.evaluate(() => ({ screen: window.__SY__.state().screen, result: window.__SY__.state().result }));
    stats.takes.results = {
      screen: fin.screen,
      winnerSlots: fin.result?.winnerSlots,
      p0Score: fin.result?.players?.[0]?.score,
      p1Score: fin.result?.players?.[1]?.score,
      p0Title: fin.result?.players?.[0]?.title,
    };
  } finally {
    await ctx.close();
  }
}

// 8b) 白熱乱闘クライマックス (23.50–26.00s = 75f): 1Pと2P CPU(本気)の並走衝突をk=0から棚かぶり無しで撮る
async function shootShowdown(browser) {
  const n = takeFramesCount('showdown'); // 75
  const { ctx, page } = await openMatch(browser, 'showdown', { level: 'hard', cpuOn: true });
  try {
    await page.evaluate(() => {
      window.__SY__.teleport(0, 4.0, 5.3);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, 2.5, 5.3);
      window.__SY__.face(1, Math.PI);
    });
    await tick(page, null, 2);
    for (let i = 0; i < 8; i++) await tick(page, { moveZ: -1, moveX: -0.15, dash: true }, 2);
    await tick(page, { moveZ: -1, moveX: -0.15, dash: true, action: true, actionPressed: true }, 6);
    const last = await captureTake(page, 'showdown', n, async (k) => {
      let inp;
      if (k < 25) inp = { moveX: -0.45, moveZ: -0.35, dash: true, ...(k === 10 ? { action: true, actionPressed: true } : {}) };
      else if (k < 50) inp = { moveX: 0.55, moveZ: 0.45, dash: true, ...(k === 35 ? { action: true, actionPressed: true } : {}) };
      else inp = { moveX: -0.45, moveZ: 0.25, dash: true, ...(k === 58 ? { action: true, actionPressed: true } : {}) };
      const st = await tick(page, inp, 2);
      const p0 = st.players[0].pos;
      const p1 = st.players[1]?.pos ?? p0;
      const clampVal = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const mid = [clampVal((p0.x + p1.x) / 2, 2.8, 4.3), 0.02, clampVal((p0.z + p1.z) / 2, 3.6, 5.1)];
      const pose = evalCameraPose(k / (n - 1), mid, {
        startOffset: [1.0, 1.55, -3.4],
        endOffset: [-0.8, 1.45, -3.1],
        startLook: [0, 0.72, 0.35],
        endLook: [0, 0.72, 0.3],
        startFov: 60,
        endFov: 58,
        impactAtK: k >= 58 ? 58 : k >= 35 ? 35 : k >= 10 ? 10 : 0,
        impactFrames: 6,
        fovPunch: 4,
        shakeAmp: 0.09,
      }, k);
      return { st, pose };
    });
    stats.takes.showdown = {
      p0Score: last.players[0].score,
      p1Score: last.players[1]?.score ?? 0,
      p0Pos: last.players[0].pos,
      p1Pos: last.players[1]?.pos ?? null,
    };
  } finally {
    await ctx.close();
  }
}

// ---- オーバーレイ＆カードHTML ----
function ringPlan() {
  const rings = Array.from({ length: TOTAL }, () => []);
  for (const p of PRESSES) {
    const file = join(framesDir, p.take, 'press.json');
    if (!existsSync(file)) continue;
    const rec = JSON.parse(readFileSync(file, 'utf8'));
    const b = rec.box;
    const base = frameAt(TAKES[p.take].from);
    const down = base + rec.downK;
    const up = base + rec.pressK;
    for (let f = down; f < up; f++) {
      if (f < 0 || f >= TOTAL) continue;
      const held = Math.min(1, (f - down + 1) / Math.max(1, up - down));
      rings[f].push({ x: b.x, y: b.y, o: 0.92, s: +(0.6 + 0.35 * held).toFixed(3) });
    }
  }
  return rings;
}

function captionPlan() {
  return STORYBOARD.filter((s) => s.lines.length > 0).map((s) => ({
    id: s.id, from: frameAt(s.start), to: frameAt(s.end),
    lines: s.lines, top: s.captionTop ?? 128, plate: !!s.plate, compact: !!s.compact,
  }));
}

function overlayHtml() {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><style>
  @font-face { font-family: Promo; src: url(/font.ttf); font-weight: 700; }
  @font-face { font-family: PromoBlack; src: url(/font-black.ttf); font-weight: 900; }
  :root { --ink: #181a24; --cream: #fffaf0; --yellow: #ffcf35; --red: #e53e30; --blue: #2374e1; --green: #2ba859; }
  html, body { margin: 0; width: 540px; height: 960px; overflow: hidden; background: transparent; font-family: Promo, sans-serif; color: #fff; }
  .cap { position: absolute; left: 16px; right: 16px; top: 96px; min-height: 76px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; transform-origin: center top; }
  .cap.compact { min-height: 30px; }
  .cap span { display: inline-block; font-family: PromoBlack, Promo, sans-serif; font-weight: 900; font-size: 30px; line-height: 1.28; white-space: nowrap;
    color: #fff; -webkit-text-stroke: 8px var(--ink); paint-order: stroke fill; text-shadow: 0 3px 12px rgba(0, 0, 0, .55); }
  .cap span:nth-child(2) { color: var(--yellow); }
  .cap.plate span { background: rgba(24, 26, 36, .92); border-radius: 14px; padding: 3px 16px; margin: 2px 0; -webkit-text-stroke: 0; border: 2px solid rgba(255, 255, 255, .25); font-size: 26px; }
  .cap.compact span { font-size: 20px; padding: 2px 14px; border-radius: 999px; color: var(--yellow); }
  .sfx { position: absolute; font-family: PromoBlack, sans-serif; font-weight: 900; font-size: 36px; line-height: 1; white-space: nowrap;
    -webkit-text-stroke: 9px var(--ink); paint-order: stroke fill; text-shadow: 0 4px 12px rgba(0,0,0,.55); display: none; }
  .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
  .ring { position: absolute; width: 62px; height: 62px; margin: -31px; border-radius: 50%; border: 4px solid #fff; background: rgba(229, 62, 48, .35);
    box-shadow: 0 0 0 3px var(--ink); box-sizing: border-box; }
  .rules { position: absolute; inset: 0; display: none; overflow: hidden; background: rgba(24, 26, 36, .42); }
  .pile { position: relative; width: 100%; height: 100%; }
  .rule-pill { position: absolute; left: 50%; width: 410px; background: var(--cream); color: var(--ink); border: 3.5px solid var(--ink); border-radius: 14px;
    box-shadow: 0 6px 0 var(--ink); font-family: PromoBlack, sans-serif; font-size: 19px; font-weight: 900; overflow: hidden; opacity: 0; }
  .rule-pill .band { background: var(--red); color: #fff; font-size: 12px; letter-spacing: .16em; padding: 2px 12px; text-align: center; }
  .rule-pill .txt { padding: 7px 14px; text-align: center; white-space: nowrap; }
  .big-stamp { position: absolute; left: 50%; top: 582px; transform: translate(-50%, -50%) rotate(-4deg) scale(.3); opacity: 0;
    background: var(--red); color: #fff; border: 5px solid var(--cream); border-radius: 18px; padding: 10px 26px; font-family: PromoBlack, sans-serif;
    font-size: 36px; font-weight: 900; box-shadow: 0 8px 0 var(--ink); white-space: nowrap; }
  .card.end { position: absolute; inset: 0; display: none; overflow: hidden; background: var(--ink); }
  .card.end .bg { position: absolute; inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; filter: blur(6px) brightness(.88); }
  .card.end .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(24,26,36,.35), rgba(24,26,36,.15) 35%, rgba(24,26,36,.52)); }
  .end-card { position: absolute; left: 26px; right: 26px; top: 104px; background: var(--cream); color: var(--ink); border: 4px solid var(--ink);
    border-radius: 26px; padding: 20px 16px 16px; text-align: center; box-shadow: 0 12px 0 var(--ink); }
  .end-pill { display: inline-block; background: var(--ink); color: var(--yellow); font-size: 15px; font-weight: 900; padding: 6px 16px; border-radius: 999px; letter-spacing: .08em; }
  .end-title { font-family: PromoBlack, sans-serif; font-size: 40px; font-weight: 900; color: var(--red); margin: 12px 0 8px; -webkit-text-stroke: 2px var(--ink); paint-order: stroke fill; white-space: nowrap; }
  .end-sub { font-size: 18px; font-weight: 900; margin: 0 0 14px; color: var(--ink); line-height: 1.4; }
  .end-badges { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 14px; }
  .end-badges b { font-size: 15px; font-weight: 900; padding: 7px 13px; border-radius: 999px; border: 2.5px solid var(--ink); background: #fff; color: var(--ink); display: inline-block; }
  .end-badges b:first-child { background: var(--yellow); }
  .end-url { display: inline-block; background: var(--blue); color: #fff; font-size: 23px; font-weight: 900; padding: 12px 22px; border-radius: 14px; border: 3px solid var(--ink); box-shadow: 0 4px 0 var(--ink); white-space: nowrap; }
  .end-note { margin: 12px auto 0; font-size: 14px; line-height: 1.4; color: #434857; font-weight: 700; white-space: pre-line; }
  </style>
  <div class="rules"><div class="pile"></div><div class="big-stamp">全部、逆をやれ！</div></div>
  <div class="card end"><img class="bg" src="/end.jpg" alt=""><div class="shade"></div>
    <div class="end-card"><span class="end-pill"></span><h1 class="end-title"></h1><p class="end-sub"></p><div class="end-badges"></div><div class="end-url"></div><p class="end-note"></p></div></div>
  <div class="cap cur"></div><div class="sfx"></div><div class="rings"></div><div class="flash"></div>
  <script>
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
  let D, current = -1;
  window.__setup = (data) => {
    D = data;
    $('.end-pill').textContent = data.end.pill; $('.end-title').textContent = data.end.title;
    $('.end-sub').textContent = data.end.sub; $('.end-url').textContent = data.end.url; $('.end-note').textContent = data.end.note;
    $('.end-badges').replaceChildren(...data.end.badges.map((t) => Object.assign(document.createElement('b'), { textContent: t })));
    const ys = [226, 296, 366, 436], rots = [-2.0, 1.8, -1.6, 2.0];
    $('.pile').replaceChildren(...data.rules.map((r, i) => {
      const el = document.createElement('div'); el.className = 'rule-pill';
      el.dataset.at = r.at; el.dataset.y = ys[i]; el.dataset.r = rots[i];
      el.innerHTML = '<div class="band">おねがい</div><div class="txt"></div>';
      el.querySelector('.txt').textContent = r.text.replace('おねがい：', '');
      return el;
    }));
  };
  window.__overflow = () => {
    const bad = [], box = (el) => el.getBoundingClientRect();
    const check = (el, r) => { if (r.width && (r.left < 12 || r.right > 528)) bad.push({ text: el.textContent, left: Math.round(r.left), right: Math.round(r.right) }); };
    for (const el of document.querySelectorAll('.cap span, .rule-pill, .big-stamp, .end-title, .end-url, .end-note')) check(el, box(el));
    const endBox = box($('.end-card'));
    if (endBox.height && endBox.bottom > 756) bad.push({ text: 'end-card-bottom', bottom: Math.round(endBox.bottom) });
    return bad;
  };
  const spans = (lines) => lines.map((t) => Object.assign(document.createElement('span'), { textContent: t }));
  window.__caption = (lines, top = 136, plate = false, compact = false) => {
    const el = $('.cap.cur'); el.style.top = top + 'px'; el.classList.toggle('plate', plate); el.classList.toggle('compact', compact);
    el.replaceChildren(...spans(lines));
    for (const s of el.querySelectorAll('span')) s.style.opacity = 1;
  };
  window.__endCard = (f) => {
    $('.rules').style.display = 'none';
    $('.card.end').style.display = 'block';
    const sc = D.storyboard.find((s) => s.card === 'end'), rel = f / D.fps - sc.start;
    $('.card.end .bg').style.transform = 'scale(' + (1.04 + 0.025 * clamp(rel / 4, 0, 1)) + ')';
    const pulse = 1 + 0.032 * Math.sin(Math.max(0, rel - 0.35) * 4.5);
    $('.end-url').style.transform = 'scale(' + pulse.toFixed(4) + ')';
    [...document.querySelectorAll('.end-badges b')].forEach((b, idx) => {
      const u = clamp((rel - (0.1 + idx * 0.14)) / 0.16, 0, 1);
      b.style.opacity = u;
      b.style.transform = 'scale(' + (0.72 + 0.28 * easeOut(u)).toFixed(4) + ')';
    });
    $('.cap.cur').style.visibility = 'hidden'; $('.sfx').style.display = 'none'; $('.rings').style.visibility = 'hidden'; $('.flash').style.visibility = 'hidden';
  };
  window.__noCard = () => { $('.card.end').style.display = 'none'; $('.cap.cur').style.visibility = 'visible'; $('.rings').style.visibility = 'visible'; $('.flash').style.visibility = 'visible'; };
  window.__frame = (f, rings) => {
    const tSec = f / D.fps;
    const rulesSc = D.storyboard.find((s) => s.card === 'rules');
    const inRules = rulesSc && tSec >= rulesSc.start && tSec < rulesSc.end;
    $('.rules').style.display = inRules ? 'block' : 'none';
    if (inRules) {
      [...document.querySelectorAll('.rule-pill')].forEach((el) => {
        const u = tSec - Number(el.dataset.at);
        const scPop = u < 0 ? 0.6 : 0.92 + 0.08 * easeOut(u / 0.14);
        el.style.opacity = u < 0 ? 0 : clamp(u / 0.06, 0, 1);
        el.style.top = el.dataset.y + 'px';
        el.style.transform = 'translate(-50%, 0) rotate(' + el.dataset.r + 'deg) scale(' + scPop + ')';
      });
      const stU = tSec - D.stampAt;
      const st = $('.big-stamp');
      st.style.opacity = stU < 0 ? 0 : 1;
      const stScale = stU < 0 ? 0.3 : stU < 0.14 ? 1.24 - 0.24 * easeOut(stU / 0.14) : 1;
      st.style.transform = 'translate(-50%, -50%) rotate(-4deg) scale(' + stScale + ')';
    }
    const segs = D.captions, i = segs.findIndex((s) => f >= s.from && f < s.to);
    if (i !== current) {
      $('.cap.cur').replaceChildren(...(i >= 0 ? spans(segs[i].lines) : []));
      if (i >= 0) { $('.cap.cur').style.top = segs[i].top + 'px'; $('.cap.cur').classList.toggle('plate', segs[i].plate); $('.cap.cur').classList.toggle('compact', segs[i].compact); }
      current = i;
    }
    if (i >= 0) {
      const ageFrames = f - segs[i].from + (segs[i].from === 0 ? 6 : 0);
      const pop = ageFrames < 6 ? 1.12 - 0.12 * easeOut(ageFrames / 6) : 1;
      const u = easeOut(ageFrames / 3);
      $('.cap.cur').style.transform = 'scale(' + pop + ')';
      for (const el of $('.cap.cur').querySelectorAll('span')) { el.style.opacity = 0.85 + 0.15 * u; }
    }
    const sfx = D.sfx.find((x) => tSec >= x.from && tSec < x.to);
    const sfxEl = $('.sfx');
    if (sfx) {
      const age = tSec - sfx.from;
      const sc = age < 0.12 ? 1.28 - 0.28 * easeOut(age / 0.12) : 1;
      sfxEl.textContent = sfx.text;
      sfxEl.style.display = 'block';
      sfxEl.style.top = sfx.top + 'px';
      sfxEl.style.left = sfx.left != null ? sfx.left + 'px' : 'auto';
      sfxEl.style.right = sfx.right != null ? sfx.right + 'px' : 'auto';
      sfxEl.style.color = sfx.color;
      sfxEl.style.transform = 'rotate(' + sfx.rot + 'deg) scale(' + sc + ')';
    } else {
      sfxEl.style.display = 'none';
    }
    let flash = 0;
    for (const [at, str] of D.flashes) { const dt = (f - Math.round(at * D.fps)) / D.fps; if (dt >= 0) flash = Math.max(flash, str * Math.exp(-dt / 0.09)); }
    $('.flash').style.opacity = flash < 0.004 ? 0 : flash;
    $('.rings').replaceChildren(...rings.map((m) => { const el = document.createElement('div'); el.className = 'ring'; Object.assign(el.style, { left: m.x + 'px', top: m.y + 'px', opacity: m.o, transform: 'scale(' + m.s + ')' }); return el; }));
    return i >= 0 ? Math.max(0, ...[...$('.cap.cur').querySelectorAll('span')].map((el) => Number(el.style.opacity))) : null;
  };
  </script></html>`;
}

async function shootOverlay(browser) {
  const ovDir = cleanDir(join(framesDir, 'overlay'));
  const cdDir = cleanDir(join(framesDir, 'cards'));
  const captions = captionPlan();
  const rings = ringPlan();
  const endImage = fname('combo', 35);
  if (!existsSync(endImage)) throw new Error(`背景コマがありません: ${endImage}`);
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  await page.route('**/*', (route) => {
    const p = new URL(route.request().url()).pathname;
    const files = { '/font.ttf': [font, 'font/ttf'], '/font-black.ttf': [fontBlack, 'font/ttf'], '/end.jpg': [endImage, 'image/jpeg'] };
    if (p === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: overlayHtml() });
    if (files[p]) return route.fulfill({ contentType: files[p][1], body: readFileSync(files[p][0]) });
    return route.abort();
  });
  try {
    await page.goto('http://promo.local/');
    await page.evaluate(async () => {
      await document.fonts.load('700 30px Promo');
      await document.fonts.load('900 30px PromoBlack');
      await document.fonts.ready;
      await Promise.all([...document.images].map((im) => (im.complete ? null : new Promise((r) => { im.onload = r; im.onerror = r; }))));
    });
    await page.evaluate((data) => window.__setup(data), {
      storyboard: STORYBOARD, captions, end: END_CARD, flashes: FLASHES, fps: FPS, rules: RULE_PILLS, stampAt: STAMP_AT, sfx: ONOMATOPOEIA,
    });
    const overflow = [];
    for (const c of captions) {
      await page.evaluate((x) => window.__caption(x.lines, x.top, x.plate, x.compact), c);
      overflow.push(...await page.evaluate(() => window.__overflow()));
    }
    const endSc = STORYBOARD.find((s) => s.card === 'end');
    await page.evaluate((f) => window.__endCard(f), frameAt(endSc.end) - 1);
    overflow.push(...await page.evaluate(() => window.__overflow()));
    await page.evaluate(() => window.__noCard());
    await page.evaluate((f) => window.__frame(f, []), frameAt(3.5));
    overflow.push(...await page.evaluate(() => window.__overflow()));
    if (overflow.length) throw new Error(`字幕・文字が画面からはみ出します: ${JSON.stringify(overflow)}`);

    for (let f = frameAt(endSc.start); f < frameAt(endSc.end); f++) {
      await page.evaluate((ff) => window.__endCard(ff), f);
      await page.screenshot({ path: join(cdDir, `c${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    }
    await page.evaluate(() => window.__noCard());
    const gaps = [];
    for (let f = 0; f < TOTAL; f++) {
      const sc = STORYBOARD.find((s) => f >= frameAt(s.start) && f < frameAt(s.end));
      const shown = await page.evaluate(([ff, r]) => window.__frame(ff, r), [f, rings[f]]);
      if (sc.lines.length && (shown === null || shown < 0.5)) gaps.push(f);
      await page.screenshot({ path: join(ovDir, `o${String(f).padStart(5, '0')}.png`), omitBackground: true });
    }
    stats.captionGapFrames = gaps;
    stats.captions = captions.map((c) => ({ id: c.id, from: +(c.from / FPS).toFixed(2), to: +(c.to / FPS).toFixed(2), text: c.lines.join(' ') }));
    stats.frames.overlay = TOTAL;
  } finally {
    await ctx.close();
  }
}

const silentName = OUT_NAME('silent');

function baseFrame(f) {
  const sec = f / FPS;
  const sc = STORYBOARD.find((s) => f >= frameAt(s.start) && f < frameAt(s.end));
  if (sc.card === 'end') return join(framesDir, 'cards', `c${String(f).padStart(5, '0')}.jpg`);
  const tk = takeForTime(sc, sec);
  return fname(tk, f - frameAt(TAKES[tk].from));
}

function buildStrip(silent, outFile, frameList, cols = 4) {
  const rows = Math.ceil(frameList.length / cols);
  execFileSync(ffmpeg, [
    '-v', 'error', '-y', '-i', silent,
    '-vf', `select='${frameList.map((n) => `eq(n\\,${n})`).join('+')}',scale=270:480,tile=${cols}x${rows}:padding=4:color=0x181a24`,
    '-vsync', '0', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', outFile,
  ]);
}

function compose() {
  const base = cleanDir(join(framesDir, 'base'));
  for (let f = 0; f < TOTAL; f++) {
    const src = baseFrame(f);
    if (!existsSync(src)) throw new Error(`コマ欠損: ${src}`);
    symlinkSync(src, join(base, `b${String(f).padStart(5, '0')}.jpg`));
  }
  const rgba = cleanDir(join(framesDir, 'overlay-rgba'));
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(framesDir, 'overlay', 'o%05d.png'), '-vf', 'format=rgba', '-start_number', '0', join(rgba, 'o%05d.png')]);
  mkdirSync(outDir, { recursive: true });
  const silent = join(outDir, silentName);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(FPS), '-i', join(base, 'b%05d.jpg'),
    '-framerate', String(FPS), '-i', join(rgba, 'o%05d.png'),
    '-filter_complex', '[0:v]scale=1080:1920:flags=lanczos,format=rgba,setsar=1[b];[b][1:v]overlay=0:0:format=auto,scale=out_color_matrix=bt709:out_range=tv:flags=lanczos,format=yuv420p[v]',
    '-map', '[v]', '-frames:v', String(TOTAL), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart', '-map_metadata', '-1', silent], { stdio: 'inherit' });

  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-frames:v', '1', '-map_metadata', '-1', join(outDir, 'first-frame.png')]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', 'fps=1,scale=270:480,tile=6x5:padding=6:color=0x181a24', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'contact-sheet.jpg')]);
  const gray = (n) => execFileSync(ffmpeg, ['-v', 'error', '-i', silent, '-vf', `select=eq(n\\,${n}),scale=270:480,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  const [g0, g1] = [gray(0), gray(1)];
  let diff = 0; for (let i = 0; i < g0.length; i++) diff += Math.abs(g0[i] - g1[i]);
  stats.firstFrameMotion = { frames0to1MeanAbsDiff: +(diff / g0.length).toFixed(3) };
  if (diff === 0) throw new Error('1コマ目が動いていません');
  const cuts = [...new Set(STORYBOARD.slice(1).map((s) => frameAt(s.start)))];
  for (let p = 0; p < cuts.length; p += 6) {
    const chunk = cuts.slice(p, p + 6);
    const picks = chunk.flatMap((c) => [c - 2, c - 1, c, c + 1]);
    const pageIdx = Math.floor(p / 6) + 1;
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', `select='${picks.map((n) => `eq(n\\,${n})`).join('+')}',scale=270:480,tile=4x${chunk.length}:padding=4:color=0x181a24`, '-vsync', '0', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, `cut-check-${pageIdx}.jpg`)]);
  }

  // 全コマ走査: カメラの看板・棚・缶めり込み（画面の50%以上が単一色で埋まるコマ）を自動検出
  const w = 90, h = 160, pxCount = w * h, frameBytes = pxCount * 3;
  const raw = execFileSync(ffmpeg, ['-v', 'error', '-i', join(base, 'b%05d.jpg'), '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
  const ranked = [];
  const flagged = [];
  for (let f = 0; f < TOTAL; f++) {
    const sec = +(f / FPS).toFixed(2);
    const sc = STORYBOARD.find((s) => f >= frameAt(s.start) && f < frameAt(s.end));
    const tk = sc.card === 'end' ? 'end' : takeForTime(sc, sec);
    const buckets = new Map();
    const off = f * frameBytes;
    let bestKey = 0, bestCount = 0;
    for (let i = 0; i < pxCount; i++) {
      const idx = off + i * 3;
      const r = raw[idx] >> 4, g = raw[idx + 1] >> 4, b = raw[idx + 2] >> 4;
      const key = (r << 8) | (g << 4) | b;
      const c = (buckets.get(key) ?? 0) + 1;
      buckets.set(key, c);
      if (c > bestCount) { bestCount = c; bestKey = key; }
    }
    const ratio = +(bestCount / pxCount).toFixed(4);
    const rgb = [((bestKey >> 8) & 15) * 16 + 8, ((bestKey >> 4) & 15) * 16 + 8, (bestKey & 15) * 16 + 8];
    const row = { frame: f, sec, take: tk, ratio, dominantRgb: rgb };
    if (tk !== 'end' && tk !== 'results' && tk !== 'friends') {
      ranked.push(row);
      if (ratio >= 0.5) flagged.push(row);
    }
  }
  ranked.sort((a, b) => b.ratio - a.ratio);
  const occReport = { scannedFrames: TOTAL, threshold: 0.5, flaggedCount: flagged.length, flagged, top10GameplayFrames: ranked.slice(0, 10) };
  writeFileSync(join(outDir, 'occlusion-report.json'), `${JSON.stringify(occReport, null, 2)}\n`);
  log('遮蔽走査', JSON.stringify({ flaggedCount: flagged.length, maxRatio: ranked[0]?.ratio ?? 0, atFrame: ranked[0]?.frame ?? null }));
  if (flagged.length) throw new Error(`単色占有50%以上のめり込みコマ検出: ${JSON.stringify(flagged.slice(0, 5))}`);

  // 詳細確認用ストリップ（衝撃点・字幕が出る代表コマ）
  const stripsDir = cleanDir(join(outDir, 'strips'));
  buildStrip(silent, join(stripsDir, '01_pyramid_rules.jpg'), [0, 6, 35, 50, 75, 95, 108, 118]);
  buildStrip(silent, join(stripsDir, '02_sweep_cart.jpg'), [123, 140, 155, 175, 185, 200, 215, 232]);
  buildStrip(silent, join(stripsDir, '03_bowling.jpg'), [245, 265, 290, 300, 305, 315, 335, 350]);
  buildStrip(silent, join(stripsDir, '04_banana_s6.jpg'), [362, 368, 378, 398, 425, 442, 456, 472]);
  buildStrip(silent, join(stripsDir, '05_combo_chase.jpg'), [485, 505, 525, 550, 585, 624, 632, 650]);
  buildStrip(silent, join(stripsDir, '06_results_end.jpg'), [662, 682, 700, 710, 740, 768, 795, 860]);
}

function mux(variant) {
  const src = ['wav', 'mp3'].map((ext) => join(outDir, `bgm_${variant}.${ext}`)).find(existsSync);
  if (!src) throw new Error(`BGM がありません: ${join(outDir, `bgm_${variant}.wav`)}`);
  const out = join(outDir, OUT_NAME(variant));
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(outDir, silentName), '-i', src,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-af', `apad=whole_dur=${DURATION_SECONDS}`, '-t', String(DURATION_SECONDS), '-movflags', '+faststart', '-map_metadata', '-1', out]);
  return out;
}

function probe(file) {
  const p = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = p.streams.find((s) => s.codec_type === 'video'), a = p.streams.find((s) => s.codec_type === 'audio');
  const decode = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  const seconds = Number(p.format.duration), silent = file.endsWith(silentName);
  const ok = v.width === 1080 && v.height === 1920 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.r_frame_rate === '30/1'
    && Math.abs(seconds - DURATION_SECONDS) <= 1 / FPS + 0.002 && decode.trim() === ''
    && (silent ? !a : a?.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2);
  const row = { file: basename(file), ok, size: `${v.width}x${v.height}`, fps: v.r_frame_rate, seconds: +seconds.toFixed(3), bytes: statSync(file).size, audio: a ? `${a.codec_name} ${a.sample_rate}Hz` : 'なし' };
  log(ok ? '検品OK' : '検品NG', JSON.stringify(row));
  if (!ok) throw new Error(`検品NG: ${file}`);
  return row;
}

mkdirSync(framesDir, { recursive: true });
const srvInfo = await startDistServer(port);
const srv = srvInfo.srv;
origin = srvInfo.origin;
const SHOOT = {
  pyramid: shootPyramid, sweep: shootSweep, cart: shootCart, bowling: shootBowling,
  banana: shootBanana, samples: shootSamples, freezer: shootFreezer, combo: shootCombo,
  chase: shootChase, results: shootResults, showdown: shootShowdown,
};
const toShoot = Object.keys(SHOOT).filter(wanted);
let browser = null;
const outputs = [];
try {
  if (toShoot.length || (wanted('overlay') && !flag('--no-compose'))) browser = await chromium.launch({ args: GPU_ARGS });
  for (const name of toShoot) { log('撮影開始', name); await SHOOT[name](browser); }
  if (wanted('overlay') && !flag('--no-compose')) { log('オーバーレイ生成'); await shootOverlay(browser); }
} finally {
  await browser?.close().catch(() => {});
  srv.close();
}

if (!flag('--no-compose')) {
  log('動画合成');
  compose();
  outputs.push(probe(join(outDir, silentName)));
  for (const v of (arg('--mux', '') || '').split(',').filter(Boolean)) outputs.push(probe(mux(v)));
}

const reportFile = join(framesDir, 'capture-report.json');
const prev = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : {};
const report = {
  seconds: DURATION_SECONDS, fps: FPS, width: 1080, height: 1920, bpm: BPM,
  publicUrl: PUBLIC_URL, network: toShoot.length ? { requests: stats.requests, local: stats.local, blocked: stats.blocked.length } : prev.network,
  localAddressSeen: toShoot.length ? stats.localAddressSeen : prev.localAddressSeen,
  takes: { ...prev.takes, ...stats.takes }, framesShot: { ...prev.framesShot, ...stats.frames },
  captions: stats.captions ?? prev.captions, captionGapFrames: stats.captionGapFrames ?? prev.captionGapFrames,
  firstFrameMotion: stats.firstFrameMotion ?? prev.firstFrameMotion,
  consoleWarnings: toShoot.length ? stats.warnings : prev.consoleWarnings,
  outputs,
};
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
if (!flag('--no-compose')) writeFileSync(join(outDir, 'capture-report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (flag('--clean') && !flag('--no-compose')) {
  for (const d of [...Object.keys(SHOOT), 'overlay', 'overlay-rgba', 'cards', 'base']) rmSync(join(framesDir, d), { recursive: true, force: true });
}
log('完了', JSON.stringify({ warnings: report.consoleWarnings?.length ?? 0, outputs: outputs.map((o) => o.file) }));
