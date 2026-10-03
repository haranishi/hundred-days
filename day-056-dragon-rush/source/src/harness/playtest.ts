// OWNER: harness
// 自動プレイ（?playtest=basic）と台本の再生（?playtest=script）。人と同じ InputState を通して操作するので、
// 操作の割り当て・視点・攻撃の出し方をまとめて確かめられる。時間はシミュレーションの刻みで数えるので、描画の速さに関係なく決定的。
// basic の流れ：着地 → 最寄りのビルへ歩く → 炎3秒 → 爪2回 → 背を向けて尾 →（怒りが満タンなら咆哮）→ 飛び上がって別のビルへ → 急降下 → 繰り返す。
// r03-roster：技は怪獣ごとの中身で出る（雷翼は雷の息・翼・尾の鞭・落雷、キーは同じ）。飛べない焔角は、歩いて近づく → 溶岩の礫3秒 →
// 突進でぶつかって押し倒す → 角2回 → 尾の鎚 →（満タンなら的へ向き直って地割れ）→ 跳んで別のビルへのしかかる → 繰り返す。
// やり直し（時刻が戻った）を見たら最初から。
import { LOOK } from '../config/controls';
import { wrapAngle } from '../core/springs';
import { STAGE } from '../gameplay/damage';
import type { Game } from '../gameplay/game';
import { DEG, clamp } from '../gameplay/math';
import { footprintCenter, footprintDistance } from '../gameplay/shapes';
import type { Building } from '../world/types';
import { pressInput, releaseInput, type InputSink } from './keys';

export interface Playtest {
  readonly label: string;
  /** 毎刻み、操作を読む前に呼ぶ。 */
  update(dt: number, game: Game, sink: InputSink): void;
  /** いま何をしているか（状態のログ用） */
  readonly doing: string;
}

type BotStep = 'land' | 'approach' | 'breath' | 'claw' | 'turn' | 'tail' | 'roar' | 'takeoff' | 'fly' | 'dive' | 'hop' | 'charge';

const TURN_RATE = 200 * DEG;

export class BasicPlaytest implements Playtest {
  readonly label = 'basic';
  private step: BotStep = 'land';
  private t = 0;
  private target: Building | null = null;
  private readonly visited = new Set<number>();
  private readonly held = new Set<string | number>();
  /** 近づけているか（行く手を別のビルに塞がれたら、そのビルを壊しに行く） */
  private bestDistance = Infinity;
  private stuckFor = 0;
  private lastClock = 0;

  get doing(): string {
    return this.target ? `${this.step}#${this.target.id}` : this.step;
  }

