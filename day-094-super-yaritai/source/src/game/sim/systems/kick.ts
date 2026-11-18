/**
 * 蹴る：近くに何もないときのアクション（どこでも使える）。前方の扇の中の物を蹴り飛ばす。
 * 蹴った商品が床に落ちれば kind='knock'（缶ピラミッドの缶なら pyramid の数え方になる）。
 */
import { KICK } from '../../../shared/rules/tuning';
import type { AvatarState, MisdeedSystem, Offer, SimContext } from '../types';

const DEG = Math.PI / 180;

export const kickSystem: MisdeedSystem = {
  id: 'kick',
  offer(): Offer {
    return { system: kickSystem, priority: 0, prompt: null, target: -1 };
  },
  act(ctx, av) {
    kick(ctx, av);
  },
};

/** 蹴る。当たった物の数を返す（冷めている間は -1） */
export function kick(ctx: SimContext, av: AvatarState): number {
  if (!ctx.cooldownReady(av, 'kick')) return -1;
  ctx.setCooldown(av, 'kick', KICK.cooldown);
  ctx.playAction(av, 'kick');
  const fx = Math.sin(av.yaw);
  const fz = Math.cos(av.yaw);
  const cosHalf = Math.cos(KICK.halfAngle * DEG);
  let hits = 0;
  for (const p of ctx.props) {
    if (p.hidden || p.locked) continue;
    const c = ctx.propCenter(p);
    const dx = c.x - av.pos.x;
    const dz = c.z - av.pos.z;
    const dist = Math.hypot(dx, dz);
    const r = Math.max(p.def.size.x, p.def.size.z) / 2;
    if (dist > KICK.reach + r) continue;
    // 足から胸の高さまで
    if (c.y > av.pos.y + 1.4 || c.y < av.pos.y - 0.4) continue;
    if (dist > 0.15 && (dx * fx + dz * fz) / dist < cosHalf) continue;
    const speed = ctx.fx.range(KICK.forwardSpeed[0], KICK.forwardSpeed[1]);
    const side = dist > 0.15 ? 0.25 : 0;
    const dirx = fx * (1 - side) + (dx / Math.max(dist, 0.001)) * side;
    const dirz = fz * (1 - side) + (dz / Math.max(dist, 0.001)) * side;
    ctx.launch(
      p,
      { x: dirx * speed, y: ctx.fx.range(KICK.upSpeed[0], KICK.upSpeed[1]), z: dirz * speed },
      { x: ctx.fx.range(-KICK.spin, KICK.spin), y: ctx.fx.range(-KICK.spin, KICK.spin), z: ctx.fx.range(-KICK.spin, KICK.spin) },
      av.slot,
    );
    hits++;
  }
  // 誰も乗っていないカートも蹴り出せる
  for (const cart of ctx.carts) {
    if (cart.rider !== null) continue;
    const t = cart.body.translation();
    const dx = t.x - av.pos.x;
    const dz = t.z - av.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > KICK.reach + 0.5 || (dist > 0.2 && (dx * fx + dz * fz) / dist < cosHalf)) continue;
    cart.body.setLinvel({ x: fx * 6, y: 0, z: fz * 6 }, true);
    cart.lastRider = av.slot;
    cart.lastRideT = ctx.time;
    hits++;
  }
  if (hits > 0) ctx.emit({ t: 'sfx', name: 'knock', pos: { x: av.pos.x + fx * 0.8, y: av.pos.y + 0.5, z: av.pos.z + fz * 0.8 } });
  return hits;
}
