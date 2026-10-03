// OWNER: gameplay
// 体と建物の当たり：低い建物は踏みつぶして通り抜け、高い建物には押し返される。壁抜けを防ぐのが主目的。
// r02-controls（バグ B1「空中でビルに当たると止まり、W を押しても6.5秒抜けられない」）で、止める作りをやめた：
// - 押し返しても速さは抑えない。触れている壁の向き（body.wall）を体へ渡し、壁へ向かう入力を壁に沿う向きへ直して滑らせる
// - 速く深い角度で当たったら、その建物を傾きの段階まで壊す（体当たり）。浅い角度なら速さを7割ほど残して滑る
// - 急降下で屋上から建物に突っ込んだら、その建物を押しつぶす（崩れるまで壊し、押し返さずに下まで通す）
// r03-roster：体の半径と高さは怪獣ごと（body.shape）。焔角の突進（body.charging）は、ふつうの体当たりより遅く浅い当たりでも
// 建物を傾きまで押し倒して速さを残す（charge.shove を出す）。跳んで屋上に落ちたとき（のしかかり）も押しつぶす。
// 体当たりの速さ（body.shape.smashSpeed）も怪獣ごと。どの怪獣でも、壁に押し付けられて0.3秒動けなければ（建物の隅に挟まったときなど）、
// 押している建物を傾きまで壊して通り抜ける（r02-controls の「0.5秒以上張り付かない」を、走りの遅い雷翼でも守るため）。
// r05-play：前の刻みからあった重なり（滑空で屋上の高さを下回った瞬間など）は1刻みで押し出さず、数コマに分ける（空中で塔をかすめると横へ跳んだ）。
import { BODY_CONTACT as B } from '../config/attacks';
import type { CreatureName } from '../core/events';
import { STAGES } from '../config/gameplay';
import type { Building } from '../world/types';
import type { CombatWorld } from './ring';
import type { DragonBody } from './locomotion';
import { forwardOf } from './math';
import { footprintCenter, footprintDistance } from './shapes';

/** 体当たりの手応え */
const SMASH_HIT = { scale: 0.2, seconds: 0.08 };
const SMASH_SHAKE = 0.55;
/** 壁に押し付けられて動けない（進むはずの距離の STUCK_RATIO 未満しか動かない）のが STUCK_SECONDS 続いたら、押している建物を壊して通り抜ける */
const STUCK_SECONDS = 0.3;
const STUCK_RATIO = 0.25;

export class BodyContact {
  private readonly lastTouch: Float64Array;
  /** 最後に触れていたゲーム内時刻（新しく当たったかの判定） */
  private readonly lastContact: Float64Array;
  /** 押しつぶしている建物（体が重なってよい）。体が外形から離れたら外す */
  private readonly crushing = new Set<number>();
  private prevFeetY = Number.POSITIVE_INFINITY;
  /** 突進で傾きまで押し倒した棟数（受け入れ条件4の数字。やり直しで 0） */
  chargeTilts = 0;
  /** 出来事に載せる怪獣の名前 */
  creature: CreatureName = 'kurenai';
  /** 壁に押し付けられて動けない秒数と、前の刻みの位置と時刻 */
  private stuckFor = 0;
  private lastX = Number.NaN;
  private lastZ = 0;
  private lastT = 0;

  constructor(count: number) {
    this.lastTouch = new Float64Array(count).fill(-1e9);
    this.lastContact = new Float64Array(count).fill(-1e9);
  }

  reset(): void {
    this.lastTouch.fill(-1e9);
    this.lastContact.fill(-1e9);
    this.crushing.clear();
    this.prevFeetY = Number.POSITIVE_INFINITY;
    this.chargeTilts = 0;
    this.stuckFor = 0;
    this.lastX = Number.NaN;
  }

