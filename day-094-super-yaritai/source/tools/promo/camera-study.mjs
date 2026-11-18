// カメラ候補の試し撮り：8つの場面を、同じ物理状態のまま標準・中寄り・寄って低い3視点で比較する。
// 使い方:
//   node tools/promo/camera-study.mjs
//   node tools/promo/camera-study.mjs --only pyramid
//   node tools/promo/camera-study.mjs --sheet-only
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { FPS, TAKES, frameAt } from './timeline.mjs';
import {
  GPU_ARGS, ROOT, VIEW, checkLocalText, chromium, cleanDir, ffmpeg,
  runBanana, runBowling, runCart, runChase, runCombo, runFreezer, runPyramid, runSweep,
  startDistServer,
} from './shared.mjs';

const arg = (name, fb) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fb; };
const flag = (name) => process.argv.includes(name);
const only = (arg('--only', '') || '').split(',').filter(Boolean);
const port = Number(arg('--port', 4401));
const outDir = resolve(ROOT, 'out/study-r2');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const MOMENTS = ['pyramid', 'sweep', 'cart', 'bowling', 'banana', 'freezer', 'combo', 'chase'];
const CANDIDATES = ['R1', 'A', 'B'];

const round3 = (n) => Math.round(n * 1000) / 1000;
const roundVec = (v) => v.map(round3);

/** 定義式 pos = T + d * [sinθ cosφ, sinφ, cosθ cosφ] から CameraPose を組み立てる */
function computePose(T, { theta, phi, d, fov, lookOffset = [0, 0, 0] }) {
  const th = (theta * Math.PI) / 180;
  const ph = (phi * Math.PI) / 180;
  const pos = [
    T[0] + d * Math.sin(th) * Math.cos(ph),
    T[1] + d * Math.sin(ph),
    T[2] + d * Math.cos(th) * Math.cos(ph),
  ];
  const look = [T[0] + lookOffset[0], T[1] + lookOffset[1], T[2] + lookOffset[2]];
  return { pos: roundVec(pos), look: roundVec(look), fov };
}

/** 場面ごとのカメラ候補（中寄り・寄って低い視点） */
const STUDY_CONFIG = {
  pyramid: {
    label: 'pyramid (缶ピラミッド爆散)',
    targetOffset: (st) => [st.players[0].pos.x, 0.8, st.players[0].pos.z - 1.1],
    A: { theta: 18, phi: 42, d: 9.5, fov: 50 },
    B: { theta: 162, phi: 24, d: 5.8, fov: 62 },
  },
  sweep: {
    label: 'sweep (棚なぎ払い)',
    targetOffset: (st) => [st.players[0].pos.x, 0.8, st.players[0].pos.z],
    A: { theta: 16, phi: 44, d: 9.5, fov: 50, lookOffset: [0.3, 0.2, -0.8] },
    B: { theta: 24, phi: 24, d: 5.6, fov: 62, lookOffset: [0.4, 0.1, -0.6] },
  },
  cart: {
    label: 'cart (カート爆走)',
    targetOffset: (st) => [st.players[0].pos.x, 0.8, st.players[0].pos.z],
    A: { theta: 24, phi: 42, d: 9.5, fov: 50, lookOffset: [-0.4, 0.1, 0] },
    B: { theta: 132, phi: 24, d: 5.5, fov: 62, lookOffset: [-0.4, 0.0, 0] },
  },
  bowling: {
    label: 'bowling (スイカ命中・ピン飛散)',
    targetOffset: () => [8.5, 0.7, -7.0],
    A: { theta: 10, phi: 42, d: 9.5, fov: 50 },
    B: { theta: 168, phi: 23, d: 5.4, fov: 62, lookOffset: [0, 0.15, 0.5] },
  },
  banana: {
    label: 'banana (店員スリップ宙浮き)',
    targetOffset: (st) => {
      const clerk = st.npcs.find((n) => n.id === 0) ?? st.players[0];
      return [clerk.pos.x, 0.9, clerk.pos.z];
    },
    A: { theta: 14, phi: 42, d: 9.2, fov: 50 },
    B: { theta: 28, phi: 22, d: 6.2, fov: 60, lookOffset: [0, -0.45, 0] },
  },
  freezer: {
    label: 'freezer (冷凍ケース飛び込み)',
    targetOffset: (st) => [st.players[0].pos.x, 0.85, st.players[0].pos.z],
    A: { theta: -16, phi: 42, d: 9.0, fov: 50 },
    B: { theta: -48, phi: 22, d: 4.5, fov: 58 },
  },
  combo: {
    label: 'combo (コンボ×3.0達成)',
    targetOffset: (st) => [st.players[0].pos.x, 1.0, st.players[0].pos.z],
    A: { theta: 28, phi: 42, d: 9.5, fov: 50 },
    B: { theta: 112, phi: 24, d: 5.3, fov: 60, lookOffset: [0, 0, 0.35] },
  },
  chase: {
    label: 'chase (店員追走)',
    targetOffset: (st) => [st.players[0].pos.x, 0.9, st.players[0].pos.z],
    A: { theta: 10, phi: 42, d: 9.2, fov: 50, lookOffset: [0, 0.2, -1.0] },
    B: { theta: 12, phi: 22, d: 5.4, fov: 62, lookOffset: [0, 0.2, -0.8] },
  },
};

