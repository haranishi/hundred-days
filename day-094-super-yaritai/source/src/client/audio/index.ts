// 音の出口（AudioAPI）。効果音・鳴らし続ける音・BGM は、すべてここを通る。
// - iOS では利用者の操作の中でしか音を出せない。unlock() が呼ばれるまで AudioContext も作らない。
//   呼び忘れに備えて、最初のタップ・キー入力で自分からも unlock する
// - 同じ音が1フレームに何十回呼ばれても、同時に鳴る数を絞る（limiter.ts）。最後に圧縮器で割れを抑える
// - タブが隠れたら AudioContext を止め、戻ったら動かす
// - 消音は端末に覚える（localStorage が使えない端末ではこのタブの間だけ）

import type { AudioAPI, BgmKind, LoopName } from '../contracts';
import type { SfxName } from '../../shared/view';
import { BgmPlayer } from './bgm';
import { VoiceLimiter } from './limiter';
import { LoopVoice } from './loops';
import { type Mixer, buildMixer } from './mixer';
import { SONGS } from './score';
import { SFX } from './sfx';

const MUTE_KEY = 'sy.muted';
/** コンボの段ごとに上げる音程（半音） */
const COMBO_SEMITONES = 2;
/** この秒数「コンボが上がる」が来なければ、段の数え直し */
const COMBO_RESET = 6;

