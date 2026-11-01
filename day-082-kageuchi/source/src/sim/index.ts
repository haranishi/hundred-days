// OWNER: core
// sim の入口。画面・描画・テストはここから読む。
export { Sim, lanternLight, stonePos, type SimOptions, type SimStats, type NoiseRing, type StoneFlight } from './sim';
export { idleInput, type SimInput, type SimEvent, type SimEventType, type DetectRecord, type DetectCause, type GuardState, type PlayerState } from './types';
export { getQuery, lightTier, falloff, StageQuery, type LightTier } from './query';
export { getGuardNav, NavGrid, type Pt } from './nav';
export type { MoveStance } from './perception';
export { canTakedown, canAssassinate } from './player';
