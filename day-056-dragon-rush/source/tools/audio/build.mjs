// OWNER: audio-tools
// 音をすべて作り直す：npm run build:audio（＝ node tools/audio/build.mjs）。外部の音源は使わず、すべてこのフォルダの合成で作る。
// 出力：public/assets/audio/（OGG と manifest.json）。途中の WAV は .captures/_audio-work/ に置く（確かめ用・git に入れない）。
// 同じ --seed なら同じ出力になる（乱数は音ごとの系列、OGG は bitexact で書く）。
//
//   node tools/audio/build.mjs                    全部（効果音・残響・曲）
//   node tools/audio/build.mjs --only building/   名前がこれで始まる効果音だけ作り直す（目録は前の値を残して上書き）
//   node tools/audio/build.mjs --no-music         曲を作らない（目録の曲の欄は前のまま）
//   node tools/audio/build.mjs --music-only --out <置き場> --work <作業場所>   曲だけ作る（r06-audio：tools/audio-render.mjs が、
//                                                 継ぎ目を比べる WAV を今の版で作り直すのに使う。効果音と残響は作らない）
//   --seed 20260930 --jobs 10 --png（効果音ごとの帯域の図を作業場所へ）
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { BANKS, IR_NAMES } from './banks.mjs';
import { ffmpegStderr } from './lib/io.mjs';
import { IR_SPECS, makeIR } from './lib/reverb.mjs';
import { rngFor } from './lib/rng.mjs';
import { PARTS } from './music/arrange.mjs';
import { createMixdown } from './music/mixdown.mjs';
import { MONSTER_IDS } from './monsters.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) out[k] = v;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

class Pool {
  constructor(size) {
    this.idle = [];
    this.queue = [];
    this.pending = new Map();
    this.next = 1;
    this.workers = Array.from({ length: size }, () => {
      const w = new Worker(new URL('./worker.mjs', import.meta.url));
      w.on('message', (m) => {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        this.idle.push(w);
        this.pump();
        if (m.ok) p.resolve(m.result);
        else p.reject(new Error(m.error));
      });
      w.on('error', (e) => {
        for (const p of this.pending.values()) p.reject(e);
      });
      this.idle.push(w);
      return w;
    });
  }

  run(task) {
    return new Promise((resolve, reject) => {
      const id = this.next++;
      this.queue.push({ ...task, id });
      this.pending.set(id, { resolve, reject });
      this.pump();
    });
  }

  pump() {
    while (this.idle.length > 0 && this.queue.length > 0) this.idle.pop().postMessage(this.queue.shift());
  }

