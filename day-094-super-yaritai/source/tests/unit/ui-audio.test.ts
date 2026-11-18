// 音の純粋な部分：BGM の楽譜の並び・強さごとの層とテンポ・同時に鳴る数の絞り・効果音の名前の網羅。
// 実際に鳴らした音量（割れないか）は、ブラウザの OfflineAudioContext で tools/ui-shots.mjs が測る。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudio } from '../../src/client/audio/index';
import { DEFAULT_LIMIT, TOTAL_LIMIT, VOICE_LIMITS, VoiceLimiter } from '../../src/client/audio/limiter';
import * as offline from '../../src/client/audio/offline';
import { GAME_SONG, SONGS, type Song, TITLE_SONG, TEMPO_SCALE, eventsAt, stepSeconds, totalSteps } from '../../src/client/audio/score';
import { SFX } from '../../src/client/audio/sfx';
import { App } from '../../src/client/app';
import type { SfxName, WorldView } from '../../src/shared/view';

/** ハ長調の音（ド・レ・ミ・ファ・ソ・ラ・シ） */
const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);

function allEvents(song: Song, intensity: 0 | 1 | 2) {
  return Array.from({ length: totalSteps(song) }, (_, s) => eventsAt(song, s, intensity).map((e) => ({ ...e, s })));
}

describe('BGM の楽譜', () => {
  for (const song of [TITLE_SONG, GAME_SONG]) {
    describe(song.id, () => {
      it('8小節×8分音符8つ＝64の位置でひと回りする', () => {
        expect(totalSteps(song)).toBe(64);
        expect(eventsAt(song, 64, 0)).toEqual(eventsAt(song, 0, 0));
        expect(eventsAt(song, -1, 0)).toEqual(eventsAt(song, 63, 0));
      });
      it('メロディはハ長調の音だけで、ひと回りの中に収まり、重ならない（単音）', () => {
        const lead = [...song.lead].sort((a, b) => a.step - b.step);
        for (const n of lead) {
          expect(C_MAJOR.has(((n.midi % 12) + 12) % 12)).toBe(true);
          expect(n.midi).toBeGreaterThanOrEqual(60);
          expect(n.midi).toBeLessThanOrEqual(96);
          expect(n.step + n.len).toBeLessThanOrEqual(totalSteps(song));
        }
        for (let i = 1; i < lead.length; i++) {
          const prev = lead[i - 1]!;
          expect(prev.step + prev.len).toBeLessThanOrEqual(lead[i]!.step);
        }
      });
      it('和音とベースもハ長調の音だけ', () => {
        for (const chord of song.chords) for (const m of chord) expect(C_MAJOR.has(m % 12)).toBe(true);
        for (const n of song.bass) expect(C_MAJOR.has(n.midi % 12)).toBe(true);
        expect(song.chords).toHaveLength(song.bars);
      });
      it('同じ音の繰り返しだけにならない（メロディに5種類以上の高さ）', () => {
        expect(new Set(song.lead.map((n) => n.midi)).size).toBeGreaterThanOrEqual(5);
      });
    });
  }

  it('試合の曲：強さ0は低音とリズムなし、1で低音・キック・スネアが加わる', () => {
    const at0 = allEvents(GAME_SONG, 0).flat();
    const at1 = allEvents(GAME_SONG, 1).flat();
    const count = (evs: { inst: string }[], inst: string): number => evs.filter((e) => e.inst === inst).length;
    expect(count(at0, 'bass')).toBe(0);
    expect(count(at0, 'kick')).toBe(0);
    expect(count(at0, 'snare')).toBe(0);
    expect(count(at0, 'lead')).toBe(GAME_SONG.lead.length);
    expect(count(at0, 'hat')).toBeGreaterThan(0);
    expect(count(at1, 'bass')).toBe(GAME_SONG.bass.length);
    expect(count(at1, 'kick')).toBe(16);
    expect(count(at1, 'snare')).toBe(16);
  });

  it('強さ2はテンポを上げる（音の並びは1と同じで、ハイハットだけ細かくなる）', () => {
    expect(stepSeconds(GAME_SONG, 2)).toBeCloseTo(stepSeconds(GAME_SONG, 1) / TEMPO_SCALE[2], 10);
    expect(stepSeconds(GAME_SONG, 2)).toBeLessThan(stepSeconds(GAME_SONG, 1));
    expect(stepSeconds(GAME_SONG, 1)).toBe(stepSeconds(GAME_SONG, 0));
    const strip = (evs: { inst: string }[][]) => evs.map((e) => e.filter((x) => x.inst !== 'hat'));
    expect(strip(allEvents(GAME_SONG, 2))).toEqual(strip(allEvents(GAME_SONG, 1)));
    const hats = (i: 0 | 1 | 2) => allEvents(GAME_SONG, i).flat().filter((e) => e.inst === 'hat').length;
    expect(hats(2)).toBeGreaterThan(hats(1));
  });

  it('テンポ：タイトル108、試合126（ラストスパートで約154）', () => {
    expect(60 / stepSeconds(TITLE_SONG, 0) / 2).toBeCloseTo(108, 6);
    expect(60 / stepSeconds(GAME_SONG, 0) / 2).toBeCloseTo(126, 6);
    expect(60 / stepSeconds(GAME_SONG, 2) / 2).toBeCloseTo(153.72, 2);
  });

  it('タイトルの和音はのばす（小節の頭と半ば）、試合は裏拍で刻む', () => {
    const chordSteps = (song: Song) => [...new Set(allEvents(song, 1).flat().filter((e) => e.inst === 'chord').map((e) => e.s % 8))].sort();
    expect(chordSteps(TITLE_SONG)).toEqual([0, 4]);
    expect(chordSteps(GAME_SONG)).toEqual([1, 3, 5, 7]);
  });

  it('タイトルと試合はちがう曲', () => {
    expect(SONGS.title).not.toBe(SONGS.game);
    expect(TITLE_SONG.lead.map((n) => n.midi)).not.toEqual(GAME_SONG.lead.map((n) => n.midi));
  });
});

