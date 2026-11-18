// 試合中のデータ（バイナリ。docs/05「試合中のデータ」）。1バイト目が種類。
//   1 自分の様子（参加者→主） 2 店の様子（主→参加者） 3 出来事（主→参加者） 4 意図（参加者→主）
// 種類1と4の2バイト目は送り主の slot で、部屋が書き込む（なりすまし防止）。送る側は SLOT_UNSET を入れておく。
// 名前（動き・役・効果音など）は tables.ts の番号で送る。読む関数は、壊れたもの・表の外の番号・余りがあれば null。

import type { MisdeedId, ScoreKind, SecretId } from '../rules/misdeeds'
import type {
  ActionPrompt,
  AnimName,
  CartView,
  ComboView,
  GameEvent,
  NpcRole,
  NpcState,
  NpcView,
  PeelView,
  Phase,
  StationsView,
  Vec3,
} from '../view'
import { asBytes, ByteReader, ByteWriter, DecodeError } from './bytes'
import { MAX_BINARY_BYTES } from './constants'
import { dqCenti, dqPos, dqUnit16, dqUnit8, dqYaw, qCenti, qPos, qUnit16, qUnit8, qYaw, unpackQuat } from './quant'
import {
  ACHIEVE_IDS,
  ANIM_NAMES,
  BUBBLES,
  EVENT_TYPES,
  indexIn,
  MISDEED_ORDER,
  NPC_ROLES,
  NPC_STATES,
  PHASES,
  PRESS_KINDS,
  SCORE_KINDS,
  SECRET_ORDER,
  SFX_NAMES,
  STATION_NAMES,
} from './tables'

export const BIN_SELF = 1
export const BIN_STORE = 2
export const BIN_EVENTS = 3
export const BIN_INTENT = 4
/** 種類1・4の2バイト目に送る側が入れておく値（部屋が本当の slot で上書きする） */
export const SLOT_UNSET = 0xff

const NONE8 = 0xff
const NONE16 = 0xffff

/** 1バイト目（種類）。空なら 0 */
export function binaryKind(data: ArrayBuffer | ArrayBufferView): number {
  return asBytes(data)[0] ?? 0
}

// ── 小さな部品 ──

function writeVec(w: ByteWriter, v: Vec3): void {
  w.i16(qPos(v.x)).i16(qPos(v.y)).i16(qPos(v.z))
}

function readVec(r: ByteReader): Vec3 {
  return { x: dqPos(r.i16()), y: dqPos(r.i16()), z: dqPos(r.i16()) }
}

function writeOpt8(w: ByteWriter, v: number | null): void {
  w.u8(v === null || v < 0 || v >= NONE8 ? NONE8 : v)
}

function readOpt8(r: ByteReader): number | null {
  const v = r.u8()
  return v === NONE8 ? null : v
}

function writeOpt16(w: ByteWriter, v: number | null): void {
  w.u16(v === null || v < 0 || v >= NONE16 ? NONE16 : v)
}

function readOpt16(r: ByteReader): number | null {
  const v = r.u16()
  return v === NONE16 ? null : v
}

function writeIndex(w: ByteWriter, table: readonly string[], value: string): void {
  const i = indexIn(table, value)
  // 表に無い名前は送れない（型の上では起きない。起きたら0番に寄せる）
  w.u8(i < 0 ? 0 : i)
}

/** 読み切りを確かめ、壊れていれば null にする */
function decodeWith<T>(data: ArrayBuffer | ArrayBufferView, kind: number, read: (r: ByteReader) => T): T | null {
  const bytes = asBytes(data)
  if (bytes.byteLength < 2 || bytes.byteLength > MAX_BINARY_BYTES || bytes[0] !== kind) return null
  try {
    const r = new ByteReader(bytes)
    r.u8()
    const v = read(r)
    r.end()
    return v
  } catch (err) {
    if (err instanceof DecodeError) return null
    throw err
  }
}

// ───────── 種類1：自分の様子（参加者→主・毎秒15回） ─────────

