// OWNER: core
// r07: 面の仕掛けと進行。描画やDOMに依存せず、固定刻みで作業を進める。
import { GUARD, INTERACTION } from '../config/rules';
import type { InteractionSnap } from '../contract/snapshot';
import type { InteractionDef, StageDef } from '../stage/types';
import { NavGrid } from './nav';
import type { Sim } from './sim';
import type { SimInput } from './types';

export const MISSION_PHASES = [
  ['潜入', '表門・裏門・水抜き穴から境内へ'],
  ['境内突破', '竹林の板戸か中門から奥の庭へ。消灯・補充も使える'],
  ['護衛突破', '蘭丸と提灯持ちの隙を作り、信長へ近づく'],
  ['討ち取り', '信長の背後で E。討ち取った時点でクリア'],
] as const;

export class Mission {
  phase = 0;
  readonly used = new Set<string>();
  readonly disabledLights = new Set<string>();
  active: { id: string; elapsed: number } | null = null;
  message = '';
  messageUntil = 0;
  snapshots(stage: StageDef): InteractionSnap[] {
    return (stage.interactions ?? []).map((v) => ({
      id: v.id, kind: v.kind, x: v.pos.x, z: v.pos.z, used: this.used.has(v.id),
      progress: this.active?.id === v.id ? this.active.elapsed / v.duration : 0,
    }));
  }
}

export function nearbyInteraction(sim: Sim): InteractionDef | null {
  const p = sim.player;
  let best: InteractionDef | null = null;
  let distance: number = INTERACTION.range;
  for (const item of sim.stage.interactions ?? []) {
    if (sim.mission.used.has(item.id) || (item.kind === 'supply' && p.stones >= INTERACTION.supply)) continue;
    const d = Math.hypot(p.x - item.pos.x, p.z - item.pos.z);
    if (d > distance || sim.q.blocked(p.x, p.z, item.pos.x, item.pos.z)) continue;
    distance = d;
    best = item;
  }
  return best;
}

export function updateMission(sim: Sim, input: SimInput, dt: number): void {
  const p = sim.player;
  const m = sim.mission;
  if (p.x > -35.5 && p.x < 35.5 && p.z < 29.5 && p.z > -31.5) m.phase = Math.max(1, m.phase);
  if (p.z < -12.5 && p.x > -35.5 && p.x < 35.5) m.phase = Math.max(2, m.phase);
  if (p.prompt?.kind === 'assassinate' || sim.outcome === 'win') m.phase = 3;
  if (sim.outcome) { m.active = null; return; }
  const moving = Math.hypot(input.moveX, input.moveY) > 0.01;
  if (m.active) {
    const item = sim.stage.interactions?.find((v) => v.id === m.active!.id);
    if (!item || p.action || moving || input.attack || p.speed > INTERACTION.stopSpeed ||
      Math.hypot(p.x - item.pos.x, p.z - item.pos.z) > INTERACTION.range || sim.q.blocked(p.x, p.z, item.pos.x, item.pos.z)) {
      m.active = null;
    } else {
      m.active.elapsed += dt;
      if (m.active.elapsed >= item.duration) complete(sim, item);
    }
  } else if (input.interact && !p.action && !moving && !p.aiming && p.speed <= INTERACTION.stopSpeed) {
    const item = nearbyInteraction(sim);
    if (item) m.active = { id: item.id, elapsed: 0 };
  }
}

function complete(sim: Sim, item: InteractionDef): void {
  const m = sim.mission;
  m.used.add(item.id);
  m.active = null;
  if (item.kind === 'lamp' && item.lightId) {
    m.disabledLights.add(item.lightId);
    const i = sim.stage.lights.findIndex((v) => v.id === item.lightId);
    if (i >= 0) sim.q.lights[i].intensity = 0;
    // 消えた灯りへ点検に来る。投げる小石と同じく音だけではプレイヤーを特定しない。
    sim.emitNoise(item.pos.x, item.pos.z, INTERACTION.noise, 'stone');
    m.message = '消灯した。番兵が点検に来る前に抜けよう';
  } else if (item.kind === 'barrier' && item.wall) {
    const i = sim.q.boxes.findIndex((v) => v.id === item.wall!.id);
    if (i >= 0) sim.q.boxes.splice(i, 1);
    sim.nav = new NavGrid(sim.q, GUARD.radius, false);
    for (const g of sim.guards) { if (g.goal) { g.path = null; g.pathPending = true; } }
    sim.emitNoise(item.pos.x, item.pos.z, INTERACTION.noise, 'stone');
    m.message = '板戸を開いた。竹林から奥の庭へ進める';
  } else if (item.kind === 'supply') {
    sim.player.stones = INTERACTION.supply;
    m.message = '小石を補充した。この置き場は回収済み';
  } else {
    m.message = '偵察書：信長の背は東側。蘭丸の向きと提灯の巡回を読め';
  }
  m.messageUntil = sim.t + 7;
}
