/**
 * 描画・HUD・音・ネットの符号化が読む「店の見え方」の型（docs/06_作り方と検証.md）。
 *
 * - ひとり（Local）・部屋の主（Host）は Simulation がこれを作る
 * - 参加者（Guest）は届いた店の様子からこれを組み立てる
 * - 描画とHUDはどのモードでも、この型だけを読む
 *
 * 座標はメートル。x＝東、y＝上、z＝手前（南）。店の中心の床が原点。
 * yaw は Y軸まわりの回転（ラジアン）。0 で +Z（手前・カメラ側）を向き、three.js の rotation.y にそのまま入れる。
 * この型を変えたいときは、理由を書いて設計者に返す（担当が勝手に形を変えない）。
 */
import type { MisdeedId, ScoreKind, SecretId } from './rules/misdeeds';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Phase = 'countdown' | 'playing' | 'ended';
export type CpuLevel = 'easy' | 'normal' | 'hard';

/** 素材の鍵。'mm/〜'＝Mini Market、'fk/〜'＝Food Kit、'ch/〜'＝Mini Characters、'pc/〜'＝コードで作る部品 */
export type ModelKey = string;

// ───────── 試合のはじめに決まり、試合中は変わらないもの ─────────

export type PropShape = 'box' | 'cylinder' | 'ball';
export type PropKind = 'product' | 'can' | 'pin' | 'watermelon' | 'banana' | 'basket';

export interface PropDef {
  /** 0 から振る通し番号。propTransforms の何番目かと一致する */
  id: number;
  kind: PropKind;
  model: ModelKey;
  /** 描画の倍率（モデルの元の大きさ → この大きさ） */
  scale: number;
  shape: PropShape;
  /** 当たり判定の大きさ（box＝幅・高さ・奥行き、cylinder＝直径・高さ・直径、ball＝直径） */
  size: Vec3;
  mass: number;
  /** 置かれていた位置（床からの高さを含む）と向き */
  home: { pos: Vec3; yaw: number };
  /** 棚や台の番号（なぎ払いの対象を探すのに使う）。床置きは null */
  fixtureId: number | null;
}

export interface CartDef {
  id: number;
  home: { pos: Vec3; yaw: number };
}

/** 試合を組み立てるのに必要なすべて。部屋の主と参加者は同じ seed から同じものを作る */
export interface WorldStatic {
  seed: number;
  props: PropDef[];
  carts: CartDef[];
}

// ───────── 毎フレーム変わるもの ─────────

export type AnimName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'dash'
  | 'jump'
  | 'fall'
  | 'push-cart'
  | 'ride-cart'
  | 'kick'
  | 'sweep'
  | 'hold'
  | 'throw'
  | 'pick-up'
  | 'eat'
  | 'bell'
  | 'pa'
  | 'chill'
  | 'tantrum'
  | 'slip'
  | 'caught'
  | 'stunned'
  | 'cheer'
  | 'sad';

/** アクションボタンに出す案内。近くに何もなければ null（ボタンは「蹴る」） */
export interface ActionPrompt {
  label: string;
  press: 'press' | 'hold' | 'mash';
  /** 長押しの進み具合 0..1（hold のときだけ） */
  progress?: number;
  misdeed?: MisdeedId;
}

export interface ComboView {
  level: number;
  multiplier: number;
  /** 途切れるまでの残り秒 */
  remaining: number;
}

export interface AvatarView {
  /** プレイヤー番号 0..3（1P=0）。CPUのライバルもこの枠を使う */
  slot: number;
  kind: 'human' | 'cpu';
  name: string;
  character: ModelKey;
  /** 足元の位置 */
  pos: Vec3;
  yaw: number;
  anim: AnimName;
  /** 持っている物の PropDef.id */
  holding: number | null;
  ridingCart: number | null;
  /** 捕まった・滑ったなどで操作できない残り秒（0なら動ける） */
  stunned: number;
  score: number;
  combo: ComboView;
  /** 目立ち度 0..100 */
  heat: number;
  achieved: MisdeedId[];
  secrets: SecretId[];
  /** この端末で操作しているキャラか */
  isLocal: boolean;
  /** この端末で操作しているキャラにだけ入る */
  prompt: ActionPrompt | null;
  connected: boolean;
  /**
   * 達成に向けた進み具合（例：ベルを12回鳴らした → { bell: 12 }）。目標は MISDEEDS の goal.target。
   * HUD のリストに「12/20」と出すのに使う。省略可（2026-10-06 core の相談で追加）
   */
  progress?: Partial<Record<MisdeedId, number>>;
}

export type NpcRole = 'clerk' | 'manager' | 'shopper';
export type NpcState =
  | 'patrol'
  | 'notice'
  | 'chase'
  | 'carry'
  | 'rest'
  | 'slipped'
  | 'investigate'
  | 'wander'
  | 'react';

