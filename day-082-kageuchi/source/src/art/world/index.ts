// OWNER: world-art
// 世界の見た目の入口。契約（src/contract/art.ts）の createRenderer・buildWorld・createPost・createSeeThrough・warmUp。
// buildWorld はステージの純データだけから、空・霧・光・影・地面・建物・塀・植物・水・炎・外の飾りまでを作る。
// 静的な物は材質ごとに1つの形へまとめ（描画の回数を減らす）、繰り返す物はインスタンスで描く。
import { Group, Mesh, Vector3, type PerspectiveCamera, type Scene, type Texture, type WebGLRenderer } from 'three';
import type { ArtSeeThrough, ArtWorld } from '../../contract/art';
import type { MovingLight } from '../../contract/snapshot';
import type { StageDef } from '../../stage/types';
import { AMBIENT } from '../render/config';
import { installGameLightCurve } from '../render/lightCurve';
import { BURN_UNIFORMS } from '../render/materials';
import { createPostChain, type KgPost } from '../render/post';
import { createRenderer as makeRenderer } from '../render/renderer';
import { createSeeThrough as makeSeeThrough, setInsideBoxes, type InsideBox } from '../render/seeThrough';
import { SKY_UNIFORMS, bakeSkyEnvironment, createSkyDome } from '../render/sky';
import { buildBuildings, type Builders, type FireLines } from './buildings';
import { buildDetails } from './details';
import { FireSystem, type FlameDef, type SmokeDef, type SparkDef } from './fire';
import { MeshBuilder, rng, type V3 } from './geometry';
import { createGround } from './ground';
import { WorldLights } from './lights';
import { LampState } from './lampState';
import { buildInteractions } from './interactions';
import { createWorldMaterials, type WorldMaterials } from './materialsLib';
import { loadPhotoTextures, photoTexturesReady } from './photoTex';
import { buildOutside } from './outside';
import { buildPlants } from './plants';
import { buildPond } from './pond';
import { buildProps } from './props';
import { buildFarTown, buildTown } from './town';
import { buildWalls } from './walls';
import { buildWorldMap } from './worldMap';

/** 契約の ArtWorld に、確認ページと計測のための口を足したもの。 */
export interface KgWorld extends ArtWorld {
  readonly lights: WorldLights;
  /** 手提灯の枠の数（番兵の数） */
  readonly lanternSlots: number;
  prime(on: boolean): void;
  /** 画面の高さ（画素）。火の粉の点の大きさに使う */
  setViewportHeight(px: number): void;
}

const worlds = new WeakMap<Scene, KgWorld>();
const posts = new WeakMap<Scene, KgPost>();

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  return makeRenderer(canvas);
}