  update(dt: number, game: Game, sink: InputSink): void {
    if (game.session.phase !== 'playing') {
      this.releaseAll(sink);
      return;
    }
    // やり直し（別の怪獣でのやり直しも）：最初の段から
    if (game.clock + 1e-9 < this.lastClock) {
      this.go('land', sink);
      this.target = null;
      this.visited.clear();
    }
    this.lastClock = game.clock;
    this.t += dt;
    if (!game.creature.motion.canFly) return this.updateGrounded(dt, game, sink);
    const body = game.body;
    switch (this.step) {
      case 'land':
        this.hold(sink, 'shift', true);
        this.look(game, sink, game.view.yaw, -20 * DEG, dt);
        if (body.grounded) this.go('approach', sink);
        break;
      case 'approach': {
        if (!this.target || !game.damage.isStanding(this.target.id)) this.target = this.pick(game, 0, 420);
        if (!this.target) return this.go('takeoff', sink);
        const d = footprintDistance(this.target, body.pos.x, body.pos.z);
        this.faceTarget(game, sink, dt, -8 * DEG);
        this.hold(sink, 'w', d > 24);
        this.hold(sink, 'shift', d > 90);
        if (d < this.bestDistance - 1) {
          this.bestDistance = d;
          this.stuckFor = 0;
        } else {
          this.stuckFor += dt;
        }
        if (this.stuckFor > 1.2) this.target = this.blocker(game) ?? this.target;
        if (d <= 24 || this.stuckFor > 1.2 || this.t > 9) this.go('breath', sink);
        break;
      }
      case 'breath': {
        if (!this.target) return this.go('takeoff', sink);
        const d = footprintDistance(this.target, body.pos.x, body.pos.z);
        const h = Math.min(this.target.height * 0.45, 28);
        const pitch = Math.atan2(h - (body.pos.y + 13), d + 70);
        this.faceTarget(game, sink, dt, pitch);
        this.hold(sink, 'left', this.t < 3.0);
        if (this.t >= 3.1) this.go('claw', sink);
        break;
      }
      case 'claw':
        this.faceTarget(game, sink, dt, -8 * DEG);
        this.hold(sink, 'right', (this.t > 0 && this.t < 0.06) || (this.t > 0.8 && this.t < 0.86));
        if (this.t >= 1.6) this.go('turn', sink);
        break;
      case 'turn':
        // 視点はビルに向けたまま後ろへ歩くと、竜は向きを変えて背（尾）をビルへ向ける
        this.faceTarget(game, sink, dt, -8 * DEG);
        this.hold(sink, 's', this.t < 1.7);
        if (this.t >= 1.8) this.go('tail', sink);
        break;
      case 'tail':
        this.hold(sink, 'q', this.t < 0.06);
        if (this.t >= 1.1) this.go(game.score.rageFull ? 'roar' : 'takeoff', sink);
        break;
      case 'roar':
        this.hold(sink, 'e', this.t < 0.06);
        if (this.t >= 1.6) this.go('takeoff', sink);
        break;
      case 'takeoff': {
        if (this.t < dt * 1.5) {
          if (this.target) this.visited.add(this.target.id);
          this.target = this.pick(game, 70, 460);
        }
        // 離陸して押し続け、そのあと数回羽ばたいて高さを稼ぐ
        const taps = [0, 1.5, 2.0, 2.5, 3.0];
        const holding = this.t < 1.4 || taps.some((s) => this.t >= s && this.t < s + 0.35);
        this.hold(sink, 'space', holding);
        this.hold(sink, 'w', this.t > 0.6);
        if (this.target) this.faceTarget(game, sink, dt, -14 * DEG);
        if (body.altitude > 48 || this.t > 4.2) this.go('fly', sink);
        break;
      }
      case 'fly': {
        if (!this.target || !game.damage.isStanding(this.target.id)) this.target = this.pick(game, 40, 460);
        this.hold(sink, 'w', true);
        this.hold(sink, 'space', body.altitude < 60);
        if (this.target) this.faceTarget(game, sink, dt, -18 * DEG);
        const c = this.target ? footprintCenter(this.target) : { x: body.pos.x, z: body.pos.z };
        const dh = Math.hypot(c.x - body.pos.x, c.z - body.pos.z);
        if (dh <= 20 + body.altitude * 0.75 || this.t > 8) {
          if (game.score.rageFull) {
            this.hold(sink, 'e', true);
            this.hold(sink, 'e', false);
          }
          this.go('dive', sink);
        }
        break;
      }
      case 'dive':
        this.hold(sink, 'shift', true);
        if (body.grounded) this.go('approach', sink);
        else if (this.t > 6) this.go('approach', sink);
        break;
    }
  }

