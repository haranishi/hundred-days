// 音を OfflineAudioContext で書き出して測る（確認用ページと tools/ui-shots.mjs が使う。本番では読み込まない）。
// - 効果音：鳴るか（最大値が小さすぎない）・割れないか（最大値が1未満）。同じ音を1フレームに40回呼んでも割れないか
// - BGM：曲を数秒ぶん書き出して、耳で確かめられるよう WAV にする

import type { BgmKind, LoopName } from '../contracts';
import type { SfxName } from '../../shared/view';
import { scheduleEvents } from './bgm';
import { VoiceLimiter } from './limiter';
import { LoopVoice } from './loops';
import { buildMixer } from './mixer';
import { SONGS, eventsAt, stepSeconds, totalSteps } from './score';
import { SFX } from './sfx';

export interface AudioStats {
  peak: number;
  rms: number;
  seconds: number;
}

const RATE = 22050;

function stats(buf: AudioBuffer): AudioStats {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i] ?? 0);
      if (v > peak) peak = v;
      sum += v * v;
      n++;
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), seconds: buf.duration };
}

/** 効果音を1つ（または count 回同時に、上限の仕組みを通して）書き出す */
export async function renderSfx(name: SfxName, count = 1, rate = RATE): Promise<{ buffer: AudioBuffer; stats: AudioStats; played: number }> {
  const recipe = SFX[name];
  const ctx = new OfflineAudioContext(1, Math.ceil(rate * (recipe.dur + 0.4)), rate);
  const mix = buildMixer(ctx);
  const limiter = new VoiceLimiter();
  let played = 0;
  for (let i = 0; i < count; i++) {
    const g = limiter.allow(name, 0, recipe.dur);
    if (g <= 0) continue;
    const voice = ctx.createGain();
    voice.gain.value = g;
    voice.connect(mix.sfx);
    recipe.play(ctx, voice, 0.02, 1);
    played++;
  }
  const buffer = await ctx.startRendering();
  return { buffer, stats: stats(buffer), played };
}

/** BGM を seconds 秒ぶん書き出す */
export async function renderSong(kind: BgmKind, intensity: 0 | 1 | 2, seconds: number, rate = RATE): Promise<{ buffer: AudioBuffer; stats: AudioStats }> {
  const song = SONGS[kind];
  const ctx = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
  const mix = buildMixer(ctx);
  const step = stepSeconds(song, intensity);
  let t = 0.05;
  for (let i = 0; t < seconds - 0.05; i++) {
    scheduleEvents(ctx, mix.bgm, eventsAt(song, i % totalSteps(song), intensity), t, step, song);
    t += step;
  }
  const buffer = await ctx.startRendering();
  return { buffer, stats: stats(buffer) };
}

/** 鳴らし続ける音（カート・冷凍ケース）を seconds 秒ぶん書き出す */
export async function renderLoop(name: LoopName, level: number, seconds = 2, rate = RATE): Promise<{ buffer: AudioBuffer; stats: AudioStats }> {
  const ctx = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
  const mix = buildMixer(ctx);
  const loop = new LoopVoice(ctx, mix.loops, name);
  loop.set(level);
  const buffer = await ctx.startRendering();
  return { buffer, stats: stats(buffer) };
}

/** BGM（game-2）＋ループ（cart）＋時間差の連続効果音を同時に混ぜて書き出す */
export async function renderMix(opts?: { seconds?: number; rate?: number }): Promise<{ buffer: AudioBuffer; stats: AudioStats; played: number }> {
  const seconds = opts?.seconds ?? 4;
  const rate = opts?.rate ?? RATE;
  const ctx = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
  const mix = buildMixer(ctx);
  const song = SONGS.game;
  const step = stepSeconds(song, 2);
  let t = 0.05;
  for (let i = 0; t < seconds - 0.05; i++) {
    scheduleEvents(ctx, mix.bgm, eventsAt(song, i % totalSteps(song), 2), t, step, song);
    t += step;
  }
  const loop = new LoopVoice(ctx, mix.loops, 'cart');
  loop.set(0.8);
  const limiter = new VoiceLimiter();
  const cues: readonly [SfxName, number][] = [
    ['knock', 0.4],
    ['knock', 0.44],
    ['knock', 0.48],
    ['knock', 0.52],
    ['knock', 0.56],
    ['knock', 0.6],
    ['crash', 0.65],
    ['can', 1.2],
    ['can', 1.24],
    ['can', 1.28],
    ['bell', 1.8],
    ['bell', 1.93],
    ['bell', 2.06],
    ['bell', 2.19],
    ['pin', 2.5],
    ['pin', 2.54],
    ['combo-up', 2.6],
    ['score', 2.9],
  ];
  let played = 0;
  for (const [name, at] of cues) {
    if (at >= seconds - 0.2) continue;
    const recipe = SFX[name];
    const g = limiter.allow(name, at, recipe.dur);
    if (g <= 0) continue;
    const voice = ctx.createGain();
    voice.gain.value = g;
    voice.connect(mix.sfx);
    recipe.play(ctx, voice, at, 1);
    played++;
  }
  const buffer = await ctx.startRendering();
  return { buffer, stats: stats(buffer), played };
}

/** 全部の効果音を0.15秒あけて1本につなげる（耳で確かめる用） */
export async function renderSfxReel(names: readonly SfxName[], rate = RATE): Promise<AudioBuffer> {
  const total = names.reduce((t, n) => t + SFX[n].dur + 0.25, 0.2);
  const ctx = new OfflineAudioContext(1, Math.ceil(rate * total), rate);
  const mix = buildMixer(ctx);
  let t = 0.1;
  for (const n of names) {
    SFX[n].play(ctx, mix.sfx, t, 1);
    t += SFX[n].dur + 0.25;
  }
  return ctx.startRendering();
}

/** 16bit・モノラルの WAV にする（base64） */
export function wavBase64(buf: AudioBuffer): string {
  const data = buf.getChannelData(0);
  const bytes = new Uint8Array(44 + data.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + data.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