  close() {
    return Promise.all(this.workers.map((w) => w.terminate()));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = Number(args.seed ?? 20260930);
  const out = path.resolve(ROOT, String(args.out ?? 'public/assets/audio'));
  const work = path.resolve(ROOT, String(args.work ?? '.captures/_audio-work'));
  const only = typeof args.only === 'string' ? args.only : null;
  const music = !args['no-music'] && !only;
  const musicOnly = Boolean(args['music-only']);
  const jobs = Math.max(1, Number(args.jobs ?? Math.min(10, os.cpus().length - 2)));
  mkdirSync(out, { recursive: true });
  mkdirSync(work, { recursive: true });
  const manifestFile = path.join(out, 'manifest.json');
  const prev = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : null;
  const t0 = Date.now();
  const pool = new Pool(jobs);
  try {
    const sfxTasks = [];
    for (const b of BANKS) {
      if (musicOnly || (only && !b.name.startsWith(only))) continue;
      for (let v = 0; v < b.variants; v++) sfxTasks.push(pool.run({ type: 'sfx', bank: b.name, variant: v, seed, work, out }));
    }
    const irTasks = only || musicOnly ? [] : IR_NAMES.map((name) => pool.run({ type: 'ir', name, seed, work, out }));
    let musicResult = prev?.music ?? null;
    if (music) {
      const hall = makeIR(rngFor(seed, 'ir.hall'), IR_SPECS.hall);
      const mix = createMixdown({ seed, work, out, irs: { hall } });
      // 足す順番で浮動小数の和の末尾の桁が変わるので、作り終わった順ではなくパートの並びの順に足す（同じ種で同じ出力にするため）
      const parts = await Promise.all(Object.keys(PARTS).map((part) => pool.run({ type: 'part', part, seed })));
      for (const r of parts) mix.add(r);
      // r06-audio：63 小節目の後に足す溜めの小節の帯（パートごと、曲の本体と別の乱数の系列）。足す順はパートの並び
      const holds = await Promise.all(Object.keys(PARTS).map((part) => pool.run({ type: 'hold', part, seed })));
      for (const r of holds) mix.addHold(r);
      console.log(`曲のパート ${Object.keys(PARTS).length} 本を作りました（${Math.round((Date.now() - t0) / 1000)}秒）。仕上げます…`);
      musicResult = mix.finish();
    }
    const sfxResults = await Promise.all(sfxTasks);
    const irResults = await Promise.all(irTasks);
    // 目録：音の名前ごとに変化の一覧。--only のときは前の目録の他の音を残す（全部を作るときは、消えた音を目録に残さない）
    const banks = only || musicOnly ? { ...(prev?.sfx ?? {}) } : {};
    for (const b of BANKS) {
      const mine = sfxResults.filter((r) => r.bank === b.name).sort((x, y) => x.variant - y.variant);
      if (mine.length === 0) continue;
      banks[b.name] = { loop: Boolean(b.loop), target: b.target, variants: mine.map(({ bank, variant, ...rest }) => rest) };
    }
    const manifest = {
      generator: 'tools/audio/build.mjs（すべて合成。第三者の音源・サンプルは使っていない）',
      seed,
      sampleRate: 48000,
      monsters: MONSTER_IDS,
      ir: irResults.length ? Object.fromEntries(irResults.map((r) => [r.name, r])) : (prev?.ir ?? {}),
      sfx: Object.fromEntries(Object.keys(banks).sort().map((k) => [k, banks[k]])),
      music: musicResult,
    };
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 1)}\n`);
    // 目録から消えた効果音のファイル（名前を変えた・減らした変化）を片付ける
    if (!only && !musicOnly) {
      const keep = new Set(Object.values(manifest.sfx).flatMap((b) => b.variants.map((v) => path.join(out, v.file))));
      const walk = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);
      for (const f of walk(path.join(out, 'sfx'))) if (f.endsWith('.ogg') && !keep.has(f)) rmSync(f);
    }
    if (args.png) {
      mkdirSync(path.join(work, 'png'), { recursive: true });
      for (const r of sfxResults) {
        const wav = path.join(work, r.file.replace(/\.ogg$/, '.wav'));
        const png = path.join(work, 'png', r.file.replace(/\//g, '__').replace(/\.ogg$/, '.png'));
        ffmpegStderr(['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-lavfi', 'showspectrumpic=s=900x360:legend=1:scale=log:fscale=log:stop=16000', '-frames:v', '1', png]);
      }
    }
    const worstPeak = sfxResults.length ? Math.max(...sfxResults.map((r) => r.truePeakDb)) : null;
    console.log(`効果音 ${sfxResults.length} 個・残響 ${irResults.length} 個${music ? '・曲' : ''}を ${Math.round((Date.now() - t0) / 1000)} 秒で作りました（作業員 ${jobs}）。効果音の最大の真のピーク ${worstPeak} dBTP`);
    if (music && musicResult) {
      for (const [k, s] of Object.entries(musicResult.report.stages)) console.log(`  曲の段階 ${k}: ${s.lufs} LUFS・真のピーク ${s.truePeakDb} dBTP`);
      if (musicResult.report.hold) for (const [k, s] of Object.entries(musicResult.report.hold.stages)) console.log(`  溜めの塊 ${k}: ${s.lufs} LUFS・真のピーク ${s.truePeakDb} dBTP・小節ごと ${s.perBarLufs.join('/')} LUFS`);
    }
    console.log(`出力: ${path.relative(ROOT, out)}/（manifest.json）`);
  } finally {
    await pool.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
