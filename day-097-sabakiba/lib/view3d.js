import * as THREE from '../vendor/three.js';
import { createCameraRig } from './camera.js';
import { captureFrame } from './capture.js';
import { connectControls } from './controls.js';
import { AUTO_TIERS, GFX_TIERS } from './gfx.js';
import { createGfxGovernor } from './gfx-governor.js';
import { deviceInfo, readLearnedGfx, resolveGfx, writeLearnedGfx } from './gfx-select.js';
import { createStage } from './stage.js';

function webglRenderer(canvas, quality) {
  const attributes = { alpha: false, antialias: quality !== 'light', depth: true, stencil: false,
    preserveDrawingBuffer: false, powerPreference: 'default' };
  let context;
  try {
    context = canvas.getContext('webgl2', attributes);
    if (!context) throw new Error('WebGL2を利用できません。');
    return new THREE.WebGLRenderer({ canvas, context, ...attributes });
  } catch (cause) {
    context?.getExtension?.('WEBGL_lose_context')?.loseContext();
    throw new Error('この端末では3D表示を開始できません。文章で手順を確認できます。', { cause });
  }
}

/** 停止の希望と一時的な非表示を区別し、復帰時の最初の刻みを 0 に戻す。 */
export function createFrameLoop({ host, doc, frame, onPause }) {
  let wanted = false, available = true, disposed = false, id = null, previous = null;
  const canRun = () => wanted && available && !disposed && !doc.hidden;
  function schedule() {
    if (id === null && canRun()) id = host.requestAnimationFrame(tick);
  }
  function tick(now) {
    id = null;
    if (!canRun()) return;
    const ms = previous === null ? 0 : Math.max(0, now - previous);
    previous = now;
    frame(Math.min(0.1, ms / 1000), now, ms);
    schedule();
  }
  function sync() {
    if (canRun()) { schedule(); return; }
    if (id !== null) host.cancelAnimationFrame(id);
    id = previous = null;
    onPause?.();
  }
  doc.addEventListener('visibilitychange', sync);
  return {
    start() { wanted = true; sync(); },
    stop() { wanted = false; sync(); },
    setAvailable(value) { available = value; sync(); },
    dispose() {
      disposed = true;
      doc.removeEventListener('visibilitychange', sync);
      sync();
    },
  };
}

export function createViewer({
  container, quality = 'auto', bounds, onFrame, onQualityChange, onCameraUser, onTap, reducedMotion,
} = {}) {
  const doc = container?.ownerDocument;
  if (!doc) throw new Error('3Dの表示領域を用意できません。');
  const host = doc.defaultView ?? globalThis;
  const env = deviceInfo(host);
  const storage = () => host.localStorage;
  let automatic = !AUTO_TIERS.includes(quality);
  const select = (setting) => resolveGfx({ setting, env, learned: readLearnedGfx({ storage }) });
  let tier = select(quality), governor = createGfxGovernor({ tier });
  const canvas = doc.createElement('canvas');
  const renderer = webglRenderer(canvas, tier);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
  canvas.setAttribute('role', 'region');
  canvas.setAttribute('aria-label', '魚の3Dです。矢印で回し、プラスとマイナスで拡大・縮小します。ホームキーで手順の視点に戻ります。');
  const scene = new THREE.Scene();
  const mirror = new THREE.Group();
  mirror.name = 'mirror';
  // Scene を子にすると、呼び出し側が scene.add した部品・光・影にも反転が届く。
  mirror.add(scene);
  const stage = createStage({ quality: tier, renderer, createCanvas: () => doc.createElement('canvas'), defer: true });
  scene.add(stage.group);
  scene.background = stage.background;
  scene.environmentIntensity = 0.72;
  const rig = createCameraRig({ bounds });
  const { camera } = rig;
  const controls = connectControls(canvas, { rig, onUser: onCameraUser, onTap, reducedMotion });
  container.appendChild(canvas);
  let width = 1, height = 1, ratio = 0;
  let disposed = false, lost = false, frames = 0, fps = 0, drawnReady = false;

  function setSize(w = container.clientWidth, h = container.clientHeight, dpr = host.devicePixelRatio || 1) {
    if (disposed || !(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) return;
    const pixelRatio = Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, GFX_TIERS[tier].dpr);
    const nextW = Math.max(1, Math.round(w)), nextH = Math.max(1, Math.round(h));
    if (width === nextW && height === nextH && ratio === pixelRatio) return;
    width = nextW; height = nextH; ratio = pixelRatio;
    renderer.setDrawingBufferSize(width, height, ratio);
    rig.setAspect(width / height);
  }

  function applyQuality(next) {
    if (disposed || next === tier) return;
    tier = next;
    drawnReady = false;
    stage.setQuality(next);
    setSize(width, height);
    // 形と魚の材質は呼び出し側が所有する。影・画素比と同じ段へ更新してもらう。
    onQualityChange?.(next, GFX_TIERS[next]);
  }

  function render(dt = 0) {
    if (disposed || lost) return false;
    rig.update(dt);
    stage.update(dt);
    scene.environment = stage.envTexture;
    renderer.render(scene, camera);
    frames++;
    drawnReady = stage.ready;
    return true;
  }

  const loop = createFrameLoop({
    host, doc,
    frame(dt, now, ms) {
      if (ms > 0) fps = fps ? fps * 0.85 + 150 / ms : 1000 / ms;
      if (automatic && drawnReady) {
        const change = governor.push(ms, now);
        if (change) {
          writeLearnedGfx(change.to, { storage });
          applyQuality(change.to);
        }
      }
      onFrame?.(dt, now);
      render(dt);
    },
    onPause() { controls.cancel(); governor.resetFrames(); fps = 0; },
  });
  const onLost = (event) => {
    event.preventDefault();
    lost = true;
    drawnReady = false;
    loop.setAvailable(false);
  };
  const onRestored = () => {
    lost = false;
    stage.restoreEnvironment();
    stage.setQuality(tier);
    loop.setAvailable(true);
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  const resize = () => setSize();
  const observer = host.ResizeObserver ? new host.ResizeObserver(([entry]) => {
    if (entry) setSize(entry.contentRect.width, entry.contentRect.height);
  }) : null;
  if (observer) observer.observe(container);
  else host.addEventListener('resize', resize);
  setSize();

  return {
    renderer, scene, camera, rig, stage, mirror, controls, setSize, start: loop.start, stop: loop.stop, render,
    get quality() { return tier; },
    setQuality(setting) {
      if (disposed) return;
      automatic = !AUTO_TIERS.includes(setting);
      const next = select(setting);
      governor = createGfxGovernor({ tier: next });
      applyQuality(next);
    },
    setMirror(value) {
      mirror.scale.x = value ? -1 : 1;
      mirror.updateMatrixWorld(true);
      rig.setMirror(value);
    },
    async snapshot() {
      if (disposed || lost) throw new Error('3Dを表示できないため、画像を書き出せません。');
      return captureFrame({ renderer, scene, camera });
    },
    stats: () => ({ quality: tier, gl: 'webgl2', ready: drawnReady, triangles: renderer.info.render.triangles,
      drawCalls: renderer.info.render.calls, frames, fps, startupFps: governor.startupFps }),
    dispose() {
      if (disposed) return;
      disposed = true;
      drawnReady = false;
      loop.dispose();
      controls.dispose();
      if (observer) observer.disconnect();
      else host.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      scene.background = scene.environment = null;
      stage.dispose();
      mirror.remove(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