export interface SelfStateFrame {
  /** 送り主（部屋が書き込んだ値）。送る側が作るときは無視される */
  slot: number
  /** 連番（古いものが後から届いたら捨てる目安） */
  seq: number
  /** 試合開始からのミリ秒（サーバー時刻で数える。カウントダウン中は負） */
  t: number
  pos: Vec3
  /** 速さ（m/秒） */
  vel: Vec3
  yaw: number
  anim: AnimName
  ridingCart: number | null
  holding: number | null
  /** アクションを押しているか（長押しの判定を、意図の取りこぼしがあってもそろえるため） */
  actionHeld: boolean
}

export function encodeSelfState(s: Omit<SelfStateFrame, 'slot'>): Uint8Array {
  const w = new ByteWriter(32)
  w.u8(BIN_SELF).u8(SLOT_UNSET).u32(s.seq).i32(s.t)
  writeVec(w, s.pos)
  writeVec(w, s.vel)
  w.u16(qYaw(s.yaw))
  writeIndex(w, ANIM_NAMES, s.anim)
  writeOpt8(w, s.ridingCart)
  writeOpt16(w, s.holding)
  w.u8(s.actionHeld ? 1 : 0)
  return w.finish()
}

export function decodeSelfState(data: ArrayBuffer | ArrayBufferView): SelfStateFrame | null {
  return decodeWith(data, BIN_SELF, (r) => {
    const slot = r.u8()
    const seq = r.u32()
    const t = r.i32()
    const pos = readVec(r)
    const vel = readVec(r)
    const yaw = dqYaw(r.u16())
    const anim = r.pick(ANIM_NAMES)
    const ridingCart = readOpt8(r)
    const holding = readOpt16(r)
    const flags = r.u8()
    if (flags > 1) throw new DecodeError('知らない印')
    return { slot, seq, t, pos, vel, yaw, anim, ridingCart, holding, actionHeld: flags === 1 }
  })
}

// ───────── 種類4：意図（参加者→主・押したとき） ─────────

/** press＝アクションを押した、release＝離した、jump・dash＝押した瞬間（主の側で効果が要るときのため） */
export type IntentKind = 'press' | 'release' | 'jump' | 'dash'
const INTENT_KINDS = ['press', 'release', 'jump', 'dash'] as const satisfies readonly IntentKind[]
/** 1通に入れる意図の上限（連打は1刻みぶんをまとめて送る） */
export const MAX_INTENTS_PER_FRAME = 64

export interface Intent {
  kind: IntentKind
  /** 相手（棚や台の番号など。意味はゲームの側で決める）。無ければ null */
  target: number | null
  /** 試合開始からのミリ秒 */
  t: number
}

export interface IntentFrame {
  slot: number
  seq: number
  intents: Intent[]
}

export function encodeIntents(seq: number, intents: readonly Intent[]): Uint8Array {
  const list = intents.slice(0, MAX_INTENTS_PER_FRAME)
  const w = new ByteWriter(8 + list.length * 7)
  w.u8(BIN_INTENT).u8(SLOT_UNSET).u32(seq).u8(list.length)
  for (const it of list) {
    writeIndex(w, INTENT_KINDS, it.kind)
    writeOpt16(w, it.target)
    w.i32(it.t)
  }
  return w.finish()
}

export function decodeIntents(data: ArrayBuffer | ArrayBufferView): IntentFrame | null {
  return decodeWith(data, BIN_INTENT, (r) => {
    const slot = r.u8()
    const seq = r.u32()
    const n = r.u8()
    if (n > MAX_INTENTS_PER_FRAME) throw new DecodeError('意図が多すぎる')
    const intents: Intent[] = []
    for (let i = 0; i < n; i++) intents.push({ kind: r.pick(INTENT_KINDS), target: readOpt16(r), t: r.i32() })
    return { slot, seq, intents }
  })
}

// ───────── 種類3：出来事（主→参加者・起きたとき） ─────────

export interface EventFrame {
  seq: number
  /** 試合開始からのミリ秒（主がその出来事を出した時刻） */
  t: number
  events: GameEvent[]
}