/** 炎上の炎・煙・火の粉の置き場所。書院の屋根から（0.05）書院全体（0.4）、本堂へ（0.6）、大火（1）。 */
function fireSpread(lines: FireLines[], stage: StageDef, flames: FlameDef[], smokes: SmokeDef[], sparks: SparkDef[]): { pos: Vector3; from: number; to: number }[] {
  const r = rng(77);
  const shoin = lines.find((l) => l.id === 'shoin');
  const hondo = lines.find((l) => l.id === 'hondo');
  const places: { pos: Vector3; from: number; to: number }[] = [];
  // r02-fix-visual: 指摘「同じ形の炎の板が棟に沿って櫛の歯のように並ぶ」 棟と軒の等間隔の点（13＋26）に1枚ずつ置くのをやめ、
  // 棟の上の乱数の位置に「大きな主の炎＋小さな脇の炎」の群れを置き、屋根の面と軒にはまばらに低い炎を足す（枚数 約120→約45）。
  // 大きさは対数正規に近いばらつき（0.55〜1.8 倍）。形の種類は種から選ぶ（fire.ts）
  const along = (pts: V3[], s: number): V3 => {
    const f = Math.min(pts.length - 1.0001, Math.max(0, s * (pts.length - 1)));
    const i = Math.floor(f);
    const k = f - i;
    const a = pts[i];
    const b = pts[i + 1];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  };
  const spread = (l: FireLines, ign: V3, from: number, to: number, scale: number, clusters: number): void => {
    const n = l.ridge.length;
    const eavesA = l.eaves.slice(0, n);
    const eavesB = l.eaves.slice(n, n * 2);
    const ends = [...l.ridge, ...l.eaves];
    const maxD = Math.max(...ends.map((p) => Math.hypot(p[0] - ign[0], p[2] - ign[2]))) || 1;
    const when = (p: V3, lag: number): number => from + (to - from) * (Math.hypot(p[0] - ign[0], p[2] - ign[2]) / maxD) + (r() - 0.5) * 0.05 + lag;
    const size = (): number => Math.exp((r() - 0.5) * 1.2);
    // 燃え始めの点には、最初から大きな炎の塊（遠目にも火が出たと分かる）
    for (let k = 0; k < 3; k++) {
      flames.push({ base: [ign[0] + (r() - 0.5) * 2.4, ign[1] - 0.3, ign[2] + (r() - 0.5) * 1.6], w: 2.5 * scale, h: 4.6 * scale, seed: r(), from: from + 0.006 * k, kind: 1 });
    }
    // 棟に沿って途切れない低い火の帯（形の種類 3＝低く這う炎だけ。尖った炎はこの帯から立ち上がる）
    const lowSeed = (): number => {
      for (;;) {
        const sd = r();
        if (Math.floor(((sd * 4.731) % 1) * 4) === 3) return sd;
      }
    };
    const ridgeLen = Math.hypot(l.ridge[n - 1][0] - l.ridge[0][0], l.ridge[n - 1][2] - l.ridge[0][2]);
    const nBand = Math.max(4, Math.round(ridgeLen / 1.5));
    for (let k = 0; k < nBand; k++) {
      const p = along(l.ridge, (k + 0.2 + r() * 0.6) / nBand);
      flames.push({ base: [p[0] + (r() - 0.5) * 0.6, p[1] - 0.35, p[2] + (r() - 0.5) * 0.6], w: 2.8 * scale * (0.9 + r() * 0.4), h: 3.6 * scale * (0.8 + r() * 0.5), seed: lowSeed(), from: when(p, 0.01), kind: 1 });
    }
    // 棟の群れ：位置は区間ごとの乱数（等間隔にしない）。主の炎は大きく、脇の炎は小さく前後へずらす
    for (let c = 0; c < clusters; c++) {
      const s = (c + 0.5 + (r() - 0.5) * 0.85) / clusters;
      const p = along(l.ridge, s);
      const f = when(p, 0);
      const big = size() * 1.45;
      flames.push({ base: [p[0] + (r() - 0.5) * 0.8, p[1] - 0.4 - r() * 0.3, p[2] + (r() - 0.5) * 0.8], w: 2.2 * scale * big, h: 4.3 * scale * big, seed: r(), from: f, kind: 1 });
      const sat = 2 + Math.floor(r() * 2.2);
      for (let k = 0; k < sat; k++) {
        const b2 = size() * 0.78;
        flames.push({ base: [p[0] + (r() - 0.5) * 2.8, p[1] - 0.5 - r() * 0.4, p[2] + (r() - 0.5) * 2.2], w: 2.0 * scale * b2, h: 3.6 * scale * b2, seed: r(), from: f + 0.02 + r() * 0.04, kind: 1 });
      }
      // 煙の柱：種の違う塊を3つ（上がる位相がずれ、切れ目のない柱になる）
      for (let k = 0; k < 3; k++) {
        smokes.push({ base: [p[0] + (r() - 0.5) * 1.5, p[1] + 1.0 + k * 0.4, p[2] + (r() - 0.5) * 1.5], size: (8.5 + r() * 6) * scale, rise: 32 + r() * 10, seed: r(), from: f + 0.01 * k, density: 0.85 });
      }
      sparks.push({ base: [p[0], p[1] + 0.6, p[2]], spread: 2.4 * scale, rise: 20 + r() * 8, seed: r(), from: f, count: 22 + Math.floor(r() * 12) });
    }
    // 屋根の面（棟から軒への 15〜55%）と軒：まばらで低い炎（燃え移りの遅れ）
    for (const eav of [eavesA, eavesB]) {
      for (let k = 0; k < 7; k++) {
        const s = r();
        const rp = along(l.ridge, s);
        const e = along(eav, s);
        const u = 0.15 + r() * 0.4;
        const p: V3 = [rp[0] + (e[0] - rp[0]) * u, rp[1] + (e[1] - rp[1]) * u, rp[2] + (e[2] - rp[2]) * u];
        const b2 = size() * 0.85;
        flames.push({ base: [p[0], p[1] - 0.3, p[2]], w: 2.2 * scale * b2, h: 3.4 * scale * b2, seed: r(), from: when(p, 0.04), kind: 1 });
      }
      for (let k = 0; k < 5; k++) {
        const p = along(eav, r());
        const b2 = size() * 0.75;
        flames.push({ base: [p[0], p[1] - 0.25, p[2]], w: 2.0 * scale * b2, h: 3.0 * scale * b2, seed: r(), from: when(p, 0.07), kind: 1 });
        if (r() < 0.35) smokes.push({ base: [p[0], p[1] + 0.5, p[2]], size: (5 + r() * 3) * scale, rise: 12, seed: r(), from: when(p, 0.09), density: 0.6 });
      }
    }
  };
  if (shoin) {
    const ign = shoin.ridge[Math.floor(shoin.ridge.length * 0.4)];
    spread(shoin, ign, 0.05, 0.38, 1, 7);
    const f = stage.buildings.find((b) => b.id === 'shoin')?.footprint;
    if (f) {
      BURN_UNIFORMS.uKgBurnRect.value[0].set(f.x0 - 2, f.z0 - 2, f.x1 + 2, f.z1 + 2.2);
      BURN_UNIFORMS.uKgBurnSpan.value[0].set(0.05, 0.4, ign[0], ign[2]);
    }
    // 書院の正面（障子）から噴き出す炎
    const def = stage.buildings.find((b) => b.id === 'shoin');
    if (def) {
      // r02-fix-visual: 1.6m おきの等間隔 → 乱数の間隔（1.1〜2.9m）と大きさ
      for (let x = def.footprint.x0 + 0.8 + r(); x < def.footprint.x1 - 0.5; x += 1.1 + r() * 1.8) {
        const d = Math.abs(x - ign[0]) / (def.footprint.x1 - def.footprint.x0);
        const b2 = Math.exp((r() - 0.5) * 0.9);
        flames.push({ base: [x, 0.7, def.footprint.z1 - 0.9 + (r() - 0.5) * 0.4], w: (1.3 + r() * 0.5) * b2, h: (2.6 + r() * 1.0) * b2, seed: r(), from: 0.22 + 0.18 * d, kind: 1 });
      }
    }
    places.push({ pos: new Vector3(ign[0], ign[1] + 1.5, ign[2]), from: 0.05, to: 0.38 });
    places.push({ pos: new Vector3(shoin.center[0], 2.4, (def?.footprint.z1 ?? shoin.center[2]) + 1.5), from: 0.2, to: 0.45 });
  }
  if (hondo) {
    const north = hondo.eaves.reduce((best, p) => (p[2] < best[2] ? p : best), hondo.eaves[0]);
    spread(hondo, [hondo.center[0], 0, north[2]], 0.6, 0.92, 1.25, 9);
    const f = stage.buildings.find((b) => b.id === 'hondo')?.footprint;
    if (f) {
      BURN_UNIFORMS.uKgBurnRect.value[1].set(f.x0 - 2.5, f.z0 - 2.5, f.x1 + 2.5, f.z1 + 2.5);
      BURN_UNIFORMS.uKgBurnSpan.value[1].set(0.6, 0.95, hondo.center[0], north[2]);
    }
    places.push({ pos: new Vector3(hondo.center[0], hondo.topY - 1, hondo.center[2]), from: 0.6, to: 0.95 });
  }
  return places;
}

