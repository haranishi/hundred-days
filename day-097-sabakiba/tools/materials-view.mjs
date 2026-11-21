// 材質つきで魚を確認する開発ページ（tools/geometry-view.mjs を元に作成）。
// クエリ: ?sp=aji&q=standard&yaw=&pitch=&zoom=&focus=head|belly|tail|body&explode=0..1&xray=0..1&scale=0..1&scutes=0..1&cuts=headCut:L:0.6,bellySlit::1&only=...
import * as THREE from '../vendor/three.js';
import { buildFishModel, visitPieceMeshes } from '../lib/pieces.js';
import { getSpecies } from '../lib/species/index.js';
import { createMaterials } from '../lib/materials.js';
import { createStage } from '../lib/stage.js';

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const VALID_FOCUS = new Set(['head', 'belly', 'tail', 'body']);
const VALID_FLESH = new Set(['white', 'pink', 'red']);

/** cuts クエリ文字列を [{name, side, progress, through}] に分解します。 */
export function parseCutsQuery(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const list = [];
  for (const token of raw.split(',')) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(':');
    const name = parts[0]?.trim();
    if (!name) continue;
    const sideRaw = parts[1]?.trim() || '';
    const side = sideRaw === 'L' || sideRaw === 'R' ? sideRaw : null;
    const progRaw = parts[2]?.trim();
    const progress = progRaw !== undefined && progRaw !== '' && Number.isFinite(Number(progRaw))
      ? clamp(Number(progRaw), 0, 1)
      : 1;
    const through = parts[3]?.trim() === '1' || parts[3]?.trim() === 'true';
    list.push({ name, side, progress, through });
  }
  return list;
}

/** URL クエリから確認ページのオプションを解釈します。 */
export function materialsViewOptions(search) {
  const query = new URLSearchParams(search);
  const number = (key, fallback) => {
    const raw = query.get(key);
    return raw?.trim() && Number.isFinite(Number(raw)) ? Number(raw) : fallback;
  };
  const focusRaw = (query.get('focus') ?? '').trim();
  const focus = VALID_FOCUS.has(focusRaw) ? focusRaw : '';
  const fleshRaw = (query.get('flesh') ?? '').trim();
  const flesh = VALID_FLESH.has(fleshRaw) ? fleshRaw : '';
  const defaultPitch = focus === 'belly' ? -44 : 12;

  return {
    species: query.get('sp') || 'aji',
    quality: query.get('q') || 'standard',
    only: new Set((query.get('only') ?? '').split(',').map((id) => id.trim()).filter(Boolean)),
    explode: clamp(number('explode', 0), 0, 1),
    yaw: number('yaw', -8),
    pitch: clamp(number('pitch', defaultPitch), -89, 89),
    zoom: clamp(number('zoom', 1), 0.35, 8),
    focus,
    xray: clamp(number('xray', 0), 0, 1),
    scale: clamp(number('scale', 1), 0, 1),
    scutes: query.has('scutes') ? clamp(number('scutes', 1), 0, 1) : null,
    cuts: parseCutsQuery(query.get('cuts')),
    flesh,
    wire: query.get('wire') === '1',
    board: query.get('board') === '1',
  };
}

