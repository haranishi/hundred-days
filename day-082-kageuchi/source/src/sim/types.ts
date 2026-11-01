// OWNER: core
// sim の入力・出来事・内部の状態の形。three も DOM も import しない。
import type { ActionKind, MarkSnap, Phase } from '../contract/snapshot';
import type { GuardDef, SurfaceKind } from '../stage/types';
import type { Pt } from './nav';
import type { MoveStance } from './perception';
import type { LightTier } from './query';

/** 1刻み分の入力。画面の側（カメラ・キー）から作る。sim はこれ以外の外の状態を読まない。 */
export interface SimInput {
  /** 左右（右が +1）。 */
  moveX: number;
  /** 前後（前が +1）。 */
  moveY: number;
  /** カメラの向き（地図の Yaw。ばねに通す前の入力の向き）。移動はこれを前として決める。 */
  camYaw: number;
  run: boolean;
  /** この刻みで押された：しゃがみの切り替え。 */
  crouchToggle: boolean;
  /** この刻みで押された：当て身・討ち取る。 */
  interact: boolean;
  attack?: boolean;
  /** 小石の狙い（Q を押している間）。 */
  aim: boolean;
  /** 画面中央の線と地面の交点。狙っている間だけ。null なら前へ STONE.defaultAim。 */
  aimPoint: { x: number; z: number } | null;
  /** この刻みで押された：狙いをやめる（右クリックか Esc）。投げずに狙いを消し、Q を離すまで狙い直さない。r03-fix-play 追加 */
  cancelAim?: boolean;
}

export function idleInput(camYaw = 0): SimInput {
  return { moveX: 0, moveY: 0, camYaw, run: false, crouchToggle: false, interact: false, aim: false, aimPoint: null };
}

/** 見つかった理由：視界・物音（足音）・小石を調べに来た・倒れた仲間・当て身を見られた。 */
export type DetectCause = 'sight' | 'noise' | 'stone' | 'body' | 'takedown' | 'debug';

/** 最初の発見と、捕まった瞬間の記録。失敗の画面に理由として出す。 */
export interface DetectRecord {
  t: number;
  guardId: string;
  guardName: string;
  cause: DetectCause;
  /** プレイヤーの足元の明るさとその段。 */
  light: number;
  lightTier: LightTier;
  stance: MoveStance;
  still: boolean;
  inBush: boolean;
  surface: SurfaceKind;
  distance: number;
  phase: Phase;
  x: number;
  z: number;
}

export type NoiseKind = 'footstep' | 'stone' | 'takedown';

export type SimEvent =
  | { type: 'melee'; t: number; stage: 'start' | 'hit' | 'miss'; guardId: string | null }
  | { type: 'suspicious'; t: number; guardId: string; cause: DetectCause }
  | { type: 'discovered'; t: number; guardId: string; record: DetectRecord; count: number }
  | { type: 'takedown'; t: number; guardId: string; stage: 'start' | 'done' }
  | { type: 'stoneThrown'; t: number; x: number; z: number }
  | { type: 'stoneLanded'; t: number; x: number; z: number }
  | { type: 'footstep'; t: number; x: number; z: number; radius: number; surface: SurfaceKind; stance: MoveStance }
  | { type: 'heard'; t: number; guardId: string; kind: NoiseKind; x: number; z: number }
  | { type: 'bodyNoticed'; t: number; guardId: string; bodyId: string }
  | { type: 'bodyFound'; t: number; guardId: string; bodyId: string }
  | { type: 'phase'; t: number; from: Phase; to: Phase }
  | { type: 'caught'; t: number; guardId: string; record: DetectRecord }
  | { type: 'assassinated'; t: number }
  | { type: 'shout'; t: number; guardId: string; text: string };

export type SimEventType = SimEvent['type'];