/** 同じ物理状態のまま標準 → 中寄り → 寄って低い視点の順に撮る（追従の履歴を保つため標準を最初にする） */
async function captureMomentTriplet(page, moment, k, st, records) {
  const cfg = STUDY_CONFIG[moment];
  const T = cfg.targetOffset(st);
  const poseA = computePose(T, cfg.A);
  const poseB = computePose(T, cfg.B);

  const shotPath = (cand) => join(outDir, `${moment}_${cand}.jpg`);
  await page.screenshot({ path: shotPath('R1'), type: 'jpeg', quality: 92, timeout: 60_000 });
  await checkLocalText(page, moment, k);

  for (const [cand, pose] of [['A', poseA], ['B', poseB]]) {
    const afterSt = await page.evaluate((p) => {
      window.__SY__.camera(p);
      window.__promoStep(0);
      return window.__SY__.state();
    }, pose);
    // 物理が進んでいないことを確かめる
    if (Math.abs(afterSt.timeLeft - st.timeLeft) > 1e-6) {
      throw new Error(`${moment} ${cand}: __promoStep(0) で時間が進みました (${st.timeLeft} -> ${afterSt.timeLeft})`);
    }
    await page.screenshot({ path: shotPath(cand), type: 'jpeg', quality: 92, timeout: 60_000 });
  }

  records[moment] = {
    frame: k,
    timeLeft: st.timeLeft,
    playerPos: st.players[0].pos,
    combo: st.players[0].combo,
    score: st.players[0].score,
    T: roundVec(T),
    R1: { note: '標準追従カメラ (camera(null))' },
    A: { ...cfg.A, ...poseA },
    B: { ...cfg.B, ...poseB },
  };
  log(`撮影完了 ${moment} (k=${k})`, JSON.stringify({ A: poseA, B: poseB }));
}

function makeCaptureHook(moment, shouldCapture, records) {
  let captured = false;
  let last = null;
  return async (page, _take, nFrames, perFrameFn) => {
    for (let k = 0; k < nFrames; k++) {
      last = await perFrameFn(k);
      if (!captured && shouldCapture(k, last)) {
        captured = true;
        await captureMomentTriplet(page, moment, k, last, records);
        break;
      }
    }
    if (!captured) throw new Error(`${moment}: 撮影タイミングが見つかりませんでした (nFrames=${nFrames})`);
    return last;
  };
}

function buildSheet() {
  const missing = [];
  for (const m of MOMENTS) {
    for (const c of CANDIDATES) {
      const p = join(outDir, `${m}_${c}.jpg`);
      if (!existsSync(p)) missing.push(p);
    }
  }
  if (missing.length) {
    log(`sheet.jpg スキップ（未撮影あり: ${missing.length} 件）`);
    return;
  }

  const fontBold = join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
  const fontOpt = existsSync(fontBold) ? `:fontfile='${fontBold.replace(/'/g, "\\'")}'` : '';
  const cellW = 270;
  const cellH = 480;
  const labelW = 190;
  const gap = 8;
  const rowH = cellH;

  // 24 枚を入力し、各行の左に瞬間名の帯を置いて 8 行×3 列に並べる
  const inputs = [];
  const filters = [];
  let idx = 0;
  const rowNodes = [];
  for (let r = 0; r < MOMENTS.length; r++) {
    const m = MOMENTS[r];
    const cellNodes = [];
    for (let c = 0; c < CANDIDATES.length; c++) {
      inputs.push('-i', join(outDir, `${m}_${CANDIDATES[c]}.jpg`));
      const node = `[c_${r}_${c}]`;
      filters.push(`[${idx}:v]scale=${cellW}:${cellH}:flags=lanczos,setsar=1${node}`);
      cellNodes.push(node);
      idx++;
    }
    const labelNode = `[lbl_${r}]`;
    const safeText = m.toUpperCase();
    filters.push(
      `color=c=0x181a24:s=${labelW}x${rowH}:d=1,drawtext=text='${safeText}'${fontOpt}:fontcolor=white:fontsize=26:x=18:y=(h-text_h)/2${labelNode}`,
    );
    const rowNode = `[row_${r}]`;
    filters.push(
      `${labelNode}${cellNodes.join('')}hstack=inputs=4,pad=iw:ih+${gap}:0:0:color=0x181a24${rowNode}`,
    );
    rowNodes.push(rowNode);
  }
  filters.push(`${rowNodes.join('')}vstack=inputs=${MOMENTS.length}[sheet]`);

  const sheetPath = join(outDir, 'sheet.jpg');
  execFileSync(
    ffmpeg,
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      ...inputs,
      '-filter_complex', filters.join(';'),
      '-map', '[sheet]',
      '-frames:v', '1',
      '-update', '1',
      '-q:v', '3',
      '-map_metadata', '-1',
      sheetPath,
    ],
    { stdio: 'inherit' },
  );
  log('sheet.jpg 生成完了', sheetPath);
}

