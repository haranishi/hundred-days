// OWNER: core
// window.__state の形（毎コマ書き出す）。自動操作（autopilot）・E2E・自動プレイの道具はこれだけを読む。
import type { InteractionSnap, Phase } from '../contract/snapshot';
import type { MoveStance } from '../sim/perception';
import type { LightTier } from '../sim/query';
import type { Sim } from '../sim/sim';
import type { DetectRecord } from '../sim/types';
import { guardAwareness } from '../sim/guards';
import { rankOf, type Rank } from '../config/rules';
import { MISSION_PHASES, nearbyInteraction } from '../sim/mission';

export type Screen = 'title' | 'select' | 'briefing' | 'play' | 'pause' | 'finale' | 'result' | 'gameover';

export interface GuardStateOut {
  id: string;
  name: string;
  x: number;
  z: number;
  /** 体の向き（度。0＝東・90＝南） */
  yaw: number;
  /** 頭の向きを足した、見ている向き（度） */
  view: number;
  /** 振る舞い（base／investigate／chase／search／return／body／lookAt／victim／down／strike） */
  state: string;
  awareness: string;
  s: number;
  down: boolean;
  dozing: boolean;
  sees: boolean;
}

export interface GameStateOut {
  interactions: InteractionSnap[];
  mission: { step: number; label: string; hint: string; prepared: number; interaction: string | null; progress: number; message: string };
  screen: Screen;
  seed: number;
  tick: number;
  /** ゲーム内時刻（秒） */
  t: number;
  phase: Phase;
  phaseLeft: number;
  /** 発見中、誰にも見られていない秒数（見られた刻みで 0 に戻る。発見中でなければ 0）。r03-fix-play 追加 */
  alertUnseen: number;
  player: {
    x: number;
    z: number;
    yaw: number;
    stance: MoveStance;
    crouch: boolean;
    speed: number;
    light: number;
    lightTier: LightTier;
    stones: number;
    inBush: boolean;
    action: string | null;
    prompt: string | null;
  };
  guards: GuardStateOut[];
  discoveries: number;
  takedowns: number;
  stonesUsed: number;
  outcome: null | 'win' | 'caught';
  /** 討ち取った（または捕まった）時刻（秒）。結末が出るまでは null。 */
  endTime: number | null;
  finale: number | null;
  rank: Rank | null;
  /** 捕まった理由（捕まったときだけ）と、最初の発見。 */
  reason: DetectRecord | null;
  firstDetect: DetectRecord | null;
  camera: { yaw: number; pitch: number; distance: number; lookSens: number };
}

const R2D = 180 / Math.PI;

export function buildState(
  sim: Sim,
  extra: { screen: Screen; seed: number; camera: { yaw: number; pitch: number; distance: number; lookSens: number } },
): GameStateOut {
  const p = sim.player;
  return {
    interactions: sim.mission.snapshots(sim.stage),
    mission: {
      step: sim.mission.phase + 1,
      label: MISSION_PHASES[sim.mission.phase][0],
      hint: MISSION_PHASES[sim.mission.phase][1],
      prepared: sim.mission.used.size,
      interaction: sim.mission.active
        ? sim.stage.interactions?.find((v) => v.id === sim.mission.active!.id)?.name ?? null
        : nearbyInteraction(sim)?.name ?? null,
      progress: sim.mission.active ? sim.mission.active.elapsed / (sim.stage.interactions?.find((v) => v.id === sim.mission.active!.id)?.duration ?? 1) : 0,
      message: sim.t < sim.mission.messageUntil ? sim.mission.message : '',
    },
    screen: extra.screen,
    seed: extra.seed,
    tick: sim.tick,
    t: sim.t,
    phase: sim.phase,
    phaseLeft: sim.phase === 'normal' ? 0 : sim.phaseLeft,
    alertUnseen: sim.phase === 'alert' ? sim.alertUnseen : 0,
    player: {
      x: p.x,
      z: p.z,
      yaw: p.yaw * R2D,
      stance: p.moveStance,
      crouch: p.crouch,
      speed: p.speed,
      light: p.light,
      lightTier: p.tier,
      stones: p.stones,
      inBush: p.inBush,
      action: p.action ? p.action.kind : null,
      prompt: p.prompt ? p.prompt.kind : null,
    },
    guards: sim.guards.map((g) => ({
      id: g.id,
      name: g.name,
      x: g.x,
      z: g.z,
      yaw: g.yaw * R2D,
      view: (g.yaw + g.headYaw) * R2D,
      state: g.mode === 'base' ? (g.dozing ? 'doze' : g.base) : g.mode,
      awareness: guardAwareness(sim, g),
      s: g.s,
      down: g.down,
      dozing: g.dozing,
      sees: g.sees,
    })),
    discoveries: sim.stats.discoveries,
    takedowns: sim.stats.takedowns,
    stonesUsed: sim.stats.stonesUsed,
    outcome: sim.outcome,
    endTime: sim.outcome ? sim.stats.endTime : null,
    finale: sim.finale,
    rank: sim.outcome === 'win' ? rankOf(sim.stats.discoveries, sim.stats.takedowns) : null,
    reason: sim.capture,
    firstDetect: sim.firstDetect,
    camera: extra.camera,
  };
}