function writeEvent(w: ByteWriter, e: GameEvent): void {
  writeIndex(w, EVENT_TYPES, e.t)
  switch (e.t) {
    case 'score':
      w.u8(e.slot)
      writeIndex(w, SCORE_KINDS, e.kind)
      w.f64(e.points).f64(e.multiplier)
      writeVec(w, e.pos)
      return
    case 'achieve':
      w.u8(e.slot)
      writeIndex(w, ACHIEVE_IDS, e.id)
      w.f64(e.bonus)
      return
    case 'complete':
      w.u8(e.slot).f64(e.bonus)
      return
    case 'combo':
      w.u8(e.slot).u8(e.level).f64(e.multiplier)
      return
    case 'combo-break':
    case 'escape':
      w.u8(e.slot)
      return
    case 'notice':
      w.u16(e.npc).u8(e.target)
      return
    case 'caught':
      w.u8(e.slot).u16(e.npc)
      return
    case 'slip':
      writeOpt8(w, e.slot)
      writeOpt16(w, e.npc)
      writeOpt8(w, e.by)
      writeVec(w, e.pos)
      return
    case 'sfx': {
      writeIndex(w, SFX_NAMES, e.name)
      w.u8((e.pos ? 1 : 0) | (e.volume !== undefined ? 2 : 0))
      if (e.pos) writeVec(w, e.pos)
      if (e.volume !== undefined) w.f32(e.volume)
      return
    }
    case 'pa':
      w.u8(e.slot).str(e.text)
      return
    case 'phase':
      writeIndex(w, PHASES, e.phase)
      return
    case 'last-spurt':
    case 'manager':
      return
    case 'reset':
      writeIndex(w, STATION_NAMES, e.station)
      return
  }
}

function readEvent(r: ByteReader): GameEvent {
  const t = r.pick(EVENT_TYPES)
  switch (t) {
    case 'score':
      return { t, slot: r.u8(), kind: r.pick(SCORE_KINDS) as ScoreKind, points: r.f64(), multiplier: r.f64(), pos: readVec(r) }
    case 'achieve':
      return { t, slot: r.u8(), id: r.pick(ACHIEVE_IDS) as MisdeedId | SecretId, bonus: r.f64() }
    case 'complete':
      return { t, slot: r.u8(), bonus: r.f64() }
    case 'combo':
      return { t, slot: r.u8(), level: r.u8(), multiplier: r.f64() }
    case 'combo-break':
      return { t, slot: r.u8() }
    case 'escape':
      return { t, slot: r.u8() }
    case 'notice':
      return { t, npc: r.u16(), target: r.u8() }
    case 'caught':
      return { t, slot: r.u8(), npc: r.u16() }
    case 'slip':
      return { t, slot: readOpt8(r), npc: readOpt16(r), by: readOpt8(r), pos: readVec(r) }
    case 'sfx': {
      const name = r.pick(SFX_NAMES)
      const flags = r.u8()
      if (flags > 3) throw new DecodeError('知らない印')
      const e: Extract<GameEvent, { t: 'sfx' }> = { t, name }
      if (flags & 1) e.pos = readVec(r)
      if (flags & 2) e.volume = r.f32()
      return e
    }
    case 'pa':
      return { t, slot: r.u8(), text: r.str() }
    case 'phase':
      return { t, phase: r.pick(PHASES) }
    case 'last-spurt':
      return { t }
    case 'manager':
      return { t }
    case 'reset':
      return { t, station: r.pick(STATION_NAMES) }
  }
}

/**
 * 出来事をまとめて送る形にする。1通16KBを超えそうなら分ける（ふつうは1通）。出来事が無ければ空の配列。
 * 同じ刻みで起きた出来事は1通にまとめる（通数を増やさないため）
 */
export function encodeEvents(seq: number, t: number, events: readonly GameEvent[]): Uint8Array[] {
  const out: Uint8Array[] = []
  let i = 0
  while (i < events.length) {
    const w = new ByteWriter(256)
    w.u8(BIN_EVENTS).u32(seq + out.length).i32(t)
    const countAt = w.length
    w.u16(0)
    let n = 0
    while (i < events.length && w.length < MAX_BINARY_BYTES - 512 && n < 0xffff) {
      writeEvent(w, events[i] as GameEvent)
      i++
      n++
    }
    w.patchU16(countAt, n)
    out.push(w.finish())
  }
  return out
}