const RUNNERS = {
  pyramid: async (browser, env, records) => {
    const kickF = Math.round(TAKES.pyramid.kickAt * FPS); // 6
    await runPyramid(browser, env, makeCaptureHook('pyramid', (k) => k === kickF + 4, records));
  },
  sweep: async (browser, env, records) => {
    await runSweep(browser, env, makeCaptureHook('sweep', (k) => k === 21, records));
  },
  cart: async (browser, env, records) => {
    const { openMatch, tick } = await import('./shared.mjs');
    const { ctx, page } = await openMatch(browser, env.origin, 'cart', { stats: env.stats });
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
      for (let i = 0; i < 20; i++) await tick(page, { moveZ: -1, moveX: -0.2, dash: true }, 2);
      for (let i = 0; i < 16; i++) await tick(page, { moveX: -1, moveZ: -0.1, dash: true }, 2);
      let prevScore = (await page.evaluate(() => window.__SY__.state())).players[0].score;
      let captured = false;
      for (let k = 0; k < 60; k++) {
        const st = await tick(page, { moveX: -1, moveZ: k < 28 ? 0.12 : -0.18, dash: true }, 2);
        const delta = st.players[0].score - prevScore;
        prevScore = st.players[0].score;
        if (delta >= 25 || k === 48) {
          log(`cart候補 k=${k} delta=${delta} pos=${JSON.stringify(st.players[0].pos)} score=${st.players[0].score}`);
        }
        if (!captured && (delta >= 25 || k === 48)) {
          captured = true;
          await captureMomentTriplet(page, 'cart', k, st, records);
          break;
        }
      }
    } finally {
      await ctx.close();
    }
  },
  bowling: async (browser, env, records) => {
    const impactF = frameAt(TAKES.bowling.impactAt) - frameAt(TAKES.bowling.from); // 60
    await runBowling(browser, env, makeCaptureHook('bowling', (k) => k === impactF + 12, records));
  },
  banana: async (browser, env, records) => {
    let slipK = null;
    await runBanana(browser, env, makeCaptureHook('banana', (k, st) => {
      if (slipK === null && (st.npcs.some((npc) => npc.state === 'slipped' || npc.anim === 'slip') || st.players[0].secrets?.includes('secret-staff-slip'))) {
        slipK = k;
      }
      return slipK !== null && k === slipK + 3;
    }, records));
  },
  freezer: async (browser, env, records) => {
    await runFreezer(browser, env, makeCaptureHook('freezer', (k) => k === 4, records), { viewport: VIEW, clip: null });
  },
  combo: async (browser, env, records) => {
    await runCombo(browser, env, makeCaptureHook('combo', (k, st) => (st.players[0].combo?.multiplier ?? 1) >= 3.0 && k >= 16, records));
  },
  chase: async (browser, env, records) => {
    // 逮捕直前（店員が主役のすぐ後ろに迫っている瞬間）を撮る
    await runChase(browser, env, makeCaptureHook('chase', (k, st) => {
      const me = st.players[0];
      const clerk = st.npcs.find((n) => n.id === 1);
      if (!clerk) return false;
      const d = Math.hypot(clerk.pos.x - me.pos.x, clerk.pos.z - me.pos.z);
      return (k >= 45 && d < 2.1 && me.caught === 0) || k === 74;
    }, records));
  },
};

mkdirSync(outDir, { recursive: true });
const metaPath = join(outDir, 'study-meta.json');
const existingMeta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
const records = { ...existingMeta };

if (!flag('--sheet-only')) {
  const targets = only.length ? MOMENTS.filter((m) => only.includes(m)) : MOMENTS;
  if (!targets.length) throw new Error(`未知の --only 指定: ${only.join(',')}`);
  const { srv, origin } = await startDistServer(port);
  const stats = { requests: 0, local: 0, blocked: [], warnings: [], localAddressSeen: [] };
  let browser = null;
  try {
    browser = await chromium.launch({ args: GPU_ARGS });
    for (const m of targets) {
      log(`開始 ${m}`);
      await RUNNERS[m](browser, { origin, stats }, records);
    }
    if (stats.blocked.length) throw new Error(`外部通信を検出: ${stats.blocked.join(', ')}`);
    if (stats.warnings.length) log('警告', JSON.stringify(stats.warnings));
  } finally {
    await browser?.close().catch(() => {});
    srv.close();
  }
  writeFileSync(metaPath, `${JSON.stringify(records, null, 2)}\n`);
}

buildSheet();