/** 町屋の屋根の寸法の幅（town.ts と同じ値の範囲）。 */
const TOWN_ROOF = { eaveMin: 5.1, eaveMax: 5.85, riseMax: 2.4 };

/**
 * 建物を、カメラが中に入ったら薄くする箱にする（屋根の張り出しまで）。r03-fix-visual: 屋根の面の高さを持たせる。
 * 屋根は棟の軸に直角の向きに、外形から約 1.6m 張り出す（buildings.ts の roofSpecFor の over.b）。面は軒から棟へまっすぐ上がると見る
 * （本当の屋根は反りでそれより低いので、見積もりは「中にいる」側に寄る）。
 */
function buildingBox(b: StageDef['buildings'][number]): InsideBox {
  const f = b.footprint;
  const alongX = b.ridgeAxis === 'x';
  const c = alongX ? (f.z0 + f.z1) / 2 : (f.x0 + f.x1) / 2;
  const half = (alongX ? f.z1 - f.z0 : f.x1 - f.x0) / 2 + 1.6;
  const top = b.ridgeHeight - 0.6;
  return {
    x0: f.x0 - 2,
    z0: f.z0 - 2,
    x1: f.x1 + 2,
    z1: f.z1 + 2,
    y0: 0.5,
    y1: b.ridgeHeight + 1.2,
    roofY: (x: number, z: number): number => {
      const q = Math.abs((alongX ? z : x) - c);
      return b.eaveHeight + (top - b.eaveHeight) * Math.max(0, 1 - q / half);
    },
  };
}

