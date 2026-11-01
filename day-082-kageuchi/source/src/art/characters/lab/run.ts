// OWNER: chars-art
// 確認ページの本体：URL の引数で、構図（shot）・連番（film）・性能（perf）・自由に見る、を切り替える。
// どれも 1/60 秒の固定刻みで進めるので、同じ引数なら同じ絵になる。
import { Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CharacterSnap } from '../../../contract/snapshot';
import { createLabStage, type LabStage } from './stage';
import { SCENARIOS, type Scenario } from './scenarios';
import { runFilm } from './film';
import { runPerf } from './perf';

const DT = 1 / 60;

/** 場面の人物を1コマ進める。 */
export function stepScenario(sc: Scenario, t: number, dt: number): void {
  for (const a of sc.actors) {
    const snap: CharacterSnap = a.drive(t, dt);
    a.char.update(dt, snap);
  }
  sc.after?.(t, dt);
}

/** 人物の頭の上に名札を出す（撮影で何の構図か分かるように）。 */
export function placeLabels(stage: LabStage, sc: Scenario, holder: HTMLElement): void {
  holder.innerHTML = '';
  const w = stage.renderer.domElement.clientWidth;
  const h = stage.renderer.domElement.clientHeight;
  const p = new Vector3();
  for (const a of sc.actors) {
    if (!a.label) continue;
    a.char.root.updateMatrixWorld(true);
    p.set(0, a.labelY ?? 2.05, 0).applyMatrix4(a.char.root.matrixWorld);
    if (a.labelAt) p.copy(a.labelAt);
    p.project(stage.camera);
    if (p.z > 1) continue;
    const el = document.createElement('div');
    el.textContent = a.label;
    el.style.cssText = `position:absolute;left:${((p.x + 1) / 2) * w}px;top:${((1 - p.y) / 2) * h}px;transform:translate(-50%,-100%);color:#efe6d2;font:600 13px "Hiragino Sans",sans-serif;text-shadow:0 1px 3px #000,0 0 6px #000;white-space:nowrap;pointer-events:none`;
    holder.appendChild(el);
  }
}

export async function runLab(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  document.body.style.cssText = 'margin:0;overflow:hidden;background:#070b16';
  const ui = document.getElementById('ui') as HTMLElement;
  ui.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  // 影絵（名前に Matte を含む構図）は、光のにじみと色調の処理を通さない
  const post = q.get('post') !== '0' && !(q.get('shot') ?? '').includes('Matte');
  const stage = createLabStage(canvas, { post });
  window.addEventListener('resize', () => stage.resize());

  if (q.get('perf')) {
    await runPerf(stage);
    return;
  }
  const film = q.get('film');
  if (film) {
    runFilm(stage, film, Number(q.get('frames') ?? 48), ui);
    return;
  }
  const shotName = q.get('shot');
  const sc = SCENARIOS[shotName ?? 'roam']?.(stage, q);
  if (!sc) throw new Error(`知らない構図: ${shotName}`);
  if (sc.shadow) stage.focusShadow(sc.shadow.target, sc.shadow.half);
  (window as unknown as { __lab: unknown }).__lab = { sc, stage };
  for (const a of sc.actors) stage.scene.add(a.char.root);

  if (shotName) {
    let t = 0;
    for (let i = 0; i < sc.warmup; i++) {
      stepScenario(sc, t, DT);
      t += DT;
    }
    sc.camera(stage.camera, t);
    stage.render();
    stage.render();
    if (q.get('labels') !== '0') placeLabels(stage, sc, ui);
    window.__shotInfo = {
      triangles: stage.renderer.info.render.triangles,
      calls: stage.renderer.info.render.calls,
      actors: sc.actors.length,
    };
    window.__shotReady = true;
    return;
  }

  // 自由に見る：ゆっくり進め、マウスで回す
  const controls = new OrbitControls(stage.camera, canvas);
  ui.style.pointerEvents = 'none';
  sc.camera(stage.camera, 0);
  controls.target.copy(sc.lookAt ?? new Vector3(0, 1, 0));
  controls.update();
  let t = 0;
  let last = performance.now();
  let acc = 0;
  const loop = (now: number) => {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= DT) {
      stepScenario(sc, t, DT);
      t += DT;
      acc -= DT;
    }
    controls.update();
    stage.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
