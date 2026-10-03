// OWNER: city
// 遠景の地形：湾の対岸の丘と、背後の山並み。霧に溶ける輪郭として読ませるので、形は粗くてよい。
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshStandardMaterial } from 'three';
import type { MaterialKit } from '../render/materials';
import type { SceneryData } from '../world/scenery';

type Profile = { offset: number; height: number; color: [number, number, number] }[];

/** 標本の並び（稜線）と横断面から格子のメッシュを作る。 */
function ridgeMesh(
  samples: SceneryData['farShore']['samples'],
  profile: (h: number) => Profile,
  place: (along: number, offset: number, y: number) => [number, number, number],
): BufferGeometry {
  const cols = profile(0).length;
  const pos = new Float32Array(samples.length * cols * 3);
  const col = new Float32Array(samples.length * cols * 3);
  samples.forEach((s, i) => {
    profile(s.height).forEach((p, j) => {
      const k = (i * cols + j) * 3;
      const v = place(s.along, p.offset, p.height);
      pos.set(v, k);
      col.set(p.color, k);
    });
  });
  const index: number[] = [];
  for (let i = 0; i + 1 < samples.length; i++) {
    for (let j = 0; j + 1 < cols; j++) {
      const a = i * cols + j;
      const b = (i + 1) * cols + j;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  // 巻き順がどちら向きでも上を向くように、法線の y を正にそろえる
  const n = g.getAttribute('normal') as BufferAttribute;
  for (let i = 0; i < n.count; i++) {
    if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  g.computeBoundingSphere();
  return g;
}

const SHORE: [number, number, number] = [0.16, 0.15, 0.13];
const FOREST: [number, number, number] = [0.045, 0.06, 0.035];
const RIDGE: [number, number, number] = [0.07, 0.075, 0.055];

export function buildTerrain(scenery: SceneryData, waterLevel: number, kit: MaterialKit): Mesh[] {
  const material = kit.patch(new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), { key: 'terrain' });
  material.name = 'Terrain';
  material.side = DoubleSide; // 巻き順に頼らない
  const fs = scenery.farShore;
  const shore = ridgeMesh(
    fs.samples,
    (h) => [
      { offset: 80, height: waterLevel - 10, color: SHORE },
      { offset: 0, height: 3, color: SHORE },
      { offset: -260, height: h * 0.42, color: FOREST },
      { offset: -900, height: h, color: RIDGE },
      { offset: -1600, height: h * 0.8, color: FOREST },
      { offset: -fs.depth, height: h * 0.45, color: FOREST },
    ],
    (along, offset, y) => [fs.x + offset, y, along],
  );
  const mt = scenery.mountains;
  const mountains = ridgeMesh(
    mt.samples,
    (h) => [
      { offset: 0, height: -12, color: FOREST },
      { offset: 700, height: h * 0.45, color: FOREST },
      { offset: 1700, height: h, color: RIDGE },
      { offset: 2800, height: h * 0.75, color: FOREST },
      { offset: 3800, height: h * 0.3, color: FOREST },
    ],
    (azDeg, offset, y) => {
      const a = (azDeg * Math.PI) / 180;
      const r = mt.radius + offset;
      return [Math.sin(a) * r, y, -Math.cos(a) * r];
    },
  );
  return [new Mesh(shore, material), new Mesh(mountains, material)].map((m, i) => {
    m.name = i === 0 ? 'farShore' : 'mountains';
    m.receiveShadow = false;
    m.castShadow = false;
    return m;
  });
}
