import * as THREE from '../vendor/three.js';
import { GFX_TIERS } from './gfx.js';

const WIDTH = 42, DEPTH = 28, HEIGHT = 2, EDGE_RADIUS = 0.58;
const BOARD_TOP = 0;
const browserCanvas = () => globalThis.document?.createElement('canvas');

function paintWood(size, createCanvas) {
  const canvas = createCanvas();
  if (!canvas) return null;
  canvas.width = size;
  canvas.height = Math.round(size * DEPTH / WIDTH);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(canvas.width, canvas.height);
  const wash = ctx.createLinearGradient(0, 0, 0.24, 1);
  for (const [at, color] of [[0, '#dcbf93'], [0.27, '#ebd1aa'], [0.60, '#e6cba2'], [1, '#efdbba']]) {
    wash.addColorStop(at, color);
  }
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 1, 1);
  // 長さの違う繊維が同じ節の周囲を通る。画素数を変えても木目と傷の位置はそろう。
  for (let i = 0; i < 245; i++) {
    const y = (i + Math.sin(i * 1.76) * 0.34) / 240;
    const start = -0.18 + (i % 7) * 0.039;
    const bow = 0.055 * Math.exp(-((y - 0.37) ** 2) / 0.028) + 0.006 * Math.sin(i * 0.39);
    ctx.strokeStyle = i % 5 === 0 ? 'rgba(255,249,222,0.34)' : 'rgba(151,107,61,0.16)';
    ctx.lineWidth = 0.0006 + (i % 4) * 0.00026;
    ctx.beginPath();
    ctx.moveTo(start, y);
    ctx.bezierCurveTo(0.24, y - bow * 0.4, 0.32, y + bow, 0.55, y + bow * 0.64);
    ctx.bezierCurveTo(0.73, y + bow * 0.45, 0.85, y - 0.016, 1.13 - (i % 9) * 0.024, y - 0.008);
    ctx.stroke();
  }
  for (let i = 0; i < 22; i++) {
    const x = 0.48 + 0.25 * Math.sin(i * 1.73), y = 0.51 + 0.24 * Math.sin(i * 2.19);
    const dx = 0.018 + (i % 5) * 0.011, dy = ((i % 4) - 1.2) * 0.023;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.strokeStyle = 'rgba(129,102,76,0.31)';
    ctx.lineWidth = 0.001;
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function dataTexture(w, h, pixels) {
  const texture = new THREE.DataTexture(pixels, w, h, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function backgroundGradient() {
  const height = 32, pixels = new Uint8Array(height * 4);
  const bottom = [226, 220, 208], top = [249, 247, 242];
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    pixels.set([...bottom.map((v, i) => Math.round(v + (top[i] - v) * t)), 255], y * 4);
  }
  return dataTexture(1, height, pixels);
}

function contactShadow(name, w, d, y, rectangular) {
  const side = 64, pixels = new Uint8Array(side * side * 4);
  const exponent = rectangular ? 8 : 2;
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const x = Math.abs(2 * (i + 0.5) / side - 1), z = Math.abs(2 * (j + 0.5) / side - 1);
      const r = (x ** exponent + z ** exponent) ** (1 / exponent);
      const t = Math.max(0, 1 - r * r);
      const alpha = rectangular ? Math.min(1, t * 3.6) ** 2 : t * t;
      pixels.set([74, 57, 42, Math.round(255 * alpha)], (j * side + i) * 4);
    }
  }
  const material = new THREE.MeshBasicMaterial({ map: dataTexture(side, side, pixels),
    opacity: rectangular ? 0.24 : 0.28, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.name = name;
  mesh.scale.set(w, d, 1);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

/** 銀の表面に映る、窓と反射板。輝度の異なる広い面を離して置く。 */
export function createStudioRoom() {
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x929698);
  function panel(x, y, z, width, height, color, intensity) {
    const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    material.color.multiplyScalar(intensity);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    room.add(mesh);
  }
  // 銀の映り込みも左右反転するよう、正面の窓を中心線上、細い反射板を対に置く。
  panel(0, 7, 3, 9, 4, 0xfff4e3, 4.2);
  panel(-6, 3, -3, 3, 6, 0xe0efff, 2.4);
  panel(6, 3, -3, 3, 6, 0xe0efff, 2.4);
  return room;
}

function environment(renderer) {
  const room = createStudioRoom();
  const generator = new THREE.PMREMGenerator(renderer);
  const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), level = renderer.getActiveMipmapLevel();
  const { autoClear, toneMapping } = renderer, xrEnabled = renderer.xr.enabled;
  try {
    // 128 の立方体から得る最終テクスチャは 384×512。全段で再利用する。
    return generator.fromScene(room, 0.02, 0.1, 35, { size: 128 });
  } finally {
    renderer.setRenderTarget(target, face, level);
    renderer.autoClear = autoClear;
    renderer.toneMapping = toneMapping;
    renderer.xr.enabled = xrEnabled;
    generator.dispose();
    for (const panel of room.children) { panel.geometry.dispose(); panel.material.dispose(); }
  }
}

export function createStage({ quality = 'standard', renderer, createCanvas = browserCanvas, defer = false } = {}) {
  const group = new THREE.Group();
  group.name = 'stage';
  const background = backgroundGradient();
  const wood = new THREE.MeshStandardMaterial({ color: 0xe8cfaa, roughness: 0.78, metalness: 0 });
  const board = new THREE.Mesh(new THREE.RoundedBoxGeometry(WIDTH, HEIGHT, DEPTH, 3, EDGE_RADIUS), wood);
  board.name = 'board';
  board.position.y = BOARD_TOP - HEIGHT / 2;
  const boardShadow = contactShadow('board-contact', 50, 34, BOARD_TOP - HEIGHT - 0.025, true);
  const fishShadow = contactShadow('fish-contact', 22, 5.8, BOARD_TOP + 0.012, false);
  group.add(boardShadow, board, fishShadow);

  function light(name, color, intensity, x, y, z) {
    const lamp = new THREE.DirectionalLight(color, intensity);
    lamp.name = name;
    lamp.position.set(x, y, z);
    group.add(lamp, lamp.target);
    return lamp;
  }
  const key = light('key', 0xfff2df, 2.05, -30, 52, 27);
  const fill = light('fill', 0xe3efff, 0.85, 38, 26, 10);
  const rim = light('rim', 0xfffbf4, 1.4, 8, 35, -36);
  const lights = [key, fill, rim];
  const shadow = key.shadow;
  Object.assign(shadow.camera, { left: -29, right: 29, top: 27, bottom: -27, near: 10, far: 115 });
  shadow.camera.updateProjectionMatrix();
  shadow.bias = -0.00025;
  shadow.normalBias = 0.025;
  shadow.intensity = 0.55;
  let envTarget = null, needsEnv = Boolean(renderer), disposed = false;
  let woodSize = 0, wantedSize = 0;

  function update() {
    if (disposed) return;
    if (woodSize !== wantedSize) {
      const map = paintWood(wantedSize, createCanvas);
      wood.map?.dispose();
      wood.map = map;
      wood.color.set(map ? 0xffffff : 0xe8cfaa);
      if (map) map.anisotropy = Math.min(4, renderer?.capabilities.getMaxAnisotropy() ?? 1);
      wood.needsUpdate = true;
      woodSize = wantedSize;
    } else if (needsEnv) {
      needsEnv = false;
      try {
        envTarget = environment(renderer);
      } catch {
        // 映り込みの描画先が確保できなくても、3灯で手順を表示する。
        envTarget = null;
      }
    }
  }

  function setQuality(q) {
    if (disposed) return;
    const tier = GFX_TIERS[q] ?? GFX_TIERS.standard;
    wantedSize = tier.maxTextureSize;
    const size = tier.shadowSize;
    if (shadow.mapSize.x !== Math.max(1, size)) {
      shadow.dispose();
      shadow.map = shadow.mapPass = null;
      shadow.mapSize.setScalar(Math.max(1, size));
    }
    board.castShadow = board.receiveShadow = key.castShadow = size > 0;
    shadow.radius = size >= 1024 ? 2.5 : 1;
    fishShadow.material.opacity = size ? 0.17 : 0.30;
    if (renderer) {
      renderer.shadowMap.enabled = size > 0;
      renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    if (!defer) {
      update();
      if (needsEnv) update();
    }
  }

  function setContactBounds(bounds) {
    fishShadow.visible = Boolean(bounds);
    if (!bounds) return;
    const lo = bounds.min, hi = bounds.max;
    const x = lo.x ?? lo[0], z = lo.z ?? lo[2];
    const dx = (hi.x ?? hi[0]) - x, dz = (hi.z ?? hi[2]) - z;
    const w = Math.max(0.1, dx * 1.04), d = Math.max(0.1, dz * 1.12);
    const left = x + (dx - w) / 2, back = z + (dz - d) / 2;
    // 盤からはみ出す魚でも、上面の縁の丸みにかかる手前で影を切る。
    const clippedLeft = Math.max(left, -WIDTH / 2 + EDGE_RADIUS);
    const clippedRight = Math.min(left + w, WIDTH / 2 - EDGE_RADIUS);
    const clippedBack = Math.max(back, -DEPTH / 2 + EDGE_RADIUS);
    const clippedFront = Math.min(back + d, DEPTH / 2 - EDGE_RADIUS);
    const width = clippedRight - clippedLeft, depth = clippedFront - clippedBack;
    fishShadow.visible = width > 0 && depth > 0;
    if (!fishShadow.visible) return;
    fishShadow.position.set(clippedLeft + width / 2, BOARD_TOP + 0.012, clippedBack + depth / 2);
    fishShadow.scale.set(width, depth, 1);
    fishShadow.material.map.offset.set((clippedLeft - left) / w, (back + d - clippedFront) / d);
    fishShadow.material.map.repeat.set(width / w, depth / d);
  }

  setQuality(quality);
  return {
    group, lights, background, boardTop: BOARD_TOP, update, setQuality, setContactBounds,
    get envTexture() { return envTarget?.texture ?? null; },
    get ready() { return woodSize === wantedSize && !needsEnv; },
    restoreEnvironment() {
      envTarget?.dispose();
      envTarget = null;
      needsEnv = Boolean(renderer);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of [board, boardShadow, fishShadow]) {
        mesh.geometry.dispose();
        mesh.material.map?.dispose();
        mesh.material.dispose();
      }
      lights.forEach((lamp) => lamp.dispose());
      background.dispose();
      envTarget?.dispose();
      envTarget = null;
      group.removeFromParent();
      group.clear();
    },
  };
}