export function decodeEvents(data: ArrayBuffer | ArrayBufferView): EventFrame | null {
  return decodeWith(data, BIN_EVENTS, (r) => {
    // decodeWith が1バイト目を読んだ。種類3には slot が無い
    const seq = r.u32()
    const t = r.i32()
    const n = r.u16()
    const events: GameEvent[] = []
    for (let i = 0; i < n; i++) events.push(readEvent(r))
    return { seq, t, events }
  })
}

// ───────── 種類2：店の様子（主→参加者・毎秒15回） ─────────

/** 1人ぶんの様子。名前・キャラ・CPUかどうかは名簿（StoreRoster）で送る */
export interface AvatarState {
  slot: number
  cpu: boolean
  connected: boolean
  pos: Vec3
  yaw: number
  anim: AnimName
  holding: number | null
  ridingCart: number | null
  stunned: number
  score: number
  combo: ComboView
  heat: number
  achieved: MisdeedId[]
  secrets: SecretId[]
  /** その人の端末に出すアクションの案内（主が参加者のぶんも作って入れる） */
  prompt: ActionPrompt | null
  /** 悪事ごとの進み具合（HUD の「ベル 12/20」）。無ければ送らない */
  progress?: Partial<Record<MisdeedId, number>>
}

/** 店員・客の様子。キャラは名簿で送る */
export interface NpcFrameState {
  id: number
  role: NpcRole
  pos: Vec3
  yaw: number
  anim: AnimName
  state: NpcState
  target: number | null
  bubble: NpcView['bubble']
}

/** 名前やキャラのように、めったに変わらないもの。鍵の回と、変わったときだけ送る */
export interface StoreRoster {
  avatars: { slot: number; kind: 'human' | 'cpu'; name: string; character: string }[]
  npcs: { id: number; character: string }[]
}

/** 商品の更新（量子化した値）。ids[i] の商品の位置は qpos[i*3..]、回転は qquat[i] */
export interface PropUpdates {
  count: number
  ids: Uint16Array
  hidden: Uint8Array
  qpos: Int16Array
  qquat: Uint32Array
}

export interface StoreFrameHeader {
  seq: number
  t: number
  /** 鍵の回（2秒に1回）：定位置から外れている商品を全部入れる */
  keyframe: boolean
  /** 商品の一覧が全部そろっている（入っていない商品は定位置にある）。鍵の回で、全部が1通に入ったときだけ true */
  full: boolean
  phase: Phase
  timeLeft: number
  duration: number
  lastSpurt: boolean
  damage: number
}

export interface StoreFrameInput extends StoreFrameHeader {
  avatars: readonly AvatarState[]
  npcs: readonly NpcFrameState[]
  carts: readonly CartView[]
  peels: readonly PeelView[]
  stations: StationsView
  roster: StoreRoster | null
  props: PropUpdates
}

/** 読んだ店の様子。商品の値は量子化を戻した m と四元数 */
export interface StoreFrame extends StoreFrameHeader {
  avatars: AvatarState[]
  npcs: NpcFrameState[]
  carts: CartView[]
  peels: PeelView[]
  stations: StationsView
  roster: StoreRoster | null
  props: { ids: number[]; hidden: boolean[]; transforms: Float32Array }
}

/** 商品1個の大きさ（id 2・印 1・位置 6・回転 4） */
export const PROP_ENTRY_BYTES = 13

function achievedMask(achieved: readonly MisdeedId[], secrets: readonly SecretId[]): number {
  let m = 0
  for (const id of achieved) {
    const i = indexIn(MISDEED_ORDER, id)
    if (i >= 0) m |= 1 << i
  }
  for (const id of secrets) {
    const i = indexIn(SECRET_ORDER, id)
    if (i >= 0) m |= 1 << (MISDEED_ORDER.length + i)
  }
  return m
}

