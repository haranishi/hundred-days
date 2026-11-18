/**
 * 物理の商品ではない、場所の見た目：バナナの皮（見え方の peels）と、試食台の皿のウインナー（stations.samples.left）。
 * どちらもコードで組む形を InstancedMesh で描く（素材を読み込まずに済み、描画も1回ずつ）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StoreLayout } from '../../shared/layout/store';
import { BANANA, SAMPLES } from '../../shared/rules/tuning';
import type { WorldView } from '../../shared/view';
import { PALETTE } from './palette';

function colored(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = src.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', src.getAttribute('position'));
  out.setAttribute('normal', src.getAttribute('normal'));
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return out;
}

/** バナナの皮：黄色の4枚の花びらと、茶色の芯 */
function peelGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const petal = new THREE.BoxGeometry(0.1, 0.03, 0.3);
    petal.translate(0, 0.015, 0.15);
    petal.rotateY((Math.PI / 2) * i + 0.35);
    parts.push(colored(petal, PALETTE.yellow));
  }
  const core = new THREE.CylinderGeometry(0.06, 0.07, 0.06, 8);
  core.translate(0, 0.03, 0);
  parts.push(colored(core, PALETTE.woodDark));
  return mergeGeometries(parts, false)!;
}

/** 試食のウインナー（爪楊枝つき） */
function sausageGeometry(): THREE.BufferGeometry {
  const body = new THREE.CapsuleGeometry(0.035, 0.11, 4, 8);
  body.rotateZ(Math.PI / 2);
  body.translate(0, 0.04, 0);
  const pick = new THREE.CylinderGeometry(0.006, 0.006, 0.12, 4);
  pick.translate(0, 0.1, 0);
  return mergeGeometries([colored(body, PALETTE.red), colored(pick, PALETTE.wood)], false)!;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const scl = new THREE.Vector3(1, 1, 1);
const one = new THREE.Vector3(1, 1, 1);
const zero = new THREE.Vector3(0, 0, 0);
const PEEL_POP_TIME = 0.35;

export class StationsView {
  readonly group = new THREE.Group();
  private readonly peels: THREE.InstancedMesh;
  private readonly sausages: THREE.InstancedMesh;
  private readonly plate: { x: number; y: number; z: number };
  private readonly peelAge = new Map<number, number>();

  constructor(layout: StoreLayout, material: THREE.Material) {
    this.group.name = 'stations';
    this.peels = new THREE.InstancedMesh(peelGeometry(), material, BANANA.maxPeels * 4);
    this.peels.frustumCulled = false;
    this.peels.receiveShadow = true;
    this.sausages = new THREE.InstancedMesh(sausageGeometry(), material, SAMPLES.count);
    this.sausages.castShadow = true;
    this.sausages.frustumCulled = false;
    const t = layout.fixtures.find((f) => f.kind === 'sample-table')!;
    this.plate = { x: t.pos.x, y: t.size.y + 0.03, z: t.pos.z };
    this.group.add(this.peels, this.sausages);
  }

  update(view: WorldView, dt = 1 / 60): void {
    const n = this.peels.count;
    const safeDt = Math.max(0, dt);
    const active = new Set<number>();
    for (let i = 0; i < n; i++) {
      const p = view.peels[i];
      if (p) {
        active.add(p.id);
        const prev = this.peelAge.get(p.id);
        const age = prev === undefined ? 0 : prev + safeDt;
        this.peelAge.set(p.id, age);
        const u = Math.min(1, age / PEEL_POP_TIME);
        const pop = 1.5 - 0.5 * (1 - (1 - u) * (1 - u));
        q.setFromAxisAngle(up, (p.id * 1.7) % (Math.PI * 2));
        m4.compose(pos.set(p.pos.x, 0.012, p.pos.z), q, scl.setScalar(pop));
      } else m4.compose(pos.set(0, -50, 0), q.identity(), zero);
      this.peels.setMatrixAt(i, m4);
    }
    for (const id of this.peelAge.keys()) if (!active.has(id)) this.peelAge.delete(id);
    this.peels.instanceMatrix.needsUpdate = true;
    // 皿の上に、残っている本数だけ輪に並べる
    const left = view.stations.samples.left;
    for (let i = 0; i < SAMPLES.count; i++) {
      if (i < left) {
        const a = (i / SAMPLES.count) * Math.PI * 2;
        q.setFromAxisAngle(up, -a);
        m4.compose(pos.set(this.plate.x + Math.cos(a) * 0.17, this.plate.y, this.plate.z + Math.sin(a) * 0.17), q, one);
      } else m4.compose(pos.set(0, -50, 0), q.identity(), zero);
      this.sausages.setMatrixAt(i, m4);
    }
    this.sausages.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.peelAge.clear();
    this.peels.geometry.dispose();
    this.peels.dispose();
    this.sausages.geometry.dispose();
    this.sausages.dispose();
  }
}
