// 骨格を木として描く。卓と鉢は diorama（担当C）に任せ、ここは木・光・カメラ・写真を持つ。
// 環境の映り込みは鉢の釉と針金だけ。scene.environment を置くと幹と葉まで金属になる。
import { cameraOffset, createCameraRig, skeletonBounds, worldPerPixel } from './camera-math.js';
import { MAX_NODES, MAX_PADS } from './contract.js';
import { createDiorama } from './diorama.js';
import { GROW_SECONDS, buildTreeBuffers, growthArray } from './tree-mesh.js';
import { WIRE_MAX_EXPANSION, buildWireBuffers, createWireMaterial, wireRadiusOffset } from './wire-mesh.js';
import { barkBumpScale, createBarkTextures } from './textures-tree.js';
import { createLeafTextures } from './leaf-atlas.js';
import {
  PAD_FLAT, applyLookColors, cardScale, composeInstanceMatrix, createCoreMesh, leafCardGeometry, planFoliage,
  visibleCardCount, writeCoreInstances,
} from './foliage.js';
import { createStage } from './stage.js';
import { captureFrame } from './capture.js';
import { GFX_TIERS } from './gfx.js';

const FOV = 30;
const HIGHLIGHT_COLOR = { cut: 0xe0482f, bend: 0x2f6fa3, pinch: 0xe8b030, select: 0xfff2c0 };
const highlightColor = (tone) => HIGHLIGHT_COLOR[tone] ?? HIGHLIGHT_COLOR.select;
// 葉の塊にかぶせる殻は、紅葉の赤の上でも松の緑の上でも見えるよう、足し合わせて明るくなる淡い色にする
// （朱の殻は、赤い葉に埋もれて見えなかった＝採点役2人が指摘した）。管の色は、これまでどおり tone の色。
const SHELL_COLOR = { cut: 0xfff0c0, bend: 0xcfe8ff, pinch: 0xffe070, select: 0xffffff };
const shellColor = (tone) => SHELL_COLOR[tone] ?? SHELL_COLOR.select;
const SHELL_OPACITY = 0.6;
const SHELL_SCALE = 1.18; // 葉の外へ少しはみ出して、塊の輪郭ごと光らせる

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

function geometry(THREE, position, normal, uv, color, index) {
  const geo = new THREE.BufferGeometry();
  const attr = (array, size) => new THREE.BufferAttribute(array, size);
  if (position?.length) geo.setAttribute('position', attr(position, 3));
  if (normal?.length) geo.setAttribute('normal', attr(normal, 3));
  if (uv?.length) geo.setAttribute('uv', attr(uv, 2));
  if (color?.length) geo.setAttribute('color', attr(color, 3));
  if (index?.length) geo.setIndex(attr(index, 1));
  if (position?.length) geo.computeBoundingSphere();
  return geo;
}

function normalizeLook(look) {
  const color = Array.isArray(look?.color) ? look.color.slice(0, 3) : [0.85, 0.27, 0.16];
  const color2 = Array.isArray(look?.color2) ? look.color2.slice(0, 3) : color.slice();
  return {
    coverage: look?.coverage ?? 1,
    flower: look?.flower ?? 0,
    bud: look?.bud ?? 0,
    leafAge: look?.leafAge ?? 0.5,
    fall: look?.fall ?? 0,
    petal: look?.petal ?? 0,
    color,
    color2,
    season: look?.season || 'autumn',
  };
}

function blendLook(a, b, t) {
  const k = smooth(t);
  return normalizeLook({
    coverage: lerp(a.coverage, b.coverage, k),
    flower: lerp(a.flower, b.flower, k),
    bud: lerp(a.bud, b.bud, k),
    leafAge: lerp(a.leafAge, b.leafAge, k),
    fall: lerp(a.fall, b.fall, k),
    petal: lerp(a.petal, b.petal, k),
    color: a.color.map((v, i) => lerp(v, b.color[i], k)),
    color2: a.color2.map((v, i) => lerp(v, b.color2[i], k)),
    season: k < 0.5 ? a.season : b.season,
  });
}