  update(t: number, body: DragonBody, w: CombatWorld): void {
    const R = body.shape.radius;
    const feetY = body.pos.y - body.bodyHeight;
    for (const id of [...this.crushing]) {
      if (!w.damage.isStanding(id) || footprintDistance(w.city.buildings[id], body.pos.x, body.pos.z) > R) this.crushing.delete(id);
    }
    const near = w.index.buildingsNear(body.pos.x, body.pos.z, R + 1).sort((a, b) => a.id - b.id);
    let pressed: Building | null = null;
    let pressedInto = 0.3;
    for (const b of near) {
      if (!w.damage.isStanding(b.id) || b.height <= feetY + 0.5) continue;
      const d = footprintDistance(b, body.pos.x, body.pos.z);
      if (d > R) continue;
      const cooled = t - this.lastTouch[b.id] >= B.bumpCooldown;
      if (b.height < B.trampleHeight) {
        if (cooled) {
          this.lastTouch[b.id] = t;
          w.damage.hit(b.id, B.trampleDamage, { cause: 'trample', fromX: body.pos.x, fromZ: body.pos.z, y: b.height * 0.5, player: true });
        }
        continue;
      }
      if (this.crushing.has(b.id)) continue;
      const falling = body.mode === 'dive' || (body.mode === 'jump' && body.vel.y < 0);
      if (falling && d < 1e-3 && this.prevFeetY >= b.height - 0.5) {
        // 屋上から突っ込んだ：押しつぶす（押し返さない。着地の地響きが続けて壊す）
        this.crushing.add(b.id);
        this.lastTouch[b.id] = t;
        this.breakTo(t, w, b, body, 1.02, body.mode === 'jump' ? 'slam' : 'bump');
        w.impact(SMASH_HIT, SMASH_SHAKE);
        w.cue('hit');
        continue;
      }
      const into = this.resolve(t, b, d, cooled, body, w);
      if (into > pressedInto) {
        pressed = b;
        pressedInto = into;
      }
    }
    this.prevFeetY = feetY;
    this.checkStuck(t, pressed, body, w);
  }

  /** 壁に押し付けられて動けない時間を数え、STUCK_SECONDS を超えたら押している建物を傾きまで壊して通り抜ける。 */
  private checkStuck(t: number, pressed: Building | null, body: DragonBody, w: CombatWorld): void {
    const dt = t - this.lastT;
    const moved = Number.isNaN(this.lastX) ? Infinity : Math.hypot(body.pos.x - this.lastX, body.pos.z - this.lastZ);
    this.lastX = body.pos.x;
    this.lastZ = body.pos.z;
    this.lastT = t;
    if (!pressed || dt <= 0 || body.speed < 4 || moved >= STUCK_RATIO * body.speed * dt) {
      this.stuckFor = 0;
      return;
    }
    this.stuckFor += dt;
    if (this.stuckFor < STUCK_SECONDS) return;
    this.stuckFor = 0;
    this.lastTouch[pressed.id] = t;
    this.breakTo(t, w, pressed, body, STAGES.thresholds[2] + 0.03, body.motion.charge ? 'charge' : 'bump');
    this.crushing.add(pressed.id);
    w.impact(SMASH_HIT, SMASH_SHAKE);
    w.cue('hit');
  }

