import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeEvents, PEAK_CEILING, noteFor, envelope, encodeWav, alignment } from '../tools/render-demo-audio.mjs';
import { createAudio } from '../lib/audio.js';
const rate = 8000;
const synth = (events, extra = {}) => synthesizeEvents(events, { duration: 1, sampleRate: rate, ...extra });
test('各イベント1つで無音ではない', () => {
  for (const name of ['fire', 'hit', 'hurt', 'flinch', 'wave', 'march']) assert.ok(synth([{ t: .2, name }]).some(v => v !== 0), name);
});
test('重なるイベントもピーク-1dBFS以下、PCMも範囲内', () => {
  const samples = synth(Array.from({ length: 200 }, (_, i) => ({ t: .1 + i % 8 / rate, name: 'hurt' })));
  const peak = Math.max(...samples.map(Math.abs));
  assert.ok(peak <= PEAK_CEILING + 1e-12 && peak < 1);
  const wav = encodeWav(samples, rate);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), rate);
  assert.equal(wav.readUInt32LE(40), samples.length * 2);
  for (let i = 44; i < wav.length; i += 2) assert.ok(Math.abs(wav.readInt16LE(i)) <= Math.floor(PEAK_CEILING * 32767));
});
test('秒→サンプル位置が正確で、開始前と終了後は無音', () => {
  const base = synth([{ t: 0, name: 'fire' }], { normalized: false });
  const offset = .25, at = Math.round(offset * rate);
  const shifted = synth([{ t: offset, name: 'fire' }], { normalized: false });
  assert.ok(shifted.slice(0, at).every(v => v === 0));
  assert.deepEqual(shifted.slice(at, at + 640), base.slice(0, 640));
  assert.ok(shifted.slice(at + 640).every(v => v === 0));
});
test('無イベントは無音、同じ入力は同じPCM', () => {
  assert.ok(synth([]).every(v => v === 0));
  const events = [{ t: .1, name: 'march' }, { t: .2, name: 'march' }];
  assert.deepEqual(synth(events), synth(events));
});
test('包絡線は8msで0.07、指数減衰', () => {
  assert.equal(envelope(0, .12), .0001);
  assert.ok(Math.abs(envelope(.008, .12) - .07) < 1e-12);
  assert.ok(Math.abs(envelope(.004, .12) - Math.sqrt(.0001 * .07)) < 1e-12);
  assert.equal(envelope(.12, .12), 0);
});
test('ブラウザの実合成パラメータと一致し、marchのみ半音量', () => {
  const previous = globalThis.AudioContext, captured = [];
  class Audio {
    state = 'running'; currentTime = 0; destination = {};
    resume() { return Promise.resolve(); }
    createOscillator() {
      const data = {}; captured.push(data);
      return { set type(v) { data.type = v; }, frequency: { setValueAtTime(v) { data.from = v; }, exponentialRampToValueAtTime(v, t) { data.to = v; data.duration = t; } }, connect() {}, start() {}, stop() {} };
    }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  try {
    globalThis.AudioContext = Audio; const audio = createAudio(); audio.unlock();
    const names = ['fire', 'hit', 'hurt', 'flinch', 'wave', 'pickup', 'levelup', 'march', 'march', 'march', 'march'];
    names.forEach(name => audio.play(name));
    let march = 0;
    names.forEach((name, i) => { const { gain, ...note } = noteFor(name, march); if (name === 'march') march++; assert.deepEqual(captured[i], note); assert.equal(gain, name === 'march' ? .5 : 1); });
  } finally { globalThis.AudioContext = previous; }
});
test('動画末尾から開始点を逆算し、音と映像の頭を同じだけ切る', () => {
  assert.deepEqual(alignment(21, 18), { videoFrom: 3.3, audioFrom: .3, duration: 17.7 });
  assert.throws(() => alignment(10, 18)); assert.throws(() => alignment(18, NaN));
});
test('不正な時刻やイベントは拒否する', () => {
  assert.throws(() => synth([{ t: -1, name: 'fire' }]));
  assert.throws(() => synth([{ t: 0, name: 'unknown' }]));
});