/**
 * 町屋の列（town の壁ごと）を、カメラが中に入ったら薄くする箱にする（r01-integrate）。
 * 遊ぶカメラは通りでプレイヤーの後ろ 7〜11m・高さ 9〜13m に来るので、南の通りでは南の町屋の屋根の上や中に入り、
 * 画面が屋根で塞がっていた。家は壁の線から外へ最大 11m（＋軒 0.75m）、通りの側へ 0.5m（＋軒）。高さは棟の上 6m まで
 * （引いたカメラで屋根の上にいるときも抜く）。
 */
function townRowBoxes(stage: StageDef): InsideBox[] {
  const out: InsideBox[] = [];
  for (const w of stage.walls) {
    if (w.kind !== 'town') continue;
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    // 通りの側（town.ts の frame と同じ右手）
    const nx = -uz;
    const nz = ux;
    const pts: [number, number][] = [];
    for (const s of [-1.5, len + 1.5]) for (const k of [1.3, -12]) pts.push([w.a.x + ux * s + nx * k, w.a.z + uz * s + nz * k]);
    out.push({
      x0: Math.min(...pts.map((p) => p[0])),
      z0: Math.min(...pts.map((p) => p[1])),
      x1: Math.max(...pts.map((p) => p[0])),
      z1: Math.max(...pts.map((p) => p[1])),
      y0: 0.5,
      y1: w.height + 0.35 + 2.4 + 6,
      // r03-fix-visual: 屋根の上のカメラには幕を掛けない。家ごとの寸法（town.ts：表 0.5、奥行き 4.5〜11m、軒 5.1〜5.85m、
      // 棟の上がり 1.5〜2.4m、張り出し 0.75m）の中で、いちばん高くなる屋根の面を返す（中にいる側へ寄せた見積もり）
      roofY: (x: number, z: number): number => {
        const k = (x - w.a.x) * nx + (z - w.a.z) * nz;
        if (k > 1.25 || k < -11.25) return TOWN_ROOF.eaveMin;
        const q = Math.abs(k - Math.min(-1.75, Math.max(-5.0, k)));
        return TOWN_ROOF.eaveMax + TOWN_ROOF.riseMax * Math.max(0, 1 - q / 6.25) + 0.25;
      },
    });
  }
  return out;
}