/** 分解・表示部品・材質状態（透視・うろこ・ぜいご・切り込み）・注視領域を整えます。 */
export function prepareMaterialsPreview(model, options) {
  const { pieces, anatomy: a, materials: mats } = model;
  const delta = new Map();
  const center = new THREE.Vector3().fromArray(model.group.userData.centroid);

  for (const piece of Object.values(pieces)) {
    const away = new THREE.Vector3().fromArray(piece.pivot).sub(center);
    away.set(away.x / (a.SL * 0.48), away.y / (a.SL * 0.13), away.z / (a.SL * 0.06));
    delta.set(piece.id, away.multiplyScalar(options.explode * a.SL * 0.29));
  }
  const zero = new THREE.Vector3();
  for (const piece of Object.values(pieces)) {
    piece.object.position.copy(delta.get(piece.id)).sub(delta.get(piece.group.userData.pieceId) ?? zero);
    visitPieceMeshes(piece.object, (mesh) => {
      mesh.visible = !options.only.size || options.only.has(piece.id);
      const list = [mesh.material].flat();
      mesh.renderOrder = Math.max(0, ...list.map((mat) => mat?.userData?.renderOrder ?? 0));
      mesh.castShadow = options.board && !options.xray;
      mesh.receiveShadow = options.board && !options.xray;
    });
  }

  mats.setScale(options.scale);
  if (options.scutes !== null) mats.setScutes(options.scutes);
  mats.setXray(options.xray);

  const incisions = [];
  for (const cut of options.cuts) {
    try {
      const curve = a.curve(cut.name, cut.side ?? undefined);
      incisions.push({ points: curve.points, progress: cut.progress, through: cut.through });
    } catch {
      // 存在しないカーブ名や左右指定漏れは無視して描画を継続します。
    }
  }
  mats.setIncisions(incisions);

  for (const mat of new Set(Object.values(mats.kinds ?? mats))) {
    if (mat?.isMaterial) mat.wireframe = options.wire;
  }

  model.group.updateMatrixWorld(true);
  const fullBounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  model.group.traverseVisible((mesh) => {
    if (!mesh.isMesh) return;
    const owner = mesh.isInstancedMesh ? mesh : mesh.geometry;
    if (!owner.boundingBox) owner.computeBoundingBox();
    fullBounds.union(meshBounds.copy(owner.boundingBox).applyMatrix4(mesh.matrixWorld));
  });
  if (fullBounds.isEmpty()) throw new RangeError('指定した部品が見つかりません。');

  // focus 指定がある場合は対象部位にカメラ外接箱を絞ります。
  if (!options.focus || options.explode > 0.25) return fullBounds;
  const shift = model.group.position;
  const pMin = fullBounds.min;
  const pMax = fullBounds.max;
  const headEndX = shift.x + a.SL * Math.min(0.45, a.head + 0.08);
  const box = fullBounds.clone();
  if (options.focus === 'head') {
    box.min.set(pMin.x, pMin.y * 0.78, pMin.z);
    box.max.set(headEndX, pMax.y * 0.78, pMax.z);
  } else if (options.focus === 'body') {
    box.min.set(shift.x + a.SL * 0.30, pMin.y * 0.72, pMin.z);
    box.max.set(shift.x + a.SL * 0.68, pMax.y * 0.72, pMax.z);
  } else if (options.focus === 'tail') {
    box.min.set(shift.x + a.SL * 0.56, pMin.y * 0.82, pMin.z);
    box.max.set(pMax.x, pMax.y * 0.82, pMax.z);
  } else if (options.focus === 'belly') {
    box.min.set(shift.x + a.SL * 0.12, pMin.y, pMin.z);
    box.max.set(shift.x + a.SL * 0.82, shift.y + a.profile(0.45).top * 0.28, pMax.z);
  }
  return box;
}

function resolveSpecies(options) {
  const base = getSpecies(options.species);
  if (!base) throw new RangeError(`魚種「${options.species}」は見つかりません。`);
  if (!options.flesh) return base;
  return {
    ...base,
    look: {
      ...base.look,
      flesh: options.flesh,
    },
  };
}

