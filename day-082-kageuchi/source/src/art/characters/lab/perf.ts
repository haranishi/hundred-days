// OWNER: chars-art
// 性能の計測（?perf=1）：人物10人（5種×2）を歩かせ、300 コマの update の時間と、人物1人あたりの三角形数・描画命令数を測る。
// 描画命令は「その人物だけを足した時に増える数」を、影の描画を含めた場合と含めない場合の両方で出す。
import { Vector3 } from 'three';
import type { CharacterKind } from '../../../contract/snapshot';
import { kindAsset } from '../asset';
import { createCharacter } from '../character';
import { circler, type Actor } from './scenarios';
import type { LabStage } from './stage';

const DT = 1 / 60;

function stats(xs: number[]): { mean: number; p50: number; p95: number; max: number } {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return { mean: xs.reduce((a, b) => a + b, 0) / xs.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}

export async function runPerf(stage: LabStage): Promise<void> {
  const kinds: CharacterKind[] = ['player', 'ashigaru', 'samurai', 'ranmaru', 'nobunaga'];
  const actors: Actor[] = [];
  kinds.forEach((k, i) => {
    actors.push(circler(k, `perf-${k}-a`, -4 + i * 2, -1.5, 1.4, k === 'player' ? 2.6 : 1.25, k === 'ashigaru' ? { lantern: true } : {}));
    actors.push(circler(k, `perf-${k}-b`, -4 + i * 2, 1.8, 1.2, k === 'player' ? 1.5 : 1.25, k === 'player' ? { stance: 'crouch' } : { awareness: 'suspicious' }, undefined, 1.3));
  });
  for (const a of actors) stage.scene.add(a.char.root);
  stage.camera.position.set(0, 7, 12);
  stage.camera.lookAt(new Vector3(0, 0.8, 0));
  stage.focusShadow(new Vector3(0, 0, 0), 8);
  let t = 0;
  // ならし（シェーダーを作り、足運びを落ち着かせる）
  for (let i = 0; i < 30; i++) {
    for (const a of actors) a.char.update(DT, a.drive(t, DT));
    t += DT;
  }
  stage.render();
  // 先に 300 コマ分の姿勢を作っておき、update だけを測る。performance.now の刻みは粗い（0.1ms 前後）ので、
  // 平均は 300 コマまとめた時間から出し、コマごとの値は外れ値の目安にだけ使う
  const snaps = Array.from({ length: 300 }, (_, i) => actors.map((a) => a.drive(t + i * DT, DT)));
  const perFrame: number[] = [];
  const all0 = performance.now();
  for (let i = 0; i < 300; i++) {
    const t0 = performance.now();
    for (let k = 0; k < actors.length; k++) actors[k].char.update(DT, snaps[i][k]);
    perFrame.push(performance.now() - t0);
  }
  const totalMs = performance.now() - all0;
  t += 300 * DT;
  const frame = { ...stats(perFrame), mean: totalMs / 300 };
  // 1人あたりの描画命令：その人物だけを足した時に増える数（後処理を通さず、直接描く）
  const r = stage.renderer;
  for (const a of actors) a.char.root.visible = false;
  r.info.autoReset = true;
  r.render(stage.scene, stage.camera);
  const baseCalls = r.info.render.calls;
  r.shadowMap.enabled = false;
  r.render(stage.scene, stage.camera);
  const baseCallsNoShadow = r.info.render.calls;
  const perKind: Record<string, { triangles: number; calls: number; callsNoShadow: number; vertices: number }> = {};
  for (const k of kinds) {
    const c = createCharacter(k);
    c.update(DT, { id: `perf-one-${k}`, kind: k, x: 0, z: 0, yaw: Math.PI / 2, pose: { speed: 0, stance: k === 'nobunaga' ? 'sit' : 'stand', awareness: 'calm', headYaw: 0, action: null, lantern: k === 'ashigaru', weapon: k === 'ashigaru' ? 'spear' : k === 'nobunaga' ? 'none' : 'katana' } });
    stage.scene.add(c.root);
    r.shadowMap.enabled = true;
    r.shadowMap.needsUpdate = true;
    r.render(stage.scene, stage.camera);
    const calls = r.info.render.calls - baseCalls;
    r.shadowMap.enabled = false;
    r.render(stage.scene, stage.camera);
    const callsNoShadow = r.info.render.calls - baseCallsNoShadow;
    const asset = kindAsset(k);
    perKind[k] = { triangles: asset.triangles, vertices: asset.geometry.getAttribute('position').count, calls, callsNoShadow };
    c.dispose();
  }
  r.shadowMap.enabled = true;
  window.__perfResult = {
    characters: actors.length,
    frames: 300,
    updateMsPerFrame: frame,
    updateMsPerCharacter: { mean: frame.mean / actors.length, p95: frame.p95 / actors.length, max: frame.max / actors.length },
    perKind,
    gpu: (() => {
      const gl = r.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    })(),
  };
}
