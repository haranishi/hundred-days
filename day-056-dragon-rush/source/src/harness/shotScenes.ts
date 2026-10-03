// OWNER: harness
// 破壊の出てくる3構図（breath・landing・aftermath）を、遊びと同じ仕組み（Stage）で決定的に作る。
// 乱数は系列を固定し、時間は決まった刻みで進めるので、何度撮っても同じ絵になる（AO の積算だけは実時間の雑音が残る）。
// ?film では、同じ場面をコマごとに advance で進める（炎のゆらぎ・煙の上昇・崩れの続きを連番で見られる）。
import { Vector3 } from 'three';
import type { App } from '../app';
import { COLLAPSE_FILM, SHOT_SCENES } from '../config/shots';
import { sideNormal } from '../world/geom';
import { nearestWallPoint, wallPointZero } from '../fx/buildingPoints';
import type { BreathView } from '../fx/fxDirector';
import { STAGE } from '../gameplay/damage';
import { footprintCenter } from '../gameplay/shapes';
import { Stage } from '../stage';
import type { ResolvedShot } from './shotResolver';

const STEP = 1 / 60;

export interface ShotScene {
  stage: Stage;
  /** 街・効果を dt 秒進め、壊れ方の表を描画へ渡す */
  advance(dt: number): void;
}

function sceneOf(app: App, stage: Stage, breath: BreathView | null): ShotScene {
  return {
    stage,
    advance: (dt: number) => {
      stage.game.advanceWorld(dt);
      if (breath) app.dragon.mouthWorld(breath.mouth);
      stage.fx.update(dt, app.camera, app.size.height, breath);
      // r03-roster：雷翼・焔角の技の見た目（紅竜の場面では何も出さない）
      stage.creatureFx.update(dt, app.camera, app.size.height);
      app.cityView.damage.sync(stage.game.damage, stage.game.fire, stage.game.clock);
    },
  };
}

/** breath：中層ビルへ炎を吐き続け、ビルが燃えながら傾き始めたところ。 */
function breathScene(app: App, stage: Stage, shot: ResolvedShot): ShotScene {
  const S = SHOT_SCENES.breath;
  const game = stage.game;
  const id = shot.targetId;
  if (id === undefined) return sceneOf(app, stage, null);
  const b = app.city.buildings[id];
  const mouth = app.dragon.mouthWorld(new Vector3());
  const wall = nearestWallPoint(b, mouth.x, mouth.z, Math.min(b.height - 3, Math.max(4, mouth.y - 2)), wallPointZero());
  const d = shot.dragon.position;
  const kind = game.creature.moves.primary.kind;
  if (kind !== 'flame') {
    // r03-roster：雷翼は雷を、焔角は溶岩の礫を、同じ壁へ決まった時刻に撃つ（最後の1発が撮る瞬間に見えるように：雷は跳ねの途中、礫は飛んでいる途中）
    game.damage.hit(id, game.damage.hp[id] * S.damage, { cause: kind === 'lightning' ? 'lightning' : 'lava', fromX: d.x, fromZ: d.z, y: wall.y, player: true });
    const to = new Vector3(wall.x, wall.y, wall.z);
    const times = kind === 'lightning' ? [0.4, 1.3, 2.2, S.seconds - 0.16] : [0.2, 1.0, 1.8, S.seconds - 0.5];
    const scene = sceneOf(app, stage, null);
    let k = 0;
    for (let t = 0; t < S.seconds; t += STEP) {
      while (k < times.length && t >= times[k]) {
        game.fireAt(app.dragon.mouthWorld(new Vector3()), to);
        k++;
      }
      scene.advance(STEP);
    }
    return scene;
  }
  game.damage.hit(id, game.damage.hp[id] * S.damage, { cause: 'breath', fromX: d.x, fromZ: d.z, y: wall.y, player: true });
  game.ignite(id, wall.y);
  const scene = sceneOf(app, stage, { mouth, target: new Vector3(wall.x, wall.y, wall.z), hit: true });
  for (let t = 0; t < S.seconds; t += STEP) scene.advance(STEP);
  return scene;
}

/** landing：急降下の着地の瞬間。土煙の輪と、まわりのビルから飛ぶ窓ガラスの破片。 */
function landingScene(app: App, stage: Stage, shot: ResolvedShot): ShotScene {
  const S = SHOT_SCENES.landing;
  const d = shot.dragon.position;
  stage.game.stomp(d.x, d.z, S.fallSpeed);
  const scene = sceneOf(app, stage, null);
  for (let t = 0; t < S.seconds; t += STEP) scene.advance(STEP);
  return scene;
}

