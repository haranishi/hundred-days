import * as THREE from '../vendor/three.js';
import { buildFishModel, visitPieceMeshes } from '../lib/pieces.js';

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
export function previewOptions(search) {
  const query = new URLSearchParams(search);
  const number = (key, fallback) => {
    const raw = query.get(key);
    return raw?.trim() && Number.isFinite(Number(raw)) ? Number(raw) : fallback;
  };
  return {
    species: query.get('sp') || 'aji', quality: query.get('q') || 'standard',
    only: new Set((query.get('only') ?? '').split(',').map(id => id.trim()).filter(Boolean)),
    explode: clamp(number('explode', 0), 0, 1), yaw: number('yaw', -8), pitch: clamp(number('pitch', 12), -89, 89),
    wire: query.get('wire') === '1', xray: query.get('xray') === '1',
  };
}

export function preparePreview(model, options) {
  const { pieces, anatomy: a, materials: m } = model, delta = new Map();
  const center = new THREE.Vector3().fromArray(model.group.userData.centroid);
  for (const piece of Object.values(pieces)) {
    const away = new THREE.Vector3().fromArray(piece.pivot).sub(center);
    // 横長の魚でも、左右に剥がす皮と身が重ならないよう各軸の体寸法で方向を決めます。
    away.set(away.x / (a.SL * 0.48), away.y / (a.SL * 0.13), away.z / (a.SL * 0.06));
    delta.set(piece.id, away.multiplyScalar(options.explode * a.SL * 0.29));
  }
  const zero = new THREE.Vector3();
  for (const piece of Object.values(pieces)) {
    piece.object.position.copy(delta.get(piece.id)).sub(delta.get(piece.group.userData.pieceId) ?? zero);
    // 子だけを指定したときも親の変換は有効にし、描くメッシュだけを選びます。
    visitPieceMeshes(piece.object, mesh => { mesh.visible = !options.only.size || options.only.has(piece.id); });
  }
  for (const mat of new Set(Object.values(m))) {
    if (!mat?.isMaterial) continue;
    const translucent = options.xray && [m.skin,m.flesh,m.cap,m.fin].includes(mat);
    mat.wireframe = options.wire;
    mat.transparent = translucent;
    mat.opacity = translucent ? (mat === m.skin ? 0.14 : 0.10) : 1;
    mat.depthWrite = !translucent;
  }
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3(), meshBounds = new THREE.Box3();
  model.group.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    const owner = mesh.isInstancedMesh ? mesh : mesh.geometry;
    if (!owner.boundingBox) owner.computeBoundingBox();
    bounds.union(meshBounds.copy(owner.boundingBox).applyMatrix4(mesh.matrixWorld));
  });
  if (bounds.isEmpty() && ![...options.only].some(id => Object.hasOwn(pieces, id))) {
    throw new RangeError('指定した部品が見つかりません。');
  }
  return bounds;
}

function start(canvas, info) {
  const options = previewOptions(location.search), model = buildFishModel(options.species, { quality: options.quality });
  const bounds = preparePreview(model, options);
  if (bounds.isEmpty()) {
    canvas.hidden = true; info.hidden = false;
    info.textContent = '選んだ部品は、この魚では0個です。';
    model.dispose();
    return;
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f4f0e8');
  scene.add(model.group);
  const target = bounds.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(35, 1, 0.02, model.anatomy.TL * 50);
  for (const [color, intensity, xyz] of [[0xfff2df, 2.65, [-0.7,1.2,1.1]], [0xe6f1ff, 1.6, [1,-0.35,0.85]], [0xffffff, 2.1, [0.5,0.9,-1.4]]]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.fromArray(xyz).multiplyScalar(model.anatomy.TL).add(target);
    light.target.position.copy(target);
    scene.add(light, light.target);
  }
  const corners = [];
  for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) {
    corners.push(new THREE.Vector3(x,y,z).sub(target));
  }
  let yaw = options.yaw, pitch = options.pitch, zoom = 1, pointer = null, lastWidth = 0, lastHeight = 0;
  function draw() {
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    if (width !== lastWidth || height !== lastHeight) {
      renderer.setSize(width, height, false); lastWidth = width; lastHeight = height;
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch);
    const toward = new THREE.Vector3(Math.sin(y)*Math.cos(p), Math.sin(p), Math.cos(y)*Math.cos(p));
    const right = new THREE.Vector3(Math.cos(y),0,-Math.sin(y)), up = new THREE.Vector3().crossVectors(toward,right);
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fit = Math.max(...corners.map(c => c.dot(toward) + Math.max(Math.abs(c.dot(right)) / camera.aspect, Math.abs(c.dot(up))) / tangent));
    camera.position.copy(target).addScaledVector(toward, fit * 1.12 / zoom);
    camera.lookAt(target);
    renderer.render(scene, camera);
    if (renderer.info.render.calls > 0 && !renderer.getContext().isContextLost()) document.body.dataset.ready = 'true';
  }
  canvas.addEventListener('pointerdown', e => {
    if (pointer || e.button !== 0) return;
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer?.id) return;
    yaw -= 0.38 * (e.clientX - pointer.x); pitch = clamp(pitch + 0.38 * (e.clientY - pointer.y), -89, 89);
    pointer.x = e.clientX; pointer.y = e.clientY; draw();
  });
  canvas.addEventListener('lostpointercapture', () => { pointer = null; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1);
    zoom = clamp(zoom * Math.exp(-pixels * 0.0014), 0.45, 4); draw();
  }, { passive: false });
  canvas.addEventListener('keydown', e => {
    switch (e.key) {
      case 'ArrowLeft': yaw -= 6; break;
      case 'ArrowRight': yaw += 6; break;
      case 'ArrowUp': pitch = Math.min(89, pitch + 6); break;
      case 'ArrowDown': pitch = Math.max(-89, pitch - 6); break;
      case '+': case '=': zoom = Math.min(4, zoom * 1.15); break;
      case '-': zoom = Math.max(0.45, zoom / 1.15); break;
      default: return;
    }
    e.preventDefault(); draw();
  });
  canvas.addEventListener('webglcontextlost', () => {
    delete document.body.dataset.ready; info.hidden = false; info.textContent = '3D表示が中断しました。';
  });
  canvas.addEventListener('webglcontextrestored', () => { info.hidden = true; draw(); });
  window.addEventListener('resize', draw);
  window.addEventListener('pagehide', e => {
    if (!e.persisted) { window.removeEventListener('resize', draw); model.dispose(); renderer.dispose(); }
  });
  draw();
}

if (typeof document !== 'undefined') {
  const canvas = document.querySelector('#fish'), info = document.querySelector('#message');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', touchAction: 'none' });
  Object.assign(info.style, { position: 'relative', padding: '1em', fontFamily: 'system-ui, sans-serif' });
  try { start(canvas, info); }
  catch (error) {
    canvas.hidden = true; info.hidden = false;
    info.textContent = error instanceof RangeError && /[ぁ-ん]/u.test(error.message)
      ? error.message : 'この環境では魚を3Dで表示できませんでした。';
  }
}