  /**
   * 飛べない怪獣（焔角）の流れ：歩いて的へ（70m まで）→ 溶岩の礫3秒 → 突進でぶつかって押し倒す → 角2回 → 背を向けて尾の鎚 →
   *（満タンなら的へ向き直って地割れ）→ 跳んで次の的へのしかかる → 繰り返す。
   */
  private updateGrounded(dt: number, game: Game, sink: InputSink): void {
    const body = game.body;
    switch (this.step) {
      case 'land':
      case 'takeoff':
      case 'fly':
      case 'dive':
        this.go('approach', sink);
        break;
      case 'approach': {
        // 礫が放物線を描くよう、口（体の中心の21m 前）より先にある的を選ぶ
        if (!this.target || !game.damage.isStanding(this.target.id)) this.target = this.pick(game, 35, 420);
        if (!this.target) return this.go('hop', sink);
        const d = footprintDistance(this.target, body.pos.x, body.pos.z);
        this.faceTarget(game, sink, dt, -8 * DEG);
        // 溶岩の礫が放物線で届く所（70m）まで歩いて寄る。遠ければ突進で寄る
        this.hold(sink, 'w', d > 70);
        this.hold(sink, 'shift', d > 160);
        if (d < this.bestDistance - 1) {
          this.bestDistance = d;
          this.stuckFor = 0;
        } else {
          this.stuckFor += dt;
        }
        if (this.stuckFor > 1.2) this.target = this.blocker(game) ?? this.target;
        if (d <= 70 || this.stuckFor > 1.2 || this.t > 9) this.go('breath', sink);
        break;
      }
      case 'breath': {
        // 的が礫で崩れたら、次の的へ突進する
        if (!this.target || !game.damage.isStanding(this.target.id)) return this.go('charge', sink);
        const d = footprintDistance(this.target, body.pos.x, body.pos.z);
        const h = Math.min(this.target.height * 0.45, 28);
        this.faceTarget(game, sink, dt, Math.atan2(h - (body.pos.y + 13), d + 70));
        this.hold(sink, 'left', this.t < 3.0);
        if (this.t >= 3.1) this.go('charge', sink);
        break;
      }
      case 'charge': {
        // 突進（Shift＋W）でぶつかるまで走り、当たったビルを押し倒す（体の半径が11m なので、外形まで12m で当たる）
        if (!this.target || !game.damage.isStanding(this.target.id)) this.target = this.pick(game, 0, 200) ?? this.target;
        if (!this.target) return this.go('hop', sink);
        const d = footprintDistance(this.target, body.pos.x, body.pos.z);
        this.faceTarget(game, sink, dt, -8 * DEG);
        this.hold(sink, 'w', d > 12);
        this.hold(sink, 'shift', d > 12);
        if (d <= 12.5 || this.t > 5) this.go('claw', sink);
        break;
      }
      case 'claw':
        this.faceTarget(game, sink, dt, -8 * DEG);
        this.hold(sink, 'right', (this.t > 0 && this.t < 0.06) || (this.t > 0.9 && this.t < 0.96));
        if (this.t >= 1.8) this.go('turn', sink);
        break;
      case 'turn':
        this.faceTarget(game, sink, dt, -8 * DEG);
        this.hold(sink, 's', this.t < 1.5);
        if (this.t >= 1.6) this.go('tail', sink);
        break;
      case 'tail':
        this.hold(sink, 'q', this.t < 0.06);
        if (this.t >= 1.3) this.go(game.score.rageFull ? 'roar' : 'hop', sink);
        break;
      case 'roar':
        // 地割れは体の前へ走るので、まず的へ向き直る（W で照準の向きへ歩き出す）
        if (this.target && game.damage.isStanding(this.target.id)) this.faceTarget(game, sink, dt, -8 * DEG);
        this.hold(sink, 'w', this.t < 0.8);
        this.hold(sink, 'e', this.t >= 0.85 && this.t < 0.91);
        if (this.t >= 2.6) this.go('hop', sink);
        break;
      case 'hop': {
        if (this.t < dt * 1.5) {
          if (this.target) this.visited.add(this.target.id);
          this.target = this.pick(game, 40, 300);
        }
        if (this.target) this.faceTarget(game, sink, dt, -10 * DEG);
        this.hold(sink, 'w', true);
        this.hold(sink, 'space', this.t > 0.35 && this.t < 0.41);
        if ((this.t > 0.6 && body.grounded && body.jump.phase === 'none') || this.t > 4) this.go('approach', sink);
        break;
      }
    }
  }

  private go(step: BotStep, sink: InputSink): void {
    this.releaseAll(sink);
    this.step = step;
    this.t = 0;
    this.bestDistance = Infinity;
    this.stuckFor = 0;
  }

