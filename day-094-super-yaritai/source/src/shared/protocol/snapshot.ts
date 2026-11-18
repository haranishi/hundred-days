// 店の様子（種類2）の送り方と組み立て直し。
// - 主：StoreFrameEncoder が WorldView から1通を作る。商品は「前回送った値から変わった物だけ」。
//   2秒に1回の鍵では「定位置から外れている物（見えなくなった物を含む）」を全部入れ、入っていない物は定位置にあると約束する
//   （一度動いて定位置に戻った物は、定位置と同じなので入れなくても同じ。つなぎ直した人もこれでそろう）
// - 参加者：WorldMirror が最後に知った値を持ち、届いた1通を重ねて WorldView を組み立て直す
// 店の形（WorldStatic）は seed から主と参加者が同じものを作る（layout/store.ts の buildWorldStatic）。

import type { AvatarView, NpcRole, NpcView, WorldStatic, WorldView } from '../view'
import {
  encodeStoreFrame,
  PROP_ENTRY_BYTES,
  type AvatarState,
  type NpcFrameState,
  type PropUpdates,
  type StoreFrame,
  type StoreRoster,
} from './binary'
import { KEYFRAME_INTERVAL_MS, MAX_BINARY_BYTES } from './constants'
import { packQuat, qPos, yawQuat } from './quant'

/** 定位置の変換（位置xyz・四元数xyzw）を props の数×7 の配列で作る */
export function homeTransforms(world: WorldStatic): Float32Array {
  const out = new Float32Array(world.props.length * 7)
  for (const p of world.props) {
    const o = p.id * 7
    out[o] = p.home.pos.x
    out[o + 1] = p.home.pos.y
    out[o + 2] = p.home.pos.z
    yawQuat(p.home.yaw, out, o + 3)
  }
  return out
}

// ───────── 主：WorldView → 1通 ─────────

export interface StoreEncoderOptions {
  keyframeIntervalMs?: number
  /** 1通の上限（試験で小さくして、分けて送る動きを確かめる） */
  maxBytes?: number
}

export class StoreFrameEncoder {
  private seq = 0
  private lastKeyT: number | null = null
  private forceKey = true
  private rosterSig = ''
  private readonly n: number
  private readonly keyInterval: number
  private readonly maxBytes: number
  private readonly homePos: Int16Array
  private readonly homeQuat: Uint32Array
  private readonly lastPos: Int16Array
  private readonly lastQuat: Uint32Array
  private readonly lastHidden: Uint8Array
  private readonly curPos: Int16Array
  private readonly curQuat: Uint32Array
  private readonly curHidden: Uint8Array

  constructor(world: WorldStatic, opts: StoreEncoderOptions = {}) {
    this.n = world.props.length
    this.keyInterval = opts.keyframeIntervalMs ?? KEYFRAME_INTERVAL_MS
    this.maxBytes = Math.min(opts.maxBytes ?? MAX_BINARY_BYTES, MAX_BINARY_BYTES)
    const home = homeTransforms(world)
    this.homePos = new Int16Array(this.n * 3)
    this.homeQuat = new Uint32Array(this.n)
    quantizeAll(home, new Uint8Array(this.n), this.n, this.homePos, this.homeQuat, new Uint8Array(this.n))
    this.lastPos = this.homePos.slice()
    this.lastQuat = this.homeQuat.slice()
    this.lastHidden = new Uint8Array(this.n)
    this.curPos = new Int16Array(this.n * 3)
    this.curQuat = new Uint32Array(this.n)
    this.curHidden = new Uint8Array(this.n)
  }

  /** 次の1通を必ず鍵にする（参加者がつなぎ直した・入ってきたとき） */
  forceKeyframe(): void {
    this.forceKey = true
  }

