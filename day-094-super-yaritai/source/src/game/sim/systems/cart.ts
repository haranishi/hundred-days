/**
 * カートで爆走：カートの近くでアクションで乗り、もう一度で降りる。
 * 乗っている間、カートは運動学の剛体になってキャラと一体で動く（最高10m/s・曲がりは遅め）。動かない物とだけ当てて滑らせ、商品は押しのける。
 * 秒速4m以上で1mごと5点、秒速5m以上でぶつかると+50。降りると今の速さのまま転がる。
 * 乗っている間は、カートの当たり判定を「カート＋後ろに立つ人」の箱に広げる。人だけが棚に重なることがないように（第1波の課題）。
 * ネットの参加者（puppet）は、届いた姿勢の ridingCart で乗せ降ろしし、カートは姿勢を追いかける。self（参加者の端末）でも回す。
 */
import { CART } from '../../../shared/rules/tuning';
import { CART_SIZE, yawQuat } from '../physics';
import type { AvatarState, CartState, MisdeedSystem, Offer, SimContext } from '../types';

/** 缶ピラミッドへの突っ込みを申し送る鍵（pyramid.ts が読む） */
export const MEMO_CART_STRIKE = 'cart:strike';

/** 乗っている間の当たり判定（カートの前端から、後ろに立つ人の背中まで） */
const RIDE_BACK = CART.riderOffset + 0.32;
const RIDE_HALF = { x: CART_SIZE.x / 2, y: 0.82, z: (CART_SIZE.z / 2 + RIDE_BACK) / 2 };
const RIDE_OFFSET = { x: 0, y: 0.84, z: (CART_SIZE.z / 2 - RIDE_BACK) / 2 };
const BOX_HALF = { x: CART_SIZE.x / 2, y: CART_SIZE.y / 2, z: CART_SIZE.z / 2 };
const BOX_OFFSET = { x: 0, y: CART_SIZE.y / 2 + 0.02, z: 0 };

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function cartYaw(cart: CartState): number {
  const q = cart.body.rotation();
  return 2 * Math.atan2(q.y, q.w);
}

