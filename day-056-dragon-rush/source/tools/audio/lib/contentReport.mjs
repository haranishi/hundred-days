// OWNER: audio-tools
// 音の中身の報告（tools/audio-render.mjs の content の部。r02-audio で足した）：
// 効果音の重さ（低域が1本の音に寄る度合い・250Hz〜2kHz の比率）、よく鳴る短い音の変化（包絡の相関・長さの幅）、
// 咆哮の声らしさ（120Hz 未満の比率・F1/F2 の動き・止まった山）を音ごとに測り、怪獣3体の咆哮と足音を並べた図を作る。
// --assets で別の置き場（前の周の写しなど）を測れるので、前後を同じ物差しで並べられる。
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { audibleSeconds, bandProfile, envelopeSimilarity, formantMotion, lowToneConcentration, pitchMedian, rosterDistance, staticPeakDb } from './content.mjs';
import { FFMPEG, decodeFile, writeWav } from './io.mjs';

const SR = 48000;
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null);
const r1 = (x) => Math.round(x * 10) / 10;

/** 胴の重さを見る音（S3）と、低域を見る窓の長さ（秒）。 */
// r05-audio：近い技の音は怪獣ごと（clawHit など）。r04 までの置き場（attack/ の共用）を測るときは resolve が attack/ へ落とす
const WEIGHT_BANKS = { 'building/collapseNear': 3, 'building/collapseFar': 3, 'building/tilt': 3, 'building/peel': 0.5, clawHit: 0.5, tailHit: 0.5, land: 0.5, landHeavy: 3, stepHind: 0.5, stepFront: 0.5, step: 0.5 };
/** 変化を見る音（S4）。r06-audio：短い咆哮（焔角は踏み切りで3分に約11回鳴る）を足した */
const VARIETY_BANKS = ['stepHind', 'stepFront', 'step', 'flap', 'clawSwing', 'tailSwing', 'breathStart', 'fire/ignite', 'fire/spread', 'building/collapseNear', 'roar', 'roarShort', 'building/crack', 'building/glass', 'arc', 'breathHit'];
/** 怪獣どうしの差を見る音（r05-audio：メル64帯の平均スペクトル。足音・重い着地・近い技を怪獣ごとに聞き分けられるか） */
const ROSTER_BANKS = ['roar', 'roarShort', 'stepHind', 'stepFront', 'land', 'landHeavy', 'breathStart', 'clawSwing', 'clawHit', 'tailSwing', 'tailHit'];

function resolve(manifest, key) {
  if (manifest.sfx[key]) return [key];
  // 怪獣の音は、目録にいる怪獣の数だけ
  const own = (manifest.monsters ?? []).map((m) => `${m}/${key}`).filter((k) => manifest.sfx[k]);
  if (own.length) return own;
  // r04 までの近い技は attack/ の共用
  return manifest.sfx[`attack/${key}`] ? [`attack/${key}`] : [];
}

/** 怪獣ごとの音の変化（その怪獣に無ければ attack/ の共用を3体とも使っていた、r04 まで）。 */
function monsterVariants(manifest, key, load) {
  const out = {};
  for (const m of manifest.monsters ?? []) {
    const bank = manifest.sfx[`${m}/${key}`] ? `${m}/${key}` : manifest.sfx[`attack/${key}`] ? `attack/${key}` : null;
    if (bank) out[m] = load(bank);
  }
  return out;
}

