import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, makeLoop, makeSample, crossfadeGains } from '../src/synthesis.js';

test('every original record is a deterministic, non-silent 16-beat loop with bounded samples', () => {
  const fingerprints = new Set();
  for (const track of TRACKS) {
    const result = makeLoop(track), repeat = makeLoop(track);
    assert.ok(Math.abs(result.duration - 60 / track.bpm * 16) < 1 / result.sampleRate);
    let energy = 0, max = 0;
    for (let i = 0; i < result.pcm.length; i++) {
      const sample = result.pcm[i]; assert.ok(Number.isFinite(sample)); energy += sample * sample; max = Math.max(max, Math.abs(sample));
    }
    assert.ok(Math.sqrt(energy / result.pcm.length) > .05, 'audible music'); assert.ok(max < 1, 'no PCM clipping');
    assert.deepEqual(result.pcm, repeat.pcm);
    fingerprints.add(result.pcm.slice(0, 2000).join(','));
  }
  assert.equal(fingerprints.size, 4);
});
test('all four sampler instruments make finite, audible, bounded signals', () => {
  for (const kind of ['kick', 'clap', 'hat', 'horn']) {
    const { pcm } = makeSample(kind); assert.ok(pcm.some(sample => Math.abs(sample) > .05));
    assert.ok(pcm.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 1));
  }
});
test('crossfade isolates the selected record at each edge and conserves power through the transition', () => {
  for (let i = 0; i <= 100; i++) {
    const [left, right] = crossfadeGains(i / 100); assert.ok(Math.abs(left * left + right * right - 1) < 1e-12);
  }
  assert.equal(crossfadeGains(0)[0], 1); assert.ok(crossfadeGains(0)[1] < 1e-12);
  assert.ok(crossfadeGains(1)[0] < 1e-12); assert.equal(crossfadeGains(1)[1], 1);
  assert.deepEqual(crossfadeGains(-1), crossfadeGains(0)); assert.deepEqual(crossfadeGains(2), crossfadeGains(1));
});