function start(canvas, info) {
  let options = materialsViewOptions(location.search);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: options.quality !== 'light', alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const stage = createStage({ quality: options.quality, renderer, defer: false });
  scene.add(stage.group);
  scene.background = stage.background;
  scene.environment = stage.envTexture;
  scene.environmentIntensity = 0.78;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 1000);
  let model = null;
  let modelKey = '';
  let target = new THREE.Vector3();
  let corners = [];
  let yaw = options.yaw;
  let pitch = options.pitch;
  let zoom = options.zoom;
  let pointer = null;
  let lastWidth = 0;
  let lastHeight = 0;

  function loadOptions(nextOptions) {
    options = nextOptions;
    const nextKey = `${options.species}|${options.quality}|${options.flesh}`;
    if (!model || nextKey !== modelKey) {
      if (model) {
        scene.remove(model.group);
        model.dispose();
      }
      const species = resolveSpecies(options);
      model = buildFishModel(species, {
        quality: options.quality,
        materialFactory: createMaterials,
      });
      stage.setQuality(options.board ? options.quality : 'light');
      scene.environment = stage.envTexture;
      scene.add(model.group);
      modelKey = nextKey;
    }

    for (const name of ['board', 'board-contact', 'fish-contact']) {
      const obj = stage.group.getObjectByName(name);
      if (obj) obj.visible = options.board;
    }
    renderer.shadowMap.enabled = options.board && options.quality !== 'light';

    const centroid = model.group.userData.centroid;
    if (options.board) {
      const bellyDrop = model.anatomy.profile(0.42).bottom;
      model.group.position.set(-centroid[0], stage.boardTop + bellyDrop + 0.25, -centroid[2]);
    } else {
      model.group.position.set(-centroid[0], -centroid[1], -centroid[2]);
    }

    const bounds = prepareMaterialsPreview(model, options);
    target = bounds.getCenter(new THREE.Vector3());
    camera.far = model.anatomy.TL * 50;
    corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          corners.push(new THREE.Vector3(x, y, z).sub(target));
        }
      }
    }
    yaw = options.yaw;
    pitch = options.pitch;
    zoom = options.zoom;
  }

  function draw() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    if (width !== lastWidth || height !== lastHeight) {
      renderer.setSize(width, height, false);
      lastWidth = width;
      lastHeight = height;
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const y = THREE.MathUtils.degToRad(yaw);
    const p = THREE.MathUtils.degToRad(pitch);
    const toward = new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
    const right = new THREE.Vector3(Math.cos(y), 0, -Math.sin(y));
    const up = new THREE.Vector3().crossVectors(toward, right);
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fit = Math.max(...corners.map((c) =>
      c.dot(toward) + Math.max(Math.abs(c.dot(right)) / camera.aspect, Math.abs(c.dot(up))) / tangent));
    camera.position.copy(target).addScaledVector(toward, (fit * 1.10) / zoom);
    camera.lookAt(target);
    renderer.render(scene, camera);
    if (renderer.info.render.calls > 0 && !renderer.getContext().isContextLost()) {
      document.body.dataset.ready = 'true';
    }
  }

  loadOptions(options);
  draw();

  // 一括撮影で WebGL コンテキスト・環境マップ・コンパイル済みシェーダーを再利用するためのフック
  window.__materialsView = {
    apply(query) {
      delete document.body.dataset.ready;
      loadOptions(materialsViewOptions(query.startsWith('?') ? query : `?${query}`));
      draw();
      return { quality: options.quality, ready: document.body.dataset.ready === 'true' };
    },
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (pointer || e.button !== 0) return;
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer?.id) return;
    yaw -= 0.38 * (e.clientX - pointer.x);
    pitch = clamp(pitch + 0.38 * (e.clientY - pointer.y), -89, 89);
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    draw();
  });
  canvas.addEventListener('lostpointercapture', () => { pointer = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1);
    zoom = clamp(zoom * Math.exp(-pixels * 0.0014), 0.35, 8);
    draw();
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft': yaw -= 6; break;
      case 'ArrowRight': yaw += 6; break;
      case 'ArrowUp': pitch = Math.min(89, pitch + 6); break;
      case 'ArrowDown': pitch = Math.max(-89, pitch - 6); break;
      case '+': case '=': zoom = Math.min(8, zoom * 1.15); break;
      case '-': zoom = Math.max(0.35, zoom / 1.15); break;
      default: return;
    }
    e.preventDefault();
    draw();
  });
  canvas.addEventListener('webglcontextlost', () => {
    delete document.body.dataset.ready;
    info.hidden = false;
    info.textContent = '3D表示が中断しました。';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    info.hidden = true;
    stage.restoreEnvironment();
    stage.update();
    scene.environment = stage.envTexture;
    draw();
  });
  window.addEventListener('resize', draw);
  window.addEventListener('pagehide', (e) => {
    if (!e.persisted) {
      window.removeEventListener('resize', draw);
      model?.dispose();
      stage.dispose();
      renderer.dispose();
    }
  });
}

if (typeof document !== 'undefined') {
  const canvas = document.querySelector('#fish');
  const info = document.querySelector('#message');
  Object.assign(document.documentElement.style, { height: '100%' });
  Object.assign(document.body.style, { margin: '0', height: '100%', minHeight: '100vh' });
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', touchAction: 'none' });
  Object.assign(info.style, { position: 'relative', padding: '1em', fontFamily: 'system-ui, sans-serif' });
  try {
    start(canvas, info);
  } catch (error) {
    canvas.hidden = true;
    info.hidden = false;
    info.textContent = error instanceof RangeError && /[ぁ-ん]/u.test(error.message)
      ? error.message
      : `この環境では魚の材質を3Dで表示できませんでした。（${error?.message ?? ''}）`;
  }
}
