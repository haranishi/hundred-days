// OWNER: gameplay
// 焔角のドミノ（r04-roster2、docs/CHARACTERS.md の壊し方の芯「押し倒したビルが隣を巻き込んで倒れる」）。純データ・three を読まない。
// 起点：焔角の突進（charge）・のしかかり（slam）・地割れ（fissure）で、傾き・崩落の段階に入ったビル。
// そのビルが倒れる向き（damage.dirX/dirZ）の先で、自分の幅の帯に入るいちばん手前のビルへ、delay 秒後に損傷を渡す。
// 渡されたビルが memberSeconds のうちに傾き・崩落に入ると、同じ向きでさらに隣へ渡す。1回の起点から maxChain 棟まで、
// 渡すたびに falloff 倍に弱くする。背の低いビルは遠くまで届かず、自分より高いビルには高さの比でしか効かない。
// ほかの怪獣の設定は null なので何も起きない（紅竜と雷翼の数字は変わらない）。どのビルも隣へ渡すのは1回だけ。
// 予約は（時刻, 積んだ順）で並べ、候補は id の順に比べるので、自動プレイの1倍と4倍で同じ結果になる。
import type { DominoSpec } from '../config/creatures/types';
import type { DamageCause } from '../core/events';
import type { Building } from '../world/types';
import { STAGE, type DamageState, type StageChange } from './damage';

/** 候補のビルを引く口（CityIndex がこの形を持つ。テストは素の配列で作る）。 */
export interface BuildingQuery {
  buildingsNear(x: number, z: number, radius: number): Building[];
}

/** ドミノの数え（__state.creature.stats に出る。やり直しで 0 に戻る）。 */
export interface DominoStats {
  /** 起点の数（原因の限定を通って、隣へ渡す予約を積んだビル） */
  dominoOrigins: number;
  /** 隣へ損傷を渡した回数 */
  dominoPasses: number;
  /** 渡された損傷で傾き・崩落の段階に入った棟数 */
  dominoTilts: number;
  dominoCollapses: number;
  /** 1回の起点からの最大の連なり（傾き・崩落に入った巻き込みの段数。1〜maxChain） */
  dominoMaxChain: number;
}

export const emptyDominoStats = (): DominoStats => ({ dominoOrigins: 0, dominoPasses: 0, dominoTilts: 0, dominoCollapses: 0, dominoMaxChain: 0 });

/** k 棟目（1 から）に渡す強さ（受けるビルの耐久に対する割合、高さの比を掛ける前）。 */
export function passStrength(spec: DominoSpec, k: number): number {
  return spec.strength * Math.pow(spec.falloff, k - 1);
}

/** 高さ height の建物が倒れて届く隙間（m）。 */
export function dominoReach(spec: DominoSpec, height: number): number {
  return Math.min(spec.maxReach, height * spec.reachPerHeight);
}

/** 外形（軸にそろった矩形）を向き (ux, uz) に写した区間。 */
function project(b: Building, ux: number, uz: number): [number, number] {
  const f = b.footprint;
  const c = ((f.x0 + f.x1) / 2) * ux + ((f.z0 + f.z1) / 2) * uz;
  const h = (Math.abs(ux) * (f.x1 - f.x0)) / 2 + (Math.abs(uz) * (f.z1 - f.z0)) / 2;
  return [c - h, c + h];
}

/**
 * 倒れるビル src が向き (dx, dz) へ倒れたとき巻き込む隣：倒れる向きに直交する src の幅の帯と minOverlap 以上重なり、
 * src の前の面から reach 以内に手前の面があり、src より先にあるビルのうち、いちばん手前のもの
 * （同じ近さなら帯と重なる幅の広い方、さらに id の小さい方）。skip(b) が true のビルは数えない。
 */
export function dominoTarget(src: Building, dx: number, dz: number, candidates: readonly Building[], reach: number, minOverlap: number, skip: (b: Building) => boolean): Building | null {
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) return null;
  const ux = dx / l;
  const uz = dz / l;
  // 帯の向き（倒れる向きに直交）
  const vx = -uz;
  const vz = ux;
  const [sF0, sF1] = project(src, ux, uz);
  const [sL0, sL1] = project(src, vx, vz);
  const sMid = (sF0 + sF1) / 2;
  let best: Building | null = null;
  let bestGap = Infinity;
  let bestOverlap = -Infinity;
  for (const b of candidates) {
    if (b.id === src.id || skip(b)) continue;
    const [bF0, bF1] = project(b, ux, uz);
    const [bL0, bL1] = project(b, vx, vz);
    const overlap = Math.min(sL1, bL1) - Math.max(sL0, bL0);
    if (overlap < minOverlap) continue;
    // 先にある：中心が src の中心より先で、先の面が src の前の面より先
    if ((bF0 + bF1) / 2 <= sMid || bF1 <= sF1) continue;
    const gap = Math.max(0, bF0 - sF1);
    if (gap > reach) continue;
    const closer = gap < bestGap - 1e-9;
    const tie = Math.abs(gap - bestGap) <= 1e-9;
    if (closer || (tie && (overlap > bestOverlap + 1e-9 || (Math.abs(overlap - bestOverlap) <= 1e-9 && best !== null && b.id < best.id)))) {
      best = b;
      bestGap = gap;
      bestOverlap = overlap;
    }
  }
  return best;
}

