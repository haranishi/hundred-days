// OWNER: world-art
// r08-world-周3：動かしたときのちらつきを、写真の質感のあり・なしで比べる。
// 遊ぶ画面（dist-core）を ?shot=<構図>&overlays=0 で開き（種と時刻は固定、人物・炎・火の粉も止まる）、カメラだけを 1/30 秒ぶんずつ
// 動かして 1 コマずつ撮る。写真あり（既定）と ?tex=0 で同じ動きを撮り、画面の明るさ（sRGB の輝度、0〜255）の時間の変化を比べる。
//   E1＝隣り合うコマの差 |I(t+1)−I(t)| の平均（動きに乗った模様の移動も含む）
//   E2＝時間の2階差 |I(t+1)−2I(t)+I(t−1)| の平均（なめらかな動きでは小さく、ちらつき・瞬きで大きくなる＝時間の高い周波数の強さ）
// 測る所は2つ。scene＝HUD と炎（明るい所）を除いた画面全体。photo＝写真のあり・なしで画が変わる所（写真の当たる面）だけ。
// 模様が多いほど、なめらかに動かしても E1・E2 は増える。そこで E1/G・E2/H（G・H＝空間の1階・2階の差＝模様の細かさ）も出し、
// これが写真のあり・なしで同じなら、増えた分は模様が景色と一緒に動いた分で、ちらつき（景色と一緒に動かない瞬き）ではないと見る。
//   npm run motion:art は無い。node tools/art/motion.mjs <周の名前> [--port 5409] [--frames 75] [--no-build] [--framings courtyard,gate]
// 撮った画は .captures/<周>/motion/<構図>-<動き>-<on|off>/ に、数値は motion.json に書く。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ROOT, buildCore, parseArgs, startPreview } from '../core/harness.mjs';
import { assertGpu, openBrowser } from '../lib/shoot.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const { getShot } = await import(path.join(ROOT, 'src', 'contract', 'shots.ts'));

const args = parseArgs(process.argv.slice(2));
const round = String(args._[0] ?? 'scratch');
const port = Number(args.port ?? 5409);
const FRAMES = Number(args.frames ?? 75);
const FPS = 30;
const framings = String(args.framings ?? 'courtyard,gate').split(',');
const VIEWPORT = { width: 1280, height: 720 };
const outRoot = path.join(ROOT, '.captures', round, 'motion');

/** 動き：i コマ目の構図。pan＝向きを回す（度/秒）、truck＝注視点を横へ歩く速さで動かす（m/秒）。 */
const MOTIONS = {
  'pan-slow': (s, i) => ({ ...s, yawDeg: s.yawDeg + (i * 1) / FPS }),
  pan: (s, i) => ({ ...s, yawDeg: s.yawDeg + (i * 4) / FPS }),
  // 回転だけ（カメラの位置は動かさない）：コマどうしは射影変換1つでぴったり重なる（視差も陰影の変化も無い）。補償した残り（R）を測る
  rot: (s, i) => {
    const yaw = (s.yawDeg * Math.PI) / 180;
    const pitch = (s.pitchDeg * Math.PI) / 180;
    const flat = Math.cos(pitch) * s.distance;
    const cam = [s.target[0] - Math.cos(yaw) * flat, s.target[1] + Math.sin(pitch) * s.distance, s.target[2] - Math.sin(yaw) * flat];
    const y2 = yaw + ((i * 2) / FPS) * (Math.PI / 180);
    return { ...s, yawDeg: (y2 * 180) / Math.PI, target: [cam[0] + Math.cos(y2) * flat, cam[1] - Math.sin(pitch) * s.distance, cam[2] + Math.sin(y2) * flat], cam };
  },
  truck: (s, i) => {
    const yaw = (s.yawDeg * Math.PI) / 180;
    // 画面の右（向きの前方 (cos, sin) から右手へ 90°）
    const rx = -Math.sin(yaw);
    const rz = Math.cos(yaw);
    const d = (i * 1.4) / FPS;
    return { ...s, target: [s.target[0] + rx * d, s.target[1], s.target[2] + rz * d] };
  },
};

/** HUD の場所（1280×720、遊ぶ画面）。時間で変わらないので測る所から外す。 */
function hudMask(x, y) {
  if (x < 360 && y < 125) return true; // 左上の目的と段階
  if (x > 1040 && y < 195) return true; // 右上の地図
  if (y > 635) return true; // 下の帯と操作の一覧
  if (x > 360 && x < 920 && y < 62) return true; // 視点をつかむ案内
  return false;
}

function luma(png) {
  const n = png.width * png.height;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.2126 * png.data[i * 4] + 0.7152 * png.data[i * 4 + 1] + 0.0722 * png.data[i * 4 + 2];
  return L;
}