/** 進み具合は 0.01 刻みの uint32 で送る（30.5m・2.73秒のような値が、戻したときにそのままの小数になる） */
function writeProgress(w: ByteWriter, progress: Partial<Record<MisdeedId, number>>): void {
  let mask = 0
  const values: number[] = []
  MISDEED_ORDER.forEach((id, i) => {
    const v = progress[id]
    if (v === undefined || !Number.isFinite(v)) return
    mask |= 1 << i
    values.push(v)
  })
  w.u16(mask)
  for (const v of values) w.u32(Math.round(Math.max(0, v) * 100))
}

function readProgress(r: ByteReader): Partial<Record<MisdeedId, number>> {
  const mask = r.u16()
  if (mask >= 1 << MISDEED_ORDER.length) throw new DecodeError('知らない印')
  const out: Partial<Record<MisdeedId, number>> = {}
  MISDEED_ORDER.forEach((id, i) => {
    if (mask & (1 << i)) out[id] = r.u32() / 100
  })
  return out
}

function writeAvatar(w: ByteWriter, a: AvatarState): void {
  const prompt = a.prompt
  w.u8(a.slot)
  w.u8(
    (a.cpu ? 1 : 0) |
      (a.connected ? 2 : 0) |
      (prompt ? 4 : 0) |
      (prompt?.progress !== undefined ? 8 : 0) |
      (a.progress !== undefined ? 16 : 0),
  )
  writeVec(w, a.pos)
  w.u16(qYaw(a.yaw))
  writeIndex(w, ANIM_NAMES, a.anim)
  writeOpt16(w, a.holding)
  writeOpt8(w, a.ridingCart)
  w.u16(qCenti(a.stunned))
  w.f64(a.score)
  w.u8(a.combo.level).f64(a.combo.multiplier).u16(qCenti(a.combo.remaining))
  w.u16(Math.round(Math.max(0, Math.min(100, a.heat)) * 100))
  w.u16(achievedMask(a.achieved, a.secrets))
  if (prompt) {
    writeIndex(w, PRESS_KINDS, prompt.press)
    if (prompt.progress !== undefined) w.u8(qUnit8(prompt.progress))
    w.u8(prompt.misdeed ? indexIn(MISDEED_ORDER, prompt.misdeed) : NONE8)
    w.str(prompt.label, 64)
  }
  if (a.progress !== undefined) writeProgress(w, a.progress)
}

function readAvatar(r: ByteReader): AvatarState {
  const slot = r.u8()
  const flags = r.u8()
  if (flags > 31) throw new DecodeError('知らない印')
  const pos = readVec(r)
  const yaw = dqYaw(r.u16())
  const anim = r.pick(ANIM_NAMES)
  const holding = readOpt16(r)
  const ridingCart = readOpt8(r)
  const stunned = dqCenti(r.u16())
  const score = r.f64()
  const combo: ComboView = { level: r.u8(), multiplier: r.f64(), remaining: dqCenti(r.u16()) }
  const heat = r.u16() / 100
  const mask = r.u16()
  const achieved = MISDEED_ORDER.filter((_, i) => mask & (1 << i)) as MisdeedId[]
  const secrets = SECRET_ORDER.filter((_, i) => mask & (1 << (MISDEED_ORDER.length + i))) as SecretId[]
  let prompt: ActionPrompt | null = null
  if (flags & 4) {
    const press = r.pick(PRESS_KINDS)
    const progress = flags & 8 ? dqUnit8(r.u8()) : undefined
    const mi = r.u8()
    const misdeed = mi === NONE8 ? undefined : MISDEED_ORDER[mi]
    if (mi !== NONE8 && misdeed === undefined) throw new DecodeError('表の外の番号')
    const label = r.str()
    prompt = { label, press }
    if (progress !== undefined) prompt.progress = progress
    if (misdeed !== undefined) prompt.misdeed = misdeed
  }
  const out: AvatarState = {
    slot,
    cpu: (flags & 1) !== 0,
    connected: (flags & 2) !== 0,
    pos,
    yaw,
    anim,
    holding,
    ridingCart,
    stunned,
    score,
    combo,
    heat,
    achieved,
    secrets,
    prompt,
  }
  if (flags & 16) out.progress = readProgress(r)
  return out
}

