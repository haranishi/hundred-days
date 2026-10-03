// OWNER: gameplay
// 攻撃が街へ問い合わせる口（CombatWorld）と、円の当たり（applyRing）。combat.ts・contact.ts・techniques.ts が同じものを使う。
// r03-roster：techniques.ts（雷・溶岩・地割れ）からも使うため combat.ts から分けた。中身は r02-controls のまま（当てる高さ y だけ足した）。
import type { RingSpec, TimeScaleHit } from '../config/attacks';
import type { DamageCause, EventBus } from '../core/events';
import type { CityIndex } from '../world/query';
import type { CityData } from '../world/types';
import type { DamageState } from './damage';
import type { FireState, Ignition } from './fire';
import type { ScoreKeeper } from './score';
import { footprintCenter, footprintDistance } from './shapes';

/** 照準のそばに出す合図の種類：当たった・空振り・怒りが足りない。 */
export type CueKind = 'hit' | 'miss' | 'noRage';

export interface CombatWorld {
  city: CityData;
  index: CityIndex;
  damage: DamageState;
  fire: FireState;
  score: ScoreKeeper;
  bus: EventBus;
  ignitions: Ignition[];
  /** 足もとの地面の高さ（湾の上は浅瀬の底）。溶岩の礫の着地と地割れに使う */
  groundAt(x: number, z: number): number;
  /** 当たった瞬間の手応え（時間の減速・画面の揺れ）を遊びの側へ返す */
  impact(hitStop: TimeScaleHit | null, shake: number): void;
  /** 照準の合図（r02-controls：当たった瞬間に印を光らせ、空振りと怒り不足を知らせる） */
  cue(kind: CueKind): void;
}

/**
 * 円（着地・咆哮・落雷・地割れ・溶岩の着弾）の当たり：半径の中の建物を中心ほど強く壊し、窓を割る。当たった棟数を返す。
 * y を渡すと、その高さに当てる（溶岩の礫が壁の高い所で弾けたとき）。渡さなければ建物の下の方（r02-controls のまま）。
 */
export function applyRing(w: CombatWorld, t: number, cx: number, cz: number, spec: RingSpec, cause: DamageCause, y?: number): number {
  let hits = 0;
  const reach = Math.max(spec.radius, spec.glassRadius);
  for (const b of w.index.buildingsNear(cx, cz, reach).sort((p, q) => p.id - q.id)) {
    if (!w.damage.isStanding(b.id)) continue;
    const d = footprintDistance(b, cx, cz);
    if (d <= spec.glassRadius) {
      const panes = w.damage.breakGlass(b.id, spec.glass * (1 - 0.35 * (d / spec.glassRadius)));
      if (panes > 0) {
        const c = footprintCenter(b);
        w.bus.emit('glass.shatter', { t, id: b.id, pos: [c.x, y === undefined ? b.height * 0.5 : Math.min(b.height, y), c.z], count: panes });
      }
    }
    if (d > spec.radius) continue;
    const k = 1 - (d / spec.radius) ** 2;
    const at = y === undefined ? Math.min(b.height * 0.4, 20) : Math.max(b.masses[0].y0 + 1, Math.min(b.height - 1, y));
    w.damage.hit(b.id, spec.damage * k, { cause, fromX: cx, fromZ: cz, y: at, player: true });
    hits++;
  }
  return hits;
}
