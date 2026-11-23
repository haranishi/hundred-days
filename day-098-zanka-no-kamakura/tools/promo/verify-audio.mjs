// verify-audio.mjs — BGM A案・B案（bgm_a.wav / bgm_b.wav）のラウドネス・真のピーク・クリッピング・初フレーム音量・直流・スペクトログラムを検査する。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DURATION, FPS } from './timeline.mjs';
import { ebur, parseEbur } from './promo-audio.mjs';

function audioSamples(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], {
    maxBuffer: 1 << 28,
  });
  if (r.status !== 0) throw new Error(`ffmpeg audio read failed: ${r.stderr}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
}

export function verifyAudio(outDir) {
  mkdirSync(outDir, { recursive: true });
  const report = { checkedAt: new Date().toISOString(), variants: {} };

  for (const v of ['a', 'b']) {
    const wav = path.join(outDir, `bgm_${v}.wav`);
    const mp3 = path.join(outDir, `bgm_${v}.mp3`);
    assert.ok(existsSync(wav), `Missing ${wav}`);
    assert.ok(existsSync(mp3), `Missing ${mp3}`);

    const m = parseEbur(ebur(wav));
    assert.ok(m.I >= -17.5 && m.I <= -15.5, `Variant ${v} LUFS out of range: ${m.I}`);
    assert.ok(m.tp <= -1.5, `Variant ${v} true peak too high: ${m.tp} dBTP`);

    const smp = audioSamples(wav);
    const expectedSamples = DURATION * 48000;
    assert.ok(Math.abs(smp.length - expectedSamples) <= 48, `Variant ${v} duration sample mismatch: ${smp.length}`);

    const f1 = Math.round(48000 / FPS);
    let e = 0;
    for (let i = 0; i < f1; i++) e += smp[i] * smp[i];
    const firstFrameDbfs = Number((10 * Math.log10(e / f1 + 1e-20)).toFixed(1));
    assert.ok(firstFrameDbfs > -40, `Variant ${v} first frame too quiet: ${firstFrameDbfs} dBFS`);

    let sum = 0;
    for (let i = 0; i < smp.length; i++) sum += smp[i];
    const dc = sum / smp.length;
    assert.ok(Math.abs(dc) < 1e-3, `Variant ${v} DC offset too high: ${dc}`);

    const specPng = path.join(outDir, `spectrogram-${v}.png`);
    spawnSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      wav,
      '-lavfi',
      'showspectrumpic=s=960x400:legend=1',
      specPng,
    ]);
    assert.ok(existsSync(specPng), `Spectrogram not created: ${specPng}`);

    const sha256 = createHash('sha256').update(readFileSync(wav)).digest('hex');
    report.variants[v] = { ...m, firstFrameDbfs, dc: Number(dc.toExponential(2)), sha256 };
  }

  writeFileSync(path.join(outDir, 'audio-report.json'), JSON.stringify(report, null, 2));
  console.log('Audio verification PASSED:', JSON.stringify(report, null, 2));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const pick = flag => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const outDir = path.resolve(pick('--out-dir') || process.env.PROMO_OUT_DIR || '.');
  verifyAudio(outDir);
}
