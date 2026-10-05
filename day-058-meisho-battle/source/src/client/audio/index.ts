// 音の出口（app-context.ts の AudioApi）。音はすべてここを通るので、効果音とBGMはここで切れる。
// - 最初のタップ（unlock）より前は鳴らさない。AudioContext も、そのときに初めて作る
// - 部品の着地「コトッ」は、進み具合が大きく飛ぶと一度に何十件も届くので、1秒12回までに絞る
// - タブが隠れたら AudioContext を止め、戻ったら動かす
// - 効果音・BGM の入り切りは端末に覚える（Settings）

import type { AudioApi, Settings, SfxName } from '../ui/app-context'
import { Bgm } from './bgm'
import { sfxBuzz, sfxCorrect, sfxFanfare, sfxGo, sfxJoin, sfxLand, sfxPaint, sfxTap, sfxTick, sfxWrong } from './synth'

/** 着地の音を鳴らしてよい回数（1秒あたり） */
export const LAND_PER_SECOND = 12

export interface GameAudio extends AudioApi {
  sfxEnabled(): boolean
  bgmEnabled(): boolean
  /** unlock 済みで、音を鳴らせる状態か */
  readonly ready: boolean
}

type AudioContextCtor = new () => AudioContext

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export function createAudio(settings: Settings): GameAudio {
  let ctx: AudioContext | null = null
  let sfxBus: GainNode | null = null
  let bgm: Bgm | null = null
  let unlocked = false
  let bgmWanted = false
  let sfxOn = settings.get<boolean>('sfx', true) !== false
  let bgmOn = settings.get<boolean>('bgm', true) !== false
  const landTimes: number[] = []

  const hidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden'

  const syncBgm = (): void => {
    if (!bgm) return
    const should = unlocked && bgmOn && bgmWanted && !hidden()
    if (should) bgm.start()
    else bgm.stop()
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return
      if (hidden()) {
        bgm?.stop()
        void ctx.suspend().catch(() => {})
      } else if (unlocked) {
        void ctx.resume().catch(() => {})
        syncBgm()
      }
    })
  }

  const landAllowed = (): boolean => {
    const now = performance.now()
    while (landTimes.length > 0 && now - (landTimes[0] ?? 0) >= 1000) landTimes.shift()
    if (landTimes.length >= LAND_PER_SECOND) return false
    landTimes.push(now)
    return true
  }

  return {
    get ready(): boolean {
      return unlocked && ctx !== null && ctx.state === 'running'
    },

    unlock(): void {
      if (!ctx) {
        const Ctor = audioContextCtor()
        if (!Ctor) return
        try {
          ctx = new Ctor()
        } catch {
          return
        }
        const master = ctx.createGain()
        master.gain.value = 0.9
        master.connect(ctx.destination)
        sfxBus = ctx.createGain()
        sfxBus.gain.value = 0.8
        sfxBus.connect(master)
        bgm = new Bgm(ctx, master)
        // iPhone の Safari は、タップの中で一度音を出すと以後も鳴らせる。聞こえない長さの音を1つ鳴らしておく
        try {
          const buf = ctx.createBuffer(1, 1, ctx.sampleRate)
          const src = ctx.createBufferSource()
          src.buffer = buf
          src.connect(ctx.destination)
          src.start(0)
        } catch {
          // 鳴らせなくても先へ進む
        }
      }
      unlocked = true
      if (ctx.state !== 'running' && !hidden()) void ctx.resume().catch(() => {})
      syncBgm()
    },

    play(name: SfxName, opts?: { size?: number }): void {
      if (!ctx || !sfxBus || !unlocked || !sfxOn || ctx.state !== 'running') return
      if (name === 'land' && !landAllowed()) return
      const t = ctx.currentTime + 0.005
      const out = sfxBus
      switch (name) {
        case 'tap':
          return sfxTap(ctx, out, t)
        case 'land':
          return sfxLand(ctx, out, t, opts?.size ?? 0.3)
        case 'paint':
          return sfxPaint(ctx, out, t)
        case 'buzz':
          return sfxBuzz(ctx, out, t)
        case 'correct':
          return sfxCorrect(ctx, out, t)
        case 'wrong':
          return sfxWrong(ctx, out, t)
        case 'tick':
          return sfxTick(ctx, out, t)
        case 'go':
          return sfxGo(ctx, out, t)
        case 'fanfare':
          return sfxFanfare(ctx, out, t)
        case 'join':
          return sfxJoin(ctx, out, t)
      }
    },

    setSfxEnabled(on: boolean): void {
      sfxOn = on
      settings.set('sfx', on)
    },

    setBgmEnabled(on: boolean): void {
      bgmOn = on
      settings.set('bgm', on)
      syncBgm()
    },

    setBgmPlaying(playing: boolean): void {
      bgmWanted = playing
      syncBgm()
    },

    sfxEnabled: () => sfxOn,
    bgmEnabled: () => bgmOn,
  }
}