describe('同時に鳴る数の絞り', () => {
  it('同じ音を1フレームに40回呼んでも、上限の数しか鳴らさない', () => {
    const lim = new VoiceLimiter();
    const gains = Array.from({ length: 40 }, () => lim.allow('knock', 1.0, 0.2));
    const played = gains.filter((g) => g > 0);
    expect(played).toHaveLength(VOICE_LIMITS.knock ?? DEFAULT_LIMIT);
    // 重なるほど小さく（合計の音量が数に比例して増えない）
    expect(played[0]).toBe(1);
    for (let i = 1; i < played.length; i++) expect(played[i]!).toBeLessThan(played[i - 1]!);
    expect(played.reduce((t, g) => t + g, 0)).toBeLessThan(played.length * 0.75);
  });
  it('鳴り終わったら、また鳴らせる', () => {
    const lim = new VoiceLimiter();
    for (let i = 0; i < 10; i++) lim.allow('can', 0, 0.45);
    expect(lim.allow('can', 0.1, 0.45)).toBe(0);
    expect(lim.allow('can', 0.5, 0.45)).toBe(1);
    expect(lim.active(0.5, 'can')).toBe(1);
  });
  it('書いていない音は3つまで、全体は28まで', () => {
    const lim = new VoiceLimiter();
    const jumps = Array.from({ length: 5 }, () => lim.allow('jump', 0, 1)).filter((g) => g > 0);
    expect(jumps).toHaveLength(DEFAULT_LIMIT);
    const names: SfxName[] = ['knock', 'can', 'pin', 'score', 'bell', 'dash', 'throw', 'pick-up', 'slip', 'eat', 'roll', 'crash'];
    let total = jumps.length;
    for (const n of names) for (let i = 0; i < 10; i++) if (lim.allow(n, 0.01, 1) > 0) total++;
    expect(total).toBe(TOTAL_LIMIT);
    expect(lim.active(0.02)).toBe(TOTAL_LIMIT);
  });
});

