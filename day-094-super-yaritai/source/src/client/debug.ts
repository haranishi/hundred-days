/**
 * 試験用の窓口 window.__SY__（docs/06）。開発中と ?debug=1 のときだけ出す。
 * E2E と撮影ではこれで状態を読み、キャラを動かし、時間を早め、試合を終わらせる。
 */
import type { InputState } from '../shared/input';
import type { App } from './app';
import type { CameraPose, ShotName } from './render/camera';
import type { LocalSession } from '../game/session/LocalSession';

export interface SyDebug {
  state(): unknown;
  teleport(slot: number, x: number, z: number): void;
  face(slot: number, yaw: number): void;
  setTimeScale(n: number): void;
  forceEnd(): void;
  seed(n: number | null): void;
  shot(name: ShotName | null): void;
  /** 撮影用にカメラの位置・見る点・画角（度）を指定する（null で標準の追従カメラに戻す） */
  camera(pose: CameraPose | null): void;
  /** 自分の入力を数フレーム上書きする（撮影の台本用） */
  input(partial: Partial<InputState>, frames?: number): void;
  /** CPU を止める・動かす（撮影で構図を固定するため） */
  cpu(on: boolean): void;
  /** 画質を固定する（撮影用） */
  quality(q: 'low' | 'mid' | 'high' | 'auto'): void;
  /** 目立ち度を置く（店員に見つかる試験用。しばらく下がらない） */
  heat(slot: number, value: number): void;
}

export function debugEnabled(): boolean {
  try {
    return import.meta.env.DEV || new URLSearchParams(location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

export function installDebug(app: App): void {
  if (!debugEnabled()) return;
  const sim = (): LocalSession['sim'] | null => (app.session ? (app.session as LocalSession).sim ?? null : null);
  // ネット対戦の参加者の端末では sim が試験用の小さな窓口（GuestDebugHandle）で、avatarBySlot を持たない。
  // 持っているとき（ひとり・部屋の主）だけ使う
  const fullSim = (): LocalSession['sim'] | null => {
    const s = sim();
    return s && typeof (s as { avatarBySlot?: unknown }).avatarBySlot === 'function' ? s : null;
  };
  const api: SyDebug = {
    state() {
      const v = app.lastView;
      const st = app.renderer?.stats();
      return {
        screen: app.screen,
        phase: v?.phase ?? null,
        timeLeft: v ? Math.round(v.timeLeft * 100) / 100 : null,
        players: (v?.avatars ?? []).map((a) => ({
          slot: a.slot,
          kind: a.kind,
          name: a.name,
          score: a.score,
          combo: a.combo,
          heat: Math.round(a.heat * 10) / 10,
          achieved: a.achieved,
          secrets: a.secrets,
          pos: { x: Math.round(a.pos.x * 100) / 100, y: Math.round(a.pos.y * 100) / 100, z: Math.round(a.pos.z * 100) / 100 },
          // 画面の上の位置（CSS の画素）：足元と頭の上。HUD がキャラに重ならないかを E2E で確かめる
          screen: app.renderer
            ? { foot: app.renderer.project({ x: a.pos.x, y: a.pos.y, z: a.pos.z }), head: app.renderer.project({ x: a.pos.x, y: a.pos.y + 2.2, z: a.pos.z }) }
            : null,
          anim: a.anim,
          ridingCart: a.ridingCart,
          prompt: a.prompt,
          stunned: Math.round(a.stunned * 100) / 100,
          caught: fullSim()?.avatarBySlot(a.slot)?.book.caught ?? 0,
          progress: a.progress ?? {},
        })),
        npcs: v?.npcs ?? [],
        damage: v ? Math.round(v.damage * 1000) / 1000 : 0,
        stations: v?.stations ?? null,
        fps: st?.fps ?? 0,
        drawCalls: st?.calls ?? 0,
        triangles: st?.triangles ?? 0,
        quality: st?.quality ?? null,
        aim: app.renderer?.aimState() ?? null,
        result: app.session?.result() ?? null,
      };
    },
    teleport(slot, x, z) {
      // 置き直したら、台本の入力（input の続き）は打ち切る。画面が重いと「何フレーム」が長い時間になり、
      // 置き直した先でも前の入力のまま走り続けてしまう（ネット対戦の E2E で、参加者が置き直し先から西へ流れた）
      if (slot === app.session?.mySlot) app.overrideInput({}, 0);
      sim()?.teleport(slot, x, z);
      app.renderer?.cam.snap();
    },
    face(slot, yaw) {
      sim()?.face(slot, yaw);
    },
    setTimeScale(n) {
      app.timeScale = Math.max(0, n);
    },
    forceEnd() {
      sim()?.end();
    },
    seed(n) {
      app.nextSeed = n;
    },
    shot(name) {
      app.setShot(name);
    },
    camera(pose) {
      app.setCameraPose(pose);
    },
    input(partial, frames = 1) {
      app.overrideInput(partial, frames);
    },
    cpu(on) {
      app.cpuEnabled = on;
      const s = sim();
      if (s && !on) s.setController(1, null);
    },
    heat(slot, value) {
      const av = fullSim()?.avatarBySlot(slot);
      if (!av) return;
      av.book.heat = Math.max(0, Math.min(100, value));
      av.book.lastScoreAt = (sim()?.time ?? 0) + 30;
    },
    quality(q) {
      const r = app.renderer;
      if (!r) return;
      r.autoQuality = q === 'auto';
      if (q !== 'auto') r.setQuality(q);
    },
  };
  (window as unknown as { __SY__: SyDebug }).__SY__ = api;
}
