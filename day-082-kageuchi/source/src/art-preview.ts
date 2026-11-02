// OWNER: world-art
// 世界の見た目を単独で確かめるページ（art.html）。
//   ?shot=<名前>  src/contract/shots.ts の構図に置き、shot.t まで決まった刻みで進め、影と AO が落ち着いてから window.__shotReady=true
//   （fire は setFire(0.8)）。?shot 無しは OrbitControls で自由に見る。
//   ?perf=1      300 コマを描いて window.__perfResult（p50・p95・draw calls・三角形数）。構図は ?shot（既定 courtyard）
//   ?hide=wood,tile  世界の部品を名前で隠す（切り分け用）
//   ?tx=&ty=&tz=&yaw=&pitch=&dist=  構図の注視点・向き・見下ろし・距離を上書き（透かしなどの確認用）
//   ?player=x,z  透かしの中心（プレイヤーの足元）を指定
//   ?check=1     撮る前後でシェーダーの数を数え、setFire・手提灯・発見・討ち取りで新しく作られないかを __shotInfo に書く
//   ?see=0       透かしを切る。?fire=0.5 で炎上の進みを指定。?alert=1・?finale=1 で後処理の演出を確かめる
//   ?others=x,z;x,z  透かしで、プレイヤーのほかに見せる人物の足元（契約の others。r02-fix-visual 追加）
//   ?t=秒        構図の時刻を上書き（揺れ・明滅の見比べ用。r02-fix-visual 追加）。?player= を渡すとそこにも人形を立てる
// 切り分け用（r03-fix-visual 追加：足元の明るい円の原因を、要因を1つずつ外して確かめる）
//   ?ao=0 AO を切る。?inside=0 カメラが建物の箱に入ったときの網点を切る。?shadowk=0.0 月の影の濃さ（既定は設定の値）
//   ?doll=0 ?player= の位置に人形を立てない。?probe=x,z その足元のまわりの地面の点（内の円と外の輪）を画面の座標にして __shotInfo.probe に書く
// 人物は担当外なので、番兵・信長・プレイヤーの位置に背丈 1.7m の暗い仮の人形（円柱と笠）を立て、提灯持ちには手提灯の明かりを置く。
import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getShot, shotCameraPosition, type ShotDef } from './contract/shots';
import type { MovingLight } from './contract/snapshot';
import { gpuName } from './art/render/renderer';
import { SEE_UNIFORMS } from './art/render/seeThrough';
import { buildWorld, createPost, createRenderer, createSeeThrough, warmUp } from './art/world';
import { HONNOJI } from './stage/honnoji';
import type { StageDef } from './stage/types';

const params = new URLSearchParams(location.search);
const STEP = 1 / 60;
/** 撮る前に描くコマ数（AO の積算が落ち着くまで） */
const SETTLE_FRAMES = 48;
/** 遊ぶ角度の構図では、注視点にいるはずのプレイヤーの周りを透かす */
const GAMEPLAY_SHOTS = new Set(['courtyard', 'bamboo', 'garden', 'start']);

function rad(d: number): number {
  return (d * Math.PI) / 180;
}

/** 仮の人形（暗い円柱と笠）。座っている者・居眠りの者は低く。extra は ?player= の位置（透かしの確かめ用）。 */
function mannequins(stage: StageDef, extra: [number, number] | null): Group {
  const g = new Group();
  g.name = 'mannequins';
  const body = new MeshStandardMaterial({ color: 0x15161a, roughness: 0.85 });
  const hat = new MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.6 });
  const face = new MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.7 });
  const place = (x: number, z: number, height: number, kasa: boolean): void => {
    const h = height - 0.25;
    const m = new Mesh(new CylinderGeometry(0.17, 0.24, h, 10), body);
    m.position.set(x, h / 2, z);
    const head = new Mesh(new SphereGeometry(0.12, 10, 8), face);
    head.position.set(x, h + 0.1, z);
    const cap = new Mesh(kasa ? new ConeGeometry(0.34, 0.16, 12) : new ConeGeometry(0.15, 0.12, 10), hat);
    cap.position.set(x, h + 0.25, z);
    for (const o of [m, head, cap]) {
      o.castShadow = true;
      o.receiveShadow = true;
      g.add(o);
    }
  };
  for (const gd of stage.guards) {
    const low = gd.seated || gd.dozing;
    place(gd.start.x, gd.start.z, low ? 1.15 : 1.7, gd.kind === 'ashigaru');
  }
  place(stage.player.start.x, stage.player.start.z, 1.7, false);
  if (extra && params.get('doll') !== '0') place(extra[0], extra[1], 1.7, false);
  return g;
}

