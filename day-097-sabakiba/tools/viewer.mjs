import * as THREE from '../vendor/three.js';
import { RAD } from '../lib/camera-math.js';
import { createViewer } from '../lib/view3d.js';

function previewFish(quality) {
  const group = new THREE.Group();
  const pieces = new Map();
  function mesh(geometry, material, id) {
    if (!pieces.has(id)) {
      const root = new THREE.Group();
      root.userData.pieceId = id;
      pieces.set(id, root);
      group.add(root);
    }
    const part = new THREE.Mesh(geometry, material);
    part.userData.pieceId = id;
    pieces.get(id).add(part);
    return part;
  }
  const segments = quality === 'high' ? 48 : quality === 'light' ? 20 : 32;
  const body = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.625));
  const p = body.getAttribute('position');
  const colors = new Float32Array(p.count * 3);
  const back = new THREE.Color(0x344e55), silver = new THREE.Color(0xa3b8b9), belly = new THREE.Color(0xe8e3d2);
  const color = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y >= 0) color.copy(silver).lerp(back, y ** 0.8);
    else color.copy(silver).lerp(belly, -y);
    color.toArray(colors, 3 * i);
  }
  body.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const skin = mesh(body, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.31, metalness: 0.48 }), 'skin.L');
  skin.position.x = 9;
  skin.scale.set(9, 2.9, 1.68);
  const tail = new THREE.Shape();
  tail.moveTo(16.6, 0.45);
  tail.quadraticCurveTo(19.4, 1.35, 22.4, 3.05);
  tail.lineTo(20.4, 0.02);
  tail.lineTo(22.35, -2.85);
  tail.quadraticCurveTo(19.1, -1.15, 16.6, -0.45);
  tail.closePath();
  const fin = mesh(new THREE.ExtrudeGeometry(tail, { depth: 0.16, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: 0x8e966c, roughness: 0.52 }), 'bone');
  fin.position.z = -0.08;
  const eye = new THREE.SphereGeometry(1, 16, 12);
  const iris = new THREE.MeshStandardMaterial({ color: 0xd3b66c, roughness: 0.28 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x15232b, roughness: 0.16 });
  for (const side of [-1, 1]) {
    const outer = mesh(eye, iris, 'head'), inner = mesh(eye, pupil, 'head');
    outer.position.set(2.45, 0.50, side * 1.11);
    inner.position.set(2.42, 0.51, side * 1.28);
    outer.scale.set(0.58, 0.58, 0.26);
    inner.scale.set(0.36, 0.36, 0.18);
  }
  return { group, dispose() {
    const geometry = new Set(), materials = new Set();
    group.traverse((o) => { if (o.isMesh) { geometry.add(o.geometry); materials.add(o.material); } });
    geometry.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    group.clear();
  } };
}

export async function loadPreviewModel(id, quality, seed = 97) {
  if (id === 'aji') {
    try {
      const { buildFishModel } = await import('../lib/pieces.js');
      const [{ default: species }, random] = await Promise.all([
        import('../lib/species/aji.js'), import('../lib/rng.js').catch(() => null),
      ]);
      const model = await buildFishModel(species, { quality, rng: random?.createRng?.(seed) });
      return { id: 'aji', model };
    } catch {
      // 分担中で魚のモジュールがそろわないときも、まな板と視点を撮影できる。
    }
  }
  return { id: 'placeholder', model: previewFish(quality) };
}

/** 吻が左、背が奥。回転した外接箱の底を盤面に合わせる。 */
export function placePreview(model, boardTop) {
  const holder = new THREE.Group();
  holder.rotation.x = -Math.PI / 2;
  holder.add(model.group);
  model.group.traverse((part) => {
    if (part.isMesh) part.castShadow = part.receiveShadow = true;
  });
  const bounds = new THREE.Box3().setFromObject(holder, true);
  const center = bounds.getCenter(new THREE.Vector3());
  holder.position.set(-center.x, boardTop - bounds.min.y, -center.z);
  bounds.translate(holder.position);
  holder.updateMatrixWorld(true);
  const focus = model.group.localToWorld(new THREE.Vector3().fromArray(model.anatomy?.point('opercleTop') ?? [3.8, 0.8, 1.2]));
  return { holder, bounds, focus: focus.toArray() };
}

function angle(params, name) {
  const value = params.get(name);
  return value?.trim() && Number.isFinite(Number(value)) ? Number(value) * RAD : undefined;
}

async function mount() {
  const container = document.getElementById('view'), status = document.getElementById('status');
  Object.assign(document.body.style, { margin: '0', backgroundColor: '#f4f0e8' });
  Object.assign(container.style, { position: 'fixed', inset: '0' });
  Object.assign(status.style, { position: 'fixed', left: '1rem', bottom: '0', color: '#1c2b33' });
  const params = new URLSearchParams(location.search);
  const preset = params.get('preset') || 'cook', seed = Number(params.get('seed') ?? 97) >>> 0;
  let viewer, current, generation = 0, closed = false;
  async function showModel(tier) {
    const revision = ++generation;
    document.body.dataset.ready = 'false';
    const next = await loadPreviewModel(params.get('model'), tier, seed);
    if (closed || revision !== generation) { next.model.dispose(); return; }
    const { holder, bounds, focus } = placePreview(next.model, viewer.stage.boardTop);
    if (current) { current.holder.removeFromParent(); current.model.dispose(); }
    current = { holder, model: next.model, revision };
    viewer.scene.add(holder);
    viewer.stage.setContactBounds(bounds);
    viewer.rig.setBounds(bounds);
    viewer.rig.applyPreset(preset, { yaw: angle(params, 'yaw'), pitch: angle(params, 'pitch'),
      focus: preset === 'closeup' ? focus : undefined }, { immediate: true });
    viewer.setMirror(params.get('mirror') === '1');
    document.body.dataset.model = next.id;
    viewer.render();
  }
  try {
    viewer = createViewer({
      container, quality: params.get('q') ?? 'auto',
      onQualityChange: (tier) => { void showModel(tier).catch(showError); },
      onFrame() {
        if (current?.revision === generation && viewer.stats().ready && document.body.dataset.ready !== 'true') {
          document.body.dataset.ready = 'true';
          status.hidden = true;
        }
      },
    });
    await showModel(viewer.quality);
    viewer.start();
  } catch (error) { showError(error); }

  function close() {
    if (closed) return;
    closed = true;
    current?.holder.removeFromParent();
    current?.model.dispose();
    viewer?.dispose();
  }
  function showError(error) {
    close();
    document.body.dataset.ready = 'false';
    document.body.dataset.gl = 'off';
    status.hidden = false;
    status.textContent = error.message;
  }
  window.addEventListener('pagehide', (event) => { if (!event.persisted) close(); });
}

if (typeof document !== 'undefined') void mount();