export function createView3D(THREE, canvas, {
  gfx = 'high', reducedMotion = false, seed = 1, createCanvas, onContextLost, onFrame, deferTextures = false,
} = {}) {
  if (!THREE || typeof THREE.WebGLRenderer !== 'function') throw new Error('描画の入口を作れません');
  const tier = GFX_TIERS[gfx];
  const motion = tier.motion && !reducedMotion;
  const deferred = deferTextures && tier.motion;
  let prepared = !deferred;
  let preparation;
  let yieldTextures;
  let potVersion = 0;
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: tier.antialias, alpha: false, powerPreference: 'high-performance',
  });
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping || THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = tier.shadowSize > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.08, 140);
  const diorama = createDiorama(THREE, { gfx, seed, createCanvas, deferTextures: deferred });
  scene.add(diorama.group);
  const treeRoot = new THREE.Group();
  treeRoot.name = 'bonsai';
  diorama.treeAnchor.add(treeRoot);
  const highlightRoot = new THREE.Group();
  treeRoot.add(highlightRoot);
  const stage = createStage(THREE, scene, renderer, { gfx, seed, createCanvas, deferEnvironment: deferred });
  const wireExpansion = { value: 0 };
  const wireMat = createWireMaterial(THREE, wireExpansion);

  let disposed = false;
  let species = 'maple';
  let skel = null;
  let plan = null;
  let lookFrom = normalizeLook(null);
  let lookTo = lookFrom;
  let lookT = 1;
  const cameraRig = createCameraRig(FOV, place, motion);
  let stageBounds = frameStage();
  let growElapsed = GROW_SECONDS;
  let growAnimate = false;
  let treeBuffers = null;
  let highlight = null;
  let highlightMesh = null;
  let highlightPads = null;
  let pulseStart = null;
  let wasMoving = false;
  let contextLost = false;
  let viewW = 1;
  let viewH = 1;
  const marked = new Uint8Array(MAX_NODES);
  const padPose = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const padNormal = new THREE.Vector3();
  let leafMesh = null;
  let flowerMesh = null;
  let coreMesh = null; // FOLIAGE-CORE (B)
  let leafIndex = [];
  let flowerIndex = [];
  let cardGeo = null;
  let barkMat = null;
  let cutMat = null;
  let leafMat = null;
  let flowerMat = null;
  let highlightMat = null;
  let barkTex = null;
  let leafTex = null;
  let boundEnv = null;
  const drops = [];
  const stats = { triangles: 0, drawCalls: 0, cards: 0, fps: 0 };
  let raf = 0;
  let dirty = false;
  let lastTime = null;
  let movedCamera = false;
  let wasMovingCamera = false;

  function shownLook() {
    return lookT >= 1 ? lookTo : blendLook(lookFrom, lookTo, lookT);
  }

  function place(state) {
    wireExpansion.value = wireRadiusOffset(state.dist);
    const off = cameraOffset(state.az, state.pol, state.dist);
    camera.position.set(state.target[0] + off[0], state.target[1] + off[1], state.target[2] + off[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(state.target[0], state.target[1], state.target[2]);
    camera.updateMatrixWorld();
    // 大きな木への引きでも、奥の枝が遠クリップ面にかからないようにする。
    // 幅96の壁の奥の角まで切れないよう、遠くを切る距離を長めに取る（横長の画面で引いて斜めから見る場合）
    const far = Math.max(140, state.dist * 6);
    if (camera.far !== far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  function requestRender() {
    if (disposed || contextLost) return;
    dirty = true;
    // 質感が揃う前に描くと、描画のたびに別のシェーダーが必要になる。
    if (prepared && !raf) raf = requestAnimationFrame(tick);
  }

  function frameStage() {
    // 初回描画や鉢の交換より先に境界を読むので、鉢の親グループのずれも反映する。
    diorama.group.updateMatrixWorld(true);
    const pot = new THREE.Box3().setFromObject(diorama.group.getObjectByName('pot'));
    const table = new THREE.Box3().setFromObject(diorama.group.getObjectByName('table'));
    // 卓の手前は鉢の下に見える分を構図に含め、縦画面の幅は盆栽に使う。
    return [
      { min: pot.min.toArray(), max: pot.max.toArray() },
      {
        min: [pot.min.x, table.max.y - 0.25, table.max.z],
        max: [pot.max.x, table.max.y, table.max.z],
      },
    ];
  }

  const sceneBounds = () => [skeletonBounds(skel), ...stageBounds];

  function ensureMaterials() {
    if (barkMat) return;
    barkMat = new THREE.MeshStandardMaterial({
      bumpScale: barkBumpScale(species),
      roughness: species === 'pine' ? 0.94 : 0.84, metalness: 0, vertexColors: true,
    });
    cutMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0, vertexColors: true });
    const leafRough = species === 'pine' ? 0.55 : 0.76;
    leafMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, alphaTest: 0.45, side: THREE.DoubleSide,
      roughness: leafRough, metalness: 0,
    });
    flowerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, alphaTest: 0.4, side: THREE.DoubleSide,
      roughness: 0.45, metalness: 0,
    });
  }

  function loadBark() {
    ensureMaterials();
    if (barkTex) return;
    barkTex = createBarkTextures(THREE, species, { seed, gfx, createCanvas });
    barkMat.map = barkTex.map;
    barkMat.bumpMap = barkTex.bump;
    barkMat.needsUpdate = true;
  }

  function loadLeaves() {
    ensureMaterials();
    if (leafTex) return;
    leafTex = createLeafTextures(THREE, species, { gfx, createCanvas });
    leafMat.map = leafTex.leaf;
    flowerMat.map = leafTex.flower;
    leafMat.needsUpdate = flowerMat.needsUpdate = true;
  }

  function ensureTextures() {
    ensureMaterials();
    if (prepared) {
      loadBark();
      loadLeaves();
    }
  }

  async function runPreparationStage(name, work) {
    if (disposed || contextLost) return;
    await yieldTextures();
    if (disposed || contextLost) return;
    const mark = `bonsai:prepare:${name}`;
    performance.mark(`${mark}:start`);
    try {
      await work();
    } finally {
      performance.mark(`${mark}:end`);
    }
  }

  function prepare({ yieldToMain } = {}) {
    if (!deferred || disposed || contextLost) return Promise.resolve();
    if (preparation) return preparation;
    yieldTextures = yieldToMain ?? (() => new Promise((resolve) => setTimeout(resolve, 0)));
    preparation = (async () => {
      await diorama.prepare(runPreparationStage);
      // 鉢が準備中に交換された場合は、最後に選ばれた鉢の質感を揃える。
      await diorama.preparePot(runPreparationStage);
      let preparedPotVersion;
      do {
        await runPreparationStage('bark', loadBark);
        await runPreparationStage('leaves', loadLeaves);
        await runPreparationStage('environment', () => {
          stage.prepareEnvironment();
          refreshEnv();
        });
        if (typeof renderer.compileAsync === 'function') {
          await runPreparationStage('compile', () => renderer.compileAsync(scene, camera));
        }
        preparedPotVersion = potVersion;
        // 待機中に鉢や樹種が変わっても、古い組み合わせのまま準備を終えない。
        await diorama.preparePot(runPreparationStage);
      } while (!disposed && !contextLost && (!barkTex || !leafTex || preparedPotVersion !== potVersion));
      if (disposed || contextLost) return;
      prepared = true;
      requestRender();
    })();
    return preparation;
  }

  function refreshEnv() {
    const env = stage.envMap();
    if (env === boundEnv) return;
    boundEnv = env;
    wireMat.envMap = env;
    wireMat.needsUpdate = true;
    const pot = diorama.group.getObjectByName('pot');
    if (pot?.material && (pot.material.clearcoat || 0) > 0.2) {
      pot.material.envMap = env;
      pot.material.envMapIntensity = 0.9;
      pot.material.needsUpdate = true;
    }
  }

  function cardGeometry() {
    if (cardGeo) return cardGeo;
    const src = leafCardGeometry();
    cardGeo = geometry(THREE, src.positions, src.normals, src.uvs, null, src.indices);
    return cardGeo;
  }

  function writeCards(mesh, indices, look) {
    const array = mesh.instanceMatrix.array;
    for (let k = 0; k < indices.length; k += 1) {
      const i = indices[k];
      composeInstanceMatrix(
        plan.quat.subarray(i * 4, i * 4 + 4),
        plan.position.subarray(i * 3, i * 3 + 3),
        cardScale(plan, i, look),
        array,
        k * 16,
      );
      mesh.instanceColor.setXYZ(k, plan.color[i * 3], plan.color[i * 3 + 1], plan.color[i * 3 + 2]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.count = indices.length;
  }

  function makeCards(indices, material) {
    if (!indices.length) return null;
    const mesh = new THREE.InstancedMesh(cardGeometry(), material, indices.length);
    mesh.frustumCulled = false;
    // カードごとに影を落とすと葉の影が穴だらけになる。塊の影は芯が落とす。FOLIAGE-CORE (B)
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(indices.length * 3), 3);
    return mesh;
  }

  function clearTree() {
    for (const child of [...treeRoot.children]) {
      if (child === highlightRoot) continue;
      treeRoot.remove(child);
      if (child.geometry && child.geometry !== cardGeo) child.geometry.dispose();
      if (child.name === 'foliage-core') child.material?.dispose();
      if (child.isInstancedMesh) child.dispose();
    }
    if (highlightMesh) {
      highlightRoot.remove(highlightMesh);
      highlightMesh.geometry.dispose();
      highlightMesh = null;
    }
    treeBuffers = null;
    leafMesh = null;
    flowerMesh = null;
    coreMesh = null;
  }

  function makeHighlightMesh() {
    if (!highlightMat) {
      highlightMat = new THREE.MeshStandardMaterial({ roughness: 0.85, toneMapped: false });
    }
    const built = treeBuffers;
    const position = new Float32Array(built.position.length);
    // 枝の曲線と丸い先端を共有し、節の途中を選んでも樹皮が色の管からはみ出さないようにする。
    for (let v = 0; v < built.vertexCount; v += 1) {
      const r = built.selection.radius[v];
      const extra = Math.max(r * 0.25, 0.03 - r);
      for (let axis = 0; axis < 3; axis += 1) {
        const i = v * 3 + axis;
        position[i] = built.position[i] + built.normal[i] * extra;
      }
    }
    // 節を選び直すたびにGPUのバッファを作り直さず、描く三角形の添字だけを書き換える。
    const geo = geometry(THREE, position, built.normal, null, null, new Uint32Array(built.index.length));
    geo.index.setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(geo, highlightMat);
    mesh.name = 'highlight-branch';
    highlightRoot.add(mesh);
    return mesh;
  }

  function syncHighlightPads(look) {
    if (highlightPads) {
      highlightPads.count = 0;
      highlightPads.visible = false;
    }
    if (!highlight || !treeBuffers || look.coverage <= 0) return;
    const { pads } = skel;
    const shift = treeBuffers.nodeShift;
    for (let p = 0; p < pads.count; p += 1) {
      const node = pads.node[p];
      if (!marked[node] || pads.density[p] <= 0) continue;
      if (!highlightPads) {
        // 殻を1回の描画で重ねる。透明な面で、その奥の枝や葉を消さない。
        const mat = new THREE.MeshBasicMaterial({
          transparent: true, opacity: SHELL_OPACITY, depthWrite: false, toneMapped: false,
          blending: THREE.AdditiveBlending,
        });
        highlightPads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 8), mat, MAX_PADS);
        highlightPads.count = 0;
        highlightPads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        highlightPads.name = 'highlight-pads';
        highlightPads.frustumCulled = false;
        highlightPads.renderOrder = 2;
        highlightRoot.add(highlightPads);
      }
      const i = p * 3;
      const j = node * 3;
      const radius = pads.radius[p] * SHELL_SCALE;
      padPose.position.set(pads.center[i] + shift[j], pads.center[i + 1] + shift[j + 1], pads.center[i + 2] + shift[j + 2]);
      padNormal.fromArray(pads.normal, i).normalize();
      padPose.quaternion.setFromUnitVectors(up, padNormal);
      padPose.scale.set(radius, radius * PAD_FLAT, radius);
      padPose.updateMatrix();
      highlightPads.setMatrixAt(highlightPads.count, padPose.matrix);
      highlightPads.count += 1;
      if (highlight.tone === 'pinch') break;
    }
    if (highlightPads?.count) {
      highlightPads.material.color.setHex(shellColor(highlight.tone));
      highlightPads.instanceMatrix.needsUpdate = true;
      highlightPads.visible = true;
    }
  }

  function syncHighlight(look = shownLook()) {
    marked.fill(0);
    let count = 0;
    if (highlight && treeBuffers?.vertexCount) {
      const { index, selection } = treeBuffers;
      const sections = [selection.sides, selection.tips];
      for (const node of highlight.nodes) {
        if (!Number.isInteger(node) || node < 0 || node >= skel.count || marked[node]) continue;
        marked[node] = 1;
        const slot = node * 2;
        for (const ranges of sections) {
          const start = ranges[slot];
          const end = ranges[slot + 1];
          if (start === end) continue;
          highlightMesh ??= makeHighlightMesh();
          highlightMesh.geometry.index.array.set(index.subarray(start, end), count);
          count += end - start;
        }
      }
    }
    if (highlightMesh) {
      highlightMesh.visible = count > 0;
      const geo = highlightMesh.geometry;
      geo.setDrawRange(0, count);
      if (count) {
        const attr = geo.index;
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, count);
        attr.needsUpdate = true;
        highlightMat.color.setHex(highlightColor(highlight.tone));
        highlightMat.emissive.copy(highlightMat.color).multiplyScalar(0.45);
      }
    }
    if (!count) pulseStart = null;
    syncHighlightPads(look);
  }

  function rebuild() {
    if (!skel) {
      clearTree();
      plan = null;
      syncHighlight();
      return;
    }
    ensureTextures();
    const look = shownLook();
    const growth = growthArray(skel, {
      animate: growAnimate, reducedMotion: !motion, elapsed: growElapsed,
    });
    const built = buildTreeBuffers(skel, { growth, species, seed, selection: true });
    clearTree();
    treeBuffers = built;
    if (built.vertexCount) {
      const trunk = new THREE.Mesh(
        geometry(THREE, built.position, built.normal, built.uv, built.color, built.index),
        barkMat,
      );
      trunk.castShadow = tier.shadowSize > 0;
      trunk.receiveShadow = true;
      treeRoot.add(trunk);
    }
    if (built.cutCount) {
      const cut = new THREE.Mesh(
        geometry(THREE, built.cutPosition, built.cutNormal, null, built.cutColor, built.cutIndex),
        cutMat,
      );
      treeRoot.add(cut);
    }
    for (const wire of buildWireBuffers(skel)) {
      if (!wire.vertexCount) continue;
      const mesh = new THREE.Mesh(geometry(THREE, wire.position, wire.normal, null, null, wire.index), wireMat);
      mesh.name = 'branch-wire';
      mesh.geometry.boundingSphere.radius += WIRE_MAX_EXPANSION;
      treeRoot.add(mesh);
    }
    plan = planFoliage(skel, look, { gfx, species, nodeShift: built.nodeShift });
    applyLookColors(plan, look);
    leafIndex = [];
    flowerIndex = [];
    for (let i = 0; i < plan.count; i += 1) (plan.kind[i] === 1 ? flowerIndex : leafIndex).push(i);
    leafMesh = makeCards(leafIndex, leafMat);
    flowerMesh = makeCards(flowerIndex, flowerMat);
    if (leafMesh) {
      writeCards(leafMesh, leafIndex, look);
      treeRoot.add(leafMesh);
    }
    if (flowerMesh) {
      writeCards(flowerMesh, flowerIndex, look);
      treeRoot.add(flowerMesh);
    }
    // FOLIAGE-CORE (B): パッドの内側の扁平な芯。透けた穴と、カードの穴だらけの影を埋める。
    coreMesh = createCoreMesh(THREE, plan, { castShadow: tier.shadowSize > 0 });
    if (coreMesh) {
      writeCoreInstances(coreMesh, plan, look);
      treeRoot.add(coreMesh);
    }
    syncHighlight(look);
    refreshEnv();
  }

  function retint() {
    if (!plan) return;
    const look = shownLook();
    applyLookColors(plan, look);
    if (leafMesh) writeCards(leafMesh, leafIndex, look);
    if (flowerMesh) writeCards(flowerMesh, flowerIndex, look);
    if (coreMesh) writeCoreInstances(coreMesh, plan, look);
    diorama.setLook(look);
    syncHighlightPads(look);
  }

  function step(dt, now) {
    let moving = cameraRig.step(dt);
    if (lookT < 1) {
      lookT = Math.min(1, lookT + dt / 0.6);
      retint();
      moving = true;
    }
    if (growAnimate && growElapsed < GROW_SECONDS) {
      growElapsed += dt;
      rebuild();
      moving = true;
      if (growElapsed >= GROW_SECONDS) growAnimate = false;
    }
    if (highlightMesh?.visible && motion) {
      // フレーム間隔が伸びても、実時間で同じ0.9秒の明滅にする。
      pulseStart ??= now;
      const wave = Math.sin((now - pulseStart) * Math.PI * 2 / 900);
      highlightMat.emissiveIntensity = 0.825 + 0.175 * wave;
      if (highlightPads?.visible) highlightPads.material.opacity = SHELL_OPACITY * (0.8 + 0.2 * wave);
      moving = true;
    }
    for (let i = drops.length - 1; i >= 0; i -= 1) {
      const drop = drops[i];
      drop.t += dt;
      const k = Math.min(1, drop.t / 0.9);
      drop.mesh.position.y = -2.2 * k * k;
      drop.mesh.rotation.z = k * 1.1;
      drop.mesh.material.opacity = 1 - k;
      moving = true;
      if (k >= 1) {
        scene.remove(drop.mesh);
        drop.mesh.geometry.dispose();
        drop.mesh.material.dispose();
        drops.splice(i, 1);
      }
    }
    if (stage.update(dt, shownLook(), motion)) moving = true;
    diorama.update(dt);
    refreshEnv();
    return moving;
  }

  function tick(now) {
    raf = 0;
    if (disposed) return;
    const frameMs = lastTime === null ? 0 : now - lastTime;
    const dt = Math.min(0.05, frameMs / 1000);
    const cameraMoving = movedCamera;
    movedCamera = false;
    // 回転や慣性は操作側のフレームで進むので、連続した視点変更も拾う。
    const followsMotion = wasMoving || wasMovingCamera && cameraMoving;
    lastTime = now;
    const moving = step(dt, now);
    // 動きが止まった直後の1枚も描く。描かないと、最後に消えた粒や補間の最終の姿が、次の操作まで画面に残る
    if (dirty || moving || wasMoving) {
      renderer.render(scene, camera);
      stats.triangles = renderer.info.render.triangles;
      stats.drawCalls = renderer.info.render.calls;
      if (dt > 0) stats.fps = stats.fps ? stats.fps * 0.85 + (1 / dt) * 0.15 : 1 / dt;
      dirty = false;
    }
    wasMoving = moving;
    wasMovingCamera = cameraMoving;
    // 回転の次に確認だけのフレームを置き、操作の休止を描画間隔として数えない。
    if (moving || cameraMoving && onFrame) raf = requestAnimationFrame(tick);
    if (tier.motion && followsMotion && (moving || cameraMoving) && frameMs > 0 && !globalThis.document?.hidden) {
      onFrame?.(frameMs);
    }
  }

  const handleContextLost = (event) => {
    event.preventDefault();
    contextLost = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (typeof onContextLost === 'function') onContextLost(event);
  };
  canvas.addEventListener('webglcontextlost', handleContextLost);

  const view = {
    prepare,
    setSpecies(id) {
      const next = id || 'maple';
      if (next === species && barkMat) return;
      species = next;
      barkMat?.map?.dispose();
      barkMat?.bumpMap?.dispose();
      barkMat?.dispose();
      cutMat?.dispose();
      leafMat?.map?.dispose();
      leafMat?.dispose();
      flowerMat?.map?.dispose();
      flowerMat?.dispose();
      barkMat = cutMat = leafMat = flowerMat = null;
      barkTex = leafTex = null;
      if (skel) rebuild();
      requestRender();
    },
    setSkeleton(next, { animate = false } = {}) {
      skel = next;
      // 生える節（fresh>0）が1つも無いときは、動かす意味が無い（毎フレーム木全体を作り直す無駄になる）
      growAnimate = !!(animate && motion && next?.fresh?.some((v) => v > 0));
      growElapsed = growAnimate ? 0 : GROW_SECONDS;
      rebuild();
      cameraRig.updateBounds(sceneBounds());
      requestRender();
    },
    setLook(next, { animate = false } = {}) {
      const safe = normalizeLook(next);
      if (!animate || !motion) {
        lookFrom = safe;
        lookTo = safe;
        lookT = 1;
      } else {
        lookFrom = shownLook();
        lookTo = safe;
        lookT = 0;
      }
      retint();
      requestRender();
    },
    setHighlight(value) {
      highlight = value && value.nodes && value.nodes.length ? value : null;
      syncHighlight();
      requestRender();
    },
    setPot(id) {
      diorama.setPot(id);
      potVersion += 1;
      if (prepared && deferred) {
        // すぐに鉢の形を描き、交換の質感が揃ったらもう一度描く。
        void diorama.preparePot(runPreparationStage).then(requestRender, () => {
          // 質感を作れないときは、先に描いた地の色で盆栽を表示し続ける。
        });
      }
      stageBounds = frameStage();
      if (skel) cameraRig.updateBounds(sceneBounds());
      boundEnv = null;
      refreshEnv();
      requestRender();
    },
    setLight(id) {
      stage.setLight(id, { animate: motion && prepared });
      requestRender();
    },
    setMoisture(m) {
      diorama.setMoisture(m);
      requestRender();
    },
    dropBranch(oldSkel, removed) {
      if (!motion || !oldSkel || !removed) return;
      const only = new Uint8Array(oldSkel.count);
      for (let i = 0; i < removed.length; i += 1) {
        const index = removed[i];
        if (index >= 0 && index < oldSkel.count) only[index] = 1;
      }
      ensureTextures();
      const built = buildTreeBuffers(oldSkel, { only, nebari: false, species, seed });
      if (!built.vertexCount) return;
      const mat = barkMat.clone();
      mat.transparent = true;
      const mesh = new THREE.Mesh(geometry(THREE, built.position, built.normal, built.uv, built.color, built.index), mat);
      scene.add(mesh);
      drops.push({ mesh, t: 0 });
      requestRender();
    },
    burst(kind, point) {
      stage.burst(kind, point, motion);
      requestRender();
    },
    camera: {
      get: cameraRig.get,
      isManual: cameraRig.isManual,
      distanceLimits: cameraRig.distanceLimits,
      set(partial, opts) {
        const before = onFrame && prepared ? cameraRig.get() : null;
        if (!cameraRig.set(partial, opts)) return;
        if (before) {
          const after = cameraRig.get();
          movedCamera ||= before.az !== after.az || before.pol !== after.pol || before.dist !== after.dist
            || before.target.some((value, i) => value !== after.target[i]);
        }
        requestRender();
      },
      reset(opts) {
        cameraRig.reset(opts);
        requestRender();
      },
      pickRay(clientX, clientY) {
        const box = canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((clientX - box.left) / Math.max(1, box.width)) * 2 - 1,
          -((clientY - box.top) / Math.max(1, box.height)) * 2 + 1,
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, camera);
        return { origin: ray.ray.origin.toArray(), dir: ray.ray.direction.toArray() };
      },
      pxToWorld: (distance) => worldPerPixel(FOV, canvas.clientHeight || 1, distance),
      project(point) {
        const v = new THREE.Vector3(point[0], point[1], point[2]).project(camera);
        const box = canvas.getBoundingClientRect();
        return {
          x: box.left + (v.x + 1) * 0.5 * box.width,
          y: box.top + (1 - v.y) * 0.5 * box.height,
          visible: v.z >= -1 && v.z <= 1,
        };
      },
      fit(bounds, opts) {
        cameraRig.fit(bounds, opts);
        requestRender();
      },
    },
    requestRender,
    resize(cssW, cssH, dpr = 1) {
      const ratio = tier.dpr === 1 ? 1 : Math.min(Math.max(1, dpr), tier.dpr);
      // 数でない・負の寸法は受け付けず、直前の有効な寸法を保つ
      if (Number.isFinite(cssW) && cssW >= 1) viewW = cssW;
      if (Number.isFinite(cssH) && cssH >= 1) viewH = cssH;
      renderer.setPixelRatio(ratio);
      renderer.setSize(viewW, viewH, false);
      camera.aspect = viewW / viewH;
      camera.updateProjectionMatrix();
      cameraRig.resize(camera.aspect);
      requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener?.('webglcontextlost', handleContextLost);
      if (raf) cancelAnimationFrame(raf);
      for (const drop of drops) {
        scene.remove(drop.mesh);
        drop.mesh.geometry.dispose();
        drop.mesh.material.dispose();
      }
      drops.length = 0;
      clearTree();
      cardGeo?.dispose();
      barkMat?.map?.dispose();
      barkMat?.bumpMap?.dispose();
      barkMat?.dispose();
      cutMat?.dispose();
      wireMat.dispose();
      leafMat?.map?.dispose();
      leafMat?.dispose();
      flowerMat?.map?.dispose();
      flowerMat?.dispose();
      highlightMat?.dispose();
      if (highlightPads) {
        highlightRoot.remove(highlightPads);
        highlightPads.dispose();
        highlightPads.geometry.dispose();
        highlightPads.material.dispose();
      }
      stage.dispose();
      diorama.dispose();
      renderer.dispose();
    },
    capturePhoto(opts = {}) {
      const shot = captureFrame({
        THREE, renderer, scene, camera, pose: cameraRig.get(), applyPose: place, bounds: sceneBounds(),
        overlay: highlightRoot, width: opts.width, height: opts.height, caption: opts.caption, fov: FOV, createCanvas,
      });
      requestRender();
      return shot;
    },
    stats() {
      const look = shownLook();
      const leaves = plan ? visibleCardCount(plan, look.coverage) : 0;
      const flowers = plan ? visibleCardCount(plan, look.coverage, { flower: look.flower, kind: 1 }) : 0;
      return { triangles: stats.triangles, drawCalls: stats.drawCalls, cards: leaves + flowers, fps: stats.fps };
    },
  };

  stage.setLight('noon', { animate: false });
  refreshEnv();
  return view;
}
