/** 器の動作確認専用。実際の雪上の力学を表すものではない。 */
export function createState() {
  const vector = () => ({ x: 0, y: 0, z: 0 });
  return { mode: 'rest', pos: vector(), com: vector(), vel: vector(), speed: 0, heading: 0, yawRate: 0,
    fwd: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 },
    edge: 0, slip: 0, load: 1, gLoad: 1, leg: .8, crouch: 0, sink: 0,
    snow: { depth: 0, powder: 1, packed: 0, ice: 0, rock: 0, wind: 0, rough: 0 }, air: { time: 0, spin: 0, apex: 0 }, switch: false, stance: 1,
    tele: { edgeForce: 0, skidPower: 0, spray: 0, carveDrag: 0, lastImpact: 0 } };
}
export function copyState(src, dst) {
  for (const key in src) {
    if (src[key] && typeof src[key] === 'object') copyState(src[key], dst[key]); else dst[key] = src[key];
  }
  return dst;
}
const ground = z => 1600 + z * .15;
export const FAKE_SPAWNS = Object.freeze({ summit: { x: 0, z: 0, heading: 0, speed: 0 }, field: { x: 120, z: -250, heading: .2, speed: 0 } });
export function createFakeRide() {
  const state = createState(), events = [];
  let drop = { ...FAKE_SPAWNS.summit }, safe = { ...drop }, jumpHeld = false;
  function place(spawn) {
    copyState(createState(), state); state.pos.x = spawn.x; state.pos.z = spawn.z; state.pos.y = ground(spawn.z);
    state.heading = spawn.heading ?? 0; state.speed = spawn.speed ?? 0; jumpHeld = false; sync();
  }
  function sync() {
    state.fwd.x = -Math.sin(state.heading); state.fwd.z = -Math.cos(state.heading);
    state.right.x = Math.cos(state.heading); state.right.z = -Math.sin(state.heading);
    state.vel.x = state.fwd.x * state.speed; state.vel.z = state.fwd.z * state.speed;
    state.com.x = state.pos.x; state.com.y = state.pos.y + state.leg; state.com.z = state.pos.z;
  }
  const ride = {
    state, events, createState, copyState,
    step(input, dt) {
      events.length = 0;
      if (state.mode === 'crash') { jumpHeld = input.jump; return; }
      state.yawRate = -input.steer * 1.2; state.heading += state.yawRate * dt;
      state.crouch = input.tuck; state.edge = input.steer * .6; state.slip = input.brake * .8;
      state.speed = Math.max(0, Math.min(30, state.speed + (2 + input.tuck - input.brake * 10 - state.speed * .05) * dt));
      if (input.jump && !jumpHeld && state.mode !== 'air') {
        state.mode = 'air'; state.air.time = 0; state.air.apex = state.pos.y + .45;
        events.push({ type: 'takeoff', speed: state.speed, pop: true });
      }
      jumpHeld = input.jump;
      if (state.mode === 'air') {
        state.air.time += dt;
        if (state.air.time >= .6) {
          state.mode = 'carve'; events.push({ type: 'land', efh: .45, yawDeg: 0, quality: 'clean' }); state.air.time = 0;
        }
      } else state.mode = state.speed < .1 ? 'rest' : input.brake > .1 ? 'skid' : 'carve';
      sync(); state.pos.x += state.vel.x * dt; state.pos.z += state.vel.z * dt;
      state.pos.y = ground(state.pos.z) + (state.mode === 'air' ? Math.sin(Math.PI * state.air.time / .6) * .45 : 0);
      if (state.mode !== 'air') safe = { x: state.pos.x, z: state.pos.z, heading: state.heading, speed: 0 };
      state.tele.spray = input.brake; state.tele.skidPower = state.speed * input.brake * 100; sync();
    },
    reset(spawn) { drop = { ...spawn }; safe = { ...spawn, speed: 0 }; place(drop); events.length = 0; },
    respawn(kind) { place({ ...(kind === 'safe' ? safe : drop), speed: 0 }); events.length = 0; events.push({ type: 'recover' }); },
    snapshot() { return structuredClone({ state, drop, safe, jumpHeld }); },
    restore(saved) { copyState(saved.state, state); drop = { ...saved.drop }; safe = { ...saved.safe }; jumpHeld = saved.jumpHeld; events.length = 0; },
  };
  ride.reset(drop); return ride;
}