async function record(page, url, shot, motion, dir) {
  await mkdir(dir, { recursive: true });
  const errors = [];
  const onErr = (m) => m.type() === 'error' && errors.push(m.text());
  page.on('console', onErr);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true || typeof window.__appError === 'string', null, { timeout: 120_000, polling: 100 });
  const appError = await page.evaluate(() => window.__appError ?? null);
  if (appError) throw new Error(appError);
  const frames = [];
  const cams = [];
  const targets = [];
  for (let i = 0; i < FRAMES; i++) {
    const s = motion(shot, i);
    cams.push(s.cam ?? null);
    targets.push(s.target);
    await page.evaluate((v) => window.__game.look(v), { target: s.target, yawDeg: s.yawDeg, pitchDeg: s.pitchDeg, distance: s.distance, fov: s.fov });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const file = path.join(dir, `f${String(i).padStart(3, '0')}.png`);
    await page.screenshot({ path: file });
    frames.push(file);
  }
  page.off('console', onErr);
  return { frames, errors, cams, targets };
}

/** 撮った画を読んで、すぐ輝度にする（PNG の画素は持ち続けない）。 */
async function load(files) {
  const out = [];
  let w = 0;
  let h = 0;
  for (const f of files) {
    const png = PNG.sync.read(await readFile(f));
    w = png.width;
    h = png.height;
    out.push(luma(png));
  }
  return { L: out, w, h };
}

/** カメラの向き（three の lookAt と同じ：前・右・上）。 */
function basis(cam, target) {
  const f = [target[0] - cam[0], target[1] - cam[1], target[2] - cam[2]];
  const fl = Math.hypot(...f);
  f[0] /= fl;
  f[1] /= fl;
  f[2] /= fl;
  const r = [-f[2], 0, f[0]]; // f × (0,1,0)
  const rl = Math.hypot(...r);
  r[0] /= rl;
  r[2] /= rl;
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { f, r, u };
}

/** Keys の3次（a=−0.5）。 */
function cubic(t) {
  const x = Math.abs(t);
  if (x <= 1) return 1.5 * x * x * x - 2.5 * x * x + 1;
  if (x < 2) return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2;
  return 0;
}

/**
 * 回転だけのカメラで、コマ a の画を、コマ b の画面の位置へ写す（3次補間）。写せない所（画面の外から来る所）は NaN。
 * 画素 (x, y) の向き＝前 + ((x+0.5−W/2)/fx)・右 − ((y+0.5−H/2)/fy)・上（three の縦の画角から fx=fy）。
 */
