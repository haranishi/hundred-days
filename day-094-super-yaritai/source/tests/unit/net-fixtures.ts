// ネットの単体試験で使う、手作りの店（WorldStatic）と見え方（WorldView）。
// layout/store.ts の buildWorldStatic はゲームの芯の担当が作るので、ここでは形だけ合わせた物を作る。

import type { AvatarView, MatchResult, NpcView, PropDef, StationsView, WorldStatic, WorldView } from '../../src/shared/view'
import { yawQuat } from '../../src/shared/protocol/quant'

/** 決まった並びの乱数（試験を毎回同じにする） */
export function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 棚に並んだ n 個の商品と、6台のカート */
export function makeWorld(n = 350, seed = 7): WorldStatic {
  const rnd = lcg(seed)
  const props: PropDef[] = []
  for (let id = 0; id < n; id++) {
    props.push({
      id,
      kind: id % 50 === 0 ? 'can' : 'product',
      model: 'fk/apple',
      scale: 1,
      shape: 'box',
      size: { x: 0.3, y: 0.3, z: 0.3 },
      mass: 1,
      home: { pos: { x: -16 + (id % 40) * 0.8, y: 0.4 + (id % 3) * 0.6, z: -12 + Math.floor(id / 40) * 2.5 }, yaw: rnd() * Math.PI * 2 },
      fixtureId: Math.floor(id / 20),
    })
  }
  const carts = Array.from({ length: 6 }, (_, i) => ({ id: i, home: { pos: { x: 12 + i * 0.7, y: 0, z: 12 }, yaw: Math.PI } }))
  return { seed, props, carts }
}

export function homeView(world: WorldStatic): { propTransforms: Float32Array; propHidden: Uint8Array } {
  const propTransforms = new Float32Array(world.props.length * 7)
  for (const p of world.props) {
    const o = p.id * 7
    propTransforms[o] = p.home.pos.x
    propTransforms[o + 1] = p.home.pos.y
    propTransforms[o + 2] = p.home.pos.z
    yawQuat(p.home.yaw, propTransforms, o + 3)
  }
  return { propTransforms, propHidden: new Uint8Array(world.props.length) }
}

export function avatar(slot: number, over: Partial<AvatarView> = {}): AvatarView {
  return {
    slot,
    kind: 'human',
    name: ['たろう', 'はなこ', 'じろう', 'さくら'][slot] ?? `${slot + 1}P`,
    character: 'ch/character-female-b',
    pos: { x: 2 + slot, y: 0, z: 11.5 },
    yaw: Math.PI,
    anim: 'idle',
    holding: null,
    ridingCart: null,
    stunned: 0,
    score: 0,
    combo: { level: 0, multiplier: 1, remaining: 0 },
    heat: 0,
    achieved: [],
    secrets: [],
    isLocal: slot === 0,
    prompt: null,
    connected: true,
    ...over,
  }
}

export function npc(id: number, over: Partial<NpcView> = {}): NpcView {
  return {
    id,
    role: 'clerk',
    character: 'mm/character-employee',
    pos: { x: -10 + id, y: 0, z: -9 },
    yaw: 0,
    anim: 'walk',
    state: 'patrol',
    target: null,
    bubble: null,
    ...over,
  }
}

export function stations(): StationsView {
  return {
    pyramid: { collapsed: false, rebuildIn: 0 },
    bowling: { pinsDown: 0, resetIn: 0 },
    samples: { left: 8, refillIn: 0 },
    watermelons: { left: 6, refillIn: 0 },
    pa: { activeSlot: null, holdProgress: 0, cooldown: 0 },
    freezerSlots: [],
  }
}

/** 試合の始まりの見え方（商品はすべて定位置） */
export function makeView(world: WorldStatic, over: Partial<WorldView> = {}): WorldView {
  return {
    phase: 'playing',
    timeLeft: 120,
    duration: 120,
    lastSpurt: false,
    avatars: [avatar(0), avatar(1)],
    npcs: [npc(0), npc(1, { role: 'manager', character: 'ch/character-male-d' })],
    ...homeView(world),
    carts: world.carts.map((c) => ({ id: c.id, pos: c.home.pos, yaw: c.home.yaw, riderSlot: null, speed: 0 })),
    peels: [],
    stations: stations(),
    events: [],
    damage: 0,
    ...over,
  }
}

/** 商品 id を dx・dy だけずらし、Y軸まわりに turn だけ回す */
export function nudgeProp(view: WorldView, id: number, dx: number, dy: number, turn: number): void {
  const o = id * 7
  const t = view.propTransforms
  t[o] = (t[o] as number) + dx
  t[o + 1] = (t[o + 1] as number) + dy
  // いまの回転に、X軸まわりの回転 turn を掛ける（傾いて落ちたような回転）
  const [x, y, z, w] = [t[o + 3] as number, t[o + 4] as number, t[o + 5] as number, t[o + 6] as number]
  const s = Math.sin(turn / 2)
  const c = Math.cos(turn / 2)
  t[o + 3] = w * s + x * c
  t[o + 4] = y * c + z * s
  t[o + 5] = z * c - y * s
  t[o + 6] = w * c - x * s
}

/** 2人の試合の結果（final の中身の見本） */
export function sampleResult(over: Partial<MatchResult> = {}): MatchResult {
  return {
    duration: 120,
    players: [
      {
        slot: 0,
        kind: 'human',
        name: 'たろう',
        character: 'ch/character-female-b',
        score: 5230.5,
        rank: 1,
        title: '店長に顔を覚えられた',
        complete: false,
        achieved: ['bell', 'sweep'],
        secrets: [],
        breakdown: { bell: { count: 20, points: 400 }, sweep: { count: 31, points: 380 }, knock: { count: 3, points: 30 } },
        caught: 1,
      },
      {
        slot: 1,
        kind: 'human',
        name: 'はなこ',
        character: 'ch/character-male-f',
        score: 3100,
        rank: 2,
        title: '要注意人物',
        complete: false,
        achieved: ['cart'],
        secrets: ['secret-cart-strike'],
        breakdown: { cart: { count: 40, points: 200 } },
        caught: 0,
      },
    ],
    winnerSlots: [0],
    damage: 0.37,
    aborted: false,
    ...over,
  }
}
