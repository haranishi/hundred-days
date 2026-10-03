// OWNER: audio-tools
// 生成の作業員（worker_threads）。build.mjs から1件ずつ仕事（効果音の1変化・残響・曲の1パート）を受け取り、
// 作って WAV と OGG を書き、仕上げの数値を返す。乱数は仕事ごとの系列なので、並べる順番や作業員の数で結果は変わらない。
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';
import { BANKS } from './banks.mjs';
import { SR } from './lib/dsp.mjs';
import { encodeOgg, writeWav } from './lib/io.mjs';
import { masterSfx, round1 } from './lib/master.mjs';
import { IR_SPECS, makeIR } from './lib/reverb.mjs';
import { rngFor } from './lib/rng.mjs';
import { renderHoldPart, renderPart } from './music/render.mjs';

let irCache = null;

function irs(seed) {
  if (!irCache || irCache.seed !== seed) {
    irCache = { seed, ir: Object.fromEntries(['near', 'mid', 'far', 'hall'].map((k) => [k, makeIR(rngFor(seed, `ir.${k}`), IR_SPECS[k])])) };
  }
  return irCache.ir;
}

function ensureDir(file) {
  mkdirSync(path.dirname(file), { recursive: true });
}

function rms(s) {
  let e = 0;
  for (let i = 0; i < s.l.length; i++) e += s.l[i] * s.l[i] + s.r[i] * s.r[i];
  return round1(10 * Math.log10(e / (2 * s.l.length) + 1e-20));
}

function sfxTask({ bank, variant, seed, work, out }) {
  const B = BANKS.find((b) => b.name === bank);
  if (!B) throw new Error(`知らない音の名前: ${bank}`);
  // r05-audio：seedName があれば乱数の系列をその名前から取る（置き場を移した音を、前と同じ中身のまま作るため）
  const rng = rngFor(seed, B.seedName ?? bank, variant);
  const made = B.make(rng, { ir: irs(seed) }, variant);
  const { audio, stats } = masterSfx(made.audio, { target: B.target, loop: Boolean(B.loop), ...(B.maxGrDb !== undefined ? { maxGrDb: B.maxGrDb } : {}) });
  const rel = `sfx/${bank}_${variant + 1}`;
  const wav = path.join(work, `${rel}.wav`);
  const ogg = path.join(out, `${rel}.ogg`);
  ensureDir(wav);
  ensureDir(ogg);
  writeWav(wav, [audio.l, audio.r], SR);
  encodeOgg(wav, ogg, 4);
  return { bank, variant, file: `${rel}.ogg`, loop: Boolean(B.loop), layers: made.layers, rmsDb: rms(audio), ...stats };
}

function irTask({ name, seed, work, out }) {
  const ir = irs(seed)[name];
  const rel = `ir/${name}`;
  const wav = path.join(work, `${rel}.wav`);
  const ogg = path.join(out, `${rel}.ogg`);
  ensureDir(wav);
  ensureDir(ogg);
  // 実行時の畳み込みは正規化しないので、エネルギー 1 のまま書く（16bit では細かい尾が潰れるので浮動小数の WAV から変換）
  writeWav(wav, [ir.l, ir.r], SR);
  encodeOgg(wav, ogg, 6);
  return { name, file: `${rel}.ogg`, seconds: Math.round((ir.l.length / SR) * 1000) / 1000, rt60: IR_SPECS[name].rt60, predelay: IR_SPECS[name].predelay };
}

parentPort.on('message', (task) => {
  try {
    let result;
    if (task.type === 'sfx') result = sfxTask(task);
    else if (task.type === 'ir') result = irTask(task);
    else if (task.type === 'part') result = renderPart(task);
    else if (task.type === 'hold') result = renderHoldPart(task);
    else throw new Error(`知らない仕事: ${task.type}`);
    parentPort.postMessage({ id: task.id, ok: true, result }, result?.transfer ?? []);
  } catch (e) {
    parentPort.postMessage({ id: task.id, ok: false, error: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) });
  }
});
