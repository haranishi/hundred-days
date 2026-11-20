// 盆栽が載る舞台の下半分（3種の鉢・土・苔・石・木の卓・和紙の壁）を組み立てて管理する。
// 契約: .kiro/specs/day-095-bonsai/interfaces-view.md の「担当C」。

import { DEFAULTS, POT_IDS } from './contract.js';
import {
  POT_SPECS,
  TABLE_BRACKET_XS,
  TABLE_DEPTH,
  TABLE_WIDTH,
  TREE_OFFSET,
  WALL_HEIGHT,
  WALL_WIDTH,
  WALL_Z,
  buildMossGeometry,
  buildPotGeometry,
  buildSoilGeometry,
  buildStonesGeometry,
  buildTableGeometry,
  buildWallGeometry,
} from './diorama-geometry.js';
import {
  createMossTexture,
  createPotTexture,
  createSoilTexture,
  createTableTexture,
  createWallTexture,
} from './textures-stage.js';

export { POT_SPECS, TABLE_BRACKET_XS, TABLE_DEPTH, TABLE_WIDTH, TREE_OFFSET, WALL_HEIGHT, WALL_WIDTH, WALL_Z };

const WALL_BASE_HEX = '#efe6d4';
const TABLE_BASE_HEX = '#9a6b43';
// 実物の山苔に合わせたくすんだ深い緑（#3f5a2e〜#6b8a4c の中心トーン）
const MOSS_BASE_HEX = '#486035';
const STONE_BASE_HEX = '#736c64';

const SOIL_DRY_HEX = '#544336';
const SOIL_MID_HEX = '#3a2e25';
const SOIL_WET_HEX = '#201813';

