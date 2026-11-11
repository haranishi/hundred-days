// 滑走の状態を、滑走者・カメラ・雪煙・跡として見せる系の入口。
// 計算（姿勢・カメラ・跡の形）は描画から切り離した関数にあり、ここは「描く時刻の状態を作って、それぞれへ渡す」だけを受け持つ。
import { createFigure, loadRiderData } from './figure.js';
import { createSimpleFigure } from './figure-simple.js';
import { createPose, createPoseMemory, solvePose } from './pose.js';
import { viewCut } from '../objects/shapes.js';
import { createCameraMemory, updateCamera } from './camera-math.js';
import { createSpray } from './spray.js';
import { createTracks } from './tracks.js';
import { createFlecks } from './flecks.js';
import { mixState } from './mix.js';

const SHAKE = { normal: 1, less: 0.4, none: 0 };
const NO_EVENTS = [];
const NO_LOOK = { yaw: 0, pitch: 0, camera: 'third' };

/**
 * @param {{view:object, world:object}} deps
 */
export function createRideFeedback({ view, world }) {
  let figure = null; // 準備（init）で、作り込んだ人物のデータを読んでから作る
  let riderData = null;
  const pose = createPose();
  const poseMemory = createPoseMemory();
  const camMemory = createCameraMemory();
  const cam = { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, fov: 62, near: 0.1 };
  const heightAt = (x, z) => world.heightAt(x, z);
  const near = [];
  const poseInput = { state: null, events: NO_EVENTS, dt: 0, jumped: true, heightAt };
  const camInput = { state: null, events: NO_EVENTS, dt: 0, jumped: true, look: NO_LOOK, shake: 1, heightAt, obstacles: near, time: 0, pose };
  let mixed = null;
  let spray = null;
  let tracks = null;
  let flecks = null;
  let ready = false;
  let bodyHidden = false; // 一人称で、体（上半身）を隠しているか。試験と確認用
  let orbit = null; // 確認用：滑走者を決まった向きから眺める

  let figureDetail = true;
  function makeFigure(context) {
    figure?.dispose();
    figureDetail = context.tier.name !== 'low';
    figure = riderData ? createFigure(riderData, { detail: figureDetail }) : createSimpleFigure();
    context.scene.add(figure.group);
  }

  const system = {
    name: 'ride-feedback',
    async init(context) {
      // 人物のデータを読めなければ、簡単な形（筒と球）で続ける。滑走そのものは止めない
      try { riderData = await loadRiderData(); } catch (error) { console.warn(`${error?.message ?? error}。簡単な形の滑走者で続けます`); }
      makeFigure(context);
      system.onTier(context);
    },
    /** 画質の段が変わったら、粒と跡を作り直す（粒の数と、速度の絵へ書くかどうかが段で変わる） */
    onTier(context) {
      // 人物の布の細かい凹凸は、低い段では描かない。段が変わったら作り直す
      if (figure && riderData && figureDetail !== (context.tier.name !== 'low')) makeFigure(context);
      spray?.dispose();
      tracks?.dispose();
      flecks?.dispose();
      flecks = createFlecks({ context, world, count: context.tier.name === 'low' ? 220 : 420 });
      spray = createSpray({ context, world, capacity: context.tier.name === 'high' ? 1536 : context.tier.name === 'mid' ? 1024 : 512 });
      tracks = createTracks({ context, world, capacity: context.tier.name === 'low' ? 2048 : 4096 });
    },
    update(frame) {
      const s = frame.state;
      if (!s) return;
      if (!mixed) mixed = structuredClone(s);
      const jumped = frame.jumped === true || !ready;
      mixState(jumped ? s : (frame.prev || s), s, jumped ? 1 : (frame.alpha ?? 1), mixed);
      const dt = Math.min(0.1, Math.max(0, frame.frameDt || 0));
      const events = frame.events || NO_EVENTS;
      if (jumped) { spray?.clear(); tracks?.clear(); }
      poseInput.state = mixed; poseInput.events = events; poseInput.dt = dt; poseInput.jumped = jumped;
      solvePose(poseInput, poseMemory, pose);
      // 体（上半身）を隠すのは、カメラが頭の近く（1.6 m 以内）にある間だけ。カメラの位置は、前のコマのもの（1 コマに動くのは 0.6 m まで）。
      // 「選んでいる視点が一人称」で決めていたときは、三人称へ戻した直後（カメラがまだ頭の位置にある間）に体を描いて、
      // 頭と腕の内側が画面に映った（スキーの滑りの採点 2 周目）。視点の移りの進み具合（半分）で決めると、戻す途中の 0.1 秒、下半身だけが映った
      const head = pose.joints.head;
      const firstPerson = bodyHidden = Math.hypot(cam.pos.x - head.x, cam.pos.y - head.y, cam.pos.z - head.z) < 1.6;
      figure?.apply(pose, { firstPerson, stance: mixed.stance });
      if (spray) { spray.emit(mixed, pose, events, dt); spray.flush(); }
      if (tracks) tracks.update(mixed, pose);
      ready = true;
    },
    dispose() { figure?.dispose(); spray?.dispose(); tracks?.dispose(); flecks?.dispose(); },
  };

  const cameraController = {
    update(frame, camera, context) {
      // 景色を見る：決まった視点へ、そのまま置く。真下を見る視点は、北（−Z）を画面の上にする
      if (frame.vista) {
        const v = frame.vista, dx = v.target[0] - v.pos[0], dy = v.target[1] - v.pos[1], dz = v.target[2] - v.pos[2];
        const straightDown = Math.hypot(dx, dz) < Math.abs(dy) * 0.02;
        camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
        if (straightDown) camera.up.set(0, 0, -1); else camera.up.set(0, 1, 0);
        camera.lookAt(v.target[0], v.target[1], v.target[2]);
        const fov = v.fov ?? 55;
        if (Math.abs(camera.fov - fov) > 0.01 || camera.near !== 1) { camera.fov = fov; camera.near = 1; camera.updateProjectionMatrix(); }
        if (context?.motionBlur) context.motionBlur.value = 0;
        flecks?.update(camera, 0, true);
        camMemory.initialized = false; // 滑走へ戻ったら、カメラを置き直す
        return;
      }
      if (!mixed) return;
      const jumped = frame.jumped === true || !camMemory.initialized;
      world.obstaclesNear(mixed.pos.x, mixed.pos.z, 11, near);
      camInput.state = mixed;
      camInput.events = frame.events || NO_EVENTS;
      camInput.dt = Math.min(0.1, Math.max(0, frame.frameDt || 0));
      camInput.jumped = jumped;
      camInput.look = frame.look || NO_LOOK;
      camInput.shake = SHAKE[frame.settings?.shake] ?? 1;
      camInput.time = frame.time || 0;
      updateCamera(camInput, camMemory, cam);
      if (orbit) {
        // 板の向きを基準に、方位（0=真後ろ, 90=右, 180=正面）・仰角・距離で置く
        // 向きの基準は、板。basis: 'chest' のときは、胸（スキーの制動は、板が横を向き、体は進む向きを向く）
        const b = orbit.basis === 'chest' && pose.chestFwd ? { fwd: pose.chestFwd } : pose.board;
        const h = Math.atan2(b.fwd.x, -b.fwd.z) + Math.PI + (orbit.az * Math.PI) / 180;
        const el = (orbit.el * Math.PI) / 180;
        const c = pose.joints.pelvis;
        cam.pos.x = c.x + Math.sin(h) * Math.cos(el) * orbit.dist;
        cam.pos.y = c.y + Math.sin(el) * orbit.dist;
        cam.pos.z = c.z - Math.cos(h) * Math.cos(el) * orbit.dist;
        cam.target.x = c.x; cam.target.y = c.y + (orbit.lift ?? 0); cam.target.z = c.z;
        cam.up.x = 0; cam.up.y = 1; cam.up.z = 0;
        cam.fov = orbit.fov ?? 40;
      }
      camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
      camera.up.set(cam.up.x, cam.up.y, cam.up.z);
      camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
      // 後ろからの視点：カメラと滑走者のあいだの枝と岩を切り欠く（自分の目の視点では、すぐそばだけ）
      viewCut.value = orbit ? 0 : Math.max(0, Math.hypot(cam.pos.x - mixed.pos.x, cam.pos.y - mixed.pos.y - 0.9, cam.pos.z - mixed.pos.z) - 0.9) * (1 - Math.min(1, camMemory.springs.first.x));
      flecks?.update(camera, camInput.dt, jumped);
      // 動きのぼかし：時速 35 km あたりから効き始め、時速 110 km で最大。設定の「揺れ」を弱めた人には弱く、「なし」ならかけない。
      // 場所が飛んだコマ（出発地点への移動など）では 0 にする（画面全体が 1 コマで動くので、全面がぼける）
      if (context?.motionBlur) {
        const t = Math.min(1, Math.max(0, (mixed.speed - 10) / 21));
        context.motionBlur.value = jumped ? 0 : t * t * (3 - 2 * t) * 0.85 * camInput.shake;
      }
      if (Math.abs(camera.fov - cam.fov) > 0.01 || Math.abs(camera.near - cam.near) > 1e-4) {
        camera.fov = cam.fov;
        camera.near = cam.near;
        camera.updateProjectionMatrix();
      }
    },
  };

  view.addSystem(system);
  view.setCameraController(cameraController);
  return {
    system, cameraController,
    /** 確認用：滑走者を決まった向きから眺める。null で通常のカメラへ戻す */
    setOrbit(value) { orbit = value; },
    /** 確認用：いまの姿勢・カメラ・粒と跡の数 */
    debug: () => ({ pose, cam, bodyHidden, sprayEmitted: spray?.stats.emitted ?? 0, trackSections: tracks?.builder.count ?? 0, figure: figure?.stats ?? null }),
    /** 確認用：滑走者の部位の色を変える */
    setColors(map) { figure?.setColors?.(map); },
  };
}
