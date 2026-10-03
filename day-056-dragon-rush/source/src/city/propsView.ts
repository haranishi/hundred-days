// OWNER: city
// 道の小物（街路樹・街灯・信号）をインスタンス描画で置く。街灯と信号の形は簡素なもの。
// r01-city：街路樹は treeView.ts（枝と葉のカード・距離の帯）に移した。
import { BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { QualityPreset } from '../config/quality';
import { AMBIENT } from '../config/render';
import type { MaterialKit } from '../render/materials';
import { replaceOrThrow } from '../render/materials';
import { NOISE_GLSL } from '../render/shaders/noiseGlsl';
import type { CityProps, PropPlacement } from '../world/props';
import type { CityData } from '../world/types';
import { StreetLifeView } from './streetLifeView';
import { TreeView } from './treeView';

class Soup {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  emit: number[] = [];
  push(p: Vector3, n: Vector3, c: Color, e: number): void {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    this.emit.push(e);
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aEmit', new BufferAttribute(new Float32Array(this.emit), 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** y 方向の円柱（または円錐台）。 */
function cylinder(s: Soup, base: Vector3, height: number, r0: number, r1: number, sides: number, color: Color, emit = 0): void {
  for (let k = 0; k < sides; k++) {
    const a0 = (k / sides) * Math.PI * 2;
    const a1 = ((k + 1) / sides) * Math.PI * 2;
    const n0 = new Vector3(Math.cos(a0), 0, Math.sin(a0));
    const n1 = new Vector3(Math.cos(a1), 0, Math.sin(a1));
    const p00 = base.clone().addScaledVector(n0, r0);
    const p01 = base.clone().addScaledVector(n1, r0);
    const p10 = base.clone().addScaledVector(n0, r1).setY(base.y + height);
    const p11 = base.clone().addScaledVector(n1, r1).setY(base.y + height);
    s.push(p00, n0, color, emit);
    s.push(p11, n1, color, emit);
    s.push(p01, n1, color, emit);
    s.push(p00, n0, color, emit);
    s.push(p10, n0, color, emit);
    s.push(p11, n1, color, emit);
  }
}

/** 軸に平行な箱（6面）。 */
function box(s: Soup, center: Vector3, size: Vector3, color: Color, emit = 0): void {
  const h = size.clone().multiplyScalar(0.5);
  const faces: [Vector3, Vector3, Vector3][] = [
    [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)],
    [new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 1, 0)],
    [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)],
    [new Vector3(0, -1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1)],
    [new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)],
    [new Vector3(0, 0, -1), new Vector3(0, 1, 0), new Vector3(1, 0, 0)],
  ];
  for (const [n, u, v] of faces) {
    const c = center.clone().add(new Vector3(n.x * h.x, n.y * h.y, n.z * h.z));
    const du = new Vector3(u.x * h.x, u.y * h.y, u.z * h.z);
    const dv = new Vector3(v.x * h.x, v.y * h.y, v.z * h.z);
    const p = [c.clone().sub(du).sub(dv), c.clone().add(du).sub(dv), c.clone().add(du).add(dv), c.clone().sub(du).add(dv)];
    for (const i of [0, 1, 2, 0, 2, 3]) s.push(p[i], n, color, emit);
  }
}

function lampGeometry(): BufferGeometry {
  const s = new Soup();
  const metal = new Color(0x5d6064);
  cylinder(s, new Vector3(0, 0, 0), 8, 0.12, 0.08, 7, metal);
  box(s, new Vector3(0, 8.0, 0.9), new Vector3(0.12, 0.12, 1.9), metal);
  box(s, new Vector3(0, 7.85, 1.75), new Vector3(0.35, 0.18, 0.7), new Color(0xb9b6ad), 0);
  return s.geometry();
}

