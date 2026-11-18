/**
 * 物理エンジン Rapier の読み込みと、店の動かない当たり判定・商品・カートの剛体づくり。
 * compat 版は WebAssembly を JS の中に持っているので、ブラウザでも Node の試験でも同じく `await init()` で動く。
 */
import type RAPIER from '@dimforge/rapier3d-compat';
import type { StoreLayout } from '../../shared/layout/store';
import { CART, PHYSICS } from '../../shared/rules/tuning';
import type { CartDef, PropDef } from '../../shared/view';

export type R = typeof RAPIER;
export type World = RAPIER.World;
export type RigidBody = RAPIER.RigidBody;
export type Collider = RAPIER.Collider;

let ready: Promise<R> | null = null;

/**
 * 物理エンジンを読む。WebAssembly を含んで大きい（約4MB）ので、最初の読み込みから外して後から読む（タイトルを出している間に間に合う）
 */
export function loadRapier(): Promise<R> {
  if (!ready) {
    ready = import('@dimforge/rapier3d-compat').then(async (m) => {
      const R = (m.default ?? m) as R;
      await R.init();
      return R;
    });
  }
  return ready;
}

/** 当たり判定のグループ。キャラの移動（KCC）は動かない物だけと当てるので、ここでは区別だけしておく */
export const GROUP = {
  static: 0x0001,
  prop: 0x0002,
  avatar: 0x0004,
  cart: 0x0008,
};

/** (自分のグループ, 当たる相手のグループ) を Rapier の形に詰める */
export function groups(member: number, filter: number): number {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

export function createWorld(R: R): World {
  const world = new R.World({ x: 0, y: -PHYSICS.gravity, z: 0 });
  world.timestep = 1 / PHYSICS.hz;
  return world;
}

/** 床と店のデータの当たり判定をすべて1つの固定の剛体に付ける */
export function addStatic(R: R, world: World, layout: StoreLayout): RigidBody {
  const body = world.createRigidBody(R.RigidBodyDesc.fixed());
  const b = layout.bounds;
  const floor = R.ColliderDesc.cuboid((b.x1 - b.x0) / 2 + 6, 0.5, (b.z1 - b.z0) / 2 + 6)
    .setTranslation((b.x0 + b.x1) / 2, -0.5, (b.z0 + b.z1) / 2)
    .setFriction(PHYSICS.floorFriction)
    .setCollisionGroups(groups(GROUP.static, 0xffff));
  world.createCollider(floor, body);
  for (const f of layout.fixtures) {
    for (const c of f.colliders) {
      const desc = R.ColliderDesc.cuboid((c.max.x - c.min.x) / 2, (c.max.y - c.min.y) / 2, (c.max.z - c.min.z) / 2)
        .setTranslation((c.min.x + c.max.x) / 2, (c.min.y + c.max.y) / 2, (c.min.z + c.max.z) / 2)
        .setFriction(0.6)
        .setCollisionGroups(groups(GROUP.static, 0xffff));
      world.createCollider(desc, body);
    }
  }
  return body;
}

export function yawQuat(yaw: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

/** 商品の剛体。原点はモデルの底面の中心（描画と同じ）、当たり判定はその上に半分の高さだけずらして付ける */
export function createPropBody(R: R, world: World, def: PropDef): { body: RigidBody; collider: Collider } {
  const p = def.home.pos;
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(p.x, p.y, p.z)
      .setRotation(yawQuat(def.home.yaw))
      .setLinearDamping(0.05)
      .setAngularDamping(0.4)
      // 最初は眠らせておく（置いた位置で落ち着いているので、触れるまで計算しない）
      .setSleeping(true),
  );
  let desc: RAPIER.ColliderDesc;
  if (def.shape === 'ball') desc = R.ColliderDesc.ball(def.size.x / 2).setTranslation(0, def.size.y / 2, 0);
  else if (def.shape === 'cylinder') desc = R.ColliderDesc.cylinder(def.size.y / 2, def.size.x / 2).setTranslation(0, def.size.y / 2, 0);
  else desc = R.ColliderDesc.cuboid(def.size.x / 2, def.size.y / 2, def.size.z / 2).setTranslation(0, def.size.y / 2, 0);
  desc
    .setMass(def.mass)
    .setFriction(def.kind === 'can' ? PHYSICS.canFriction : PHYSICS.propFriction)
    .setRestitution(PHYSICS.propRestitution)
    .setCollisionGroups(groups(GROUP.prop, 0xffff));
  const collider = world.createCollider(desc, body);
  return { body, collider };
}

/** カートの外形（Mini Market のカートを2.3倍） */
export const CART_SIZE = { x: 0.69, y: 0.9, z: 1.1 };

/** カートは倒れないよう、縦軸のまわりにしか回らない。押されたら少しずつ止まる */
export function createCartBody(R: R, world: World, def: CartDef): { body: RigidBody; collider: Collider } {
  const p = def.home.pos;
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(p.x, p.y, p.z)
      .setRotation(yawQuat(def.home.yaw))
      .enabledRotations(false, true, false)
      .setLinearDamping(1.2)
      .setAngularDamping(4)
      .setSleeping(true),
  );
  const collider = world.createCollider(
    R.ColliderDesc.cuboid(CART_SIZE.x / 2, CART_SIZE.y / 2, CART_SIZE.z / 2)
      .setTranslation(0, CART_SIZE.y / 2 + 0.02, 0)
      .setMass(CART.mass)
      .setFriction(0.3)
      .setRestitution(0.2)
      .setCollisionGroups(groups(GROUP.cart, 0xffff)),
    body,
  );
  return { body, collider };
}
