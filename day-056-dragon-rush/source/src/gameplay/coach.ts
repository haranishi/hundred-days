// OWNER: gameplay
// 最初の案内の進み方（純データ）：今やることを1段ずつ出す（動く → 炎 → 爪 → 飛ぶ → 満タンで E）。
// r02-controls：旧は9行の操作表を10秒だけ出し、今やるべきことが分からなかった（体験の採点 X1＝5点）。
// 各段は、その操作をしたら済む（順番より先にした操作も数える）。出すのは、まだ済んでいない最初の段。文は画面の側（ui/hud.ts）が段の名前から選ぶ。
// r05-play（体験の採点 r04）：爪の段は、爪を振った後に建物が崩れてから済ませる（爪が当たって傾いた瞬間に「飛び上がる」へ進み、
// 案内どおりに飛んで傾いたビルを離れ、最初の崩落が16.1秒に遅れた）。また、段を見せて COACH_PACE.skipSeconds たっても済まないとき、
// もう建物を崩せている（最初の崩落の後）なら次の段へ進める（焔角で礫を投げないと、礫の案内が2分残った）。
import { COACH_PACE } from '../config/controls';
import { COACH } from '../config/gameplay';

export type CoachStep = 'move' | 'breath' | 'claw' | 'fly' | 'rage' | 'done';

/** 段の順番（E2E と単体テストが確かめる） */
export const COACH_ORDER: readonly CoachStep[] = ['move', 'breath', 'claw', 'fly', 'rage', 'done'];

/** 1刻みで見る遊びの様子。 */
export interface CoachInput {
  /** WASD を押している */
  moving: boolean;
  /** 炎が出ている */
  breathing: boolean;
  /** この刻みで爪を振った（当たらなくても数える） */
  clawed: boolean;
  /** Space を押している（上昇の操作） */
  climbing: boolean;
  rageFull: boolean;
  /** この刻みで大技を出した */
  released: boolean;
  /** r05-play：建物が1棟でも崩れた（最初の崩落の後） */
  collapsed: boolean;
}

export class Coach {
  /** 今出す段：まだ済んでいない段のうち、順番がいちばん前のもの */
  step: CoachStep = 'move';
  /** 段ごとの「その操作を続けた秒数」と済んだか。順番より先の操作をしても数える（先に炎を吐いた人に炎の案内を出し直さない） */
  private readonly progress: Record<CoachStep, number> = { move: 0, breath: 0, claw: 0, fly: 0, rage: 0, done: 0 };
  private readonly doneSteps = new Set<CoachStep>();
  /** 爪（右クリックの技）を1回でも振った */
  private clawed = false;
  /** 今の段を出してからの秒数（ゲーム内時刻） */
  private stepTime = 0;

  reset(): void {
    this.step = 'move';
    for (const k of COACH_ORDER) this.progress[k] = 0;
    this.doneSteps.clear();
    this.clawed = false;
    this.stepTime = 0;
  }

  /** 画面に出す段（満タンで E の段は、怒りが満タンになるまで出さない。終わったら null） */
  visible(rageFull: boolean): CoachStep | null {
    if (this.step === 'done') return null;
    if (this.step === 'rage' && !rageFull) return null;
    return this.step;
  }

  update(dt: number, s: CoachInput): void {
    const add = (k: CoachStep, on: boolean, need: number): void => {
      if (!on || this.doneSteps.has(k)) return;
      this.progress[k] += dt;
      if (this.progress[k] >= need) this.doneSteps.add(k);
    };
    add('move', s.moving, COACH.moveSeconds);
    add('breath', s.breathing, COACH.breathSeconds);
    if (s.clawed) this.clawed = true;
    // 爪の段は、爪を振った後に建物が崩れて済む（崩れる前に「飛ぶ」を出すと、傾いたビルを離れてしまう）
    if (this.clawed && s.collapsed) this.doneSteps.add('claw');
    add('fly', s.climbing, COACH.climbSeconds);
    // 大技の段は、満タンの案内を見てから出したときだけ済ませる（それより前の段が残っていれば数えない）
    if (s.released && this.step === 'rage') this.doneSteps.add('rage');
    // 出してから skipSeconds たっても済まない段は、もう建物を崩せているなら済んだことにする（大技の段は満タンで出るので除く）
    this.stepTime += dt;
    if (s.collapsed && this.stepTime >= COACH_PACE.skipSeconds && this.step !== 'rage' && this.step !== 'done') this.doneSteps.add(this.step);
    const next = COACH_ORDER.find((k) => k === 'done' || !this.doneSteps.has(k)) ?? 'done';
    if (next !== this.step) {
      this.step = next;
      this.stepTime = 0;
    }
  }
}
