// 山の描画だけを確かめるページ。器（game-shell）も物理も使わない。
// 使い方：/dev/mountain.html?q=high&webgl=0&drop=0&above=2.2&yaw=…&pitch=…&x=…&z=…&log=0
import { createMountainView } from '../src/render/index.js';

const q = new URLSearchParams(location.search);
const logEl = document.getElementById('log');
const api = (window.__mv = { ready: false, errors: [], warnings: [] });
window.addEventListener('error', (e) => api.errors.push('window: ' + e.message));
window.addEventListener('unhandledrejection', (e) => api.errors.push('promise: ' + (e.reason?.message || e.reason)));

async function loadWorldAny() {
  try {
    const mod = await import('../src/world/index.js');
    return await mod.loadWorld('/world/');
  } catch (e) {
    // 問い合わせの入口がまだ無いあいだの代わり：配列を直接読み、補間の式（surface-math）だけを使う
    api.warnings.push('src/world/index.js を使えないので、配列を直接読みました: ' + (e?.message || e));
    const sm = await import('../src/world/surface-math.js');
    const meta = await (await fetch('/world/world.json')).json();
    const bin = async (name) => (await fetch('/world/' + name)).arrayBuffer();
    const [h, t, a, b, s] = await Promise.all(['height.f32', 'tile-a.f32', 'masks-a.bin', 'masks-b.bin', 'sun-evening.u8'].map(bin));
    const buffers = { height: new Float32Array(h), tileA: new Float32Array(t), masksA: new Uint8Array(a), masksB: new Uint8Array(b), sunVis: new Uint8Array(s) };
    return { meta, buffers, drops: meta.drops, half: meta.size / 2, size: meta.size, heightAt: (x, z) => sm.heightAt(meta, buffers, x, z) };
  }
}

async function main() {
  const world = await loadWorldAny();
  // 見た目の調整用：?gain=0.1&exp=0.62&sun=3.6&env=1&fog=0&sunvis=0&csm=0&shadows=0
  const tune = { sky: {}, sun: {} };
  if (q.has('gain')) tune.sky.gain = Number(q.get('gain'));
  if (q.has('turb')) tune.sky.turbidity = Number(q.get('turb'));
  if (q.has('ray')) tune.sky.rayleigh = Number(q.get('ray'));
  if (q.has('sun')) tune.sun.intensity = Number(q.get('sun'));
  if (q.has('env')) tune.envIntensity = Number(q.get('env'));
  if (q.has('exp')) tune.exposure = Number(q.get('exp'));
  if (q.has('tm')) tune.toneMapping = q.get('tm');
  if (q.has('skydebug')) tune.skyDebug = q.get('skydebug');
  if (q.get('fog') === '0') tune.fog = false;
  if (q.get('sunvis') === '0') tune.sunVis = false;
  if (q.get('csm') === '0') tune.csm = false;
  if (q.get('shadows') === '0') tune.shadows = false;
  const view = createMountainView({ forceWebGL: q.get('webgl') === '1', tune });
  const host = document.getElementById('host');
  await view.init({ canvasHost: host, world, tier: q.get('q') || 'high' });
  const fit = () => view.resize(host.clientWidth, host.clientHeight, window.devicePixelRatio);
  fit();
  addEventListener('resize', fit);

  const cam = view.context.debugCamera;
  const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
  const drop = world.drops?.[num('drop', 0)];
  const base = drop || { x: 0, z: 0, heading: 0 };
  cam.set({ x: num('x', base.x), z: num('z', base.z), above: num('above', 2.2), yaw: num('yaw', base.heading), pitch: num('pitch', -0.2) });

  Object.assign(api, { view, world, cam, backend: view.context.backend, frameMs: [] });
  if (q.get('measure') === '1') api.env = await view.context.sky.measureEnv();
  if (q.get('lod') === '1') view.context.terrain.setDebugLod(true);
  if (q.get('micro') === '0') view.context.terrain.setMicro(false);
  api.errors = view.context.errors.concat(api.errors);
  if (q.get('log') === '0') logEl.style.display = 'none';

  let last = performance.now();
  let frames = 0;
  function frame() {
    const now = performance.now();
    const dt = now - last;
    last = now;
    view.render({ frameDt: dt / 1000 });
    frames++;
    if (frames > 30 && api.frameMs.length < 900) api.frameMs.push(dt);
    if (frames === 40) api.ready = true;
    if (frames % 30 === 0) {
      const ms = api.frameMs.slice(-60);
      const avg = ms.reduce((s, v) => s + v, 0) / Math.max(1, ms.length);
      const c = cam.get();
      logEl.textContent = `${api.backend}  ${view.context.tier.name}  ${avg.toFixed(1)} ms\n区画 ${view.stats.nodes}  描画 ${view.stats.drawCalls}  三角形 ${view.stats.triangles}\n位置 ${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.z.toFixed(0)}  誤り ${view.context.errors.length}`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  api.errors.push('main: ' + (e?.stack || e));
  logEl.textContent = '失敗: ' + (e?.message || e);
});