/** 音ごとの中身の数値を measure し、content.json に書く。assetsDir は OGG の置き場、outDir は .captures/<周>/audio。 */
export async function contentPart(manifest, assetsDir, outDir) {
  const cache = new Map();
  const load = (bank) => {
    if (!cache.has(bank)) cache.set(bank, manifest.sfx[bank].variants.map((v) => decodeFile(path.join(assetsDir, v.file))));
    return cache.get(bank);
  };
  const weight = {};
  for (const [key, win] of Object.entries(WEIGHT_BANKS)) {
    for (const bank of resolve(manifest, key)) {
      const vs = load(bank);
      const conc = vs.map((s) => lowToneConcentration(s, 0, win));
      const bp = vs.map((s) => bandProfile(s));
      weight[bank] = {
        window: win,
        lowToneShare: avg(conc.map((c) => c.whole)),
        lowToneShareFrames: avg(conc.map((c) => c.frames)),
        below60: avg(bp.map((b) => b.rawBelow60)),
        k250to1kDb: r1(avg(bp.map((b) => b.k250to1kDb))),
        k250to2kDb: r1(avg(bp.map((b) => b.k250to2kDb))),
        kAbove250Db: r1(avg(bp.map((b) => b.kAbove250Db))),
      };
    }
  }
  const variety = {};
  for (const key of VARIETY_BANKS) {
    for (const bank of resolve(manifest, key)) {
      const vs = load(bank);
      if (vs.length < 2) continue;
      const e2 = envelopeSimilarity(vs, 2);
      const ea = envelopeSimilarity(vs, 'auto');
      variety[bank] = { variants: vs.length, envCorrDb: e2.db, envCorrLinear: e2.linear, envCorrDbAuto: ea.db, audibleSec: e2.audibleSec, lengthSpreadPct: e2.lengthSpreadPct };
    }
  }
  const voices = {};
  for (const bank of resolve(manifest, 'roar')) {
    const rows = load(bank).map((s) => {
      const fm = formantMotion(s);
      return { below120: bandProfile(s).rawBelow120, pitchHz: pitchMedian(s), f1: fm.f1, f2: fm.f2, f1SwingLatePct: fm.f1SwingAfterHalfSecPct, f2SwingLatePct: fm.f2SwingAfterHalfSecPct, staticPeakDb: staticPeakDb(s, [1300, 1900, 2700]) };
    });
    voices[bank] = {
      below120: avg(rows.map((r) => r.below120)),
      pitchHz: r1(avg(rows.map((r) => r.pitchHz))),
      f1SwingPct: Math.round(avg(rows.map((r) => r.f1?.swingPct ?? 0))),
      f2SwingPct: Math.round(avg(rows.map((r) => r.f2?.swingPct ?? 0))),
      staticPeak1300Db: r1(avg(rows.map((r) => r.staticPeakDb['1300Hz']))),
      staticPeak2700Db: r1(avg(rows.map((r) => r.staticPeakDb['2700Hz']))),
      variants: rows,
    };
  }
  const roster = await rosterImage(manifest, assetsDir, outDir, load);
  const rosterDistances = {};
  for (const key of ROSTER_BANKS) {
    const byMonster = monsterVariants(manifest, key, load);
    if (Object.keys(byMonster).length >= 2) rosterDistances[key] = rosterDistance(byMonster);
  }
  const out = { assets: path.relative(process.cwd(), assetsDir), weight, variety, voices, roster, rosterDistances };
  await writeFile(path.join(outDir, 'content.json'), JSON.stringify(out, null, 1));
  return out;
}

/**
 * 怪獣3体（目録にいる全員）の咆哮と足音を並べた図：1体1段で、咆哮（頭 4.5 秒）→ 後ろ足・前足・後ろ足・前足の足音。
 * 同じ尺・同じ色の目盛りで描くので、声の高さ・胸の鳴り・足音の低さと長さを並べて比べられる。
 */
async function rosterImage(manifest, assetsDir, outDir, load) {
  const monsters = (manifest.monsters ?? []).filter((m) => manifest.sfx[`${m}/roar`] && manifest.sfx[`${m}/stepHind`]);
  if (!monsters.length) return null;
  const rowSec = 8.5;
  const rows = [];
  const table = {};
  for (const m of monsters) {
    const n = Math.round(rowSec * SR);
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    const put = (s, at, maxSec) => {
      const a = Math.round(at * SR);
      const k = Math.min(s.l.length, Math.round(maxSec * SR), n - a);
      for (let i = 0; i < k; i++) (l[a + i] += s.l[i]), (r[a + i] += s.r[i]);
    };
    const roar = load(`${m}/roar`)[0];
    put(roar, 0, 4.5);
    const hind = load(`${m}/stepHind`);
    const front = load(`${m}/stepFront`);
    [hind[0], front[0], hind[1], front[1], hind[2], front[2]].forEach((s, k) => put(s, 4.8 + k * 0.6, 1.2));
    const wav = path.join(outDir, 'wav', `rosterStrip_${m}.wav`);
    writeWav(wav, [l, r], SR, 32);
    rows.push({ m, wav });
    table[m] = {
      roarPitchHz: pitchMedian(roar),
      roarBelow120: bandProfile(roar).rawBelow120,
      roarSeconds: r1(audibleSeconds(roar)),
      stepHindLowToneShare: avg(hind.map((s) => lowToneConcentration(s, 0, 0.5).whole)),
      stepHindBelow60: avg(hind.map((s) => bandProfile(s).rawBelow60)),
      stepHindSeconds: avg(hind.map((s) => audibleSeconds(s))),
      stepFrontSeconds: avg(front.map((s) => audibleSeconds(s))),
    };
  }
  const font = ['/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/SFNS.ttf'].find((f) => existsSync(f));
  const png = path.join(outDir, 'png', 'roster_roar_steps.png');
  const inputs = rows.flatMap((x) => ['-i', x.wav]);
  const chains = rows.map((x, k) => {
    const label = font ? `,drawtext=fontfile='${font}':text='${x.m}  roar | hind-front-hind-front-hind-front steps':x=12:y=10:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.5` : '';
    return `[${k}:a]showspectrumpic=s=1600x300:legend=0:scale=log:fscale=log:start=20:stop=8000:drange=75${label}[v${k}]`;
  });
  const graph = `${chains.join(';')};${rows.map((_, k) => `[v${k}]`).join('')}vstack=inputs=${rows.length}`;
  const res = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', graph, '-frames:v', '1', png]);
  if (res.status !== 0) throw new Error(`怪獣を並べた図を作れませんでした\n${res.stderr}`);
  return { png: path.relative(process.cwd(), png), seconds: { roar: [0, 4.5], steps: [4.8, 8.4] }, monsters: table };
}
