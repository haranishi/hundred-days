// 山の上の目印を描く：出発地点の門・駅の門・ジャンプ台の踏み切りの線と旗・崖の縁の竹ざお。
// 置く場所は marker-plan.js が山のデータ（world.json の drops・stations・features）から決める＝遊びの決まりと同じ場所に立つ。
// 当たり判定は持たない（線の外側に立てるので、ぶつからない）。
import * as THREE from 'three/webgpu';

import { markerPlan, basis } from './marker-plan.js';

const LINE_FADE = 0.035; // 踏み切りの線を、雪面から浮かせる高さ（m）

/**
 * @param {{view:object, world:object}} deps
 */
export function createMarkers({ view, world }) {
  const plan = markerPlan(world);
  const group = new THREE.Group();
  group.name = 'markers';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  let flagMesh = null;
  const disposables = [];

  function build() {
    // 柱：根もとを原点にした細い筒。高さと太さは 1 本ずつ変える
    if (plan.poles.length) {
      const g = new THREE.CylinderGeometry(1, 1.25, 1, 6, 1, false);
      g.translate(0, 0.5, 0);
      const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 }), plan.poles.length);
      plan.poles.forEach((p, i) => {
        const y = world.heightAt(p.x, p.z) - 0.25; // 雪に少し埋める
        m4.compose(p3.set(p.x, y, p.z), q.identity(), s3.set(p.radius, p.height + 0.25, p.radius));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, color.setHex(p.color));
      });
      mesh.castShadow = true;
      mesh.name = 'marker-poles';
      group.add(mesh); disposables.push(g, mesh.material);
    }
    // 旗：柱の先から、進む向きの後ろへなびく三角の布
    if (plan.flags.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, -0.62, 0, 1, -0.31, 0]), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
      const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
      flagMesh = new THREE.InstancedMesh(g, mat, plan.flags.length);
      flagMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      plan.flags.forEach((f, i) => flagMesh.setColorAt(i, color.setHex(f.color)));
      flagMesh.name = 'marker-flags';
      flagMesh.frustumCulled = false; // 毎コマ動かすので、個別の範囲は持たない
      group.add(flagMesh); disposables.push(g, mat);
      placeFlags(0);
    }
    // 駅の門の横断幕：2 本の柱のあいだに張る、たるんだ布
    if (plan.banners.length) {
      const g = new THREE.PlaneGeometry(1, 0.8, 12, 1);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setY(i, pos.getY(i) - (0.25 - x * x) * 0.5); // 中ほどが下がる
        pos.setZ(i, (0.25 - x * x) * 0.35); // 風で少しふくらむ
      }
      g.computeVertexNormals();
      const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(g, mat, plan.banners.length);
      plan.banners.forEach((b, i) => {
        const y = world.heightAt(b.x, b.z) + b.height;
        q.setFromAxisAngle(yAxis, -b.heading);
        m4.compose(p3.set(b.x, y, b.z), q, s3.set(b.width, 1, 1));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, color.setHex(b.color));
      });
      mesh.castShadow = true;
      mesh.name = 'marker-banners';
      group.add(mesh); disposables.push(g, mat);
    }
    // 雪面の線（踏み切りの帯・助走のわきの線・縁の破線）：雪面に沿わせた薄い面。色ごとに 1 つへまとめる
    // （仕掛けが 20 を超えるので、線ごとに面を分けると、描く回数が 100 を超える）
    const byColor = new Map();
    for (const line of plan.lines) {
      const b = basis(line.heading), depth = line.depth ?? 0.45;
      const nw = Math.max(1, Math.round(line.width / 0.75)), nd = Math.max(1, Math.round(depth / 0.75));
      let bucket = byColor.get(line.color);
      if (!bucket) byColor.set(line.color, bucket = { positions: [], indices: [] });
      const base = bucket.positions.length / 3;
      for (let i = 0; i <= nw; i++) for (let k = 0; k <= nd; k++) {
        const t = (i / nw - 0.5) * line.width, along = (k / nd - 0.5) * depth;
        const x = line.x + b.sx * t + b.fx * along, z = line.z + b.sz * t + b.fz * along;
        bucket.positions.push(x, world.heightAt(x, z) + LINE_FADE, z);
      }
      for (let i = 0; i < nw; i++) for (let k = 0; k < nd; k++) {
        const a = base + i * (nd + 1) + k, c = a + nd + 1;
        bucket.indices.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    for (const [hex, bucket] of byColor) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bucket.positions), 3));
      g.setIndex(bucket.indices);
      g.computeVertexNormals();
      const mat = new THREE.MeshStandardNodeMaterial({ color: hex, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      mesh.name = 'marker-lines';
      group.add(mesh); disposables.push(g, mat);
    }
  }

  /** 旗を、時刻に合わせてゆっくり振る（同じ時刻なら同じ絵になる） */
  function placeFlags(time) {
    if (!flagMesh) return;
    for (let i = 0; i < plan.flags.length; i++) {
      const f = plan.flags[i];
      const y = world.heightAt(f.x, f.z) + f.height;
      const sway = Math.sin(time * 2.3 + i * 1.7) * 0.22 + Math.sin(time * 5.1 + i * 0.9) * 0.08;
      // 布は、進む向きの後ろ（山の上の側）へなびかせる：滑ってくる人から、色の面が見える
      q.setFromAxisAngle(yAxis, -f.heading + Math.PI / 2 + sway);
      m4.compose(p3.set(f.x, y, f.z), q, s3.set(f.size * 1.5, f.size * 1.5, 1));
      flagMesh.setMatrixAt(i, m4);
    }
    flagMesh.instanceMatrix.needsUpdate = true;
  }

  let clock = 0;
  const system = {
    name: 'markers',
    init(context) { build(); context.scene.add(group); },
    update(frame) {
      clock += Math.min(0.1, Math.max(0, frame.frameDt || 0));
      placeFlags(clock);
    },
    dispose() {
      group.removeFromParent();
      for (const d of disposables) d.dispose?.();
    },
  };
  view.addSystem(system);
  return { system, plan, group };
}