function warpRot(L, w, h, A, B, fovDeg) {
  const fy = h / 2 / Math.tan((fovDeg * Math.PI) / 360);
  const fx = fy;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const vy = -((y + 0.5 - h / 2) / fy);
    for (let x = 0; x < w; x++) {
      const vx = (x + 0.5 - w / 2) / fx;
      const d0 = B.f[0] + vx * B.r[0] + vy * B.u[0];
      const d1 = B.f[1] + vx * B.r[1] + vy * B.u[1];
      const d2 = B.f[2] + vx * B.r[2] + vy * B.u[2];
      const zf = d0 * A.f[0] + d1 * A.f[1] + d2 * A.f[2];
      const sx = ((d0 * A.r[0] + d1 * A.r[1] + d2 * A.r[2]) / zf) * fx + w / 2 - 0.5;
      const sy = (-(d0 * A.u[0] + d1 * A.u[1] + d2 * A.u[2]) / zf) * fy + h / 2 - 0.5;
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      if (ix < 1 || iy < 1 || ix + 2 >= w || iy + 2 >= h) {
        out[y * w + x] = NaN;
        continue;
      }
      let v = 0;
      for (let j = -1; j <= 2; j++) {
        const wy = cubic(sy - (iy + j));
        let row = 0;
        for (let i = -1; i <= 2; i++) row += cubic(sx - (ix + i)) * L[(iy + j) * w + ix + i];
        v += wy * row;
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/**
 * 回転だけの列で、写真が足した分 D(t)＝I_on(t)−I_off(t) が景色と一緒に動くか（ちらつかないか）を測る。
 * 画面に貼り付いた模様（粒子の雑音・AO の雑音の型）は、写真のあり・なしで同じなので D では消える（全体の画で補償すると、
 * それが残りの大半を占めて測れない）。M＝|D| の平均、U＝|D(t+1)−D(t)|（補償なし）、R＝|D(t+1)−写したD(t)|（補償あり）、
 * F＝|D(t)−行って戻したD(t)|÷2（3次補間そのものの誤差の目安）。
 * Q＝8bit に丸めた誤差だけで出る残り（写真あり・なしの画は色ごとに整数へ丸められ、D はその差なので、コマごとに新しい丸めの誤差が乗り、
 * 補償しても消えない）。同じ写し方・同じ測る所で、丸めの誤差（色ごとに一様な ±0.5 段）を種つきの乱数で作って測る。
 * (R−Q−F)/M が、丸めと補間を除いて、写真の模様のうち景色と一緒に動かない割合（ちらつきの上限の目安）。
 */
function compensated(onSeq, offSeq, cams, targets, fovDeg, masks) {
  const { w, h } = onSeq;
  const n = w * h;
  let m = 0;
  let u = 0;
  let r = 0;
  let f = 0;
  let q = 0;
  let cnt = 0;
  // 丸めの誤差の乱数（xorshift32、種は固定）
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 4294967296 - 0.5;
  };
  const quantNoise = () => {
    const e = new Float32Array(n);
    for (let i = 0; i < n; i++) e[i] = 0.2126 * (rnd() - rnd()) + 0.7152 * (rnd() - rnd()) + 0.0722 * (rnd() - rnd());
    return e;
  };
  for (let t = 0; t + 1 < onSeq.L.length; t++) {
    const A = basis(cams[t], targets[t]);
    const B = basis(cams[t + 1], targets[t + 1]);
    const D0 = new Float32Array(n);
    const D1 = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      D0[i] = onSeq.L[t][i] - offSeq.L[t][i];
      D1[i] = onSeq.L[t + 1][i] - offSeq.L[t + 1][i];
    }
    const pred = warpRot(D0, w, h, A, B, fovDeg);
    const back = warpRot(pred, w, h, B, A, fovDeg);
    const e0 = quantNoise();
    const e1 = quantNoise();
    const ep = warpRot(e0, w, h, A, B, fovDeg);
    for (let i = 0; i < n; i++) {
      if (!masks.scene[i] || !(masks.photo[t][i] || masks.photo[t + 1][i]) || Number.isNaN(pred[i]) || Number.isNaN(back[i])) continue;
      m += Math.abs(D1[i]);
      u += Math.abs(D1[i] - D0[i]);
      r += Math.abs(D1[i] - pred[i]);
      f += Math.abs(D0[i] - back[i]) / 2;
      q += Math.abs(e1[i] - ep[i]);
      cnt++;
    }
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const M = m / cnt;
  return {
    M: r3(M),
    U: r3(u / cnt),
    R: r3(r / cnt),
    F: r3(f / cnt),
    Q: r3(q / cnt),
    uncompensatedFraction: r3(u / cnt / M),
    nonRigidFraction: r3(Math.max(0, r - q - f) / cnt / M),
  };
}

/** 2つの列（写真あり・なし）の E1・E2 を、scene と photo の2つの測る所で出す。 */
function measure(onSeq, offSeq) {
  const { w, h } = onSeq;
  const n = w * h;
  const Lon = onSeq.L;
  const Loff = offSeq.L;
  const on = Lon;
  // 炎・灯りの芯（どちらかの列で明るい所）を外す。8 画素ふくらませる
  const bright = new Uint8Array(n);
  for (let t = 0; t < on.length; t++) for (let i = 0; i < n; i++) if (Lon[t][i] > 200 || Loff[t][i] > 200) bright[i] = 1;
  const grow = (m, r) => {
    const o = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) o[yy * w + xx] = 1;
        }
      }
    }
    return o;
  };
  const fire = grow(bright, 8);
  const scene = new Uint8Array(n);
  for (let i = 0; i < n; i++) scene[i] = !fire[i] && !hudMask(i % w, Math.floor(i / w)) ? 1 : 0;
  // 写真の当たる面：そのコマで、写真のあり・なしの差が 2 段以上の画素（1 画素ふくらませる）
  const photoAt = (t) => {
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (scene[i] && Math.abs(Lon[t][i] - Loff[t][i]) >= 2) m[i] = 1;
    return grow(m, 1);
  };
  const photo = Lon.map((_, t) => photoAt(t));
  // 空間の細かさ：G＝輝度の1階の差（横＋縦）、H＝2階の差（横＋縦）。模様が多いほど、なめらかに動かしても E1・E2 は増えるので、
  // E1/G と E2/H（細かさ1つあたりの時間の変化）が写真のあり・なしで同じなら、増えた分は模様が画面と一緒に動いた分で、ちらつきではない
  const spatial = (L, i) => {
    const x = i % w;
    const y = (i - x) / w;
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return [0, 0];
    const c = L[i];
    const g = Math.abs(L[i + 1] - L[i - 1]) / 2 + Math.abs(L[i + w] - L[i - w]) / 2;
    const hh = Math.abs(L[i + 1] - 2 * c + L[i - 1]) + Math.abs(L[i + w] - 2 * c + L[i - w]);
    return [g, hh];
  };
  const zero = () => ({ e1: 0, e2: 0, g: 0, h: 0, n1: 0, n2: 0 });
  const acc = { scene: { on: zero(), off: zero() }, photo: { on: zero(), off: zero() } };
  const add = (a, L, i, t, d1, withD2, d2) => {
    a.e1 += d1;
    const [g, hh] = spatial(L[t], i);
    a.g += g;
    a.h += hh;
    a.n1++;
    if (withD2) {
      a.e2 += d2;
      a.n2++;
    }
  };
  for (let t = 1; t < on.length; t++) {
    const last = t + 1 >= on.length;
    for (let i = 0; i < n; i++) {
      if (!scene[i]) continue;
      const d1on = Math.abs(Lon[t][i] - Lon[t - 1][i]);
      const d1off = Math.abs(Loff[t][i] - Loff[t - 1][i]);
      const d2on = last ? 0 : Math.abs(Lon[t + 1][i] - 2 * Lon[t][i] + Lon[t - 1][i]);
      const d2off = last ? 0 : Math.abs(Loff[t + 1][i] - 2 * Loff[t][i] + Loff[t - 1][i]);
      add(acc.scene.on, Lon, i, t, d1on, !last, d2on);
      add(acc.scene.off, Loff, i, t, d1off, !last, d2off);
      const inPhoto = photo[t - 1][i] || photo[t][i] || (!last && photo[t + 1][i]);
      if (inPhoto) {
        add(acc.photo.on, Lon, i, t, d1on, !last, d2on);
        add(acc.photo.off, Loff, i, t, d1off, !last, d2off);
      }
    }
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const res = {};
  for (const k of ['scene', 'photo']) {
    const a = acc[k];
    const v = (b) => ({
      E1: b.e1 / Math.max(1, b.n1),
      E2: b.e2 / Math.max(1, b.n2),
      N1: b.e1 / Math.max(1e-9, b.g),
      N2: (b.e2 / Math.max(1, b.n2)) / Math.max(1e-9, b.h / Math.max(1, b.n1)),
    });
    const o = v(a.on);
    const f = v(a.off);
    res[k] = { share: r3(a.on.n1 / ((on.length - 1) * n)) };
    for (const m of ['E1', 'E2', 'N1', 'N2']) res[k][m] = { on: r3(o[m]), off: r3(f[m]), ratio: r3(o[m] / f[m]) };
  }
  res.masks = { scene, photo };
  return res;
}

