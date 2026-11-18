// バイナリで名前を番号にして送るための表。番号＝並びの位置なので、**並びを変えない・途中に足さない**（足すときは末尾へ）。
// view.ts や misdeeds.ts に名前が増えたのに表へ足し忘れると、下の「漏れの確かめ」が型の誤りになる。

import type { MisdeedId, ScoreKind, SecretId } from '../rules/misdeeds'
import type { AnimName, GameEvent, NpcRole, NpcState, NpcView, Phase, SfxName } from '../view'

/** T に漏れがなければ never。漏れていれば、その名前が型の誤りとして出る */
type AssertNever<T extends never> = T

export const ANIM_NAMES = [
  'idle',
  'walk',
  'run',
  'dash',
  'jump',
  'fall',
  'push-cart',
  'ride-cart',
  'kick',
  'sweep',
  'hold',
  'throw',
  'pick-up',
  'eat',
  'bell',
  'pa',
  'chill',
  'tantrum',
  'slip',
  'caught',
  'stunned',
  'cheer',
  'sad',
] as const satisfies readonly AnimName[]
export type AnimCheck = AssertNever<Exclude<AnimName, (typeof ANIM_NAMES)[number]>>

export const NPC_ROLES = ['clerk', 'manager', 'shopper'] as const satisfies readonly NpcRole[]
export type NpcRoleCheck = AssertNever<Exclude<NpcRole, (typeof NPC_ROLES)[number]>>

export const NPC_STATES = [
  'patrol',
  'notice',
  'chase',
  'carry',
  'rest',
  'slipped',
  'investigate',
  'wander',
  'react',
] as const satisfies readonly NpcState[]
export type NpcStateCheck = AssertNever<Exclude<NpcState, (typeof NPC_STATES)[number]>>

type Bubble = NonNullable<NpcView['bubble']>
/** 吹き出し。番号0は「なし」に使うので、表の i 番目は i+1 で送る */
export const BUBBLES = ['!', '?', '…', 'あらあら', 'こらー！'] as const satisfies readonly Bubble[]
export type BubbleCheck = AssertNever<Exclude<Bubble, (typeof BUBBLES)[number]>>

export const PHASES = ['countdown', 'playing', 'ended'] as const satisfies readonly Phase[]
export type PhaseCheck = AssertNever<Exclude<Phase, (typeof PHASES)[number]>>

export const SFX_NAMES = [
  'knock',
  'can',
  'crash',
  'bell',
  'pa-chime',
  'eat',
  'freezer',
  'slip',
  'tantrum',
  'pin',
  'roll',
  'combo-up',
  'combo-break',
  'score',
  'achieve',
  'complete',
  'notice',
  'caught',
  'escape',
  'countdown',
  'go',
  'time-up',
  'pick-up',
  'throw',
  'jump',
  'dash',
  'button',
] as const satisfies readonly SfxName[]
export type SfxCheck = AssertNever<Exclude<SfxName, (typeof SFX_NAMES)[number]>>

export const MISDEED_ORDER = [
  'sweep',
  'pyramid',
  'cart',
  'bowling',
  'samples',
  'pa',
  'freezer',
  'banana',
  'tantrum',
  'bell',
] as const satisfies readonly MisdeedId[]
export type MisdeedCheck = AssertNever<Exclude<MisdeedId, (typeof MISDEED_ORDER)[number]>>

export const SECRET_ORDER = ['secret-staff-slip', 'secret-cart-strike'] as const satisfies readonly SecretId[]
export type SecretCheck = AssertNever<Exclude<SecretId, (typeof SECRET_ORDER)[number]>>

export const SCORE_KINDS = [...MISDEED_ORDER, 'knock', 'escape'] as const satisfies readonly ScoreKind[]
export type ScoreKindCheck = AssertNever<Exclude<ScoreKind, (typeof SCORE_KINDS)[number]>>

/** 達成の出来事で送る id（やっちゃダメ10個のあとに、ひみつ2個） */
export const ACHIEVE_IDS = [...MISDEED_ORDER, ...SECRET_ORDER] as const

export const STATION_NAMES = ['pyramid', 'bowling', 'samples', 'watermelons'] as const satisfies readonly Extract<
  GameEvent,
  { t: 'reset' }
>['station'][]
export type StationCheck = AssertNever<Exclude<Extract<GameEvent, { t: 'reset' }>['station'], (typeof STATION_NAMES)[number]>>

export const EVENT_TYPES = [
  'score',
  'achieve',
  'complete',
  'combo',
  'combo-break',
  'notice',
  'caught',
  'escape',
  'slip',
  'sfx',
  'pa',
  'phase',
  'last-spurt',
  'manager',
  'reset',
] as const satisfies readonly GameEvent['t'][]
export type EventTypeCheck = AssertNever<Exclude<GameEvent['t'], (typeof EVENT_TYPES)[number]>>

export const PRESS_KINDS = ['press', 'hold', 'mash'] as const

/** 表の中の位置。見つからなければ -1 */
export function indexIn<T extends string>(table: readonly T[], value: string): number {
  return (table as readonly string[]).indexOf(value)
}