// 季節ごとの壁・卓の微細な色味ターゲット（春＝淡い桃、夏＝淡い緑青、秋＝暖かい琥珀、冬＝冷たい灰）
const SEASON_TINTS = Object.freeze({
  spring: Object.freeze({ wall: '#fae4e4', table: '#a37049' }),
  summer: Object.freeze({ wall: '#e3f0ea', table: '#916d47' }),
  autumn: Object.freeze({ wall: '#f6e2c3', table: '#a56d3b' }),
  winter: Object.freeze({ wall: '#e4e6eb', table: '#8f6a4d' }),
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function normalizePotId(id) {
  return POT_IDS.includes(id) ? id : DEFAULTS.pot;
}

/**
 * 舞台（卓・鉢・土・苔・石・和紙の壁）を生成する。
 * @param {object} THREE - three.js モジュール
 * @param {object} [options]
 * @param {'high'|'mid'|'low'|'test'} [options.gfx='high']
 * @param {number} [options.seed=1]
 * @param {Function|null} [options.createCanvas]
 * @param {boolean} [options.deferTextures=false]
 */
export function createDiorama(THREE, { gfx = 'high', seed = 1, createCanvas, deferTextures = false } = {}) {
  if (!THREE || typeof THREE.Group !== 'function') {
    throw new Error('createDiorama: THREE モジュールが必要です');
  }

  let disposed = false;
  let currentPotId = DEFAULTS.pot;
  let currentMoisture = 0.5;
  let currentLook = { season: 'autumn', color: [0.85, 0.27, 0.16] };

  const group = new THREE.Group();
  group.name = 'diorama';

  // 木の根元を据える基準点（土の面の中心 y=0、世界原点）
  const treeAnchor = new THREE.Group();
  treeAnchor.name = 'treeAnchor';
  treeAnchor.position.set(0, 0, 0);
  group.add(treeAnchor);

  // 鉢の中心は treeAnchor から -info.treeOffset の位置（木が鉢の中央から少しずれて立つ）
  const potStageGroup = new THREE.Group();
  potStageGroup.name = 'potStage';
  potStageGroup.position.set(-TREE_OFFSET[0], -TREE_OFFSET[1], -TREE_OFFSET[2]);
  group.add(potStageGroup);

  const initialSpec = POT_SPECS[currentPotId];
  const info = {
    soilRadius: initialSpec.soilRadius,
    potTopY: initialSpec.potTopY,
    tableY: initialSpec.tableY,
    wallZ: WALL_Z,
    treeOffset: [TREE_OFFSET[0], TREE_OFFSET[1], TREE_OFFSET[2]],
  };

  // 鉢を交換しても同じ卓・壁・土・苔の質感を再利用する。
  const textureOptions = { gfx, seed, createCanvas };
  const sharedFactories = {
    table: createTableTexture, wall: createWallTexture, soil: createSoilTexture, moss: createMossTexture,
  };
  const sharedTextures = {};
  if (!deferTextures) {
    // 従来の同期生成の順序を保つ。
    for (const name of ['soil', 'moss', 'table', 'wall']) {
      sharedTextures[name] = sharedFactories[name](THREE, textureOptions);
    }
  }

  // 卓メッシュ（上面は常に info.tableY に合わせる）
  const tableGeometry = buildTableGeometry(THREE, { seed });
  const tableMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(TABLE_BASE_HEX),
    roughness: 0.52,
    metalness: 0.02,
    vertexColors: true,
    map: sharedTextures.table ?? null,
    bumpMap: sharedTextures.table ?? null, bumpScale: 0.008,
  });
  const tableMesh = new THREE.Mesh(tableGeometry, tableMaterial);
  tableMesh.name = 'table';
  tableMesh.position.set(0, info.tableY, 0);
  // 棚は木と鉢の影を受ける。VSMShadowMap は receiveShadow=true のメッシュも深度パスへ描くため、
  // 主光源（sun）の狭いシャドウカメラ境界（x≈-4.15）が棚下の壁に縦線として露出しないよう、深度パスへの書き込みを抑止する
  tableMesh.castShadow = false;
  tableMesh.receiveShadow = true;
  tableMesh.onBeforeShadow = (_renderer, _object, _camera, shadowCam, _geometry, depthMat) => {
    if (depthMat && (!shadowCam || shadowCam.far > 20)) {
      depthMat.colorWrite = false;
      depthMat.depthWrite = false;
    }
  };
  tableMesh.onAfterShadow = (_renderer, _object, _camera, _shadowCam, _geometry, depthMat) => {
    if (depthMat) {
      depthMat.colorWrite = true;
      depthMat.depthWrite = true;
    }
  };
  group.add(tableMesh);

  // 和紙の壁メッシュ（z = info.wallZ、幅96×高さ56で横長画面・回転・ズーム全域を端なくカバー。裏は不要）
  const wallGeometry = buildWallGeometry(THREE, { gfx });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(WALL_BASE_HEX),
    roughness: 0.94,
    metalness: 0.0,
    vertexColors: true,
    map: sharedTextures.wall ?? null,
    bumpMap: sharedTextures.wall ?? null, bumpScale: 0.005,
  });
  const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
  wallMesh.name = 'wall';
  wallMesh.position.set(0, 0, info.wallZ);
  wallMesh.castShadow = false;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // 鉢まわりの現在アクティブなリソース参照（setPot や dispose で確実に破棄するため）
  let activePotResources = null;

  function disposePotResources() {
    if (!activePotResources) return;
    const { meshes, geometries, materials, textures } = activePotResources;
    for (const mesh of meshes) {
      potStageGroup.remove(mesh);
    }
    for (const geom of geometries) {
      geom.dispose();
    }
    for (const mat of materials) {
      mat.dispose();
    }
    for (const tex of textures) {
      if (tex) tex.dispose();
    }
    activePotResources = null;
  }

  function applyMoistureToMaterial(soilMat, m) {
    if (!soilMat) return;
    const dry = new THREE.Color(SOIL_DRY_HEX);
    const mid = new THREE.Color(SOIL_MID_HEX);
    const wet = new THREE.Color(SOIL_WET_HEX);
    if (m <= 0.5) {
      soilMat.color.copy(dry).lerp(mid, m * 2);
    } else {
      soilMat.color.copy(mid).lerp(wet, (m - 0.5) * 2);
    }
    soilMat.roughness = 0.96 - 0.24 * m;
  }

  function buildPotStage(potId) {
    disposePotResources();
    const spec = POT_SPECS[potId];
    const PotMaterialCtor = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;

    const potTexture = deferTextures ? null : createPotTexture(THREE, potId, textureOptions);
    const potGeom = buildPotGeometry(THREE, potId, { gfx, seed });
    const potMatParams = {
      color: new THREE.Color(spec.color),
      roughness: spec.roughness,
      metalness: spec.metalness,
      vertexColors: true,
      map: potTexture, bumpMap: potTexture,
      bumpScale: potId === 'oval-brown' ? 0.022 : 0.006,
    };
    if (THREE.MeshPhysicalMaterial) {
      potMatParams.clearcoat = spec.clearcoat;
      potMatParams.clearcoatRoughness = spec.clearcoatRoughness;
      potMatParams.reflectivity = spec.clearcoat > 0.35 ? 0.58 : 0.42;
    }
    const potMat = new PotMaterialCtor(potMatParams);
    const potMesh = new THREE.Mesh(potGeom, potMat);
    potMesh.name = 'pot';
    potMesh.castShadow = true;
    potMesh.receiveShadow = true;

    const soilGeom = buildSoilGeometry(THREE, potId, { gfx, seed });
    const soilMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(SOIL_MID_HEX),
      roughness: 0.88,
      metalness: 0.0,
      vertexColors: true,
      map: sharedTextures.soil ?? null,
      bumpMap: sharedTextures.soil ?? null, bumpScale: 0.016,
    });
    applyMoistureToMaterial(soilMat, currentMoisture);
    const soilMesh = new THREE.Mesh(soilGeom, soilMat);
    soilMesh.name = 'soil';
    soilMesh.castShadow = false;
    soilMesh.receiveShadow = true;

    const mossGeom = buildMossGeometry(THREE, potId, { gfx, seed });
    const mossMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(MOSS_BASE_HEX),
      roughness: 0.95,
      metalness: 0.0,
      vertexColors: true,
      map: sharedTextures.moss ?? null,
      bumpMap: sharedTextures.moss ?? null, bumpScale: 0.022,
    });
    const mossMesh = new THREE.Mesh(mossGeom, mossMat);
    mossMesh.name = 'moss';
    mossMesh.castShadow = true;
    mossMesh.receiveShadow = true;

    const stonesGeom = buildStonesGeometry(THREE, potId, { gfx, seed });
    const stonesMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STONE_BASE_HEX),
      roughness: 0.84,
      metalness: 0.03,
      vertexColors: true,
    });
    const stonesMesh = new THREE.Mesh(stonesGeom, stonesMat);
    stonesMesh.name = 'stones';
    stonesMesh.castShadow = true;
    stonesMesh.receiveShadow = true;

    const meshes = [potMesh, soilMesh, mossMesh, stonesMesh];
    for (const mesh of meshes) {
      potStageGroup.add(mesh);
    }

    activePotResources = {
      potId,
      potMesh,
      soilMesh,
      mossMesh,
      stonesMesh,
      meshes,
      geometries: [potGeom, soilGeom, mossGeom, stonesGeom],
      materials: [potMat, soilMat, mossMat, stonesMat],
      textures: potTexture ? [potTexture] : [],
    };

    // info と卓の高さを現在の鉢に合わせて同期する
    info.soilRadius = spec.soilRadius;
    info.potTopY = spec.potTopY;
    info.tableY = spec.tableY;
    info.wallZ = WALL_Z;
    info.treeOffset[0] = TREE_OFFSET[0];
    info.treeOffset[1] = TREE_OFFSET[1];
    info.treeOffset[2] = TREE_OFFSET[2];
    tableMesh.position.y = info.tableY;
  }

  function setPot(id) {
    if (disposed) return;
    const next = normalizePotId(id);
    // 同じ鉢をもう一度指定されたときは作り直さない（起動の直後の重複で、鉢・土・苔・質感を破棄して作り直す約330msの無駄があった）
    if (activePotResources && next === currentPotId) return;
    currentPotId = next;
    buildPotStage(currentPotId);
  }

  function applyTexture(material, texture) {
    if (!texture) return;
    material.map = material.bumpMap = texture;
    material.needsUpdate = true;
  }

  async function preparePot(runStage) {
    const pot = activePotResources;
    if (!deferTextures || !pot || pot.textureReady) return;
    // 待っている間に鉢が替わったら、古い鉢のために質感を作らない。
    await runStage('pot', () => {
      if (disposed || activePotResources !== pot || pot.textureReady) return;
      const texture = createPotTexture(THREE, pot.potId, textureOptions);
      if (texture) pot.textures.push(texture);
      applyTexture(pot.potMesh.material, texture);
      pot.textureReady = true;
    });
  }

  async function prepare(runStage) {
    if (!deferTextures || disposed) return;
    for (const [name, create] of Object.entries(sharedFactories)) {
      if (disposed) return;
      if (Object.hasOwn(sharedTextures, name)) continue;
      await runStage(name, () => {
        if (disposed) return;
        const texture = sharedTextures[name] = create(THREE, textureOptions);
        const material = group.getObjectByName(name).material;
        applyTexture(material, texture);
      });
    }
    await preparePot(runStage);
  }

  function setMoisture(m) {
    if (disposed) return;
    if (!Number.isFinite(m)) return;
    currentMoisture = clamp01(m);
    if (activePotResources && activePotResources.soilMesh) {
      applyMoistureToMaterial(activePotResources.soilMesh.material, currentMoisture);
    }
  }

  function setLook(look) {
    if (disposed) return;
    if (!look || typeof look !== 'object') return;
    currentLook = look;

    const seasonKey = SEASON_TINTS[look.season] ? look.season : 'autumn';
    const tint = SEASON_TINTS[seasonKey];

    const wallColor = new THREE.Color(WALL_BASE_HEX).lerp(new THREE.Color(tint.wall), 0.22);
    const tableColor = new THREE.Color(TABLE_BASE_HEX).lerp(new THREE.Color(tint.table), 0.16);

    if (Array.isArray(look.color) && look.color.length === 3 && look.color.every(Number.isFinite)) {
      const leafTint = new THREE.Color(
        clamp01(look.color[0]),
        clamp01(look.color[1]),
        clamp01(look.color[2]),
      );
      wallColor.lerp(leafTint, 0.04);
      tableColor.lerp(leafTint, 0.03);
    }

    wallMaterial.color.copy(wallColor);
    tableMaterial.color.copy(tableColor);
    // 苔は仕様どおり季節で変えない（常に MOSS_BASE_HEX を維持）
  }

  function update(dt) {
    if (disposed) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    // 将来の微細なアニメーション補間用フック（現在は静的で即時反映）
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    disposePotResources();

    group.remove(tableMesh);
    group.remove(wallMesh);
    group.remove(potStageGroup);
    group.remove(treeAnchor);

    tableGeometry.dispose();
    tableMaterial.dispose();
    wallGeometry.dispose();
    wallMaterial.dispose();

    for (const key of Object.keys(sharedTextures)) {
      if (sharedTextures[key]) {
        sharedTextures[key].dispose();
        sharedTextures[key] = null;
      }
    }
  }

  // 初期状態の構築
  buildPotStage(currentPotId);

  return {
    group,
    treeAnchor,
    setPot,
    prepare,
    preparePot,
    setMoisture,
    setLook,
    update,
    dispose,
    info,
  };
}