/** 乗れるカートのうち、いちばん近いもの */
export function nearestFreeCart(ctx: SimContext, x: number, z: number, range: number): CartState | null {
  let best: CartState | null = null;
  let bestD = range;
  for (const c of ctx.carts) {
    if (c.rider !== null || c.remoteRider !== null) continue;
    const t = c.body.translation();
    const d = Math.hypot(t.x - x, t.z - z) - 0.4;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export const cartSystem: MisdeedSystem = {
  id: 'cart',
  local: true,
  offer(ctx, av): Offer | null {
    if (av.ridingCart !== null) return { system: cartSystem, priority: 100, prompt: { label: '降りる', press: 'press', misdeed: 'cart' }, target: av.ridingCart };
    if (av.holding !== null || !av.grounded) return null;
    const c = nearestFreeCart(ctx, av.pos.x, av.pos.z, CART.rideRange);
    if (!c) return null;
    return { system: cartSystem, priority: 30, prompt: { label: '乗る', press: 'press', misdeed: 'cart' }, target: c.id };
  },
  act(ctx, av, offer) {
    // 参加者は姿勢の ridingCart で乗せ降ろしする（押した意図とで2回切り替えないように）
    if (av.puppet) return;
    if (av.ridingCart !== null) dismount(ctx, av);
    else {
      const cart = ctx.carts[offer.target];
      if (cart && cart.rider === null) mount(ctx, av, cart);
    }
  },
  preStep(ctx, dt) {
    for (const cart of ctx.carts) {
      if (cart.rider === null) continue;
      const av = ctx.avatarBySlot(cart.rider);
      if (!av) continue;
      if (av.puppet && av.stunned <= 0) followPuppet(ctx, cart, av, dt);
      else drive(ctx, cart, av, dt);
    }
  },
  postStep(ctx) {
    // 乗ったまま速くぶつかったら +50。商品に当たったときは Simulation が「触った人」を付ける
    for (const cart of ctx.carts) {
      if (cart.rider === null || cart.speed < CART.crashSpeed) continue;
      let hitProp = false;
      let hitCan = false;
      const handles: number[] = [];
      ctx.world.contactPairsWith(cart.collider, (other) => {
        if (ctx.propOf(other.handle)) handles.push(other.handle);
      });
      for (const h of handles) {
        const other = ctx.world.getCollider(h);
        let touching = false;
        ctx.world.contactPair(cart.collider, other, (m) => {
          if (m.numContacts() > 0) touching = true;
        });
        if (!touching) continue;
        hitProp = true;
        if (ctx.propOf(h)?.def.kind === 'can') hitCan = true;
      }
      if (hitCan) ctx.memo.set(MEMO_CART_STRIKE, { slot: cart.rider, t: ctx.time });
      if (hitProp) crash(ctx, cart, cart.rider);
    }
  },
};

export function mount(ctx: SimContext, av: AvatarState, cart: CartState): void {
  let t = cart.body.translation();
  cart.yaw = cartYaw(cart);
  // 乗った瞬間に、「カート＋人の箱」がほかのカートや棚・壁と重ならない所まで押し出す（置き場で噛み合って固まらないように）
  const free = freeSpotNear(ctx, cart, t.x, t.z, cart.yaw);
  if (free) {
    t = { x: free.x, y: 0, z: free.z };
    cart.body.setTranslation(t, true);
  }
  cart.stuckFor = 0;
  cart.mountedAt = ctx.time;
  const lv = cart.body.linvel();
  cart.speed = ctx.mode === 'full' ? Math.max(0, lv.x * Math.sin(cart.yaw) + lv.z * Math.cos(cart.yaw)) : 0;
  cart.body.setBodyType(ctx.R.RigidBodyType.KinematicPositionBased, true);
  cart.body.setNextKinematicTranslation({ x: t.x, y: 0, z: t.z });
  cart.collider.setHalfExtents(RIDE_HALF);
  cart.collider.setTranslationWrtParent(RIDE_OFFSET);
  cart.rider = av.slot;
  cart.lastRider = av.slot;
  cart.lastRideT = ctx.time;
  cart.meterAcc = 0;
  av.ridingCart = cart.id;
  av.vel = { x: 0, y: 0, z: 0 };
  // 乗った瞬間に、立ち位置をカートの後ろへそろえる
  const fx = Math.sin(cart.yaw);
  const fz = Math.cos(cart.yaw);
  av.pos = { x: t.x - fx * CART.riderOffset, y: 0.12, z: t.z - fz * CART.riderOffset };
  av.yaw = cart.yaw;
  ctx.emit({ t: 'sfx', name: 'roll', pos: { x: t.x, y: 0.5, z: t.z } });
}

export function dismount(ctx: SimContext, av: AvatarState): void {
  const cart = av.ridingCart === null ? undefined : ctx.carts[av.ridingCart];
  av.ridingCart = null;
  if (!cart) return;
  cart.rider = null;
  cart.lastRideT = ctx.time;
  cart.collider.setHalfExtents(BOX_HALF);
  cart.collider.setTranslationWrtParent(BOX_OFFSET);
  if (ctx.mode === 'full') {
    cart.body.setBodyType(ctx.R.RigidBodyType.Dynamic, true);
    // 今の速さのまま転がしていく
    cart.body.setLinvel({ x: Math.sin(cart.yaw) * cart.speed, y: 0, z: Math.cos(cart.yaw) * cart.speed }, true);
    cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  av.vel = { x: Math.sin(cart.yaw) * cart.speed * 0.3, y: 0, z: Math.cos(cart.yaw) * cart.speed * 0.3 };
  // 後退中に降りたら、人はカートの横へ（後ろに立つと、下がってくるカートを体で止めてしまう）
  if (cart.speed < -0.5) {
    const t = cart.body.translation();
    for (const side of [1, -1]) {
      const sx = t.x + Math.cos(cart.yaw) * 0.85 * side;
      const sz = t.z - Math.sin(cart.yaw) * 0.85 * side;
      if (ctx.nav.isFree(sx, sz)) {
        ctx.teleport(av.slot, sx, sz);
        break;
      }
    }
  }
  cart.speed = 0;
  // 念のため：棚などに重なっていたら近くの歩ける所へ出す
  if (!ctx.nav.isFree(av.pos.x, av.pos.z)) {
    const p = ctx.nav.nearestFree(av.pos.x, av.pos.z);
    if (p) ctx.teleport(av.slot, p.x, p.z);
  }
}

let cartKcc: import('@dimforge/rapier3d-compat').KinematicCharacterController | null = null;
let cartKccWorld: unknown = null;

function controller(ctx: SimContext): import('@dimforge/rapier3d-compat').KinematicCharacterController {
  // 世界ごとに1つ（試験で世界を作り直しても古いものを使わない）
  if (!cartKcc || cartKccWorld !== ctx.world) {
    cartKcc = ctx.world.createCharacterController(0.03);
    cartKcc.setSlideEnabled(true);
    cartKcc.setApplyImpulsesToDynamicBodies(false);
    cartKccWorld = ctx.world;
  }
  return cartKcc;
}

/**
 * 「カート＋人の箱」を (x, z, yaw) に置いたとき、空いているか。
 * 見るのは棚・壁・台など動かない物だけ（withCarts のときだけ、ほかのカートも見る＝乗った瞬間の押し出し用）
 */
function boxFreeAt(ctx: SimContext, cart: CartState, x: number, z: number, yaw: number, withCarts = false): boolean {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const pos = { x: x + RIDE_OFFSET.z * s, y: RIDE_OFFSET.y, z: z + RIDE_OFFSET.z * c };
  let hit = false;
  const shape = new ctx.R.Cuboid(RIDE_HALF.x - 0.02, RIDE_HALF.y - 0.05, RIDE_HALF.z - 0.02);
  const others = withCarts ? new Set(ctx.carts.filter((o) => o !== cart).map((o) => o.collider.handle)) : null;
  ctx.world.intersectionsWithShape(
    pos,
    yawQuat(yaw),
    shape,
    (col) => {
      if (col.handle === cart.collider.handle) return true;
      if (col.parent()?.isFixed() || others?.has(col.handle)) {
        hit = true;
        return false;
      }
      return true;
    },
    withCarts ? undefined : ctx.R.QueryFilterFlags.ONLY_FIXED,
  );
  return !hit;
}

/** いちばん近い、カート＋人の箱が置ける所（いまの所が空いていれば null） */
function freeSpotNear(ctx: SimContext, cart: CartState, x: number, z: number, yaw: number): { x: number; z: number } | null {
  if (boxFreeAt(ctx, cart, x, z, yaw, true)) return null;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  for (const d of [0.15, 0.3, 0.45, 0.6, 0.8, 1.0]) {
    // 前・後ろ・左右の順に試す
    for (const [ax, az] of [
      [fx, fz],
      [-fx, -fz],
      [fz, -fx],
      [-fz, fx],
    ] as const) {
      const px = x + ax * d;
      const pz = z + az * d;
      if (boxFreeAt(ctx, cart, px, pz, yaw, true)) return { x: px, z: pz };
    }
  }
  return null;
}

/**
 * 向きを変える。めり込むなら、少し下がる・横へずれる所を探して「曲がりながら押し戻す」（固まらない）。
 * 曲がれたときは押し戻した分の動き、曲がれなかったときは null を返す
 */
function tryTurn(ctx: SimContext, cart: CartState, yaw: number): { x: number; z: number } | null {
  const t = cart.body.translation();
  if (boxFreeAt(ctx, cart, t.x, t.z, yaw)) {
    cart.yaw = yaw;
    return { x: 0, z: 0 };
  }
  const fx = Math.sin(cart.yaw);
  const fz = Math.cos(cart.yaw);
  for (const d of [0.06, 0.12, 0.2, 0.3]) {
    for (const [ax, az] of [
      [-fx, -fz],
      [fz, -fx],
      [-fz, fx],
      [fx, fz],
    ] as const) {
      if (!boxFreeAt(ctx, cart, t.x + ax * d, t.z + az * d, yaw)) continue;
      const mv = moveCart(ctx, cart, { x: ax * d, z: az * d });
      if (Math.hypot(mv.x - ax * d, mv.z - az * d) > 0.02) continue;
      cart.yaw = yaw;
      return mv;
    }
  }
  return null;
}

/** カートを want だけ動かす（動かない物には当てて滑らせる）。実際に動いた量を返す */
function moveCart(ctx: SimContext, cart: CartState, want: { x: number; z: number }): { x: number; z: number } {
  if (Math.hypot(want.x, want.z) < 1e-5) return { x: 0, z: 0 };
  const kcc = controller(ctx);
  const Q = ctx.R.QueryFilterFlags;
  kcc.computeColliderMovement(cart.collider, { x: want.x, y: 0, z: want.z }, Q.EXCLUDE_DYNAMIC | Q.EXCLUDE_KINEMATIC | Q.EXCLUDE_SENSORS);
  const mv = kcc.computedMovement();
  return { x: mv.x, z: mv.z };
}

/** カートの位置と向きを決め、乗っている人を後ろに立たせる */
function placeCart(ctx: SimContext, cart: CartState, av: AvatarState, mv: { x: number; z: number }): { x: number; z: number } {
  const t = cart.body.translation();
  const nx = t.x + mv.x;
  const nz = t.z + mv.z;
  cart.body.setNextKinematicTranslation({ x: nx, y: 0, z: nz });
  cart.body.setNextKinematicRotation(yawQuat(cart.yaw));
  cart.lastRider = av.slot;
  cart.lastRideT = ctx.time;
  const fx = Math.sin(cart.yaw);
  const fz = Math.cos(cart.yaw);
  av.pos.x = nx - fx * CART.riderOffset;
  av.pos.z = nz - fz * CART.riderOffset;
  av.pos.y = 0.12;
  av.yaw = cart.yaw;
  av.vel.x = fx * cart.speed;
  av.vel.z = fz * cart.speed;
  av.vel.y = 0;
  av.grounded = true;
  return { x: nx, z: nz };
}

/** 距離と点（秒速4m以上で1mごと5点。出来事が多すぎないよう2mごとにまとめて入れる） */
function scoreRide(ctx: SimContext, cart: CartState, av: AvatarState, got: number, at: { x: number; z: number }): void {
  ctx.progress(av.slot, 'cart', got);
  if (cart.speed < CART.scoreSpeed) return;
  cart.meterAcc += got;
  while (cart.meterAcc >= 2) {
    cart.meterAcc -= 2;
    ctx.award(av.slot, 'cart', CART.pointsPerMeter * 2, { x: at.x, y: 1.2, z: at.z }, 2);
  }
}

/** 向き yaw で dist だけ進んだ所に「カート＋人の箱」を置くと、動かない物に当たるか */
function pathBlocked(ctx: SimContext, cart: CartState, yaw: number, dist: number): boolean {
  const t = cart.body.translation();
  return !boxFreeAt(ctx, cart, t.x + Math.sin(yaw) * dist, t.z + Math.cos(yaw) * dist, yaw);
}

/**
 * 押し付けて動けないとき：左右のうち空いている方（同じなら入力の側、それも同じなら店の入口の西）へ向きを変える。
 * 向きを変えられたら true（次の刻みからは、曲がった先がふさがっている間は曲がらずに進む＝壁に沿って走る）
 */
function turnAlongWall(ctx: SimContext, cart: CartState, input: { x: number; z: number }): boolean {
  const sides = [cart.yaw + Math.PI / 2, cart.yaw - Math.PI / 2].map((yaw) => {
    const y = wrapAngle(yaw);
    let run = 0;
    for (let d = 0.3; d <= 1.5 + 1e-6; d += 0.3) {
      if (pathBlocked(ctx, cart, y, d)) break;
      run += 0.3;
    }
    const sx = Math.sin(y);
    const sz = Math.cos(y);
    return { yaw: y, run, toInput: sx * input.x + sz * input.z, toWest: -sx };
  });
  sides.sort((a, b) => b.run - a.run || b.toInput - a.toInput || b.toWest - a.toWest);
  for (const s of sides) {
    if (s.run <= 0) continue;
    if (tryTurn(ctx, cart, s.yaw)) return true;
  }
  return false;
}

/**
 * 自分で（または CPU が）運転する。
 * - 入力の向きへ曲がる（遅いほど速く曲がれる）。めり込むなら押し戻しながら曲がる
 * - 曲がった先がすぐ動かない物でふさがっていて、いまの向きが空いていれば、曲がらずに進む（壁に沿って走る）
 * - 入力が進む向きと逆なら、ブレーキ→止まったら後退（180°で回る向きが決まらない状態を作らない）
 * - 押し付けて0.3秒動けなければ、壁に沿って横へ向きを変える。それもだめなら0.5秒で少し後ろへ戻す
 */
export function drive(ctx: SimContext, cart: CartState, av: AvatarState, dt: number): void {
  const inp = av.input;
  const canDrive = ctx.phase === 'playing' && av.stunned <= 0;
  let mx = canDrive ? inp.moveX : 0;
  let mz = canDrive ? inp.moveZ : 0;
  const m = Math.min(1, Math.hypot(mx, mz));
  let push = { x: 0, z: 0 };
  if (m > 0.15) {
    mx /= Math.max(m, 0.0001);
    mz /= Math.max(m, 0.0001);
    const fx0 = Math.sin(cart.yaw);
    const fz0 = Math.cos(cart.yaw);
    const dot = fx0 * mx + fz0 * mz;
    if (dot < CART.reverseDot) {
      // 逆向き：まずブレーキ、止まったら真後ろへ下がる（向きは変えない）
      if (cart.speed > 0.3) cart.speed = Math.max(0, cart.speed - CART.brake * dt);
      else cart.speed = Math.max(-CART.reverseSpeed * m, cart.speed - CART.accel * dt);
    } else {
      if (cart.speed < 0) cart.speed = Math.min(0, cart.speed + CART.brake * dt);
      const inputYaw = Math.atan2(mx, mz);
      let diff = wrapAngle(inputYaw - cart.yaw);
      // 曲がった先がすぐふさがっていて、いまの向きは空いている：曲がらずにそのまま進む
      if (Math.abs(diff) > 0.2 && Math.abs(diff) < 1.7) {
        const launching = ctx.time - cart.mountedAt < CART.launchTime;
        const ahead = launching ? CART.launchLookAhead : CART.lookAhead + Math.max(0, cart.speed) * CART.lookAheadPerSpeed;
        if (pathBlocked(ctx, cart, inputYaw, ahead) && !pathBlocked(ctx, cart, cart.yaw, 0.35)) diff = 0;
      }
      const k = Math.min(1, Math.abs(cart.speed) / CART.slowSpeed);
      const rate = CART.turnRateSlow + (CART.turnRate - CART.turnRateSlow) * k;
      const turn = rate * dt;
      const turned = tryTurn(ctx, cart, wrapAngle(cart.yaw + Math.max(-turn, Math.min(turn, diff))));
      if (turned) push = turned;
      const top = CART.maxSpeed * m * av.speedScale;
      if (cart.speed >= 0) {
        if (Math.abs(diff) < 1.7) cart.speed = cart.speed < top ? Math.min(top, cart.speed + CART.accel * dt) : Math.max(top, cart.speed - CART.drag * dt);
        else cart.speed = Math.max(0, cart.speed - CART.accel * 1.5 * dt);
      }
    }
  } else if (cart.speed >= 0) cart.speed = Math.max(0, cart.speed - CART.drag * dt);
  else cart.speed = Math.min(0, cart.speed + CART.drag * 2 * dt);
  if (canDrive && inp.dash && cart.speed >= 0) cart.speed = Math.min(CART.maxSpeed, cart.speed + CART.dashBoost);
  const fx = Math.sin(cart.yaw);
  const fz = Math.cos(cart.yaw);
  const want = cart.speed * dt;
  const mv = moveCart(ctx, cart, { x: fx * want, z: fz * want });
  let got = Math.hypot(mv.x, mv.z);
  // 壁や棚に正面からぶつかった（進めた距離が半分未満）
  if (Math.abs(want) > 0.0001 && got < Math.abs(want) * 0.5) {
    if (cart.speed >= CART.crashSpeed) crash(ctx, cart, av.slot);
    else if (cart.speed >= CART.bumpSpeed) bumpSaleTable(ctx, cart, av.slot, frontOf(cart));
    cart.speed *= CART.bumpKeep;
  }
  let move = { x: mv.x + push.x, z: mv.z + push.z };
  // 入力があるのにほとんど動けない（押し付けて固まった）：0.3秒で壁に沿って向きを変え、だめなら0.5秒で少し後ろへ戻す
  if (m > 0.15 && Math.hypot(move.x, move.z) < 0.25 * dt) cart.stuckFor += dt;
  else cart.stuckFor = 0;
  if (cart.stuckFor >= CART.slideAfter && cart.stuckFor - dt < CART.slideAfter && turnAlongWall(ctx, cart, { x: mx, z: mz })) {
    cart.stuckFor = 0;
    cart.speed = Math.max(cart.speed, 1);
  }
  if (cart.stuckFor >= CART.stuckAfter) {
    cart.stuckFor = 0;
    cart.speed = 0;
    const back = moveCart(ctx, cart, { x: -fx * CART.backOff, z: -fz * CART.backOff });
    // 後ろも塞がっていたら、入力の向きへずらす
    const alt = Math.hypot(back.x, back.z) < 0.05 && m > 0.15 ? moveCart(ctx, cart, { x: mx * CART.backOff, z: mz * CART.backOff }) : back;
    move = { x: move.x + alt.x, z: move.z + alt.z };
    got += Math.hypot(alt.x, alt.z);
  }
  const at = placeCart(ctx, cart, av, move);
  if (got > 0) scoreRide(ctx, cart, av, got, at);
}

/** ネットの参加者：届いた姿勢（の少し先）にカートを追いつかせる */
function followPuppet(ctx: SimContext, cart: CartState, av: AvatarState, dt: number): void {
  const pup = av.puppet!;
  const pose = pup.pose;
  const ahead = Math.min(0.12, Math.max(0, ctx.time - pup.at));
  const fx = Math.sin(pose.yaw);
  const fz = Math.cos(pose.yaw);
  const tx = pose.pos.x + pose.vel.x * ahead + fx * CART.riderOffset;
  const tz = pose.pos.z + pose.vel.z * ahead + fz * CART.riderOffset;
  const t = cart.body.translation();
  let wx = tx - t.x;
  let wz = tz - t.z;
  const d = Math.hypot(wx, wz);
  const lim = (CART.maxSpeed + 2) * dt;
  if (d > lim) {
    wx *= lim / d;
    wz *= lim / d;
  }
  const t0 = cart.body.translation();
  if (boxFreeAt(ctx, cart, t0.x, t0.z, pose.yaw)) cart.yaw = pose.yaw;
  const mv = moveCart(ctx, cart, { x: wx, z: wz });
  const got = Math.hypot(mv.x, mv.z);
  const prev = cart.speed;
  cart.speed = got / dt;
  // 速いまま急に止まった＝ぶつかった
  if (prev >= CART.bumpSpeed && cart.speed < prev * 0.4 && Math.hypot(wx, wz) > got + 0.02) {
    if (prev >= CART.crashSpeed) crash(ctx, cart, av.slot);
    else bumpSaleTable(ctx, cart, av.slot, frontOf(cart));
  }
  const at = placeCart(ctx, cart, av, mv);
  if (got > 0) scoreRide(ctx, cart, av, got, at);
}

/** カートの前端（ぶつかった所） */
function frontOf(cart: CartState): { x: number; y: number; z: number } {
  const t = cart.body.translation();
  return { x: t.x + Math.sin(cart.yaw) * 0.6, y: 0.6, z: t.z + Math.cos(cart.yaw) * 0.6 };
}

function crash(ctx: SimContext, cart: CartState, slot: number): void {
  if (ctx.time - cart.crashT < CART.crashCooldown) return;
  cart.crashT = ctx.time;
  const pos = frontOf(cart);
  ctx.emit({ t: 'sfx', name: 'crash', pos });
  ctx.award(slot, 'cart', CART.crashBonus, pos);
  bumpSaleTable(ctx, cart, slot, pos);
}

/**
 * 特売台に速くぶつかったら、台が揺れて下の段の缶が崩れる（台の縁でカートが止まり、缶に直接は届かないため）。
 * カートで缶ピラミッドに突っ込む＝ひみつの入口になる
 */
function bumpSaleTable(ctx: SimContext, cart: CartState, slot: number, front: { x: number; z: number }): void {
  if (ctx.mode !== 'full') return;
  const table = ctx.layout.fixtures.find((f) => f.kind === 'sale-table');
  if (!table) return;
  const hx = table.size.x / 2 + 0.5;
  const hz = table.size.z / 2 + 0.5;
  if (Math.abs(front.x - table.pos.x) > hx || Math.abs(front.z - table.pos.z) > hz) return;
  const fx = Math.sin(cart.yaw);
  const fz = Math.cos(cart.yaw);
  // ぶつかった所に近い、下の2段の缶から8個を跳ね上げる（上の段はつられて崩れる）
  const near = ctx.props
    .filter((p) => p.def.kind === 'can' && !p.locked && !p.moved && p.def.home.pos.y < table.size.y + 0.8)
    .map((p) => ({ p, d: Math.hypot(p.def.home.pos.x - front.x, p.def.home.pos.z - front.z) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);
  for (const { p } of near) {
    // 缶は台の上に1列（東西）に並ぶ。列に沿って押すと隣の缶に押し返されて崩れないので、列の外（南北）へも跳ばす
    const out = Math.abs(fz) > 0.5 ? Math.sign(fz) : ctx.fx.chance(0.5) ? 1 : -1;
    ctx.launch(
      p,
      { x: fx * 3 + ctx.fx.range(-1, 1), y: ctx.fx.range(1.5, 3), z: out * ctx.fx.range(2.5, 4) },
      { x: ctx.fx.range(-6, 6), y: 0, z: ctx.fx.range(-6, 6) },
      slot,
    );
  }
  if (near.length > 0) {
    ctx.memo.set(MEMO_CART_STRIKE, { slot, t: ctx.time });
    ctx.emit({ t: 'sfx', name: 'can', pos: { x: front.x, y: table.size.y + 0.5, z: front.z }, volume: 1 });
  }
}
