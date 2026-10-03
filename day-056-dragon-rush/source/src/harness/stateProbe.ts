// OWNER: harness
// window.__state：毎コマ、遊びの状態を1つの素の値にまとめる。tools/play.mjs と E2E がこれを読んで記録・判定する。
// 名前と形は tools/・e2e/ との契約なので、変えるときは両側を同時に直す。
import type { CreatureStats, Game } from '../gameplay/game';

export type PlayPhase = 'ready' | 'playing' | 'paused' | 'result' | 'photo';

export interface PlayState {
  /** ゲーム内時刻（秒）。ヒットストップの間はゆっくり進み、結果の後も街と一緒に進む */
  t: number;
  phase: PlayPhase;
  /** 遊んだ時間（秒、実時間で数える3分の残り時間の元） */
  elapsed: number;
  timeLeft: number;
  score: { yen: number; destruction: number; combo: number; maxCombo: number; multiplier: number; rage: number };
  dragon: { x: number; y: number; z: number; yawDeg: number; mode: string; speed: number; altitude: number; action: string };
  buildings: { total: number; intact: number; cracked: number; peeled: number; tilted: number; collapsing: number; collapsed: number; burning: number };
  firstCollapseAt: number | null;
  /** r02-controls：時間切れになったゲーム内時刻（まだなら null）・照準（炎が届くか・先の建物）・案内の段・照準の合図の回数 */
  endedAt: number | null;
  aim: { reach: boolean; building: number; distance: number };
  coach: string;
  cues: { hit: number; miss: number; noRage: number };
  /** r03-roster：遊んでいる怪獣と、3体の違いを示す数え（空中の最高速・雷の跳ね・地割れの長さ・突進で傾けた棟数など） */
  creature: { id: string; stats: CreatureStats };
  fps: number;
  frame: number;
  /** 自動プレイがいま何をしているか（自動プレイでなければ null） */
  bot: string | null;
  events: Record<string, number>;
}

function actionOf(game: Game): string {
  const c = game.combat;
  if (c.roarPhase !== 'none') return 'roar';
  if (c.claw.busy) return 'claw';
  if (c.tail.busy) return 'tail';
  if (c.breathActive) return 'breath';
  if (c.breathCharge > 0) return 'charge';
  if (game.body.jump.phase !== 'none') return 'jump';
  return 'none';
}

export function probeState(game: Game, extra: { photo: boolean; fps: number; frame: number; bot: string | null }): PlayState {
  const s = game.score;
  const b = game.body;
  const tally = game.damage.tally();
  return {
    t: Math.round(game.clock * 1000) / 1000,
    phase: extra.photo ? 'photo' : game.session.phase,
    elapsed: game.session.elapsed,
    timeLeft: game.session.timeLeft,
    score: { yen: s.yen, destruction: s.destruction, combo: s.combo, maxCombo: s.maxCombo, multiplier: s.multiplier, rage: s.rage },
    dragon: {
      x: b.pos.x,
      y: b.pos.y,
      z: b.pos.z,
      yawDeg: (b.yaw * 180) / Math.PI,
      mode: b.mode,
      speed: b.speed,
      altitude: b.altitude,
      action: actionOf(game),
    },
    buildings: { total: game.city.buildings.length, ...tally, burning: game.fire.burning.size },
    firstCollapseAt: game.firstCollapseAt,
    endedAt: game.endedAt,
    aim: { reach: game.aim.reach, building: game.aim.building, distance: Math.round(game.aim.distance * 10) / 10 },
    coach: game.coach.step,
    cues: { ...game.cues },
    // 結果の後は、時間切れの瞬間の数え（3分ちょうどの値。結果の後に済んだ跳びなどを数えない）
    creature: { id: game.creature.id, stats: game.endStats ?? game.stats },
    fps: extra.fps,
    frame: extra.frame,
    bot: extra.bot,
    events: game.bus.counts() as Record<string, number>,
  };
}