export interface ActionState {
  kind: ActionKind;
  /** 経過秒と長さ。t ＝ elapsed ÷ duration。 */
  elapsed: number;
  duration: number;
  /** 相手（当て身・討ち取り・突き）。 */
  targetId?: string;
  effectDone?: boolean;
  /** 当て身・討ち取りの踏み込み：始めた位置と、詰め終わる位置（stepIn が初めに決める）。 */
  stepFrom?: { x: number; z: number };
  stepTo?: { x: number; z: number };
}

export interface PlayerState {
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  yaw: number;
  prevYaw: number;
  vx: number;
  vz: number;
  /** この刻みの水平の速さ（m/s）。 */
  speed: number;
  crouch: boolean;
  /** 走るキーを押して動いている（立っているとき）。 */
  running: boolean;
  moveStance: MoveStance;
  still: boolean;
  stones: number;
  stepTimer: number;
  action: ActionState | null;
  light: number;
  tier: LightTier;
  inBush: boolean;
  surface: SurfaceKind;
  aiming: boolean;
  aim: { x: number; z: number; valid: boolean } | null;
  /** 狙いをやめた後、まだ Q を押している（離すまで狙い直さない・離しても投げない）。r03-fix-play 追加 */
  aimCancelled: boolean;
  /** 当て身・討ち取りができる相手（画面の「E 当て身」「E 討ち取る」）。 */
  prompt: { kind: 'takedown' | 'assassinate'; targetId: string } | null;
}

/** 番兵の土台の振る舞い。 */
export type GuardBase = 'post' | 'patrol' | 'doze' | 'seated';

/** 番兵のいまの振る舞い。base は土台（立ち番・見回り・居眠り・座る）。 */
export type GuardMode = 'base' | 'investigate' | 'chase' | 'search' | 'return' | 'body' | 'lookAt' | 'victim' | 'down' | 'strike' | 'rush' | 'stagger';

export interface GuardState {
  def: GuardDef;
  id: string;
  name: string;
  role: 'guard' | 'target';
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  yaw: number;
  prevYaw: number;
  headYaw: number;
  prevHeadYaw: number;
  speed: number;
  base: GuardBase;
  mode: GuardMode;
  dozing: boolean;
  /** 起きた時刻（居眠り番がまた眠るまでを数える）。 */
  awakeSince: number;
  sightMul: number;
  fillMul: number;
  lantern: boolean;
  walkSpeed: number;
  // 立ち番の見回し
  lookIdx: number;
  lookHeld: number;
  // 見回りの道順
  wpIdx: number;
  wpDir: 1 | -1;
  waitLeft: number;
  // 歩く道（A* か、道順の直線）
  path: Pt[] | null;
  pathIdx: number;
  /** 道を引く順番待ちの中。 */
  pathPending: boolean;
  repathAt: number;
  /** 目指している点（調べる・追う・戻る）。 */
  goal: Pt | null;
  /** 着いてから見回す残り秒（調べる・捜索・倒れた仲間・追う先）。 */
  lookLeft: number;
  lookClock: number;
  // 捜索
  searchPts: Pt[];
  searchIdx: number;
  // 倒れた仲間
  bodyTarget: string | null;
  // 知覚
  s: number;
  lastSeenT: number;
  /** 「？」が出た時刻（出ていなければ -1）。刻みの終わりに印から決める。 */
  qSince: number;
  /** いまの頭の上の印（刻みの終わりに決める）。 */
  mark: MarkSnap['kind'] | null;
  /** この「？」のきっかけ。 */
  origin: DetectCause | null;
  /** この刻みにプレイヤーが見えた。 */
  sees: boolean;
  /** 追っている最後に見た位置の版（変わったら道を引き直す）。 */
  chaseVersion: number;
  // 倒れている
  down: boolean;
  meleeHits: number;
  attackCharge: number;
  bodyFound: boolean;
  bodyClaimedBy: string | null;
  action: ActionState | null;
  // 扇
  cone: Float32Array;
  coneCount: number;
  /** 暗い隙間の向こうの灯りの島（帯1本に 8 つ。perception.ts の ConeBuffers）と、その本数。 */
  bands: Float32Array;
  bandCount: number;
}