  /** 高い建物に触れた：外へ押し出し、壁の向きを体へ渡し、新しく当たった瞬間だけ体当たり・減速を決める。戻り値は壁への深さ（向きと法線の内積）。 */
  private resolve(t: number, b: Building, d: number, cooled: boolean, body: DragonBody, w: CombatWorld): number {
    const R = body.shape.radius;
    const f = b.footprint;
    let nx: number;
    let nz: number;
    let push: number;
    if (d > 1e-3) {
      const cx = Math.max(f.x0, Math.min(body.pos.x, f.x1));
      const cz = Math.max(f.z0, Math.min(body.pos.z, f.z1));
      nx = (body.pos.x - cx) / d;
      nz = (body.pos.z - cz) / d;
      push = R - d;
    } else {
      // 外形の中に入り込んだ：いちばん近い辺から外へ出す
      const exits: [number, number, number][] = [
        [body.pos.x - f.x0, -1, 0],
        [f.x1 - body.pos.x, 1, 0],
        [body.pos.z - f.z0, 0, -1],
        [f.z1 - body.pos.z, 0, 1],
      ];
      exits.sort((a, c) => a[0] - c[0]);
      [push, nx, nz] = exits[0];
      push += R;
    }
    // r05-play（B3）：この刻みに壁へ向かって動いた分（movedIn）はすぐ戻し、それより前からの重なり（滑空で屋上の高さを下回った瞬間など）は
    // 数コマかけて押し出す（config/attacks.ts の BODY_CONTACT.easeSpeed・easeSeconds）。前の刻みの位置が無いとき（やり直しの直後）は今までどおり一度に
    const step = t > this.lastT && !Number.isNaN(this.lastX) ? Math.min(t - this.lastT, 0.1) : 1 / 60;
    const movedIn = Number.isNaN(this.lastX) ? push : Math.max(0, -((body.pos.x - this.lastX) * nx + (body.pos.z - this.lastZ) * nz));
    const ease = Math.max(B.easeSpeed, push / B.easeSeconds) * step;
    const out = Math.min(push, movedIn + ease);
    body.pos.x += nx * out;
    body.pos.z += nz * out;
    const fresh = t - this.lastContact[b.id] > B.wallMemory;
    this.lastContact[b.id] = t;
    const fwd = forwardOf(body.yaw);
    const into = -(fwd.x * nx + fwd.z * nz);
    if (fresh) body.wall.side = this.sideAround(b, body, nx, nz, fwd);
    body.wall.nx = nx;
    body.wall.nz = nz;
    body.wall.ttl = B.wallMemory;
    if (into <= 0.05) return into;
    const v = body.speed;
    const impactSpeed = v * into;
    const charge = body.motion.charge;
    if (fresh && charge && body.charging && into >= charge.minInto) {
      // 突進：傾きの段階まで押し倒し、速さを多めに残して壁に沿って進む（まだ傾いていない建物だけを数える）
      this.lastTouch[b.id] = t;
      const before = w.damage.stage[b.id];
      this.breakTo(t, w, b, body, STAGES.thresholds[2] + 0.03, 'charge');
      body.speed = v * charge.keep;
      if (before < 3) {
        this.chargeTilts++;
        const c = footprintCenter(b);
        w.bus.emit('charge.shove', { t, creature: this.creature, id: b.id, pos: [c.x, Math.min(b.height * 0.5, body.pos.y), c.z] });
      }
      w.impact(SMASH_HIT, SMASH_SHAKE);
      w.cue('hit');
      return into;
    }
    if (fresh && v >= body.shape.smashSpeed && into >= B.smashMinInto) {
      // 体当たり：傾きの段階まで壊し、速さを少し残して壁に沿って抜ける
      this.lastTouch[b.id] = t;
      this.breakTo(t, w, b, body, STAGES.thresholds[2] + 0.03);
      body.speed = v * B.smashKeep;
      w.impact(SMASH_HIT, SMASH_SHAKE);
      w.cue('hit');
      return into;
    }
    if (fresh) body.speed = v * (into >= B.smashMinInto ? B.pushKeep : 1 - (1 - B.slideKeep) * (into / B.smashMinInto));
    if (cooled && impactSpeed > 3) {
      this.lastTouch[b.id] = t;
      w.damage.hit(b.id, impactSpeed * B.bumpPerSpeed, { cause: 'bump', fromX: body.pos.x, fromZ: body.pos.z, y: Math.min(b.height - 1, body.pos.y), player: true });
      w.impact(null, Math.min(0.35, impactSpeed * 0.015));
    }
    return into;
  }

  /**
   * 正面から当たったときに回り込む側（±1、壁に沿う向き side × (-nz, nx)）。
   * 体の向きに壁に沿う成分があればその側、無ければ建物の角が近い側（短い方から回る）。
   */
  private sideAround(b: Building, body: DragonBody, nx: number, nz: number, fwd: { x: number; z: number }): number {
    const tx = -nz;
    const tz = nx;
    const along = fwd.x * tx + fwd.z * tz;
    if (Math.abs(along) > 0.08) return along > 0 ? 1 : -1;
    const c = footprintCenter(b);
    const f = b.footprint;
    const half = (Math.abs(tx) * (f.x1 - f.x0) + Math.abs(tz) * (f.z1 - f.z0)) / 2;
    const offset = (body.pos.x - c.x) * tx + (body.pos.z - c.z) * tz;
    if (Math.abs(offset) < 1e-6 || half <= 0) return 1;
    return offset > 0 ? 1 : -1;
  }

  /** 建物の損傷を、耐久の fraction 倍まで一度に進める（すでに超えていれば何もしない）。窓もまとめて割る。 */
  private breakTo(t: number, w: CombatWorld, b: Building, body: DragonBody, fraction: number, cause: 'bump' | 'charge' | 'slam' = 'bump'): void {
    const need = w.damage.hp[b.id] * fraction - w.damage.damage[b.id];
    const y = Math.max(b.masses[0].y0 + 1, Math.min(b.height - 1, body.pos.y));
    if (need > 0) w.damage.hit(b.id, need, { cause, fromX: body.pos.x, fromZ: body.pos.z, y, player: true });
    const panes = w.damage.breakGlass(b.id, Math.min(1, w.damage.glass[b.id] + 0.5));
    if (panes > 0) {
      const c = footprintCenter(b);
      w.bus.emit('glass.shatter', { t, id: b.id, pos: [c.x, y, c.z], count: panes });
    }
  }
}
