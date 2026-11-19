// 光と背景と、季節の粒・手入れの粒。数値は visual-direction の表が出発点。
// 環境マップは鉢の釉と針金だけに渡す。scene.environment には置かない（幹と葉が金属になる）。
import { createRng } from './rng.js';
import { wrapAzimuth } from './camera-math.js';

export const LIGHT_PRESETS = Object.freeze({
  morning: Object.freeze({ az: -35, alt: 28, color: '#fff1dc', intensity: 2.6, sky: '#dfe8f5', ground: '#8c7a63', hemi: 0.9, exposure: 0.95, bgTop: '#efe9dd', bgBottom: '#d8cdb8', lantern: 0 }),
  noon: Object.freeze({ az: -20, alt: 52, color: '#fffaf0', intensity: 3.2, sky: '#dfe8f5', ground: '#8c7a63', hemi: 0.8, exposure: 1, bgTop: '#f3eee3', bgBottom: '#e5dccb', lantern: 0 }),
  evening: Object.freeze({ az: 60, alt: 14, color: '#ffb877', intensity: 2.4, sky: '#ffd9b8', ground: '#6e5640', hemi: 0.6, exposure: 1.05, bgTop: '#f1d7b5', bgBottom: '#c99a72', lantern: 0 }),
  night: Object.freeze({ az: 150, alt: 62, color: '#8da4d6', intensity: 0.6, sky: '#2a3350', ground: '#12141c', hemi: 0.5, exposure: 1.1, bgTop: '#1d2233', bgBottom: '#0e111b', lantern: 1.7 }),
});

const LIGHT_SECONDS = 0.6;
const BURST_COLOR = { snip: '#c4a574', pinch: '#b6d37a', water: '#d7e6f2', sparkle: '#fff4d2' };

// 壁に落ちる影は淡く大きくぼかす。鉢と卓の接地は、狭い影カメラと小さい radius で残す。
// 濃さは見た目方針の 0.35〜0.5。radius 1 のままでは縁が切れて、塊が壁より目立つ。
export const SHADOW_TUNE = Object.freeze({
  intensity: 0.36,
  radius: 14,
  contactLight: 0.4,
  contactShadow: 0.88,
  contactRadius: 1.4,
  contactExtent: 1.85,
});

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

function sunOffset(az, alt) {
  const a = az * Math.PI / 180;
  const e = alt * Math.PI / 180;
  const dist = 16;
  return [dist * Math.cos(e) * Math.sin(a), dist * Math.sin(e), dist * Math.cos(e) * Math.cos(a)];
}

function mixPreset(a, b, t) {
  const span = wrapAzimuth(b.az - a.az);
  const color = new (a.color.constructor)().copy(a.color).lerp(b.color, t);
  const sky = new (a.sky.constructor)().copy(a.sky).lerp(b.sky, t);
  const ground = new (a.ground.constructor)().copy(a.ground).lerp(b.ground, t);
  const top = new (a.top.constructor)().copy(a.top).lerp(b.top, t);
  const bottom = new (a.bottom.constructor)().copy(a.bottom).lerp(b.bottom, t);
  return {
    az: a.az + span * t,
    alt: lerp(a.alt, b.alt, t),
    color, sky, ground, top, bottom,
    intensity: lerp(a.intensity, b.intensity, t),
    hemi: lerp(a.hemi, b.hemi, t),
    exposure: lerp(a.exposure, b.exposure, t),
    lantern: lerp(a.lantern, b.lantern, t),
  };
}