/** aftermath：燃える街区。いくつかは崩れて瓦礫になり、燃え広がった煙の柱が立つ。 */
function aftermathScene(app: App, stage: Stage, shot: ResolvedShot): ShotScene {
  const S = SHOT_SCENES.aftermath;
  const game = stage.game;
  const c = shot.district ?? { x: 0, z: 0 };
  const targets = app.index.buildingsNear(c.x, c.z, S.radius).sort((a, b) => a.id - b.id);
  targets.forEach((b, k) => {
    const center = footprintCenter(b);
    // 街区の外側へ倒れる向き（街区の中心から竜が暴れた、という見立て）
    const from = { x: 2 * c.x - center.x, z: 2 * c.z - center.z };
    const hit = (f: number): void => game.damage.hit(b.id, game.damage.hp[b.id] * f, { cause: 'claw', fromX: from.x, fromZ: from.z, y: b.height * 0.4, player: true });
    if (k % S.collapseEvery === 0) hit(1.3);
    else if (k % S.tiltEvery === 0) hit(0.8);
    if (k % S.igniteEvery === 1) game.ignite(b.id, b.height * 0.35);
  });
  const scene = sceneOf(app, stage, null);
  const fxStart = S.worldSeconds - S.fxSeconds;
  for (let t = 0; t < S.worldSeconds; ) {
    const dt = t < fxStart ? 1 / 10 : 1 / 30;
    scene.advance(dt);
    t += dt;
  }
  // 撮る瞬間に崩れかけのものが残らないよう、瓦礫になりきるまで進める
  for (let k = 0; k < 120 && targets.some((b) => game.damage.stage[b.id] === STAGE.collapse); k++) scene.advance(1 / 30);
  return scene;
}

/**
 * collapse（r03-fx：撮影の口の追加）：breath と同じビルを傾きまで壊して燃やし、撮り始めて hitAtSeconds 後に追いの損傷で崩す。
 * 炎は吐かない（崩れを隠さないため）。カメラは collapseCamera で置く。
 */
export function buildCollapseScene(app: App, shot: ResolvedShot): ShotScene | null {
  const C = COLLAPSE_FILM;
  const id = shot.targetId;
  if (id === undefined) return null;
  const stage = new Stage(app);
  const game = stage.game;
  const b = app.city.buildings[id];
  const d = shot.dragon.position;
  const y = b.height * C.hitHeight;
  const hit = (f: number): void => game.damage.hit(id, game.damage.hp[id] * f, { cause: 'claw', fromX: d.x, fromZ: d.z, y, player: true });
  hit(C.preDamage);
  game.ignite(id, y);
  const base = sceneOf(app, stage, null);
  for (let t = 0; t < C.setupSeconds; t += STEP) base.advance(STEP);
  let time = 0;
  let struck = false;
  return {
    stage,
    advance: (dt: number) => {
      time += dt;
      if (!struck && time >= C.hitAtSeconds) {
        struck = true;
        hit(C.extraDamage);
      }
      base.advance(dt);
    },
  };
}

/** collapse のカメラ：ビルの正面の点から道に沿って引き、上空から倒れる向きを斜め横に見る。 */
export function collapseCamera(app: App, shot: ResolvedShot): { position: Vector3; target: Vector3; fov: number } | null {
  const id = shot.targetId;
  if (id === undefined) return null;
  const b = app.city.buildings[id];
  const C = COLLAPSE_FILM.camera;
  const n = sideNormal(app.city.lots[b.lotId].front);
  const f = b.footprint;
  const faceX = n.x > 0 ? f.x1 : n.x < 0 ? f.x0 : (f.x0 + f.x1) / 2;
  const faceZ = n.z > 0 ? f.z1 : n.z < 0 ? f.z0 : (f.z0 + f.z1) / 2;
  const fwd = { x: n.z, z: -n.x };
  const position = new Vector3(faceX + fwd.x * C.along + n.x * C.toward, C.up, faceZ + fwd.z * C.along + n.z * C.toward);
  const target = new Vector3((f.x0 + f.x1) / 2, b.height * C.lookHeight, (f.z0 + f.z1) / 2);
  return { position, target, fov: C.fov };
}

/** 構図に合わせて破壊の場面を作る。破壊の無い構図では何もしない（null）。 */
export function buildShotScene(app: App, shot: ResolvedShot): ShotScene | null {
  const build = shot.name === 'breath' ? breathScene : shot.name === 'landing' ? landingScene : shot.name === 'aftermath' ? aftermathScene : null;
  if (!build) return null;
  return build(app, new Stage(app), shot);
}
