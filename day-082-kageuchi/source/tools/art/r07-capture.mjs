// OWNER: world-art
// r07の描画状態と固定構図を撮影する。書込みは.captures/r07-worldのみ。ゲームのcore・人物には手を入れない。
// node tools/art/r07-capture.mjs           世界の消灯・開放・回収・再初期化を5405で撮影
// node tools/art/r07-capture.mjs --game    専用ビルドを5406で配り、r07-beforeと同じ遊ぶ構図を撮影
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertGpu, openBrowser, shoot } from '../lib/shoot.mjs';
import { pngStats } from '../core/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, '.captures/r07-world');
const VITE = path.join(ROOT, 'node_modules/.bin/vite');
const gameMode = process.argv.includes('--game');
const port = gameMode ? 5406 : 5405;
const viewport = { width: 1280, height: 720 };
const url = `http://127.0.0.1:${port}`;
let child;

async function server() {
  if (gameMode) {
    const built = spawnSync(VITE, ['build', '--outDir', '.captures/r07-world/game-build'], {
      cwd: ROOT, stdio: 'inherit', env: { ...process.env, KAGE_PAGES: 'index', VITE_CACHE_DIR: 'node_modules/.vite-art' },
    });
    assert.equal(built.status, 0, '遊ぶページの専用ビルド');
  }
  child = spawn(VITE, [...(gameMode ? ['preview', '--outDir', '.captures/r07-world/game-build'] : []), '--port', String(port), '--host', '127.0.0.1', '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VITE_CACHE_DIR: 'node_modules/.vite-art' },
  });
  let log = '';
  child.stdout.on('data', (data) => { log += data; });
  child.stderr.on('data', (data) => { log += data; });
  process.once('exit', () => { if (child.exitCode === null) child.kill(); });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(log);
    try { if ((await fetch(url)).ok) return; } catch { /* 起動を待つ */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`ローカル撮影サーバーの起動失敗: ${log}`);
}

const html = `<!doctype html><html><body style="margin:0;background:black"><canvas id="game"></canvas><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import {buildWorld,createRenderer,createPost,warmUp} from '/src/art/world/index.ts';
import {HONNOJI} from '/src/stage/honnoji.ts';
import {SKY_UNIFORMS} from '/src/art/render/sky.ts';
try {
  const renderer=createRenderer(document.getElementById('game'));
  renderer.setSize(1280,720); const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(50,1280/720,0.2,1500);
  const world=buildWorld(scene,renderer,HONNOJI); const post=createPost(renderer,scene,camera); post.setSize(1280,720);
  const items=(HONNOJI.interactions??[]).map(d=>({id:d.id,kind:d.kind,x:d.pos.x,z:d.pos.z,used:false,progress:0}));
  const draw=()=>{world.update(1/60,8);world.updateForCamera(camera);post.render(1/60)};
  const look=(x,z,kind)=>{const item=kind==='supply'||kind==='intel';camera.position.set(kind==='barrier'?x:item?x-0.9:x-3,2.7,kind==='barrier'?z+3.1:item?z+3.2:z);camera.lookAt(x,0.65,z);camera.updateMatrixWorld();for(let i=0;i<12;i++)draw()};
  look(-2.8,-10.4);await warmUp(renderer,scene,camera);for(let i=0;i<48;i++)draw();
  const uniforms=material=>{const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader,renderer);return shader.uniforms};
  window.__r07={renderer,scene,camera,world,post,items,stage:HONNOJI,air:SKY_UNIFORMS.uKgAir,look,draw,
    uniforms,
    fresh:()=>{world.dispose();post.dispose();const w=buildWorld(scene,renderer,HONNOJI);w.update(1/60,8);return w;}};
  window.__shotReady=true;
} catch(error) {window.__artError=String(error.stack??error);console.error(error)}
</script></body></html>`;