function makeCanvas(createCanvas, w, h) {
  const factory = createCanvas === undefined
    ? (typeof document !== 'undefined' ? (width, height) => document.createElement('canvas') : null)
    : createCanvas;
  if (typeof factory !== 'function') return null;
  const canvas = factory(w, h);
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export function createStage(THREE, scene, renderer, { gfx = 'high', seed = 1, createCanvas } = {}) {
  const allowParticles = gfx !== 'test';
  const shadowSize = gfx === 'high' ? 2048 : gfx === 'low' ? 1024 : 0;
  const sun = new THREE.DirectionalLight(0xfffaf0, 3.2);
  sun.name = 'sun';
  sun.castShadow = shadowSize > 0;
  sun.shadow.mapSize.set(Math.max(shadowSize, 1), Math.max(shadowSize, 1));
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.04;
  sun.shadow.intensity = SHADOW_TUNE.intensity;
  sun.shadow.radius = SHADOW_TUNE.radius;
  const cam = sun.shadow.camera;
  cam.near = 2;
  cam.far = 36;
  cam.left = -5;
  cam.right = 5;
  cam.top = 5;
  cam.bottom = -5;
  sun.target.position.set(0, 0.9, 0);
  scene.add(sun.target);
  scene.add(sun);
  // 真上からの補助。影の範囲を鉢の周りに限り、壁の大きな影はこの光では作らない。
  const contact = new THREE.DirectionalLight(0xfff6ea, shadowSize > 0 ? SHADOW_TUNE.contactLight : 0);
  contact.name = 'contact';
  contact.position.set(0.15, 8, 0.35);
  contact.castShadow = shadowSize > 0;
  contact.shadow.mapSize.set(shadowSize > 0 ? 1024 : 1, shadowSize > 0 ? 1024 : 1);
  contact.shadow.bias = -0.0005;
  contact.shadow.normalBias = 0.015;
  contact.shadow.intensity = SHADOW_TUNE.contactShadow;
  contact.shadow.radius = SHADOW_TUNE.contactRadius;
  const contactCam = contact.shadow.camera;
  contactCam.near = 1;
  contactCam.far = 14;
  contactCam.left = -SHADOW_TUNE.contactExtent;
  contactCam.right = SHADOW_TUNE.contactExtent;
  contactCam.top = SHADOW_TUNE.contactExtent;
  contactCam.bottom = -SHADOW_TUNE.contactExtent;
  contact.target.position.set(0, 0.15, 0);
  scene.add(contact.target);
  scene.add(contact);
  // view3d は先に PCF を置く。VSM のぼかしの方が、壁の縁を一様に溶かせる。
  if (renderer.shadowMap && THREE.VSMShadowMap !== undefined) {
    renderer.shadowMap.type = THREE.VSMShadowMap;
  }
  const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x8c7a63, 0.8);
  hemi.name = 'sky';
  scene.add(hemi);
  const lantern = new THREE.PointLight(0xffb35a, 0, 8, 2);
  lantern.position.set(1.15, 1.35, 1.7);
  lantern.name = 'lantern';
  scene.add(lantern);

  const bgCanvas = makeCanvas(createCanvas, 8, 64);
  let bgTex = null;
  let bgCtx = null;
  if (bgCanvas) {
    bgCtx = bgCanvas.getContext('2d');
    bgTex = new THREE.CanvasTexture(bgCanvas);
    if (THREE.SRGBColorSpace) bgTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = bgTex;
  }

  // 環境の生成に失敗しても、直射と半球光だけで絵は出す（釉の映り込みだけ欠ける）。
  let pmrem = null;
  try {
    pmrem = new THREE.PMREMGenerator(renderer);
  } catch {
    pmrem = null;
  }
  let envTarget = null;

  const asColor = (preset) => ({
    az: preset.az,
    alt: preset.alt,
    intensity: preset.intensity,
    hemi: preset.hemi,
    exposure: preset.exposure,
    lantern: preset.lantern,
    color: new THREE.Color(preset.color),
    sky: new THREE.Color(preset.sky),
    ground: new THREE.Color(preset.ground),
    top: new THREE.Color(preset.bgTop),
    bottom: new THREE.Color(preset.bgBottom),
  });

  let from = asColor(LIGHT_PRESETS.noon);
  let to = from;
  let lightT = 1;
  let envKey = '';

  function paintBg(top, bottom) {
    if (!bgCtx) {
      scene.background = top;
      return;
    }
    const g = bgCtx.createLinearGradient(0, 0, 0, bgCanvas.height);
    g.addColorStop(0, `#${top.getHexString()}`);
    g.addColorStop(1, `#${bottom.getHexString()}`);
    bgCtx.fillStyle = g;
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgTex.needsUpdate = true;
    scene.background = bgTex;
  }

  function apply(state) {
    const pos = sunOffset(state.az, state.alt);
    sun.position.set(pos[0], pos[1], pos[2]);
    sun.color.copy(state.color);
    sun.intensity = state.intensity;
    hemi.color.copy(state.sky);
    hemi.groundColor.copy(state.ground);
    hemi.intensity = state.hemi;
    lantern.intensity = state.lantern;
    renderer.toneMappingExposure = state.exposure;
    paintBg(state.top, state.bottom);
    cam.updateProjectionMatrix();
  }

  function rebuildEnv(state) {
    if (!pmrem) return;
    const key = `${state.top.getHexString()}-${state.color.getHexString()}-${state.intensity.toFixed(2)}`;
    if (key === envKey) return;
    try {
      const room = new THREE.Scene();
      room.background = state.top.clone();
      room.add(new THREE.HemisphereLight(state.sky, state.ground, 1));
      const keyLight = new THREE.DirectionalLight(state.color, 1.4);
      keyLight.position.copy(sun.position);
      room.add(keyLight);
      const next = pmrem.fromScene(room, 0.04);
      if (envTarget) envTarget.dispose();
      envTarget = next;
      envKey = key;
    } catch {
      // 同じ光で毎フレーム失敗し直さない。次に光が変わったときだけもう一度試す。
      envKey = key;
      envTarget = null;
    }
  }

  apply(from);
  rebuildEnv(from);

  const plate = new THREE.PlaneGeometry(0.09, 0.12);
  const speck = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
  });
  const seasonMesh = new THREE.InstancedMesh(plate, speck, 48);
  seasonMesh.frustumCulled = false;
  seasonMesh.count = 0;
  seasonMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(48 * 3), 3);
  scene.add(seasonMesh);
  const rng = createRng(seed || 1).fork('season');
  const flakes = Array.from({ length: 48 }, () => ({
    x: rng.range(-1.3, 1.3),
    z: rng.range(-0.8, 0.8),
    phase: rng.next(),
    spin: rng.range(0, Math.PI * 2),
    sway: rng.range(0.4, 1.3),
    petal: rng.next() > 0.5,
  }));
  const clock = { t: 0 };
  const bursts = [];
  let burstSerial = 0;
  const burstMesh = new THREE.InstancedMesh(plate, speck.clone(), 48);
  burstMesh.frustumCulled = false;
  burstMesh.count = 0;
  burstMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(48 * 3), 3);
  scene.add(burstMesh);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  function writeFlakes(look) {
    const fall = clamp01(look?.fall || 0);
    const petal = clamp01(look?.petal || 0);
    if (!allowParticles || (fall < 0.02 && petal < 0.02)) {
      seasonMesh.count = 0;
      return false;
    }
    const leafColor = look.color || [0.85, 0.35, 0.16];
    let n = 0;
    for (const flake of flakes) {
      const usePetal = flake.petal && petal > 0.02;
      const useLeaf = !flake.petal && fall > 0.02;
      if (!usePetal && !useLeaf) continue;
      const life = (clock.t * (usePetal ? 0.08 : 0.11) + flake.phase) % 1;
      const y = 3.1 * (1 - life) + 0.05;
      const x = flake.x + Math.sin(clock.t * flake.sway + flake.phase * 6) * 0.18;
      const z = flake.z + Math.cos(clock.t * 0.6 + flake.phase * 4) * 0.12;
      dummy.position.set(x, y, z);
      dummy.rotation.set(life * 2, flake.spin + clock.t * 0.4, flake.spin);
      const s = usePetal ? 0.7 : 1;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      seasonMesh.setMatrixAt(n, dummy.matrix);
      if (usePetal) tint.setRGB(0.98, 0.9, 0.92);
      else tint.setRGB(leafColor[0], leafColor[1], leafColor[2]);
      seasonMesh.instanceColor.setXYZ(n, tint.r, tint.g, tint.b);
      n += 1;
      if (n >= 48) break;
    }
    seasonMesh.count = n;
    seasonMesh.instanceMatrix.needsUpdate = true;
    seasonMesh.instanceColor.needsUpdate = true;
    return n > 0;
  }

  function burst(kind, point, motion) {
    if (!allowParticles || !motion || !point) return;
    const color = BURST_COLOR[kind] || BURST_COLOR.sparkle;
    const local = createRng(seed || 1).fork(`burst-${kind}-${burstSerial}`);
    burstSerial += 1;
    const n = kind === 'water' ? 14 : 10;
    const parts = [];
    for (let i = 0; i < n; i += 1) {
      const up = kind === 'pinch' || kind === 'sparkle' ? 1 : 0.35;
      parts.push({
        x: point[0], y: point[1], z: point[2],
        vx: local.range(-0.7, 0.7),
        vy: local.range(0.15, 1) * up + (kind === 'water' ? 0.8 : 0),
        vz: local.range(-0.7, 0.7),
        life: 0,
        max: kind === 'sparkle' ? 0.8 : 0.65,
        size: local.range(0.025, 0.055),
        gravity: kind === 'sparkle' ? 0.2 : kind === 'pinch' ? 0.6 : 2.4,
        color,
      });
    }
    bursts.push(parts);
  }

  function writeBursts(dt) {
    let slot = 0;
    for (let b = bursts.length - 1; b >= 0; b -= 1) {
      const parts = bursts[b];
      let alive = 0;
      for (const p of parts) {
        p.life += dt;
        if (p.life >= p.max) continue;
        alive += 1;
        p.vy -= p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (slot >= 48) continue;
        const k = 1 - p.life / p.max;
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.life * 4, p.life * 2, 0);
        dummy.scale.setScalar(p.size * (0.4 + k));
        dummy.updateMatrix();
        burstMesh.setMatrixAt(slot, dummy.matrix);
        tint.set(p.color);
        burstMesh.instanceColor.setXYZ(slot, tint.r, tint.g, tint.b);
        slot += 1;
      }
      if (!alive) bursts.splice(b, 1);
    }
    burstMesh.count = slot;
    burstMesh.instanceMatrix.needsUpdate = true;
    burstMesh.instanceColor.needsUpdate = true;
    return bursts.length > 0;
  }

  return {
    envMap: () => envTarget?.texture || null,
    setLight(id, { animate = true } = {}) {
      const next = asColor(LIGHT_PRESETS[id] || LIGHT_PRESETS.noon);
      if (!animate) {
        from = next;
        to = next;
        lightT = 1;
        apply(next);
        rebuildEnv(next);
        return;
      }
      // 今見えている色を起点にする。to を先に置き換えると、補間が新しい光から始まって動かない。
      from = mixPreset(from, to, smooth(lightT));
      to = next;
      lightT = 0;
    },
    update(dt, look, motion) {
      clock.t += dt;
      let moving = false;
      if (lightT < 1) {
        lightT = Math.min(1, lightT + dt / LIGHT_SECONDS);
        const state = mixPreset(from, to, smooth(lightT));
        apply(state);
        moving = lightT < 1;
        if (lightT >= 1) rebuildEnv(state);
      }
      if (motion && writeFlakes(look)) moving = true;
      else seasonMesh.count = 0;
      if (writeBursts(dt)) moving = true;
      return moving;
    },
    burst,
    dispose() {
      pmrem?.dispose();
      if (envTarget) envTarget.dispose();
      if (bgTex) bgTex.dispose();
      plate.dispose();
      speck.dispose();
      burstMesh.material.dispose();
      seasonMesh.dispose();
      burstMesh.dispose();
      scene.remove(sun, sun.target, contact, contact.target, hemi, lantern, seasonMesh, burstMesh);
    },
  };
}
