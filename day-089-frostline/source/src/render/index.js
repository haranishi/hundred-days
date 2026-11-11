// 山の描画の入口。器（game-shell）の view の形を満たし、滑走者や雪煙（ride-feedback）が系を足せる口を持つ。
import * as THREE from 'three/webgpu';
import { createRenderer } from './renderer.js';
import { tierByName } from './tiers.js';
import { createTerrainTextures } from './terrain/textures.js';
import { createHeightNode } from './terrain/height-node.js';
import { createTerrain } from './terrain/terrain.js';
import { createSky } from './sky.js';
import { createDebugCamera } from './debug-camera.js';
import { createScatter } from './objects/scatter.js';
import { createBackdrop } from './backdrop.js';
import { loadProps, propShapes, createStructures } from './objects/props.js';
import { createFarForest } from './objects/far-forest.js';

/** 木を 1 本ずつ出し入れする範囲（m）。遠くの森の部品があるとき、この外は軽い形で描く */
const NEAR_TREES = 520;
/** 遠くの森の、描く本数の割合（画質の段ごと）。低い段では描かない（森は、雪面の色で表す）。山ぜんたいで 4 万本近くあり、スマホには重い */
const FAR_FOREST_DETAIL = { high: 1, mid: 0.5, low: 0 };

/**
 * @param {{forceWebGL?:boolean}} options
 */