export interface NpcView {
  id: number;
  role: NpcRole;
  character: ModelKey;
  pos: Vec3;
  yaw: number;
  anim: AnimName;
  state: NpcState;
  /** 追いかけている相手の slot */
  target: number | null;
  /** 頭上の吹き出し */
  bubble: '!' | '?' | '…' | 'あらあら' | 'こらー！' | null;
}

export interface CartView {
  id: number;
  pos: Vec3;
  yaw: number;
  riderSlot: number | null;
  speed: number;
}

export interface PeelView {
  id: number;
  owner: number;
  pos: Vec3;
}

/** 元に戻る場所の状態（docs/03「元に戻るもの」） */
export interface StationsView {
  pyramid: { collapsed: boolean; rebuildIn: number };
  bowling: { pinsDown: number; resetIn: number };
  samples: { left: number; refillIn: number };
  watermelons: { left: number; refillIn: number };
  pa: { activeSlot: number | null; holdProgress: number; cooldown: number };
  /** 冷凍ケースに入っている slot */
  freezerSlots: number[];
}

export type SfxName =
  | 'knock'
  | 'can'
  | 'crash'
  | 'bell'
  | 'pa-chime'
  | 'eat'
  | 'freezer'
  | 'slip'
  | 'tantrum'
  | 'pin'
  | 'roll'
  | 'combo-up'
  | 'combo-break'
  | 'score'
  | 'achieve'
  | 'complete'
  | 'notice'
  | 'caught'
  | 'escape'
  | 'countdown'
  | 'go'
  | 'time-up'
  | 'pick-up'
  | 'throw'
  | 'jump'
  | 'dash'
  | 'button';

/** そのフレームで起きた出来事。描画・音・HUDの演出に使い、読んだら捨てる */
export type GameEvent =
  | { t: 'score'; slot: number; kind: ScoreKind; points: number; multiplier: number; pos: Vec3 }
  | { t: 'achieve'; slot: number; id: MisdeedId | SecretId; bonus: number }
  | { t: 'complete'; slot: number; bonus: number }
  | { t: 'combo'; slot: number; level: number; multiplier: number }
  | { t: 'combo-break'; slot: number }
  | { t: 'notice'; npc: number; target: number }
  | { t: 'caught'; slot: number; npc: number }
  | { t: 'escape'; slot: number }
  | { t: 'slip'; slot: number | null; npc: number | null; by: number | null; pos: Vec3 }
  | { t: 'sfx'; name: SfxName; pos?: Vec3; volume?: number }
  | { t: 'pa'; slot: number; text: string }
  | { t: 'phase'; phase: Phase }
  | { t: 'last-spurt' }
  | { t: 'manager' }
  | { t: 'reset'; station: 'pyramid' | 'bowling' | 'samples' | 'watermelons' };

export interface WorldView {
  phase: Phase;
  /** カウントダウン中はカウントダウンの残り、試合中は試合の残り（秒） */
  timeLeft: number;
  duration: number;
  lastSpurt: boolean;
  avatars: AvatarView[];
  npcs: NpcView[];
  /** props の数×7（位置xyz・回転の四元数xyzw）。添え字は PropDef.id×7 */
  propTransforms: Float32Array;
  /** 1＝表示しない（食べた・皮にした・ワゴンに戻した等） */
  propHidden: Uint8Array;
  carts: CartView[];
  peels: PeelView[];
  stations: StationsView;
  events: GameEvent[];
  /** 店の被害率 0..1（定位置から動いた商品の割合） */
  damage: number;
}

// ───────── 結果 ─────────

export interface PlayerResult {
  slot: number;
  kind: 'human' | 'cpu';
  name: string;
  character: ModelKey;
  score: number;
  /** 1始まりの順位（同点の決め方は rules/scoring.ts） */
  rank: number;
  title: string;
  complete: boolean;
  achieved: MisdeedId[];
  secrets: SecretId[];
  /** 悪事ごとの内訳。初達成の+300 はその悪事の行に含める */
  breakdown: Partial<Record<ScoreKind, { count: number; points: number }>>;
  /**
   * 内訳の行に入らない加点（完全制覇の+3000、ひみつの+800）。
   * breakdown の points の合計＋extras の合計＝score になるようにする。省略可（2026-10-06 core の相談で追加）
   */
  extras?: { label: string; points: number }[];
  caught: number;
}

export interface MatchResult {
  duration: number;
  players: PlayerResult[];
  winnerSlots: number[];
  damage: number;
  /** 部屋の主が途中で抜けたなど、最後まで行かずに終わった */
  aborted: boolean;
}