type Ctor = new () => AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(m: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    // 覚えられない端末では、このタブの間だけ
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** コンボの段 n の音程の倍率（ゲームの芯が pitch に渡してもよい） */
export function comboPitch(level: number): number {
  return 2 ** ((Math.max(0, level - 1) * COMBO_SEMITONES) / 12);
}

let active: AudioAPI | null = null;

/** いま使っている音（画面のボタンの「ポチ」や結果のファンファーレに使う）。まだ無ければ null */
export function currentAudio(): AudioAPI | null {
  return active;
}

export function createAudio(): AudioAPI {
  let ctx: AudioContext | null = null;
  let mix: Mixer | null = null;
  let bgm: BgmPlayer | null = null;
  let unlocked = false;
  let muted = loadMuted();
  let wantedBgm: BgmKind | null = null;
  let intensity: 0 | 1 | 2 = 0;
  const limiter = new VoiceLimiter();
  const loopLevels: Record<LoopName, number> = { cart: 0, freezer: 0 };
  const loops: Partial<Record<LoopName, LoopVoice>> = {};
  let activeVoices: { node: GainNode; pan?: StereoPannerNode; endTime: number }[] = [];
  let comboLevel = 0;
  let comboAt = -Infinity;

  const sweepVoices = (now: number): void => {
    if (activeVoices.length === 0) return;
    const keep: typeof activeVoices = [];
    for (const v of activeVoices) {
      if (v.endTime < now) {
        try {
          v.node.disconnect();
          v.pan?.disconnect();
        } catch {
          // すでに切れていれば無視
        }
      } else {
        keep.push(v);
      }
    }
    activeVoices = keep;
  };

  const hidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const running = (): boolean => !!ctx && unlocked && ctx.state === 'running';

  const syncBgm = (): void => {
    if (!bgm) return;
    bgm.silent = muted;
    bgm.setIntensity(intensity);
    if (unlocked && wantedBgm && !hidden()) bgm.play(SONGS[wantedBgm]);
    else bgm.stop();
  };

  const syncLoops = (): void => {
    if (!ctx || !mix) return;
    for (const name of ['cart', 'freezer'] as const) {
      const level = muted ? 0 : loopLevels[name];
      if (level > 0 || loops[name]) {
        loops[name] ??= new LoopVoice(ctx, mix.loops, name);
        loops[name]?.set(level);
      }
    }
  };

  const onVisibility = (): void => {
    if (!ctx) return;
    if (hidden()) {
      bgm?.stop();
      void ctx.suspend().catch(() => {});
    } else if (unlocked) {
      void ctx.resume().catch(() => {});
      syncBgm();
    }
  };

  // 呼び忘れに備えた自動の unlock。Safari で一時中断されたあと再操作でも復活できるよう維持し、running 中は即抜ける
  const gestureEvents = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;
  const onGesture = (): void => {
    if (running()) return;
    api.unlock();
  };

  const api: AudioAPI = {
    unlock() {
      if (!ctx) {
        const C = audioContextCtor();
        if (!C) return;
        try {
          ctx = new C();
        } catch {
          return;
        }
        mix = buildMixer(ctx);
        mix.master.gain.value = muted ? 0 : 1;
        bgm = new BgmPlayer(ctx, mix.bgm);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
      }
      unlocked = true;
      if (ctx.state !== 'running' && !hidden()) {
        // iPhone の Safari は、操作の中で一度音を出すと以後も鳴らせる。聞こえない長さの音を1つ鳴らしておく。
        // 最初の pointerdown が操作と認められない版があるので、鳴るまで毎回やり直す（touchend・click でも呼ばれる）
        try {
          const src = ctx.createBufferSource();
          src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
          src.connect(ctx.destination);
          src.start(0);
        } catch {
          // 鳴らせなくても先へ進む
        }
        void ctx
          .resume()
          .then(() => {
            syncBgm();
            syncLoops();
          })
          .catch(() => {});
      }
      syncBgm();
      syncLoops();
    },

    play(name: SfxName, opts?: { volume?: number; pan?: number; pitch?: number }) {
      if (!running() || muted || !ctx || !mix) return;
      const recipe = SFX[name];
      if (!recipe) return;
      const now = ctx.currentTime;
      sweepVoices(now);
      const g = limiter.allow(name, now, recipe.dur);
      if (g <= 0) return;
      let pitch = opts?.pitch !== undefined && Number.isFinite(opts.pitch) ? clamp(opts.pitch, 0.25, 4) : 1;
      if (name === 'combo-break') comboLevel = 0;
      if (name === 'combo-up' && opts?.pitch === undefined) {
        // 段の高さを渡されなかったら、続けて上がった回数で音程を上げる
        comboLevel = now - comboAt > COMBO_RESET ? 1 : Math.min(6, comboLevel + 1);
        comboAt = now;
        pitch = comboPitch(comboLevel);
      }
      const voice = ctx.createGain();
      voice.gain.value = clamp(opts?.volume ?? 1, 0, 2) * g;
      let panNode: StereoPannerNode | undefined;
      const pan = opts?.pan;
      if (pan !== undefined && Number.isFinite(pan) && pan !== 0 && typeof ctx.createStereoPanner === 'function') {
        panNode = ctx.createStereoPanner();
        panNode.pan.value = clamp(pan, -1, 1);
        voice.connect(panNode).connect(mix.sfx);
      } else {
        voice.connect(mix.sfx);
      }
      recipe.play(ctx, voice, now + 0.005, pitch);
      activeVoices.push({ node: voice, pan: panNode, endTime: now + recipe.dur + 0.25 });
    },

    setLoop(name: LoopName, gain: number) {
      loopLevels[name] = Number.isFinite(gain) ? clamp(gain, 0, 1) : 0;
      if (running()) syncLoops();
    },

    startBgm(kind: BgmKind) {
      wantedBgm = kind;
      syncBgm();
    },

    stopBgm() {
      wantedBgm = null;
      syncBgm();
    },

    setBgmIntensity(level: 0 | 1 | 2) {
      intensity = level === 1 || level === 2 ? level : 0;
      bgm?.setIntensity(intensity);
    },

    setMuted(m: boolean) {
      muted = !!m;
      saveMuted(muted);
      if (ctx && mix) {
        const t = ctx.currentTime;
        mix.master.gain.cancelScheduledValues(t);
        mix.master.gain.setTargetAtTime(muted ? 0 : 1, t, 0.03);
      }
      syncBgm();
      if (running()) syncLoops();
    },

    get muted() {
      return muted;
    },
  };

  if (typeof window !== 'undefined') {
    for (const ev of gestureEvents) window.addEventListener(ev, onGesture, { capture: true, passive: true });
  }
  active = api;
  return api;
}