describe('効果音の名前', () => {
  it('SfxName の全部にレシピがある', async () => {
    // sfx.ts は WebAudio の関数を呼ぶだけで、読み込んだだけでは何も鳴らさない（Node でも読める）
    const { SFX, SFX_NAMES } = await import('../../src/client/audio/sfx');
    const expected: SfxName[] = [
      'knock', 'can', 'crash', 'bell', 'pa-chime', 'eat', 'freezer', 'slip', 'tantrum', 'pin', 'roll', 'combo-up', 'combo-break',
      'score', 'achieve', 'complete', 'notice', 'caught', 'escape', 'countdown', 'go', 'time-up', 'pick-up', 'throw', 'jump', 'dash', 'button',
    ];
    expect([...SFX_NAMES].sort()).toEqual([...expected].sort());
    for (const n of expected) {
      expect(SFX[n].dur).toBeGreaterThan(0);
      expect(SFX[n].dur).toBeLessThan(3);
    }
  });
});

interface FakeParam {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  setTargetAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
}

function fakeParam(value = 0): FakeParam {
  return {
    value,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function createFakeAudioEnv() {
  const listeners = new Map<string, Set<() => void>>();
  const docListeners = new Map<string, Set<() => void>>();
  const voiceGains: { gain: FakeParam; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  let ctxInstance: FakeAudioContext | null = null;

  class FakeAudioContext {
    state: 'suspended' | 'running' | 'closed' | 'interrupted' = 'suspended';
    currentTime = 0;
    sampleRate = 44100;
    destination = {};
    suspend = vi.fn(async () => {
      this.state = 'suspended';
    });
    resume = vi.fn(async () => {
      this.state = 'running';
    });

    constructor() {
      ctxInstance = this;
    }

    createGain() {
      const node = {
        gain: fakeParam(1),
        connect: vi.fn((dest: unknown) => dest),
        disconnect: vi.fn(),
      };
      voiceGains.push(node);
      return node;
    }

    createStereoPanner() {
      return { pan: fakeParam(0), connect: vi.fn((dest: unknown) => dest), disconnect: vi.fn() };
    }

    createDynamicsCompressor() {
      return {
        threshold: fakeParam(-10),
        knee: fakeParam(6),
        ratio: fakeParam(8),
        attack: fakeParam(0.003),
        release: fakeParam(0.2),
        connect: vi.fn((dest: unknown) => dest),
        disconnect: vi.fn(),
      };
    }

    createOscillator() {
      return {
        type: 'sine' as OscillatorType,
        frequency: fakeParam(440),
        detune: fakeParam(0),
        connect: vi.fn((dest: unknown) => dest),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };
    }

    createBiquadFilter() {
      return {
        type: 'lowpass' as BiquadFilterType,
        frequency: fakeParam(1000),
        Q: fakeParam(1),
        connect: vi.fn((dest: unknown) => dest),
        disconnect: vi.fn(),
      };
    }

    createBuffer(channels: number, length: number, sampleRate: number) {
      const data = new Float32Array(length);
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: () => data,
      };
    }

    createBufferSource() {
      return {
        buffer: null as unknown,
        loop: false,
        connect: vi.fn((dest: unknown) => dest),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };
    }
  }

  class FakeOfflineAudioContext extends FakeAudioContext {
    readonly length: number;
    readonly numberOfChannels: number;

    constructor(channels: number, length: number, sampleRate: number) {
      super();
      this.numberOfChannels = channels;
      this.length = length;
      this.sampleRate = sampleRate;
      this.state = 'running';
    }

    startRendering = vi.fn(async () => {
      const buf = this.createBuffer(this.numberOfChannels, this.length, this.sampleRate);
      const data = buf.getChannelData();
      if (data.length > 0) data[0] = 0.1;
      return buf;
    });
  }

  const fakeWindow = {
    addEventListener(type: string, fn: () => void) {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
    dispatch(type: string) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn();
    },
    AudioContext: FakeAudioContext,
  };

  const fakeDocument = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener(type: string, fn: () => void) {
      const set = docListeners.get(type) ?? new Set();
      set.add(fn);
      docListeners.set(type, set);
    },
    removeEventListener(type: string, fn: () => void) {
      docListeners.get(type)?.delete(fn);
    },
  };

  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);

  return {
    fakeWindow,
    voiceGains,
    getCtx: () => ctxInstance,
  };
}