  /**
   * view を1通にする。t は試合開始からのミリ秒（サーバー時刻で数える）。
   * view.avatars[].prompt には、その人の端末に出す案内を入れておく（主の描画用の view では自分の分だけなので、主の側で足す）
   */
  encode(view: WorldView, t: number): Uint8Array {
    const keyframe = this.forceKey || this.lastKeyT === null || t - this.lastKeyT >= this.keyInterval
    quantizeAll(view.propTransforms, view.propHidden, this.n, this.curPos, this.curQuat, this.curHidden)

    // 送る商品を選ぶ
    // 鍵の回は定位置と、ふだんは前回送った値と比べる
    const posRef = keyframe ? this.homePos : this.lastPos
    const quatRef = keyframe ? this.homeQuat : this.lastQuat
    const pick: number[] = []
    for (let i = 0; i < this.n; i++) {
      const h = this.curHidden[i] as number
      const hiddenRef = keyframe ? 0 : (this.lastHidden[i] as number)
      if (
        h !== hiddenRef ||
        this.curQuat[i] !== quatRef[i] ||
        this.curPos[i * 3] !== posRef[i * 3] ||
        this.curPos[i * 3 + 1] !== posRef[i * 3 + 1] ||
        this.curPos[i * 3 + 2] !== posRef[i * 3 + 2]
      ) {
        pick.push(i)
      }
    }

    const roster = rosterOf(view)
    const sig = JSON.stringify(roster)
    const withRoster = keyframe || sig !== this.rosterSig
    const base = {
      seq: this.seq,
      t,
      keyframe,
      full: keyframe,
      phase: view.phase,
      timeLeft: view.timeLeft,
      duration: view.duration,
      lastSpurt: view.lastSpurt,
      damage: view.damage,
      avatars: view.avatars.map(avatarState),
      npcs: view.npcs.map(npcState),
      carts: view.carts,
      peels: view.peels,
      stations: view.stations,
      roster: withRoster ? roster : null,
    }
    let count = pick.length
    let bytes = encodeStoreFrame({ ...base, props: this.propUpdates(pick, count) })
    if (bytes.length > this.maxBytes) {
      // 入りきらない：商品の数を減らして作り直す。残りは「前回から変わった物」として次の回に送られる
      const fixed = bytes.length - count * PROP_ENTRY_BYTES
      count = Math.max(0, Math.floor((this.maxBytes - fixed) / PROP_ENTRY_BYTES))
      bytes = encodeStoreFrame({ ...base, full: false, props: this.propUpdates(pick, count) })
    }
    for (let k = 0; k < count; k++) {
      const i = pick[k] as number
      this.lastPos[i * 3] = this.curPos[i * 3] as number
      this.lastPos[i * 3 + 1] = this.curPos[i * 3 + 1] as number
      this.lastPos[i * 3 + 2] = this.curPos[i * 3 + 2] as number
      this.lastQuat[i] = this.curQuat[i] as number
      this.lastHidden[i] = this.curHidden[i] as number
    }
    if (keyframe) {
      this.lastKeyT = t
      this.forceKey = false
    }
    if (withRoster) this.rosterSig = sig
    this.seq = (this.seq + 1) >>> 0
    return bytes
  }

  private propUpdates(pick: readonly number[], count: number): PropUpdates {
    const ids = new Uint16Array(count)
    const hiddenOut = new Uint8Array(count)
    const qpos = new Int16Array(count * 3)
    const qquat = new Uint32Array(count)
    for (let k = 0; k < count; k++) {
      const i = pick[k] as number
      ids[k] = i
      qpos[k * 3] = this.curPos[i * 3] as number
      qpos[k * 3 + 1] = this.curPos[i * 3 + 1] as number
      qpos[k * 3 + 2] = this.curPos[i * 3 + 2] as number
      qquat[k] = this.curQuat[i] as number
      hiddenOut[k] = this.curHidden[i] as number
    }
    return { count, ids, hidden: hiddenOut, qpos, qquat }
  }
}

function quantizeAll(
  tr: Float32Array,
  hidden: Uint8Array,
  n: number,
  outPos: Int16Array,
  outQuat: Uint32Array,
  outHidden: Uint8Array,
): void {
  for (let i = 0; i < n; i++) {
    const o = i * 7
    outPos[i * 3] = qPos(tr[o] ?? 0)
    outPos[i * 3 + 1] = qPos(tr[o + 1] ?? 0)
    outPos[i * 3 + 2] = qPos(tr[o + 2] ?? 0)
    outQuat[i] = packQuat(tr[o + 3] ?? 0, tr[o + 4] ?? 0, tr[o + 5] ?? 0, tr[o + 6] ?? 1)
    outHidden[i] = hidden[i] ? 1 : 0
  }
}

function rosterOf(view: WorldView): StoreRoster {
  return {
    avatars: view.avatars.map((a) => ({ slot: a.slot, kind: a.kind, name: a.name, character: a.character })),
    npcs: view.npcs.map((n) => ({ id: n.id, character: n.character })),
  }
}

function avatarState(a: AvatarView): AvatarState {
  const s: AvatarState = {
    slot: a.slot,
    cpu: a.kind === 'cpu',
    connected: a.connected,
    pos: a.pos,
    yaw: a.yaw,
    anim: a.anim,
    holding: a.holding,
    ridingCart: a.ridingCart,
    stunned: a.stunned,
    score: a.score,
    combo: a.combo,
    heat: a.heat,
    achieved: a.achieved,
    secrets: a.secrets,
    prompt: a.prompt,
  }
  if (a.progress !== undefined) s.progress = a.progress
  return s
}

function npcState(n: NpcView): NpcFrameState {
  return { id: n.id, role: n.role, pos: n.pos, yaw: n.yaw, anim: n.anim, state: n.state, target: n.target, bubble: n.bubble }
}

// ───────── 参加者：1通 → WorldView ─────────

/** 組み立て直した1枚。changed は前の1枚から値が変わった商品の番号 */
export interface MirrorSnapshot {
  seq: number
  t: number
  view: WorldView
  changed: Uint16Array
}

export interface MirrorMember {
  slot: number
  name: string
  character: string
}

/** 名簿がまだ届いていないときの、役ごとのキャラ（docs/04「人物の役」） */
const NPC_FALLBACK: Record<NpcRole, string> = {
  clerk: 'mm/character-employee',
  manager: 'ch/character-male-d',
  shopper: 'ch/character-female-c',
}