async function main() {
  await mkdir(outRoot, { recursive: true });
  if (!args['no-build']) buildCore();
  const server = await startPreview(port);
  const { browser, name } = await openBrowser();
  console.log(`ブラウザ: ${name}`);
  const results = [];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${server.url}/?shot=title`);
    const gpu = await assertGpu(page);
    for (const framing of framings) {
      const shot = getShot(framing);
      if (!shot) throw new Error(`構図 ${framing} が無い`);
      for (const [mname, motion] of Object.entries(MOTIONS)) {
        const seqs = {};
        for (const [variant, q] of [['on', ''], ['off', '&tex=0']]) {
          const dir = path.join(outRoot, `${framing}-${mname}-${variant}`);
          seqs[variant] = await record(page, `${server.url}/?shot=${framing}&overlays=0${q}`, shot, motion, dir);
        }
        const onSeq = await load(seqs.on.frames);
        const offSeq = await load(seqs.off.frames);
        const { masks, ...m } = measure(onSeq, offSeq);
        if (mname === 'rot') m.compensated = compensated(onSeq, offSeq, seqs.on.cams, seqs.on.targets, shot.fov, masks);
        const errors = [...seqs.on.errors, ...seqs.off.errors];
        results.push({ framing, motion: mname, frames: FRAMES, ...m, errors });
        const f = (r) => `E1 ${r.E1.ratio} E2 ${r.E2.ratio} E1/G ${r.N1.ratio} E2/H ${r.N2.ratio}`;
        console.log(`${framing.padEnd(10)} ${mname.padEnd(8)} scene(${(m.scene.share * 100).toFixed(0)}%) ${f(m.scene)} | photo(${(m.photo.share * 100).toFixed(1)}%) ${f(m.photo)}  errors=${errors.length}`);
        if (m.compensated) {
          const c = m.compensated;
          console.log(`${''.padEnd(19)} 写真の分 D：|D| ${c.M}・補償なしの変化 ${c.U}（${c.uncompensatedFraction}）・補償した残り ${c.R}・丸めだけの残り ${c.Q}・補間の目安 ${c.F}・景色と一緒に動かない割合 ${c.nonRigidFraction}`);
        }
      }
    }
    await writeFile(path.join(outRoot, 'motion.json'), JSON.stringify({ round, date: new Date().toISOString(), viewport: VIEWPORT, fps: FPS, browser: name, gpu, results }, null, 2));
    console.log(`保存先: ${path.relative(ROOT, outRoot)}/`);
  } finally {
    await browser.close();
    await server.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