function minimalView(events: WorldView['events'], mySlot = 0): WorldView {
  return {
    phase: 'playing',
    timeLeft: 90,
    duration: 120,
    lastSpurt: false,
    avatars: [
      {
        slot: mySlot,
        kind: 'human',
        name: '1P',
        character: 'ch/character-female-b',
        pos: { x: 0, y: 0, z: 0 },
        yaw: 0,
        anim: 'idle',
        holding: null,
        ridingCart: null,
        stunned: 0,
        score: 0,
        combo: { level: 0, multiplier: 1, remaining: 0 },
        heat: 0,
        achieved: [],
        secrets: [],
        isLocal: true,
        prompt: null,
        connected: true,
      },
    ],
    npcs: [],
    propTransforms: new Float32Array(0),
    propHidden: new Uint8Array(0),
    carts: [],
    peels: [],
    stations: {
      pyramid: { collapsed: false, rebuildIn: 0 },
      bowling: { pinsDown: 0, resetIn: 0 },
      samples: { left: 3, refillIn: 0 },
      watermelons: { left: 2, refillIn: 0 },
      pa: { activeSlot: null, holdProgress: 0, cooldown: 0 },
      freezerSlots: [],
    },
    events,
    damage: 0,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('品質改善（ベル連打・時間差減衰・Safari復帰・時刻清掃・App音響・Offline）', () => {
  it('ベルを 0.13s 間隔で20回連打しても dur 調律によりほぼ全て（>= 18/20）鳴る', () => {
    expect(SFX.bell.dur).toBeLessThanOrEqual(0.25);
    const lim = new VoiceLimiter();
    let allowed = 0;
    for (let i = 0; i < 20; i++) {
      if (lim.allow('bell', i * 0.13, SFX.bell.dur) > 0) allowed++;
    }
    expect(allowed).toBeGreaterThanOrEqual(18);
  });

  it('VoiceLimiter は 12ms 窓外でも鳴り続けの同種ボイス数（0, 0.04, 0.08s）で 1/√n 減衰する', () => {
    const lim = new VoiceLimiter();
    const g0 = lim.allow('knock', 0, 0.2);
    const g1 = lim.allow('knock', 0.04, 0.2);
    const g2 = lim.allow('knock', 0.08, 0.2);
    expect(g0).toBe(1);
    expect(g1).toBeCloseTo(1 / Math.sqrt(2), 5);
    expect(g2).toBeCloseTo(1 / Math.sqrt(3), 5);
  });

  it('Safari の一時中断（suspended / interrupted）後も次のジェスチャーで再 resume する', async () => {
    const env = createFakeAudioEnv();
    const audio = createAudio();
    env.fakeWindow.dispatch('pointerdown');
    await Promise.resolve();
    const ctx = env.getCtx()!;
    expect(ctx).not.toBeNull();
    expect(ctx.state).toBe('running');
    const callsAfterBoot = ctx.resume.mock.calls.length;

    // すでに running 中の操作では余計に resume しない
    env.fakeWindow.dispatch('pointerdown');
    expect(ctx.resume.mock.calls.length).toBe(callsAfterBoot);

    // Safari による割り込み・一時停止後、次の操作で復帰できる
    ctx.state = 'suspended';
    env.fakeWindow.dispatch('touchend');
    expect(ctx.resume.mock.calls.length).toBe(callsAfterBoot + 1);
    await Promise.resolve();
    expect(ctx.state).toBe('running');

    ctx.state = 'interrupted';
    env.fakeWindow.dispatch('keydown');
    expect(ctx.resume.mock.calls.length).toBe(callsAfterBoot + 2);

    // 終了時クリーンアップ
    audio.stopBgm();
  });

  it('voice.disconnect() は setTimeout ではなく AudioContext.currentTime に従って片付ける', () => {
    vi.useFakeTimers();
    const env = createFakeAudioEnv();
    const audio = createAudio();
    env.fakeWindow.dispatch('pointerdown');
    const ctx = env.getCtx()!;
    ctx.state = 'running';
    ctx.currentTime = 1.0;

    // buildMixer が 4 つ GainNode (sfx, loops, bgm, master) を作ったあと、最初の voice が作られる
    const beforeVoices = env.voiceGains.length;
    audio.play('score');
    const firstVoice = env.voiceGains[beforeVoices]!;
    expect(firstVoice).toBeDefined();

    // タブ停止中を想定し、実時間だけ 5 秒進んでも ctx.currentTime が止まっていれば切断しない
    vi.advanceTimersByTime(5000);
    expect(firstVoice.disconnect).not.toHaveBeenCalled();

    // AudioContext の時刻が再生終端を越えた後の play() で掃除される
    ctx.currentTime = 2.5;
    audio.play('button');
    expect(firstVoice.disconnect).toHaveBeenCalledTimes(1);
    audio.stopBgm();
  });

  it('App.playSounds() は combo-break と、他主要SFX非発生・140ms間隔の score を鳴らす', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const played: { name: SfxName; opts?: { volume?: number; pan?: number; pitch?: number } }[] = [];
    const fakeApp = {
      session: { mySlot: 0 },
      renderer: null,
      audio: {
        play: (name: SfxName, opts?: { volume?: number; pan?: number; pitch?: number }) => {
          played.push({ name, opts });
        },
        setBgmIntensity: vi.fn(),
        setLoop: vi.fn(),
      },
    };
    const playSounds = (App.prototype as unknown as { playSounds(view: WorldView): void }).playSounds;

    // 1. ローカル combo-break は再生、他人の combo-break は再生しない
    playSounds.call(fakeApp, minimalView([{ t: 'combo-break', slot: 1 }, { t: 'combo-break', slot: 0 }]));
    expect(played.map((p) => p.name)).toEqual(['combo-break']);

    // 2. 主要SFXがないローカル score は volume: 0.45 で鳴り、140ms 未満は間引く
    played.length = 0;
    const scoreEv: WorldView['events'][number] = { t: 'score', slot: 0, kind: 'cart', points: 20, multiplier: 1, pos: { x: 0, y: 1, z: 0 } };
    playSounds.call(fakeApp, minimalView([scoreEv]));
    expect(played).toEqual([{ name: 'score', opts: { volume: 0.45 } }]);

    played.length = 0;
    vi.advanceTimersByTime(50);
    playSounds.call(fakeApp, minimalView([scoreEv]));
    expect(played).toEqual([]);

    vi.advanceTimersByTime(100);
    playSounds.call(fakeApp, minimalView([scoreEv]));
    expect(played).toEqual([{ name: 'score', opts: { volume: 0.45 } }]);

    // 3. 同じフレームにローカルの主要SFX（knock等）があるときは score を重ねない（棚雪崩の連打抑止）
    played.length = 0;
    vi.advanceTimersByTime(200);
    playSounds.call(fakeApp, minimalView([scoreEv, { t: 'sfx', name: 'knock', pos: { x: 1, y: 0.5, z: 0 }, volume: 0.7 }]));
    expect(played.map((p) => p.name)).toEqual(['knock']);

    // 4. 自機ジャンプなど軽微SFXや遠方のSFXだけなら score を鳴らす
    played.length = 0;
    vi.advanceTimersByTime(200);
    playSounds.call(fakeApp, minimalView([scoreEv, { t: 'sfx', name: 'jump', pos: { x: 0, y: 0, z: 0 } }]));
    expect(played.map((p) => p.name)).toEqual(['jump', 'score']);

    played.length = 0;
    vi.advanceTimersByTime(200);
    playSounds.call(fakeApp, minimalView([scoreEv, { t: 'sfx', name: 'knock', pos: { x: 15, y: 0, z: 0 } }]));
    expect(played.map((p) => p.name)).toEqual(['knock', 'score']);
  });

  it('offline.ts が renderLoop / renderMix と rate 指定をサポートする', async () => {
    createFakeAudioEnv();
    expect(typeof offline.renderLoop).toBe('function');
    expect(typeof offline.renderMix).toBe('function');

    const sfx44 = await offline.renderSfx('bell', 1, 44100);
    expect(sfx44.buffer.sampleRate).toBe(44100);

    const song44 = await offline.renderSong('game', 0, 2, 44100);
    expect(song44.buffer.sampleRate).toBe(44100);

    const loop = await offline.renderLoop('cart', 0.8, 2, 44100);
    expect(loop.buffer.sampleRate).toBe(44100);
    expect(Number.isFinite(loop.stats.peak)).toBe(true);

    const mix = await offline.renderMix({ rate: 44100 });
    expect(mix.buffer.sampleRate).toBe(44100);
    expect(mix.played).toBeGreaterThan(0);
    expect(Number.isFinite(mix.stats.peak)).toBe(true);
  });
});