interface Pass {
  at: number;
  seq: number;
  /** 倒れて渡す側のビル */
  from: number;
  /** 渡される側が連なりの何棟目か（1 から） */
  depth: number;
  chain: number;
  cause: DamageCause;
}

interface Member {
  chain: number;
  depth: number;
  cause: DamageCause;
  at: number;
}

export class Domino {
  stats: DominoStats = emptyDominoStats();
  private pending: Pass[] = [];
  private seq = 0;
  private nextChain = 0;
  private readonly members = new Map<number, Member>();
  /** 隣へ渡す予約を積んだビル（どのビルも1回だけ） */
  private readonly passed = new Set<number>();
  /** 連なりごとに巻き込んだビル（同じ連なりの中で行き来しない） */
  private readonly chains = new Map<number, number[]>();

  constructor(public spec: DominoSpec | null) {}

  reset(): void {
    this.stats = emptyDominoStats();
    this.pending = [];
    this.seq = 0;
    this.nextChain = 0;
    this.members.clear();
    this.passed.clear();
    this.chains.clear();
  }

  /** 予約して、まだ渡していないものがあるか。 */
  get busy(): boolean {
    return this.pending.length > 0;
  }

  /** 段階が進んだビルを見て、起点か連なりの続きなら、隣へ渡す予約を積む（damage.update の直後、出来事にする前に呼ぶ）。 */
  onChanges(t: number, changes: readonly StageChange[]): void {
    const spec = this.spec;
    if (!spec) return;
    for (const ch of changes) {
      if (ch.stage !== STAGE.tilt && ch.stage !== STAGE.collapse) continue;
      const m = this.members.get(ch.id);
      const member = m && ch.player && ch.cause === m.cause && t - m.at <= spec.memberSeconds ? m : null;
      if (member) {
        if (ch.stage === STAGE.tilt) this.stats.dominoTilts++;
        else this.stats.dominoCollapses++;
        this.stats.dominoMaxChain = Math.max(this.stats.dominoMaxChain, member.depth);
      }
      if (this.passed.has(ch.id)) continue;
      if (member) {
        if (member.depth >= spec.maxChain) continue;
        this.schedule(t, ch.id, member.depth + 1, member.chain, member.cause);
      } else if (ch.player && spec.causes.includes(ch.cause) && !this.members.has(ch.id)) {
        const chain = this.nextChain++;
        this.chains.set(chain, [ch.id]);
        this.stats.dominoOrigins++;
        this.schedule(t, ch.id, 1, chain, ch.cause);
      }
    }
  }

  /** 時刻 t までの予約を順に渡す（damage.update の前に呼ぶ。渡した損傷はその刻みの damage.update で段階が進む）。 */
  update(t: number, damage: DamageState, query: BuildingQuery): void {
    while (this.pending.length > 0 && this.pending[0].at <= t + 1e-9) {
      this.pass(t, this.pending.shift() as Pass, damage, query);
    }
  }

  private schedule(t: number, from: number, depth: number, chain: number, cause: DamageCause): void {
    const spec = this.spec as DominoSpec;
    this.passed.add(from);
    const p: Pass = { at: t + spec.delay, seq: this.seq++, from, depth, chain, cause };
    let i = this.pending.length;
    while (i > 0 && this.pending[i - 1].at > p.at) i--;
    this.pending.splice(i, 0, p);
  }

  private pass(t: number, p: Pass, damage: DamageState, query: BuildingQuery): void {
    const spec = this.spec as DominoSpec;
    const src = damage.building(p.from);
    const dx = damage.dirX[p.from];
    const dz = damage.dirZ[p.from];
    const reach = dominoReach(spec, src.height);
    const f = src.footprint;
    const cx = (f.x0 + f.x1) / 2;
    const cz = (f.z0 + f.z1) / 2;
    const radius = Math.hypot(f.x1 - f.x0, f.z1 - f.z0) / 2 + reach + 40;
    const chain = this.chains.get(p.chain) as number[];
    const candidates = query.buildingsNear(cx, cz, radius).sort((a, b) => a.id - b.id);
    const target = dominoTarget(src, dx, dz, candidates, reach, spec.minOverlap, (b) => !damage.isStanding(b.id) || chain.includes(b.id));
    if (!target) return;
    const k = passStrength(spec, p.depth) * Math.min(1, src.height / target.height);
    const tf = target.footprint;
    const tx = (tf.x0 + tf.x1) / 2;
    const tz = (tf.z0 + tf.z1) / 2;
    // 倒れる向きはそのまま受け継ぐ（打った側の位置を、受けるビルの中心から倒れる向きの逆へ置く）。当たる高さは低い方の7割
    const y = Math.min(target.height - 1, Math.max(target.masses[0].y0 + 1, 0.7 * Math.min(src.height, target.height)));
    damage.hit(target.id, damage.hp[target.id] * k, { cause: p.cause, fromX: tx - dx * 10, fromZ: tz - dz * 10, y, player: true });
    chain.push(target.id);
    if (!this.members.has(target.id) && !this.passed.has(target.id)) this.members.set(target.id, { chain: p.chain, depth: p.depth, cause: p.cause, at: t });
    this.stats.dominoPasses++;
  }
}