export class WorldMirror {
  readonly world: WorldStatic
  /** いま知っている商品の位置と回転（props の数×7） */
  readonly propTransforms: Float32Array
  readonly propHidden: Uint8Array
  /** 最後に重ねた1通の連番（まだなら null） */
  lastSeq: number | null = null
  /** 全部そろった鍵を一度でも重ねたか（つなぎ直した直後は false） */
  synced = false
  private readonly n: number
  private readonly home: Float32Array
  private readonly avatarRoster = new Map<number, { kind: 'human' | 'cpu'; name: string; character: string }>()
  private readonly npcRoster = new Map<number, string>()
  private readonly members = new Map<number, MirrorMember>()
  private readonly touched: Uint32Array
  private stamp = 0

  constructor(
    world: WorldStatic,
    private mySlot: number | null = null,
  ) {
    this.world = world
    this.n = world.props.length
    this.home = homeTransforms(world)
    this.propTransforms = this.home.slice()
    this.propHidden = new Uint8Array(this.n)
    this.touched = new Uint32Array(this.n)
  }

  /** 部屋の顔ぶれ（名簿が届く前の名前とキャラに使う） */
  setMembers(members: readonly MirrorMember[]): void {
    this.members.clear()
    for (const m of members) this.members.set(m.slot, { ...m })
  }

  setMySlot(slot: number | null): void {
    this.mySlot = slot
  }

  /** つなぎ直したとき：次の全部そろった鍵まで synced を false にする（値はそのまま使い続ける） */
  markStale(): void {
    this.synced = false
  }

  /** 1通を重ね、組み立て直した1枚を返す */
  apply(frame: StoreFrame): MirrorSnapshot {
    if (frame.roster) {
      this.avatarRoster.clear()
      for (const a of frame.roster.avatars) this.avatarRoster.set(a.slot, { kind: a.kind, name: a.name, character: a.character })
      this.npcRoster.clear()
      for (const n of frame.roster.npcs) this.npcRoster.set(n.id, n.character)
    }
    const changed: number[] = []
    const stamp = (this.stamp = (this.stamp + 1) >>> 0 || 1)
    const tr = frame.props.transforms
    for (let k = 0; k < frame.props.ids.length; k++) {
      const id = frame.props.ids[k] as number
      if (id >= this.n) continue
      this.touched[id] = stamp
      if (this.setProp(id, tr, k * 7, frame.props.hidden[k] ? 1 : 0)) changed.push(id)
    }
    if (frame.full) {
      // 入っていない商品は定位置にある
      for (let id = 0; id < this.n; id++) {
        if (this.touched[id] === stamp) continue
        if (this.setProp(id, this.home, id * 7, 0)) changed.push(id)
      }
      this.synced = true
    }
    this.lastSeq = frame.seq
    return { seq: frame.seq, t: frame.t, view: this.buildView(frame), changed: Uint16Array.from(changed) }
  }

  /** 1個を書き、値が変わったら true */
  private setProp(id: number, src: Float32Array, so: number, hidden: number): boolean {
    const o = id * 7
    let diff = this.propHidden[id] !== hidden
    for (let j = 0; j < 7; j++) {
      const v = src[so + j] as number
      if (this.propTransforms[o + j] !== v) {
        this.propTransforms[o + j] = v
        diff = true
      }
    }
    this.propHidden[id] = hidden
    return diff
  }

  private buildView(f: StoreFrame): WorldView {
    const avatars: AvatarView[] = f.avatars.map((a) => {
      const r = this.avatarRoster.get(a.slot)
      const m = this.members.get(a.slot)
      const isLocal = a.slot === this.mySlot
      const view: AvatarView = {
        slot: a.slot,
        kind: r?.kind ?? (a.cpu ? 'cpu' : 'human'),
        name: r?.name ?? m?.name ?? `${a.slot + 1}P`,
        character: r?.character ?? m?.character ?? 'ch/character-female-b',
        pos: a.pos,
        yaw: a.yaw,
        anim: a.anim,
        holding: a.holding,
        ridingCart: a.ridingCart,
        stunned: a.stunned,
        score: a.score,
        combo: a.combo,
        heat: a.heat,
        achieved: a.achieved,
        secrets: a.secrets,
        isLocal,
        prompt: isLocal ? a.prompt : null,
        connected: a.connected,
      }
      if (a.progress !== undefined) view.progress = a.progress
      return view
    })
    const npcs: NpcView[] = f.npcs.map((n) => ({
      id: n.id,
      role: n.role,
      character: this.npcRoster.get(n.id) ?? NPC_FALLBACK[n.role],
      pos: n.pos,
      yaw: n.yaw,
      anim: n.anim,
      state: n.state,
      target: n.target,
      bubble: n.bubble,
    }))
    return {
      phase: f.phase,
      timeLeft: f.timeLeft,
      duration: f.duration,
      lastSpurt: f.lastSpurt,
      avatars,
      npcs,
      propTransforms: this.propTransforms.slice(),
      propHidden: this.propHidden.slice(),
      carts: f.carts,
      peels: f.peels,
      stations: f.stations,
      events: [],
      damage: f.damage,
    }
  }
}