function signalGeometry(): BufferGeometry {
  const s = new Soup();
  const metal = new Color(0x6a6d70);
  cylinder(s, new Vector3(0, 0, 0), 6, 0.15, 0.11, 7, metal);
  box(s, new Vector3(0, 5.8, 2.4), new Vector3(0.14, 0.14, 4.8), metal);
  const housing = new Color(0x2c2e30);
  box(s, new Vector3(0, 5.55, 4.1), new Vector3(1.25, 0.42, 0.34), housing);
  // 灯器（左から青・黄・赤）。青だけ点けておく
  box(s, new Vector3(-0.4, 5.55, 3.92), new Vector3(0.3, 0.3, 0.04), new Color(0.05, 0.6, 0.45), 3.5);
  box(s, new Vector3(0, 5.55, 3.92), new Vector3(0.3, 0.3, 0.04), new Color(0.35, 0.3, 0.1), 0);
  box(s, new Vector3(0.4, 5.55, 3.92), new Vector3(0.3, 0.3, 0.04), new Color(0.3, 0.08, 0.06), 0);
  // 歩行者用の小さな信号
  box(s, new Vector3(0, 2.6, 0.25), new Vector3(0.36, 0.7, 0.3), housing);
  return s.geometry();
}

function createPropMaterial(kit: MaterialKit): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05, envMapIntensity: AMBIENT.envIntensity });
  m.name = 'Props';
  return kit.patch(m, {
    key: 'props',
    vertex: (src) => {
      let s = replaceOrThrow(src, '#include <common>', '#include <common>\nattribute float aEmit;\nvarying float vEmit;\nvarying vec3 vPropPos;');
      s = replaceOrThrow(
        s,
        '#include <begin_vertex>',
        `#include <begin_vertex>
vEmit = aEmit;
{
  vec4 pp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    pp = instanceMatrix * pp;
  #endif
  vPropPos = (modelMatrix * pp).xyz;
}`,
      );
      return s;
    },
    fragment: (src) => {
      let s = replaceOrThrow(src, '#include <common>', `#include <common>\nvarying float vEmit;\nvarying vec3 vPropPos;\n${NOISE_GLSL}`);
      s = replaceOrThrow(
        s,
        '#include <color_fragment>',
        `#include <color_fragment>
if (vEmit < -0.5) {
  // 葉のまだら：大きめの塊と細かい葉の明暗
  float n = fbm2(vPropPos.xz * 1.9 + vPropPos.y * 1.3, 3);
  float fine = vnoise(vPropPos.xz * 7.0 + vPropPos.y * 5.0);
  diffuseColor.rgb *= 0.5 + 0.8 * n + 0.25 * (fine - 0.5);
}`,
      );
      s = replaceOrThrow(s, '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * max(vEmit, 0.0);');
      return s;
    },
  });
}

function instanced(geometry: BufferGeometry, material: MeshStandardMaterial, items: PropPlacement[]): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, items.length));
  mesh.count = items.length;
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  items.forEach((it, i) => {
    q.setFromAxisAngle(up, it.yaw);
    m.compose(new Vector3(it.x, 0.15, it.z), q, new Vector3(it.scale, it.scale, it.scale));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * 道の小物の描画。街路樹（treeView.ts）と通りの暮らし（streetLifeView.ts：車・人・消火栓などの小物）は距離の帯で形を切り替える。
 * 街灯と信号はまとめて描く。この group は水面の鏡像と環境マップには映さない（app.ts の mirrorHidden）。
 */
export class PropsView {
  readonly group = new Group();
  readonly trees: TreeView;
  readonly life: StreetLifeView;

  constructor(city: CityData, props: CityProps, kit: MaterialKit, quality: QualityPreset) {
    this.group.name = 'props';
    const material = createPropMaterial(kit);
    this.trees = new TreeView(props.trees, kit, quality.trees, city.curbHeight);
    this.life = new StreetLifeView(city, kit, quality);
    this.group.add(this.trees.group, this.life.group);
    const lamps = instanced(lampGeometry(), material, props.lamps);
    lamps.name = 'lamps';
    const signals = instanced(signalGeometry(), material, props.signals);
    signals.name = 'signals';
    this.group.add(lamps, signals);
  }

  /** 毎コマ、描画の前に呼ぶ。 */
  update(camera: Vector3): void {
    this.trees.update(camera);
    this.life.update(camera);
  }
}
