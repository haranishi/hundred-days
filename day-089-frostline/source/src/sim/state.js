const VECTORS = ['pos', 'com', 'vel', 'fwd', 'up', 'right'];
const SCALARS = ['mode', 'speed', 'heading', 'yawRate', 'edge', 'slip', 'load', 'gLoad', 'leg', 'crouch', 'sink', 'switch', 'stance'];
const SNOW_KEYS = ['depth', 'powder', 'packed', 'ice', 'rock', 'wind', 'rough'];
// grab・grabTime：成立したつかみ（0.3 秒つづけた後）と、いちばん長くつづけた時間。点の計算に使う。
// reach・reachTime：いま手を伸ばしている先と、押しつづけている時間。姿勢が使う（押した瞬間から手を伸ばすため。成立を待つと、手が動き出すのが 0.3 秒遅れた）
const AIR_KEYS = ['time', 'spin', 'apex', 'flip', 'grab', 'grabTime', 'reach', 'reachTime'];
const TELE_KEYS = ['edgeForce', 'skidPower', 'spray', 'carveDrag', 'lastImpact'];
export function createState() {
  return { gear: 'board', mode: 'carve', pos: { x: 0, y: 0, z: 0 }, com: { x: 0, y: 0.9, z: 0 },
    vel: { x: 0, y: 0, z: 0 }, fwd: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 },
    speed: 0, heading: 0, yawRate: 0, edge: 0, slip: 0, load: 1, gLoad: 1, leg: 0.9, crouch: 0, sink: 0,
    snow: { depth: 0, powder: 0, packed: 1, ice: 0, rock: 0, wind: 0, rough: 0 },
    air: { time: 0, spin: 0, apex: 0, flip: 0, grab: 0, grabTime: 0, reach: 0, reachTime: 0 }, switch: false, stance: 1,
    tele: { edgeForce: 0, skidPower: 0, spray: 0, carveDrag: 0, lastImpact: 0 } };
}
function copyNumbers(src, dst, keys) { for (let i = 0; i < keys.length; i++) dst[keys[i]] = src[keys[i]]; }
export function copyState(src, dst) {
  copyNumbers(src, dst, SCALARS);
  dst.gear = src.gear ?? 'board';
  for (let i = 0; i < VECTORS.length; i++) {
    const a = src[VECTORS[i]], b = dst[VECTORS[i]]; b.x = a.x; b.y = a.y; b.z = a.z;
  }
  copyNumbers(src.snow, dst.snow, SNOW_KEYS);
  for (const key of AIR_KEYS) dst.air[key] = src.air[key] ?? 0;
  copyNumbers(src.tele, dst.tele, TELE_KEYS);
  return dst;
}
function validNumbers(record, keys) {
  for (let i = 0; i < keys.length; i++) if (typeof record[keys[i]] === 'number' && !Number.isFinite(record[keys[i]])) return false;
  return true;
}
export function validState(s) {
  if (!validNumbers(s, SCALARS) || !validNumbers(s.snow, SNOW_KEYS) || !validNumbers(s.air, AIR_KEYS) || !validNumbers(s.tele, TELE_KEYS)) return false;
  for (let i = 0; i < VECTORS.length; i++) {
    const v = s[VECTORS[i]]; if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return false;
  }
  return true;
}
export function createMemory() {
  return { airBasis: false, hadTrick: false, baseUX: 0, baseUY: 1, baseUZ: 0, baseFX: 0, baseFY: 0, baseFZ: -1,
    flipRate: 0, seedSide: 0, seeded: false, switchIn: false, jumpBlocked: false,
    grabbing: false, grabHeld: 0, grabKind: 0, bodyHit: false, inWater: false,
    comOffsetX: 0, comOffsetY: 0, comOffsetZ: 0, turningDownhill: false, noseDown: false, skidTakeoff: false, idle: 0, legRate: 0, lateral: 0, lateralRate: 0, low: true, breakTimer: 0, recapture: 0, side: 1,
    edgeSide: 0, held: 0, wasJump: false, popDepth: 0, popping: false, windup: 0,
    spin: 0, initialSpin: 0, takeoffSpeed: 0, takeoffPop: false, takeoffSent: false,
    sketch: 0, stopped: 0, safeTimer: 0, rockTimer: 0, atBounds: false, airStart: 0, crashTime: 0 };
}
export function copyMemory(src, dst) { for (const key in src) dst[key] = src[key]; }
/** Event records are pooled; consumers must copy events before the next step. */
export function createEventPool(capacity) {
  const records = [];
  for (let i = 0; i < capacity; i++) records.push({ type: '', obstacleType: '', speed: 0, pop: false, efh: 0, yawDeg: 0, quality: '', reason: '', side: 0, cause: '', impulse: 0, spin: 0, flip: 0, grab: 0, grabTime: 0, air: 0, drop: 0, switchIn: false, switchOut: false });
  return records;
}
export function emit(ctx, type) {
  const i = ctx.events.length;
  if (i >= ctx.pool.length) throw new Error('ride-sim event capacity exceeded');
  const e = ctx.pool[i];
  e.type = type; e.obstacleType = ''; e.speed = e.efh = e.yawDeg = e.side = e.impulse = 0;
  e.spin = e.flip = e.grab = e.grabTime = e.air = e.drop = 0; e.switchIn = e.switchOut = false;
  e.pop = false; e.quality = e.reason = e.cause = '';
  ctx.events.push(e); return e;
}
