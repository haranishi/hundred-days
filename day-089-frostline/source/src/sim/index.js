import { createParams, GEAR } from './params.js';
import { createState, copyState, validState, createMemory, copyMemory, createEventPool, emit } from './state.js';
import { set, copy, scale, cross, length, normalize, transport, headingVector, finite, clamp } from './vec.js';
import { placeCom } from './pose.js';
import { contactStep } from './contact.js';
import { crash, crashStep, updateSafe, updateRock, updateWater } from './crash.js';
import { findLanding, land } from './landing.js';
import { airStep, prepareJump } from './air.js';
import { initAirBasis } from './tricks.js';
import { groundStep } from './ground.js';
import { respawnTarget } from './respawn.js';

/** Pure browser/Node simulation; terrain is injected, never imported. */
export function createRide(terrain, options = {}) {
  // Snapshot caller overrides, including snow records, so later gear changes keep them.
  const custom = { ...options.params };
  if (custom.snow) custom.snow = Object.fromEntries(Object.entries(custom.snow).map(([key, value]) => [key, { ...value }]));
  const p = createParams(), state = createState(), events = [];
  function setGear(gear) {
    if (gear !== 'board' && gear !== 'ski') throw new Error('Invalid ride-sim gear');
    Object.assign(p, createParams({ ...GEAR[gear], ...custom }));
    state.gear = gear;
  }
  setGear(options.gear ?? 'board');
  const ctx = { terrain, p, state, events, mem: createMemory(), pool: createEventPool(p.eventCapacity),
    beforePosition: { x: 0, y: 0, z: 0 }, obstacles: [],
    surface: { h: 0, nx: 0, ny: 1, nz: 0, inBounds: true }, normal: { x: 0, y: 1, z: 0 },
    lateralDirection: { x: 1, y: 0, z: 0 }, gravity: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 },
    temp: { x: 0, y: 0, z: 0 }, temp2: { x: 0, y: 0, z: 0 },
    material: { mu: 0, lambda: 0, kz: 0, q: 0, powder: 0 },
    controls: { steer: 0, rawSteer: 0, tuck: 0, brake: 0, jump: false },
    drop: { x: 0, z: 0, heading: 0, speed: 0 }, safe: { x: 0, z: 0, heading: 0, speed: 0 },
    flight: { ax: 0, ay: 0, az: 0, nx: 0, ny: 1, nz: 0, leg: 0, ux: 0, uy: 1, uz: 0 },
    previous: createState(), previousMemory: createMemory(), debug: options.debug === true };
  const defaults = createState(), emptyMemory = createMemory();
  state.stance = options.stance === -1 ? -1 : 1;
  ctx.takeoff = (pop, normalSpeed = 0) => {
    ctx.mem.unloadedTime = 0;
    ctx.mem.skidTakeoff = state.mode === 'skid'; // 横滑り（制動）の途中で浮いたか：着地の「横向き」の判定に使う
    state.mode = 'air'; state.load = state.gLoad = 0;
    state.vel.x += state.up.x * normalSpeed; state.vel.y += state.up.y * normalSpeed; state.vel.z += state.up.z * normalSpeed;
    placeCom(ctx);
    // Fold any residual landing lean into the free-flight leg vector, preserving both positions.
    set(ctx.normal, state.com.x - state.pos.x, state.com.y - state.pos.y, state.com.z - state.pos.z);
    state.leg = length(ctx.normal); normalize(ctx.normal, ctx.normal);
    transport(state.fwd, state.up, ctx.normal, state.fwd); copy(ctx.normal, state.up); cross(state.fwd, state.up, state.right);
    ctx.mem.comOffsetX = ctx.mem.comOffsetY = ctx.mem.comOffsetZ = 0;
    state.air.time = state.air.spin = state.air.flip = state.air.grab = state.air.grabTime = state.air.reach = state.air.reachTime = 0;
    ctx.mem.hadTrick = false;
    ctx.mem.flipRate = ctx.mem.grabHeld = ctx.mem.grabKind = 0; ctx.mem.grabbing = false;
    ctx.mem.switchIn = state.switch; ctx.mem.bodyHit = false; state.air.apex = state.com.y;
    ctx.mem.takeoffSpeed = length(state.vel); ctx.mem.takeoffPop = pop; ctx.mem.takeoffSent = false;
    ctx.mem.seedSide = pop ? Math.sign(ctx.mem.windup) : 0; ctx.mem.seeded = ctx.mem.seedSide !== 0;
    ctx.mem.spin = ctx.mem.seeded ? clamp(clamp(state.yawRate, -p.spinTakeoff, p.spinTakeoff) + ctx.mem.windup, -p.spinGrab, p.spinGrab) : 0;
    initAirBasis(ctx);
    ctx.mem.windup = 0;
    ctx.mem.initialSpin = ctx.mem.spin; ctx.mem.airStart = state.com.y;
  };
  ctx.findLanding = dt => findLanding(ctx, dt);
  ctx.land = () => land(ctx);
  ctx.crash = reason => crash(ctx, reason);
  ctx.groundedRemainder = dt => { if (state.mode === 'crash') crashStep(ctx, dt); else groundStep(ctx, dt); };
  function place(spawn, stopped = false) {
    const stance = state.stance, gear = state.gear;
    copyState(defaults, state); state.stance = stance; state.gear = gear; copyMemory(emptyMemory, ctx.mem); ctx.mem.unloadedTime = 0;
    state.pos.x = finite(spawn.x); state.pos.z = finite(spawn.z); state.heading = finite(spawn.heading);
    terrain.sampleSurface(state.pos.x, state.pos.z, ctx.surface); state.pos.y = ctx.surface.h;
    set(state.up, ctx.surface.nx, ctx.surface.ny, ctx.surface.nz); headingVector(state.heading, state.up, state.fwd);
    scale(state.fwd, stopped ? 0 : Math.max(0, finite(spawn.speed)), state.vel); state.speed = length(state.vel);
    const h = Math.hypot(state.vel.x, state.vel.z);
    const k = terrain.curvatureAlong(state.pos.x, state.pos.z, h ? state.vel.x / h : Math.sin(state.heading), h ? state.vel.z / h : -Math.cos(state.heading));
    state.leg = clamp(p.legStand - p.mass * state.speed ** 2 * k / p.spring, p.legMin, p.legMax);
    state.load = Math.max(0, (p.gravity * state.up.y + state.speed ** 2 * k) / p.gravity);
    state.gLoad = state.load; ctx.mem.low = state.speed < p.lowEnter;
    cross(state.fwd, state.up, state.right);
    set(state.com, state.pos.x + state.up.x * state.leg, state.pos.y + state.up.y * state.leg, state.pos.z + state.up.z * state.leg);
    terrain.snowAt(state.pos.x, state.pos.z, state.snow); events.length = 0;
  }
  // 水に落ちた後の戻り先（crash.js から呼ぶ）。出来事の一覧は消さない（転倒と復帰を、同じ刻みで伝える）
  ctx.placeSafe = () => { const kept = events.slice(); place(respawnTarget(ctx, ctx.safe), true); for (const e of kept) events.push(e); };
  function reset(spawn) {
    ctx.drop.x = finite(spawn.x); ctx.drop.z = finite(spawn.z); ctx.drop.heading = finite(spawn.heading); ctx.drop.speed = Math.max(0, finite(spawn.speed));
    copyMemory(ctx.drop, ctx.safe); place(ctx.drop);
  }
  function respawn(kind = 'safe') {
    const target = kind === 'drop' ? ctx.drop : ctx.safe;
    place(respawnTarget(ctx, target), true);
  }
  function step(controls, dt) {
    events.length = 0;
    if (!Number.isFinite(dt) || dt <= 0) return;
    copyState(state, ctx.previous); copyMemory(ctx.mem, ctx.previousMemory);
    const c = ctx.controls;
    c.steer = clamp(finite(controls?.steer), -1, 1); c.tuck = clamp(finite(controls?.tuck), 0, 1);
    c.brake = clamp(finite(controls?.brake), 0, 1); c.jump = controls?.jump === true;
    // 地上で構えている間（ジャンプを押している間）は、舵の効きを弱める。舵は「回りながら飛ぶ」ための予約（rawSteer）として読む。
    // 弱めないと、台の助走で構えながら舵を入れたとき、板が 67° それて台を外れた（体験の採点 2 周目）
    c.rawSteer = c.steer;
    const steps = Math.ceil(dt / p.maxStep), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      copy(state.pos, ctx.beforePosition);
      // 舵を弱めるのは、地上で構えている刻みだけ。1 回の step の中で踏み切った後の刻みは、空中の舵として、そのまま読む。
      // step の最初に 1 度だけ弱めていたときは、踏み切った刻みの舵が 0 になり、つかみの種類（舵の向きで決まる）が、
      // いつも「舵なし」の 1 種類になった（構えたまま台を越える遊び方で、ミュートとテールが出せなかった：2026-11-11 の撮影で発見）
      c.steer = c.jump && state.mode !== 'air' && state.mode !== 'crash' ? c.rawSteer * p.chargeSteer : c.rawSteer;
      prepareJump(ctx, h);
      state.crouch += (Math.max(c.tuck, c.jump ? 1 : 0) - state.crouch) * (1 - Math.exp(-h / p.crouchTime));
      if (state.mode === 'air') airStep(ctx, h);
      else if (state.mode === 'crash') crashStep(ctx, h);
      else groundStep(ctx, h);
      ctx.mem.sketch = Math.max(0, ctx.mem.sketch - h);
      contactStep(ctx, h); updateRock(ctx, h); updateWater(ctx); updateSafe(ctx, h);
      if (!validState(state)) {
        copyState(ctx.previous, state); copyMemory(ctx.previousMemory, ctx.mem); state.mode = 'crash';
        events.length = 0; emit(ctx, 'crash').reason = 'numeric';
        if (ctx.debug) throw new Error('ride-sim non-finite state');
        return;
      }
    }
  }
  function snapshot() { return { version: 1, state: copyState(state, createState()), memory: { ...ctx.mem }, drop: { ...ctx.drop }, safe: { ...ctx.safe } }; }
  function restore(s) {
    if (s.version !== 1 || !validState(s.state)) throw new Error('Invalid ride-sim snapshot');
    setGear(s.state.gear ?? 'board');
    copyState(s.state, state); copyMemory(emptyMemory, ctx.mem); copyMemory(s.memory, ctx.mem); ctx.mem.unloadedTime = s.memory.unloadedTime ?? 0; copyMemory(s.drop, ctx.drop); copyMemory(s.safe, ctx.safe); events.length = 0;
  }
  const ride = { state, events, step, reset, respawn, snapshot, restore, setGear, createState, copyState };
  reset(ctx.drop);
  return ride;
}
