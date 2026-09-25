import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../../lib/audio.js';

function fakeContext(log) {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = (kind) => {
    log.push(kind);
    return { connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '', buffer: null };
  };
  return {
    currentTime: 1,
    sampleRate: 8000,
    state: 'running',
    destination: {},
    createGain: () => node('gain'),
    createOscillator: () => node('osc'),
    createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('src'),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    resume: () => Promise.resolve(),
  };
}

test('AudioContext が無い端末でも例外を出さず、鳴らさないだけ', () => {
  const a = createAudio({});
  assert.equal(a.play('flap'), false);
  const b = createAudio({
    createContext() {
      throw new Error('not allowed');
    },
  });
  assert.equal(b.play('flap'), false);
  b.resume();
});

test('全部の効果音が合成できる', () => {
  const log = [];
  const a = createAudio({ createContext: () => fakeContext(log) });
  for (const name of a.names) assert.equal(a.play(name), true, name);
  assert.deepEqual(a.names.sort(), ['bonk', 'fanfare', 'fish', 'flap', 'meow', 'pass']);
  assert.ok(log.includes('osc') && log.includes('src'));
});

test('ミュート中は音のノードを作らない', () => {
  const log = [];
  const a = createAudio({ createContext: () => fakeContext(log) });
  a.setMuted(true);
  assert.equal(a.play('pass'), false);
  assert.equal(log.length, 0);
  assert.equal(a.isMuted(), true);
});