function writeStations(w: ByteWriter, s: StationsView): void {
  w.u8(s.pyramid.collapsed ? 1 : 0).u16(qCenti(s.pyramid.rebuildIn))
  w.u8(s.bowling.pinsDown).u16(qCenti(s.bowling.resetIn))
  w.u8(s.samples.left).u16(qCenti(s.samples.refillIn))
  w.u8(s.watermelons.left).u16(qCenti(s.watermelons.refillIn))
  writeOpt8(w, s.pa.activeSlot)
  w.u16(qUnit16(s.pa.holdProgress)).u16(qCenti(s.pa.cooldown))
  let mask = 0
  for (const slot of s.freezerSlots) if (slot >= 0 && slot < 8) mask |= 1 << slot
  w.u8(mask)
}

function readStations(r: ByteReader): StationsView {
  const collapsed = r.u8()
  if (collapsed > 1) throw new DecodeError('知らない印')
  const pyramid = { collapsed: collapsed === 1, rebuildIn: dqCenti(r.u16()) }
  const bowling = { pinsDown: r.u8(), resetIn: dqCenti(r.u16()) }
  const samples = { left: r.u8(), refillIn: dqCenti(r.u16()) }
  const watermelons = { left: r.u8(), refillIn: dqCenti(r.u16()) }
  const pa = { activeSlot: readOpt8(r), holdProgress: dqUnit16(r.u16()), cooldown: dqCenti(r.u16()) }
  const mask = r.u8()
  const freezerSlots: number[] = []
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) freezerSlots.push(i)
  return { pyramid, bowling, samples, watermelons, pa, freezerSlots }
}

/**
 * 店の様子を1通にする。1通16KBに収めるのは呼ぶ側（StoreFrameEncoder）の役目
 * （商品1個はちょうど PROP_ENTRY_BYTES なので、はみ出した分から数を逆算して絞れる）
 */
export function encodeStoreFrame(f: StoreFrameInput): Uint8Array {
  const w = new ByteWriter(1024 + f.props.count * PROP_ENTRY_BYTES)
  const flags = (f.keyframe ? 1 : 0) | (f.full ? 2 : 0) | (f.roster ? 4 : 0) | (f.lastSpurt ? 8 : 0)
  w.u8(BIN_STORE).u8(flags).u32(f.seq).i32(f.t)
  writeIndex(w, PHASES, f.phase)
  w.u32(Math.round(Math.max(0, f.timeLeft) * 1000))
  w.u16(f.duration)
  w.u16(qUnit16(f.damage))
  w.u8(f.avatars.length)
  for (const a of f.avatars) writeAvatar(w, a)
  w.u8(f.npcs.length)
  for (const n of f.npcs) {
    w.u16(n.id)
    writeIndex(w, NPC_ROLES, n.role)
    writeVec(w, n.pos)
    w.u16(qYaw(n.yaw))
    writeIndex(w, ANIM_NAMES, n.anim)
    writeIndex(w, NPC_STATES, n.state)
    writeOpt8(w, n.target)
    w.u8(n.bubble === null ? 0 : indexIn(BUBBLES, n.bubble) + 1)
  }
  w.u8(f.carts.length)
  for (const c of f.carts) {
    w.u16(c.id)
    writeVec(w, c.pos)
    w.u16(qYaw(c.yaw))
    writeOpt8(w, c.riderSlot)
    w.u16(Math.round(Math.max(0, c.speed) * 100))
  }
  w.u8(f.peels.length)
  for (const p of f.peels) {
    w.u16(p.id).u8(p.owner)
    writeVec(w, p.pos)
  }
  writeStations(w, f.stations)
  if (f.roster) {
    w.u8(f.roster.avatars.length)
    for (const a of f.roster.avatars) w.u8(a.slot).u8(a.kind === 'cpu' ? 1 : 0).str(a.name, 64).str(a.character, 64)
    w.u8(f.roster.npcs.length)
    for (const n of f.roster.npcs) w.u16(n.id).str(n.character, 64)
  }
  const p = f.props
  w.u16(p.count)
  for (let i = 0; i < p.count; i++) {
    w.u16(p.ids[i] ?? 0).u8(p.hidden[i] ? 1 : 0)
    w.i16(p.qpos[i * 3] ?? 0).i16(p.qpos[i * 3 + 1] ?? 0).i16(p.qpos[i * 3 + 2] ?? 0)
    w.u32(p.qquat[i] ?? 0)
  }
  return w.finish()
}

