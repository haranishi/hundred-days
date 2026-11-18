/**
 * 店員・店長・客を作る（docs/03・docs/04「人物の役」）。Simulation が full のときに呼ぶ。
 * 店員 Mini Market の character-employee ×2、店長はスーツの male-d（残り60秒から）、客は female-c・male-b・female-d。
 * 乱数は機能ごとの系列（clerks・shoppers）。
 */
import { streamRng } from '../../../shared/rng';
import type { NpcAgent, SimContext } from '../types';
import { Clerk } from './clerk';
import { Shopper } from './shopper';

export const CLERK_MODEL = 'mm/character-employee';
export const MANAGER_MODEL = 'ch/character-male-d';
export const SHOPPER_MODELS = ['ch/character-female-c', 'ch/character-male-b', 'ch/character-female-d'] as const;

export function createNpcs(ctx: SimContext): NpcAgent[] {
  const routes = ctx.layout.patrols;
  const out: NpcAgent[] = [];
  out.push(new Clerk(ctx, 0, 'clerk', CLERK_MODEL, routes[0]!, ctx.layout.places.staffDoor));
  out.push(new Clerk(ctx, 1, 'clerk', CLERK_MODEL, routes[1]!, routes[1]![0]!));
  out.push(new Clerk(ctx, 2, 'manager', MANAGER_MODEL, routes[2]!, ctx.layout.places.staffDoor));
  const points = ctx.layout.wanderPoints;
  SHOPPER_MODELS.forEach((model, i) => {
    const start = points[(i * 3) % points.length]!;
    out.push(new Shopper(ctx, 3 + i, model, points, streamRng(ctx.statics.seed + i * 977, 'shoppers'), start));
  });
  return out;
}
