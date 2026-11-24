import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CUES, DURATION_SECONDS, FPS } from '../../tools/promo/timeline.mjs';
import {
  FADE, FRAMES, MAJOR_GESTURES, RATE, SCORES, buildWav, edgeGain, loadCues, normalizeCues, pcm16, pcmBuffer, renderMix,
} from '../../tools/promo/promo-audio.mjs';

test('edgeGain は先頭・末尾ともに 0 で、中間は 1 になる', () => {
  assert.equal(edgeGain(0), 0);
  assert.equal(edgeGain(FRAMES - 1), 0);
  assert.equal(edgeGain(Math.round(RATE * 10)), 1);
  const fadeStart = FRAMES - 1 - Math.round(FADE * RATE);
  assert.equal(edgeGain(fadeStart), 1);
  assert.ok(edgeGain(FRAMES - 1 - Math.round(FADE * RATE / 2)) > 0.45);
});

test('pcm16 はニー以下でリニア・大入力でもクリップしない', () => {
  assert.equal(pcm16(0, 1), 0);
  assert.equal(pcm16(0.5, 1), Math.round(0.5 * 32767));
  assert.ok(Math.abs(pcm16(100, 1)) < 32767);
  assert.ok(Math.abs(pcm16(-100, 1)) < 32767);
});

test('normalizeCues と loadCues は絵コンテの合図と外部 JSON の差し替えを受け付け、不正値を拒む', () => {
  const base = normalizeCues(CUES);
  assert.equal(base.length, CUES.length);
  const nav0 = base.find((c) => c.kind === 'nav' && c.n === 0);
  const pop = base.find((c) => c.kind === 'pop');
  const click = base.find((c) => c.kind === 'click');
  const won = base.find((c) => c.kind === 'won');
  assert.equal(nav0?.at, 7.3);
  assert.equal(pop?.at, 7.5);
  assert.equal(click?.at, 14.3);
  assert.equal(won?.at, 14.75);

  const shifted = loadCues(JSON.stringify({
    cues: CUES.map((c) => ({ ...c, at: Math.min(DURATION_SECONDS - 0.1, c.at + 0.033) })),
  }));
  assert.equal(shifted.length, CUES.length);
  assert.ok(shifted[0].at > CUES[0].at);

  assert.throws(() => normalizeCues('invalid'), /cues 配列/);
  assert.throws(() => normalizeCues([{ at: 1, kind: 'unknown' }]), /無効/);
  assert.throws(() => normalizeCues([{ at: 31, kind: 'end' }]), /無効/);
  assert.throws(() => normalizeCues([{ at: 1, kind: 'ring', n: 9 }]), /範囲外/);
});

test('renderMix は A/B とも別調・別楽譜で 30.000 秒のステレオ波形を生成し、0-4 秒は BGM コード無し', () => {
  assert.notEqual(SCORES.a.key, SCORES.b.key);
  const cues = normalizeCues(CUES);
  const a = renderMix('a', cues);
  const b = renderMix('b', cues);

  assert.equal(a.mix.length, FRAMES * 2);
  assert.equal(b.mix.length, FRAMES * 2);
  assert.equal(a.chords[0].name, null);
  assert.equal(a.chords[1].name, null);
  assert.ok(a.chords[2].name);
  assert.equal(b.chords[0].name, null);
  assert.equal(b.chords[1].name, null);
  assert.ok(b.chords[2].name);

  // WAV 先頭ヘッダーと INFO チャンク
  const wav = buildWav(pcmBuffer(a.mix, 1), { variant: 'a', gain: 1, cueSource: 'timeline' });
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(4) + 8, wav.length);
});

test('30fps コマ丸め後の cues.json でも A/B 両案の主要合図（pop/won/tally/end）が前後100msで 3dB 以上立ち上がる', () => {
  const snapped = normalizeCues(CUES.map((c) => ({
    ...c,
    at: Math.round((Math.ceil(c.at * FPS - 1e-6) / FPS) * 1000) / 1000,
  })));
  const rmsDb = (pcm, from, to) => {
    const first = Math.max(0, Math.round(from * RATE));
    const last = Math.min(FRAMES, Math.round(to * RATE));
    let sum = 0;
    for (let i = first; i < last; i++) {
      sum += pcm.readInt16LE(i * 4) ** 2 + pcm.readInt16LE(i * 4 + 2) ** 2;
    }
    return 20 * Math.log10(Math.max(Math.sqrt(sum / (2 * (last - first))) / 32768, 1e-12));
  };
  for (const variant of ['a', 'b']) {
    const mix = renderMix(variant, snapped);
    const pcm = pcmBuffer(mix.mix, 0.72);
    for (const cue of snapped.filter((c) => MAJOR_GESTURES.has(c.kind))) {
      const rise = rmsDb(pcm, cue.at, cue.at + 0.1) - rmsDb(pcm, cue.at - 0.1, cue.at);
      assert.ok(rise >= 3, `${variant} ${cue.kind}@${cue.at}s の立ち上がりが 3dB 未満: ${rise.toFixed(2)} dB`);
    }
  }
});