/** 店の様子を読む。壊れていれば null */
export function decodeStoreFrame(data: ArrayBuffer | ArrayBufferView): StoreFrame | null {
  return decodeWith(data, BIN_STORE, (r) => {
    const flags = r.u8()
    if (flags > 15) throw new DecodeError('知らない印')
    const seq = r.u32()
    const t = r.i32()
    const phase = r.pick(PHASES)
    const timeLeft = r.u32() / 1000
    const duration = r.u16()
    const damage = dqUnit16(r.u16())
    const avatars: AvatarState[] = []
    for (let i = r.u8(); i > 0; i--) avatars.push(readAvatar(r))
    const npcs: NpcFrameState[] = []
    for (let i = r.u8(); i > 0; i--) {
      const id = r.u16()
      const role = r.pick(NPC_ROLES)
      const pos = readVec(r)
      const yaw = dqYaw(r.u16())
      const anim = r.pick(ANIM_NAMES)
      const state = r.pick(NPC_STATES)
      const target = readOpt8(r)
      const b = r.u8()
      const bubble = b === 0 ? null : BUBBLES[b - 1]
      if (bubble === undefined) throw new DecodeError('表の外の番号')
      npcs.push({ id, role, pos, yaw, anim, state, target, bubble })
    }
    const carts: CartView[] = []
    for (let i = r.u8(); i > 0; i--) {
      carts.push({ id: r.u16(), pos: readVec(r), yaw: dqYaw(r.u16()), riderSlot: readOpt8(r), speed: r.u16() / 100 })
    }
    const peels: PeelView[] = []
    for (let i = r.u8(); i > 0; i--) peels.push({ id: r.u16(), owner: r.u8(), pos: readVec(r) })
    const stations = readStations(r)
    let roster: StoreRoster | null = null
    if (flags & 4) {
      const ra: StoreRoster['avatars'] = []
      for (let i = r.u8(); i > 0; i--) {
        const slot = r.u8()
        const kind = r.u8()
        if (kind > 1) throw new DecodeError('知らない印')
        ra.push({ slot, kind: kind === 1 ? 'cpu' : 'human', name: r.str(), character: r.str() })
      }
      const rn: StoreRoster['npcs'] = []
      for (let i = r.u8(); i > 0; i--) rn.push({ id: r.u16(), character: r.str() })
      roster = { avatars: ra, npcs: rn }
    }
    const count = r.u16()
    if (count * PROP_ENTRY_BYTES > r.remaining) throw new DecodeError('商品の数が中身より多い')
    const ids: number[] = []
    const hidden: boolean[] = []
    const transforms = new Float32Array(count * 7)
    for (let i = 0; i < count; i++) {
      ids.push(r.u16())
      const h = r.u8()
      if (h > 1) throw new DecodeError('知らない印')
      hidden.push(h === 1)
      transforms[i * 7] = dqPos(r.i16())
      transforms[i * 7 + 1] = dqPos(r.i16())
      transforms[i * 7 + 2] = dqPos(r.i16())
      unpackQuat(r.u32(), transforms, i * 7 + 3)
    }
    return {
      seq,
      t,
      keyframe: (flags & 1) !== 0,
      full: (flags & 2) !== 0,
      lastSpurt: (flags & 8) !== 0,
      phase,
      timeLeft,
      duration,
      damage,
      avatars,
      npcs,
      carts,
      peels,
      stations,
      roster,
      props: { ids, hidden, transforms },
    }
  })
}