async function interactions(page) {
  await page.route('**/__r07_world.html', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(`${url}/__r07_world.html`);
  await page.waitForFunction(() => window.__shotReady || window.__artError, null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => window.__artError ?? null), null);
  const checks = [];
  const save = async (name) => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    return { file: path.relative(ROOT, file), ...await pngStats(file) };
  };
  for (const id of ['lamp-center-w', 'lamp-center-e', 'lamp-west']) {
    for (const disabled of [false, true, false]) {
      const result = await page.evaluate(({ id, disabled }) => {
        const s = window.__r07;
        const def = s.stage.interactions.find((d) => d.id === id);
        const off = disabled ? [def.lightId] : [];
        s.look(def.pos.x, def.pos.z);
        const before = s.renderer.info.programs.length;
        s.world.setInteractions(s.items.map((item) => ({ ...item, used: item.id === id && disabled })), off);
        for (let i = 0; i < 12; i++) s.draw();
        const light = s.scene.getObjectByName('light-' + def.lightId);
        const glow = s.scene.getObjectByName('glow');
        const attrs = glow.geometry.getAttribute('aKgLight');
        const slot = s.stage.lights.findIndex((l) => l.id === def.lightId);
        let boundVertices = 0;
        for (let i = 0; i < attrs.count; i++) if (attrs.getX(i) === slot) boundVertices++;
        const air=s.air.value.find(v=>Math.hypot(v.x-light.position.x,v.z-light.position.z)<0.1);
        return { id, disabled, intensity: light.intensity, lightVisible: light.visible, before, after: s.renderer.info.programs.length, boundVertices,
          emission:s.uniforms(glow.material).uKgLampState.value.image.data[slot*4],airIntensity:air?.w };
      }, { id, disabled });
      assert.equal(result.lightVisible, true, '光源の枠を維持');
      assert.ok(result.boundVertices > 0, '同じ光源へ発光面を接続');
      assert.ok(disabled ? result.intensity === 0 : result.intensity > 0, '消灯/再点灯を維持');
      assert.equal(result.emission, disabled ? 0 : 255, '発光面の消灯/再点灯を同期');
      assert.ok(disabled ? result.airIntensity === 0 : result.airIntensity > 0, '霧への光を同期');
      assert.equal(result.before, result.after, '消灯でシェーダーを増やさない');
      const suffix = disabled ? 'off' : checks.some((c) => c.id === id) ? 'reset' : 'on';
      checks.push({ ...result, ...await save(`${id}-${suffix}`) });
    }
  }
  for (const id of ['bamboo-door', 'supply-bell', 'supply-store', 'scout-note']) {
    for (const used of [false, true, false]) {
      const result = await page.evaluate(({ id, used }) => {
        const s = window.__r07;
        const def = s.stage.interactions.find((d) => d.id === id);
        s.look(def.pos.x, def.pos.z,def.kind);
        s.world.setInteractions(s.items.map((item) => ({ ...item, used: item.id === id && used })), []);
        for (let i = 0; i < 12; i++) s.draw();
        const root = s.scene.getObjectByName('interaction-' + id);
        return { id, used, visible: root.visible, contents: root.getObjectByName('contents')?.visible, lid: root.getObjectByName('lid')?.rotation.x };
      }, { id, used });
      if (id === 'bamboo-door') assert.equal(result.visible, !used, '板戸の開放/再初期化');
      else assert.equal(result.contents, !used, '補給/偵察書の回収/再初期化');
      const suffix = used ? 'used' : checks.some((c) => c.id === id) ? 'reset' : 'ready';
      checks.push({ ...result, ...await save(`${id}-${suffix}`) });
    }
  }
  const fresh = await page.evaluate(() => {
    const s = window.__r07;
    s.world.setInteractions(s.items.map((item) => ({...item,used:true})), s.stage.lights.map((l) => l.id));
    const world = s.fresh();
    return { intensity: world.root.getObjectByName('light-sl-c1').intensity, barrier: world.root.getObjectByName('interaction-bamboo-door').visible };
  });
  assert.ok(fresh.intensity > 0 && fresh.barrier, '別worldへ状態を漏らさない');
  return { checks, fresh };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await server();
  const { browser, name } = await openBrowser();
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(String(error)));
    let result;
    if (gameMode) {
      const shots = [];
      for (const shot of ['start', 'courtyard', 'garden', 'nobunaga', 'bamboo']) {
        const file = path.join(OUT, `game-${shot}.png`);
        await shoot(page, `${url}/?shot=${shot}`, file);
        const baseline = path.join(ROOT, `.captures/r07-before/${shot}.png`);
        const before = await readFile(baseline).then(() => pngStats(baseline)).catch(() => null);
        shots.push({ shot, file: path.relative(ROOT, file), before, after: await pngStats(file), info: await page.evaluate(() => window.__shotInfo) });
      }
      result = { shots };
    } else result = await interactions(page);
    const gpu = await assertGpu(page);
    assert.equal(errors.length, 0, errors.join('\n').slice(0, 800));
    const summary = { date: new Date().toISOString(), browser: name, gpu, viewport, errors, ...result };
    await writeFile(path.join(OUT, gameMode ? 'game-comparison.json' : 'interactions.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ browser: name, gpu, errors, checks: result.checks?.length, shots: result.shots?.map((s) => ({ shot: s.shot, before: s.before?.meanLum, after: s.after.meanLum })) }));
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { if (child?.exitCode === null) child.kill(); });