  /** 行く手を塞いでいる（いちばん近い、立っている）ビル。 */
  private blocker(game: Game): Building | null {
    const p = game.body.pos;
    let best: Building | null = null;
    let bestD = 30;
    for (const b of game.index.buildingsNear(p.x, p.z, 30)) {
      if (!game.damage.isStanding(b.id)) continue;
      const d = footprintDistance(b, p.x, p.z);
      if (d < bestD || (d === bestD && best && b.id < best.id)) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * 竜から最も近い、まだ訪ねていない、立っているビル。まず中くらいのビル（高さ16m以上・耐久500以下）から探し、
   * 無ければ高層も、それも無ければ8m以上の建物から選ぶ（最初の崩落を早く見せるため）。
   */
  private pick(game: Game, minDist: number, maxDist: number): Building | null {
    const p = game.body.pos;
    const tiers: [number, number][] = [
      [16, 500],
      [16, Infinity],
      [8, Infinity],
    ];
    for (const [minHeight, maxHp] of tiers) {
      let best: Building | null = null;
      let bestD = Infinity;
      for (const b of game.city.buildings) {
        if (b.height < minHeight || game.damage.hp[b.id] > maxHp || this.visited.has(b.id)) continue;
        if (game.damage.stage[b.id] > STAGE.peel) continue;
        const d = footprintDistance(b, p.x, p.z);
        if (d < minDist || d > maxDist || d >= bestD) continue;
        const c = footprintCenter(b);
        if (game.index.surfaceAt(c.x, c.z) === 'water') continue;
        best = b;
        bestD = d;
      }
      if (best) return best;
    }
    return null;
  }

  private faceTarget(game: Game, sink: InputSink, dt: number, pitch: number): void {
    if (!this.target) return;
    const c = footprintCenter(this.target);
    this.look(game, sink, Math.atan2(c.x - game.body.pos.x, c.z - game.body.pos.z), pitch, dt);
  }

  /** 視点をなめらかに回す（1秒に TURN_RATE まで）。マウスの画素に直して注入する。 */
  private look(game: Game, sink: InputSink, yaw: number, pitch: number, dt: number): void {
    const max = TURN_RATE * dt;
    const dy = clamp(wrapAngle(yaw - game.view.yaw), -max, max);
    const dp = clamp(pitch - game.view.pitch, -max, max);
    if (Math.abs(dy) + Math.abs(dp) > 1e-6) sink.injectMotion(-dy / LOOK.sensitivity, -dp / LOOK.sensitivity);
  }

  private hold(sink: InputSink, name: string, on: boolean): void {
    if (on === this.held.has(name)) return;
    if (on) {
      pressInput(sink, name);
      this.held.add(name);
    } else {
      releaseInput(sink, name);
      this.held.delete(name);
    }
  }

  private releaseAll(sink: InputSink): void {
    for (const name of this.held) releaseInput(sink, name);
    this.held.clear();
  }
}

/** 台本の1行。at は遊び始めからの秒。hold は ms だけ押して離す。look は画素。 */
export interface ScriptStep {
  at: number;
  do: 'press' | 'release' | 'tap' | 'hold' | 'look';
  key?: string | number;
  ms?: number;
  dx?: number;
  dy?: number;
}

export class ScriptPlaytest implements Playtest {
  readonly label = 'script';
  private time = 0;
  private next = 0;
  private readonly releases: { at: number; key: string | number }[] = [];
  private readonly steps: ScriptStep[];

  constructor(steps: ScriptStep[]) {
    this.steps = [...steps].sort((a, b) => a.at - b.at);
  }

  get doing(): string {
    return `script ${this.next}/${this.steps.length}`;
  }

  update(dt: number, game: Game, sink: InputSink): void {
    if (game.session.phase !== 'playing') return;
    this.time += dt;
    for (let i = this.releases.length - 1; i >= 0; i--) {
      if (this.releases[i].at <= this.time) {
        releaseInput(sink, this.releases[i].key);
        this.releases.splice(i, 1);
      }
    }
    while (this.next < this.steps.length && this.steps[this.next].at <= this.time) {
      const s = this.steps[this.next++];
      const key = s.key ?? 'left';
      if (s.do === 'look') sink.injectMotion(s.dx ?? 0, s.dy ?? 0);
      else if (s.do === 'press') pressInput(sink, key);
      else if (s.do === 'release') releaseInput(sink, key);
      else {
        pressInput(sink, key);
        this.releases.push({ at: this.time + (s.do === 'tap' ? 0.05 : (s.ms ?? 100) / 1000), key });
      }
    }
  }
}