/** 提灯持ちの手提灯（番兵の前 0.35m・右 0.2m・高さ 0.9m、半径 5m、強さ 0.75）。 */
function lanternLights(stage: StageDef): MovingLight[] {
  const out: MovingLight[] = [];
  for (const gd of stage.guards) {
    if (!gd.lantern) continue;
    const yaw = rad(gd.facingDeg);
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    out.push({ id: gd.id, x: gd.start.x + fx * 0.35 - fz * 0.2, y: 0.9, z: gd.start.z + fz * 0.35 + fx * 0.2, radius: 5, intensity: 0.75 });
  }
  return out;
}

function placeCamera(camera: PerspectiveCamera, shot: ShotDef): void {
  const [x, y, z] = shotCameraPosition(shot);
  camera.position.set(x, y, z);
  camera.fov = shot.fov;
  camera.lookAt(shot.target[0], shot.target[1], shot.target[2]);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** ?probe：足元 (x, z) のまわりの地面の点を画面の座標（CSS 画素）にする。内の円（0.25〜1.3m）と外の輪（2.9〜4.2m）。 */
function probePoints(camera: PerspectiveCamera, x: number, z: number, w: number, h: number): Record<string, [number, number][]> {
  const out: Record<string, [number, number][]> = { inner: [], ring: [] };
  const v = new Vector3();
  for (let r = 0.25; r <= 4.21; r += 0.15) {
    const key = r <= 1.3 ? 'inner' : r >= 2.9 ? 'ring' : null;
    if (!key) continue;
    const n = Math.max(8, Math.round(r * 24));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      v.set(x + Math.cos(a) * r, 0.02, z + Math.sin(a) * r).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      out[key].push([Math.round((v.x * 0.5 + 0.5) * w), Math.round((-v.y * 0.5 + 0.5) * h)]);
    }
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  document.body.style.margin = '0';
  document.body.style.background = '#000';
  document.body.style.overflow = 'hidden';
  canvas.style.display = 'block';
  const width = window.innerWidth;
  const height = window.innerHeight;

  const renderer = createRenderer(canvas);
  renderer.setSize(width, height);
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, width / height, 0.2, 1500);
  const stage = HONNOJI;
  const world = buildWorld(scene, renderer, stage);
  world.setViewportHeight(height * renderer.getPixelRatio());
  // ?hide=名前,名前 で世界の部品を隠す（原因の切り分け用）
  for (const name of (params.get('hide') ?? '').split(',').filter(Boolean)) {
    world.root.traverse((o) => {
      if (o.name === name) o.visible = false;
    });
  }
  const playerParam = params.get('player');
  const playerXZ = playerParam ? (playerParam.split(',').map(Number) as [number, number]) : null;
  scene.add(mannequins(stage, playerXZ));
  const others = (params.get('others') ?? '')
    .split(';')
    .filter(Boolean)
    .map((s) => {
      const [x, z] = s.split(',').map(Number);
      return new Vector3(x, 0, z);
    });
  const post = createPost(renderer, scene, camera);
  post.setSize(width, height);
  if (params.get('ao') === '0') post.ao.enabled = false;
  if (params.get('shadowk') !== null) world.lights.sun.shadow.intensity = Number(params.get('shadowk'));
  const see = createSeeThrough();
  // 建物の箱の網点を切る：箱を遠くへ置く（buildWorld が書いた後で上書き）
  if (params.get('inside') === '0') for (const b of SEE_UNIFORMS.uKgInside.value) b.set(1e5, 1e5, 1e5, 1e5);
  world.setMovingLights(lanternLights(stage));

  const shotName = params.get('shot') ?? (params.get('perf') ? 'courtyard' : null);
  const base = shotName ? getShot(shotName) : undefined;
  if (shotName && !base) throw new Error(`構図 ${shotName} が無い`);
  const num = (k: string, d: number): number => (params.get(k) !== null ? Number(params.get(k)) : d);
  const shot: ShotDef | undefined = base && {
    ...base,
    target: [num('tx', base.target[0]), num('ty', base.target[1]), num('tz', base.target[2])],
    yawDeg: num('yaw', base.yawDeg),
    pitchDeg: num('pitch', base.pitchDeg),
    distance: num('dist', base.distance),
    t: num('t', base.t),
  };
  const fireParam = params.get('fire');
  const fire = fireParam !== null ? Number(fireParam) : shot?.name === 'fire' ? 0.8 : 0;
  world.setFire(fire);
  if (params.get('alert')) post.setAlert(Number(params.get('alert')));
  if (params.get('finale')) post.setFinale(Number(params.get('finale')));
  const seeOn = params.get('see') !== '0';
  const player = new Vector3();
  const seeEnabled = (): boolean => {
    if (!seeOn || !shot) return false;
    if (playerXZ) {
      player.set(playerXZ[0], 0, playerXZ[1]);
      return true;
    }
    if (shot.name === 'start') player.set(stage.player.start.x, 0, stage.player.start.z);
    else player.set(shot.target[0], 0, shot.target[2]);
    return GAMEPLAY_SHOTS.has(shot.name);
  };

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    post.setSize(w, h);
    world.setViewportHeight(h * renderer.getPixelRatio());
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });

  if (shot) {
    camera.aspect = width / height;
    placeCamera(camera, shot);
    // shot.t まで決まった刻みで進める（炎・旗・霧・水面の位相をそろえる）
    const steps = Math.round(shot.t / STEP);
    for (let i = 1; i <= steps; i++) world.update(STEP, i * STEP);
    const t = steps * STEP;
    world.updateForCamera(camera);
    see.update(camera, player, seeEnabled(), others);
    const t0 = performance.now();
    await warmUp(renderer, scene, camera);
    const warmMs = performance.now() - t0;

    if (params.get('perf')) {
      post.setShotMode(false);
      const intervals: number[] = [];
      const cpu: number[] = [];
      let last = 0;
      let frame = 0;
      let calls = 0;
      let triangles = 0;
      await new Promise<void>((resolve) => {
        const tick = (now: number): void => {
          if (last > 0) intervals.push(now - last);
          last = now;
          const c0 = performance.now();
          world.update(STEP, t + frame * STEP);
          world.updateForCamera(camera);
          see.update(camera, player, seeEnabled(), others);
          post.render(STEP);
          cpu.push(performance.now() - c0);
          calls = renderer.info.render.calls;
          triangles = renderer.info.render.triangles;
          frame++;
          if (frame < 320) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      const iv = intervals.slice(20).sort((a, b) => a - b);
      const cp = cpu.slice(20).sort((a, b) => a - b);
      window.__perfResult = {
        shot: shot.name,
        frames: iv.length,
        p50: +percentile(iv, 50).toFixed(2),
        p95: +percentile(iv, 95).toFixed(2),
        cpuP50: +percentile(cp, 50).toFixed(2),
        cpuP95: +percentile(cp, 95).toFixed(2),
        calls,
        triangles,
        programs: renderer.info.programs?.length ?? 0,
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        gpu: gpuName(renderer),
        warmMs: Math.round(warmMs),
      };
      window.__shotReady = true;
      return;
    }

    // 途中でシェーダーが作られないか：炎上・手提灯・発見・討ち取りを動かして、シェーダーの数を比べる
    let check: Record<string, number> | null = null;
    if (params.get('check')) {
      const before = renderer.info.programs?.length ?? 0;
      world.setFire(0.5);
      world.setMovingLights([]);
      post.setAlert(0.8);
      post.setFinale(0.8);
      for (let i = 0; i < 3; i++) {
        world.update(STEP, t + i * STEP);
        post.render(STEP);
      }
      world.setMovingLights(lanternLights(stage));
      world.setFire(fire);
      post.setAlert(0);
      post.setFinale(0);
      post.render(STEP);
      check = { programsBefore: before, programsAfter: renderer.info.programs?.length ?? 0 };
    }
    post.setShotMode(true);
    for (let i = 0; i < SETTLE_FRAMES; i++) {
      world.update(0, t);
      world.updateForCamera(camera);
      see.update(camera, player, seeEnabled(), others);
      post.render(0);
      await new Promise((r) => requestAnimationFrame(r));
    }
    const probeParam = params.get('probe');
    const probe = probeParam ? probePoints(camera, Number(probeParam.split(',')[0]), Number(probeParam.split(',')[1]), width, height) : undefined;
    window.__shotInfo = {
      check,
      probe,
      shot: shot.name,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      programs: renderer.info.programs?.length ?? 0,
      gpu: gpuName(renderer),
      warmMs: Math.round(warmMs),
    };
    window.__shotReady = true;
    return;
  }

  // 自由に見る
  camera.position.set(-30, 40, 70);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2, 0);
  controls.update();
  await warmUp(renderer, scene, camera);
  let t = 0;
  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    controls.update();
    world.update(dt, t);
    world.updateForCamera(camera);
    see.update(camera, controls.target, seeOn);
    post.render(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main().catch((e) => {
  console.error(e);
  window.__artError = String(e?.stack ?? e);
  const ui = document.getElementById('ui');
  if (ui) ui.textContent = String(e);
});