export function buildWorld(scene: Scene, renderer: WebGLRenderer, stage: StageDef): KgWorld {
  installGameLightCurve();
  // r08-world: 写真の質感を読み始める（形を組む間に読み込みを進める。終わるまでは写真なしで描ける）
  void loadPhotoTextures(renderer);
  const root = new Group();
  root.name = 'world';
  buildWorldMap(stage);

  const lights = new WorldLights(stage);
  root.add(lights.group);

  const sky = createSkyDome();
  root.add(sky);
  const env: Texture = bakeSkyEnvironment(renderer, sky);
  scene.environment = env;
  scene.environmentIntensity = AMBIENT.envIntensity;
  scene.background = null;

  root.add(createGround(stage));

  const lamps = new LampState(stage);
  const mats: WorldMaterials = createWorldMaterials(lamps);
  const bd: Builders = {
    wood: new MeshBuilder(),
    woodLow: new MeshBuilder(),
    plaster: new MeshBuilder(),
    tile: new MeshBuilder(),
    stone: new MeshBuilder(),
    stoneLow: new MeshBuilder(),
    glow: new MeshBuilder(),
    iron: new MeshBuilder(),
  };
  const bark = new MeshBuilder();

  const fireLines = buildBuildings(bd, stage);
  // カメラが中に入ったら薄くする建物の箱（屋根の張り出しまで。鐘楼は柱だけなので外す）
  setInsideBoxes([
    ...stage.buildings
      .filter((b) => !b.open)
      .map((b) => buildingBox(b)),
    ...townRowBoxes(stage),
  ]);
  buildWalls(bd, stage);
  buildTown(bd, stage);
  const fx = buildProps(bd, stage);
  const pond = buildPond(bd, stage);
  const plants = buildPlants(stage, bark, mats);
  const outside = buildOutside(bd, stage);
  const far = buildFarTown(stage);
  const details = buildDetails(bd, stage, mats.grass);
  const interactions = buildInteractions(stage, mats);
  root.add(interactions.root);

  const flames: FlameDef[] = [...fx.flames, ...outside.flames];
  const smokes: SmokeDef[] = [...fx.smokes, ...outside.smokes];
  const sparks: SparkDef[] = [...fx.sparks];
  lights.firePlaces = fireSpread(fireLines, stage, flames, smokes, sparks);
  const fire = new FireSystem(flames, smokes, sparks);

  const statics: [MeshBuilder, keyof WorldMaterials, string][] = [
    [bd.wood, 'wood', 'wood'],
    [bd.woodLow, 'woodLow', 'woodLow'],
    [bd.plaster, 'plaster', 'plaster'],
    [bd.tile, 'tile', 'tile'],
    [bd.stone, 'stone', 'stone'],
    [bd.stoneLow, 'stoneLow', 'stoneLow'],
    [bd.glow, 'glow', 'glow'],
    [bd.iron, 'iron', 'iron'],
    [bark, 'bark', 'bark'],
  ];
  for (const [b, m, name] of statics) {
    if (b.vertexCount === 0) continue;
    const mesh = new Mesh(b.build(), mats[m]);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  for (const m of plants.meshes) root.add(m);
  if (pond) root.add(pond.mesh);
  root.add(outside.glows, outside.halos, outside.jinmaku, outside.soldiers, outside.banners, far.mesh, details.weeds, details.fireflies);
  if (details.mosen) root.add(details.mosen);
  if (details.trickle) root.add(details.trickle);
  root.add(fire.flames, fire.smoke, fire.sparks);

  scene.add(root);
  const world: KgWorld = {
    root,
    lights,
    lanternSlots: lights.lanternSlots,
    setInteractions(items, disabledLights): void {
      interactions.set(items);
      lamps.setDisabled(disabledLights);
      lights.setDisabledLights(disabledLights);
    },
    update(_dt: number, t: number): void {
      SKY_UNIFORMS.uKgTime.value = t;
      SKY_UNIFORMS.uKgMist.value.w = t * 0.12;
      lights.update(t);
      pond?.update(lights.fires);
    },
    setMovingLights(ls: readonly MovingLight[]): void {
      lights.setMovingLights(ls);
    },
    setFire(progress: number): void {
      const k = Math.min(1, Math.max(0, progress));
      lights.setFire(k);
      fire.setFire(k);
      BURN_UNIFORMS.uKgBurn.value.x = k;
    },
    updateForCamera(camera: PerspectiveCamera): void {
      lights.updateForCamera(camera);
    },
    prime(on: boolean): void {
      fire.prime(on);
    },
    setViewportHeight(px: number): void {
      fire.setViewportHeight(px);
      details.setViewportHeight(px);
    },
    dispose(): void {
      lights.dispose();
      lamps.dispose();
      env.dispose();
      root.traverse((o) => {
        const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
        m.geometry?.dispose();
        if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
        else m.material?.dispose();
      });
      scene.remove(root);
      if (scene.environment === env) scene.environment = null;
      worlds.delete(scene);
    },
  };
  worlds.set(scene, world);
  return world;
}

export function createPost(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): KgPost {
  const post = createPostChain(renderer, scene, camera);
  posts.set(scene, post);
  return post;
}

export function createSeeThrough(): ArtSeeThrough {
  return makeSeeThrough();
}

/**
 * シェーダーを先に作っておく（遊びの途中で1秒止まるのを防ぐ）。ふだん描かない物（炎上の炎・煙・火の粉）もいったん描く数にし、
 * 全材質を並列にコンパイルしてから、影と後処理を含めて1コマ描く。写真の質感（r08-world）の読み込みも、ここで待つ。
 */
export async function warmUp(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): Promise<void> {
  const world = worlds.get(scene);
  const post = posts.get(scene);
  // r08-world: 写真の質感の読み込みを待つ（撮影は写真の入った絵で撮る。読めなければ上限で写真なしのまま進む）
  await photoTexturesReady();
  world?.prime(true);
  try {
    await renderer.compileAsync(scene, camera);
    if (post) post.render(1 / 60);
    else renderer.render(scene, camera);
  } finally {
    world?.prime(false);
  }
}
