// OWNER: dragon
// window.__dragonAnim：竜の見た目の側が「いまどのクリップを見せているか」を、遊びの側の状態と突き合わせて数える。
// E2E（e2e/dragon.spec.ts）が、自動プレイでクリップが正しく切り替わるか（歩き・飛行・着地・炎・爪・尾・咆哮）をこれで確かめる。
// r03-roster：クリップの名前は3体の和（焔角の jump・stomp を含む）。地上の E は怪獣の specialClip、跳んでいる間は jump を期待する。
import { CREATURE_CLIPS, type ClipName } from '../config/creatures';
import { ACTIONS, ONE_SHOTS, type AnimState } from './animState';
import type { DragonIntent } from './intent';

type DragonClipName = ClipName;

export interface DragonAnimProbe {
  frames: number;
  dominant: DragonClipName;
  weights: Record<DragonClipName, number>;
  /** クリップが目立っていた（重み 0.5 超）コマ数 */
  seen: Record<DragonClipName, number>;
  /** 遊びの側が「その動き」をしていたコマ数と、そのうち対応するクリップの重みが 0.5 を超えていたコマ数（切り替わりの最初の 0.15 秒は数えない） */
  agree: Record<string, { frames: number; matched: number }>;
  /** 1コマでいちばん大きく変わった重み（瞬間の切り替えがあると 1 に近づく） */
  maxWeightStep: number;
  /**
   * 重みの変わる速さの最大（1/秒）。1コマの刻みが 1/30 秒以下のコマだけで測る（早回しで刻みが粗いと、正しい切り替えでも1コマの差が大きくなるため）。
   * いちばん速い正しい切り替え（一度きりのクリップの入り 0.07 秒）で約 21/秒、1コマで切り替えると 30/秒以上になる
   */
  maxWeightRate: number;
  /** maxWeightRate を測ったコマ数 */
  rateFrames: number;
  starts: Record<string, number>;
  lod: number;
}

declare global {
  interface Window {
    __dragonAnim?: DragonAnimProbe;
  }
}

const zero = (): Record<DragonClipName, number> => Object.fromEntries(CREATURE_CLIPS.map((n) => [n, 0])) as Record<DragonClipName, number>;

/** 遊びの側の状態から「見えているべきクリップ」を決める（自前の判定。見た目の実装とは独立に書く）。special は地上の E のクリップ。 */
function expected(it: DragonIntent, special: ClipName): { key: string; clips: DragonClipName[] } | null {
  if (it.roar.phase !== 'none') return { key: 'roar', clips: [special] };
  if (it.claw.phase !== 'none') return { key: 'claw', clips: ['claw'] };
  if (it.tail.phase !== 'none') return { key: 'tail', clips: ['tail'] };
  if (it.breath.active) return { key: 'breath', clips: ['breath'] };
  if (it.mode === 'dive') return { key: 'dive', clips: ['dive'] };
  if (it.mode === 'jump' || it.jump.phase !== 'none') return { key: 'jump', clips: ['jump'] };
  if (it.mode === 'air') return { key: 'air', clips: ['fly', 'glide', 'takeoff'] };
  if (it.mode === 'landing') return { key: 'landing', clips: ['land', 'idle', 'walk'] };
  if (it.speed > 11) return { key: 'run', clips: ['run', 'walk'] };
  if (it.speed > 3) return { key: 'walk', clips: ['walk', 'run'] };
  return { key: 'stand', clips: ['idle', 'walk'] };
}

export class ProbeRecorder {
  private readonly probe: DragonAnimProbe = {
    frames: 0,
    dominant: 'idle',
    weights: zero(),
    seen: zero(),
    agree: {},
    maxWeightStep: 0,
    maxWeightRate: 0,
    rateFrames: 0,
    starts: {},
    lod: 0,
  };
  private lastKey = '';
  private keyTime = 0;
  private readonly prev = zero();

  record(it: DragonIntent, state: AnimState, dt: number, lod: number): void {
    const p = this.probe;
    p.frames++;
    p.dominant = state.dominant();
    const fine = p.frames > 1 && dt > 0 && dt <= 1 / 30 + 1e-6;
    if (fine) p.rateFrames++;
    for (const name of CREATURE_CLIPS) {
      const w = state.clip[name].weight;
      if (p.frames > 1 && dt > 0) p.maxWeightStep = Math.max(p.maxWeightStep, Math.abs(w - this.prev[name]));
      if (fine) p.maxWeightRate = Math.max(p.maxWeightRate, Math.abs(w - this.prev[name]) / dt);
      this.prev[name] = w;
      p.weights[name] = Math.round(w * 1000) / 1000;
      if (w > 0.5) p.seen[name]++;
    }
    const e = expected(it, state.specialClip);
    if (e) {
      if (e.key !== this.lastKey) {
        this.lastKey = e.key;
        this.keyTime = 0;
      } else {
        this.keyTime += dt;
      }
      if (this.keyTime > 0.15 && dt > 0) {
        const a = (p.agree[e.key] ??= { frames: 0, matched: 0 });
        a.frames++;
        // 技は上半身の上書きなので、その技の重み。移動は候補のどれかが目立っていればよい
        const isAction = (ACTIONS as readonly string[]).includes(e.key);
        const ok = isAction ? state.clip[e.clips[0]].weight > 0.5 : e.clips.some((c) => state.clip[c].weight > 0.5 || (ONE_SHOTS.includes(c) && state.clip[c].weight > 0.3));
        if (ok) a.matched++;
      }
    }
    p.starts = { ...state.starts };
    p.lod = lod;
    window.__dragonAnim = p;
  }
}