export function createMountainView(options = {}) {
  let gfx = null;
  let scene = null;
  let camera = null;
  let world = null;
  let tier = null;
  let textures = null;
  let terrain = null;
  let sky = null;
  let scatter = null;
  let farForest = null; // 山ぜんたいの木を、軽い形で描く（形のデータが読めたときだけ）
  let backdrop = null;
  let props = null; // 建物・橋・リフト・針葉樹・岩の形（読めなければ null。手続きの形で続ける）
  let structures = null;
  let debugCamera = null;
  let cameraController = null;
  let trailSource = null;
  let heightNode = null;
  let lastSize = null;
  let rebuilding = false; // 段の作り直しの間は描かない（半分だけ出来た物を描くと落ちる）
  let wantedTier = null;
  const systems = [];
  const stats = { frame: 0, nodes: 0, drawCalls: 0, triangles: 0 };

  const view = {
    context: null,
    stats,

    async init({ canvasHost, world: w, tier: tierName }) {
      world = w;
      tier = tierByName(tierName);
      gfx = await createRenderer({ canvasHost, tier, forceWebGL: options.forceWebGL === true });
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 60000);
      textures = createTerrainTextures(world, tier);
      const heightAt = createHeightNode(textures, world.meta);
      heightNode = heightAt;
      wantedTier = tier.name;
      terrain = createTerrain({ world, tier, textures, heightAt });
      scene.add(terrain.mesh);
      sky = createSky({ renderer: gfx.renderer, scene, world, tier, textures, tune: options.tune || {} });
      try { props = await loadProps(); } catch (error) { console.warn(`${error?.message ?? error}。手続きの形で続けます`); }
      scatter = createScatter({ scene, world, tier, shapes: props ? propShapes(props) : null, radius: props ? NEAR_TREES : undefined });
      // 遠くの森（段が変わっても作り直さない）。木の位置を集めるのに 1〜2 秒かかるので、ここ（読み込みの間）で済ませる
      if (props) {
        farForest = createFarForest({ scene, world, shapes: propShapes(props).tree.map((lods) => lods[2]), fadeStart: NEAR_TREES - 110, fadeEnd: NEAR_TREES - 60 });
        farForest.setDetail(FAR_FOREST_DETAIL[tier.name] ?? 1);
        await farForest.build();
      }
      // 集落とリフト・地図の外の山並み（段が変わっても作り直さない。形も色も段に関係ない）
      structures = createStructures({ scene, world, props });
      backdrop = createBackdrop({ scene, world, textures });
      gfx.buildPipeline(scene, camera);
      debugCamera = createDebugCamera(camera, gfx.canvas, world);
      const d = world.drops?.[0];
      if (d) debugCamera.set({ x: d.x, z: d.z, above: 2.2, yaw: d.heading, pitch: -0.22 });
      else debugCamera.set({ x: 0, z: 0, above: 30 });
      view.context = {
        renderer: gfx.renderer, backend: gfx.backend, errors: gfx.errors, scene, camera, world, tier, motionBlur: gfx.motionBlurAmount,
        sun: { dir: sky.sunDir, color: sky.sunColor, light: sky.sun },
        heightNode: heightAt, textures, debugCamera, sky, terrain, scatter,
      };
      for (const s of systems) await s.init?.(view.context);
      // 滑走中に初めて映るもので固まらないよう、使う描画の準備を先に済ませる
      camera.updateMatrixWorld();
      scatter.prewarm(camera.position.x, camera.position.z);
      scatter.update(camera, gfx.renderer, 20);
      terrain.update(camera, gfx.renderer);
      await gfx.precompile();
      return view;
    },

    resize(width, height, devicePixelRatio) {
      if (!gfx) return;
      lastSize = [width, height, devicePixelRatio];
      gfx.resize(width, height, devicePixelRatio);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },

    /** @param {{frameDt:number, jumped?:boolean}} frame */
    render(frame = {}) {
      if (!gfx || rebuilding) return;
      for (const s of systems) s.update?.(frame, view.context);
      if (cameraController) cameraController.update(frame, camera, view.context);
      else debugCamera.update();
      terrain.update(camera, gfx.renderer);
      if (frame.manual) scatter.update(camera, gfx.renderer, Infinity, 6);
      else scatter.update(camera, gfx.renderer, 2);
      sky.update(camera, frame.frameDt);
      gfx.pipeline.render();
      stats.frame++;
      stats.nodes = terrain.stats.nodes;
      stats.objects = scatter.stats.instances;
      stats.farTrees = farForest?.stats.trees ?? 0;
      stats.objectBuildMs = scatter.stats.buildMs;
      const info = gfx.renderer.info.render;
      stats.drawCalls = info.drawCalls ?? info.calls ?? 0;
      stats.triangles = info.triangles ?? 0;
    },

    /**
     * 画質の段を切り替える。区画の格子・影の枚数・木を置く距離・後処理が段で変わるので、地形・空・木を作り直す。
     * 山の絵（テクスチャ）は段で変わらないので使い回す。作り直しの間（1 秒足らず）は前のコマが残る。
     * 続けて呼ばれたら、最後に頼まれた段だけを作る。
     */
    setTier(tierName) {
      wantedTier = tierByName(tierName).name;
      if (!gfx || rebuilding) return view.tierReady;
      view.tierReady = (async () => {
        rebuilding = true;
        try {
          while (wantedTier !== tier.name) {
            tier = tierByName(wantedTier);
            scene.remove(terrain.mesh);
            terrain.dispose();
            scatter.dispose();
            sky.dispose();
            gfx.setTier(tier);
            terrain = createTerrain({ world, tier, textures, heightAt: heightNode });
            scene.add(terrain.mesh);
            sky = createSky({ renderer: gfx.renderer, scene, world, tier, textures, tune: options.tune || {} });
            scatter = createScatter({ scene, world, tier, shapes: props ? propShapes(props) : null, radius: props ? NEAR_TREES : undefined });
            gfx.buildPipeline(scene, camera);
            if (lastSize) view.resize(...lastSize);
            Object.assign(view.context, { tier, sun: { dir: sky.sunDir, color: sky.sunColor, light: sky.sun }, sky, terrain, scatter });
            farForest?.setDetail(FAR_FOREST_DETAIL[tier.name] ?? 1);
            for (const s of systems) await s.onTier?.(view.context);
            camera.updateMatrixWorld();
            scatter.prewarm(camera.position.x, camera.position.z);
            scatter.update(camera, gfx.renderer, 20);
            terrain.update(camera, gfx.renderer);
            await gfx.precompile();
          }
        } finally { rebuilding = false; }
      })();
      return view.tierReady;
    },

    addSystem(system) {
      systems.push(system);
      if (view.context) system.init?.(view.context);
      return system;
    },
    setCameraController(controller) { cameraController = controller; },
    setTrailSource(source) { trailSource = source; view.trailSource = trailSource; },

    dispose() {
      for (const s of systems) s.dispose?.();
      debugCamera?.dispose();
      backdrop?.dispose();
      farForest?.dispose();
      structures?.dispose();
      scatter?.dispose();
      sky?.dispose();
      terrain?.dispose();
      textures?.dispose();
      gfx?.dispose();
      gfx = null;
    },
  };
  return view;
}
