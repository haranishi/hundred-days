// OWNER: integrate
// 遊びと音のつなぎ。sim の出来事（game.onEvent）を購読して効果音を鳴らし、毎コマ写し（snap）から環境音の位置と炎上を合わせる。
// 音は最初の操作（クリック・キー）で始まる（ブラウザの決まり）。M で消す・戻す。外の音源は使わない。
import { AUDIO } from '../config/audio';
import type { AudioDebugApi } from '../contract/hooks';
import type { SimSnapshot } from '../contract/snapshot';
import type { SimEvent } from '../sim/types';
import type { StageDef } from '../stage/types';
import { Ambience, type Listener } from './ambience';
import { AudioEngine, type Voice } from './engine';
import * as sfx from './sfx';

/** 討ち取りの演出の進み（sim の finale）に合わせて鳴らす合図：一閃と太鼓。題字（0.55）で大きな一打。 */
const FINALE_CUES: { at: number; kind: 'slash' | 'taiko' | 'taikoBig' }[] = [
  // 人物の討ち取りの動作（1.6 秒）で刀が走るのは t=0.24〜0.38（演出の進みで 0.038〜0.061）
  { at: 0.038, kind: 'slash' },
  { at: 0.062, kind: 'taikoBig' },
  { at: 0.23, kind: 'taiko' },
  { at: 0.265, kind: 'taiko' },
  { at: 0.55, kind: 'taikoBig' },
];

export class GameAudio {
  private readonly e = new AudioEngine();
  private readonly amb: Ambience;
  private readonly counts: Record<string, number> = {};
  private snap: SimSnapshot | null = null;
  private listener: Listener | null = null;
  private lastFinale = -1;

  constructor(stage: StageDef) {
    const braziers = stage.lights.filter((l) => l.kind === 'brazier').map((l) => ({ x: l.pos.x, z: l.pos.z }));
    const pond = stage.ponds[0] ? { x: stage.ponds[0].center.x, z: stage.ponds[0].center.z } : null;
    this.amb = new Ambience(this.e, braziers, pond);
  }

  /** 最初の操作の中で呼ぶ。2回目からは止まっていれば再開するだけ。 */
  start(): void {
    if (this.e.start()) this.amb.start();
  }

  toggleMute(): void {
    this.e.setMuted(!this.e.isMuted);
  }

  /** E2E と調べ用の様子。 */
  debug(): AudioDebugApi {
    const e = this.e;
    const counts = this.counts;
    return {
      get started() {
        return e.started;
      },
      get muted() {
        return e.isMuted;
      },
      get state() {
        return e.state;
      },
      get counts() {
        return counts;
      },
    };
  }

  private count(name: string): void {
    this.counts[name] = (this.counts[name] ?? 0) + 1;
  }

  /** 位置のある音の大きさと左右（聞き手はプレイヤー、左右はカメラの向き）。遠すぎれば null。 */
  private at(x: number, z: number, base: number, floor = 0): Voice | null {
    const l = this.listener;
    if (!l) return { dest: this.e.sfx, gain: base, pan: 0 };
    const dx = x - l.x;
    const dz = z - l.z;
    const d = Math.hypot(dx, dz);
    if (d > AUDIO.spatial.maxDistance && floor <= 0) return null;
    const k = 1 / (1 + (d / AUDIO.spatial.ref) ** 2);
    const pan = d > 0.3 ? ((dx * l.rightX + dz * l.rightZ) / d) * 0.85 : 0;
    return { dest: this.e.sfx, gain: base * Math.max(floor, k), pan };
  }

  private guardVoice(id: string, base: number, floor: number): Voice | null {
    const c = this.snap?.characters.find((ch) => ch.id === id);
    return c ? this.at(c.x, c.z, base, floor) : { dest: this.e.sfx, gain: base * floor, pan: 0 };
  }

  /** sim の出来事を受けて鳴らす（game.onEvent に渡す）。 */
  onEvent(ev: SimEvent): void {
    if (!this.e.started) return;
    const e = this.e;
    switch (ev.type) {
      case 'footstep': {
        const g = ev.stance === 'crouch' ? AUDIO.footstep.crouch : ev.stance === 'run' ? AUDIO.footstep.run : AUDIO.footstep.walk;
        sfx.footstep(e, { dest: e.sfx, gain: g * 0.55, pan: 0 }, ev.surface, ev.stance === 'run');
        this.count(`footstep-${ev.surface}`);
        break;
      }
      case 'suspicious': {
        const v = this.guardVoice(ev.guardId, 0.5, 0.45);
        if (v) sfx.question(e, v);
        this.count('question');
        break;
      }
      case 'discovered': {
        const v = this.guardVoice(ev.guardId, 0.8, 0.7);
        if (v) sfx.alarm(e, v);
        this.count('alarm');
        break;
      }
      case 'bodyNoticed': {
        const v = this.guardVoice(ev.guardId, 0.45, 0.35);
        if (v) sfx.puzzled(e, v);
        this.count('puzzled');
        break;
      }
      case 'takedown':
        if (ev.stage === 'start') sfx.takedownStart(e, { dest: e.sfx, gain: 0.5, pan: 0 });
        else sfx.takedownDone(e, { dest: e.sfx, gain: 0.75, pan: 0 });
        this.count(`takedown-${ev.stage}`);
        break;
      case 'melee':
        if (ev.stage === 'start') sfx.takedownStart(e, { dest: e.sfx, gain: 0.65, pan: 0 });
        if (ev.stage === 'hit') sfx.takedownDone(e, { dest: e.sfx, gain: 0.85, pan: 0 });
        this.count(`melee-${ev.stage}`);
        break;
      case 'stoneThrown':
        sfx.stoneThrow(e, { dest: e.sfx, gain: 0.35, pan: 0 });
        this.count('stoneThrow');
        break;
      case 'stoneLanded': {
        const v = this.at(ev.x, ev.z, 0.8, 0.12);
        if (v) sfx.stoneLand(e, v);
        this.count('stoneLand');
        break;
      }
      case 'caught':
        sfx.struck(e, { dest: e.sfx, gain: 0.8, pan: 0 });
        this.count('struck');
        break;
      default:
        break;
    }
  }

  /** 毎コマ：聞き手の位置・左右の向き、一時停止で下げる、討ち取りの演出の合図と炎上のうなり。 */
  update(snap: SimSnapshot, camYaw: number, camX: number, camZ: number, paused: boolean): void {
    this.snap = snap;
    const pl = snap.characters.find((c) => c.kind === 'player');
    this.listener = { x: pl ? pl.x : camX, z: pl ? pl.z : camZ, rightX: -Math.sin(camYaw), rightZ: Math.cos(camYaw) };
    if (!this.e.started) return;
    this.e.setDuck(paused ? AUDIO.pauseDuck : 1);
    const f = snap.finale;
    if (f === null) {
      this.lastFinale = -1;
      this.amb.setFire(0);
    } else {
      for (const c of FINALE_CUES) {
        if (this.lastFinale < c.at && f >= c.at) {
          const v: Voice = { dest: this.e.sfx, gain: c.kind === 'slash' ? 0.7 : 0.9, pan: 0, send: 0.35 };
          if (c.kind === 'slash') sfx.slash(this.e, v, this.e.now);
          else sfx.taiko(this.e, v, this.e.now, c.kind === 'taikoBig');
          this.count(c.kind);
        }
      }
      this.lastFinale = f;
      this.amb.setFire((f - 0.2) / 0.8);
    }
    this.amb.update(this.listener);
  }
}
