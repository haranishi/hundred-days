import * as THREE from '../vendor/three.js';
import { samples, loft, sectionVertex, tube, joinGeometries, namedMesh } from './loft.js';

export function addSkeleton(group, a, species, m, q) {
  const pre = species.vertebrae?.pre ?? 10, caudal = species.vertebrae?.caudal ?? 14;
  const bodies = [], spines = [], trimmings = [];
  for (let i = 0; i < pre + caudal; i++) {
    const front = i < pre, step = front ? (a.cavityEnd - a.head) / pre : (a.tail - a.cavityEnd) / caudal;
    const start = front ? a.head + i * step : a.cavityEnd + (i - pre) * step;
    const axis = samples(q < 10 ? 5 : 7, t => start + (0.006 + 0.988 * t) * step);
    const sides = q < 10 ? 12 : q * 2;
    const vertebra = axis.map((center, j) => Array.from({length: sides}, (_, k) => sectionVertex(a, center, s => {
      const r = a.spineRadius(s), phi = 2 * Math.PI * k / sides;
      const radius = r - Math.min(0.013, r * 0.18) * Math.sin(j * Math.PI / (axis.length - 1)) ** 2;
      return [s * a.SL, a.profile(s).axisY + radius * Math.cos(phi), radius * Math.sin(phi)];
    })));
    bodies.push(loft(vertebra, { tag: 1, capTag: 1, flip: false }));
    const s = start + 0.45 * step, p = a.profile(s), r = a.spineRadius(s);
    for (const direction of front ? [1] : [1, -1]) {
      const end = (direction > 0 ? p.top : p.bottom) * 0.86;
      // 棘の根元は幅のある楔、先端は後ろ向きです。身のS面の間に収めます。
      const rows = samples(4, t => {
        const x = s * a.SL + step * a.SL * 0.82 * t, y = p.axisY + direction * (r * 0.77 + (end - r * 0.77) * t);
        const dx = step * a.SL * (0.22 * (1 - t) + 0.009), dz = r * (0.28 * (1 - t) + 0.013);
        return [[x-dx,y,0], [x,y,dz], [x+dx,y,0], [x,y,-dz]];
      });
      spines.push(loft(rows, { tag: 1, capTag: 1 }));
    }
    // 溝の平らな中央部に残る中落ち。椎体の上下面から棘と同じ傾きで伸びます。
    for (const direction of [1, -1]) {
      const slab = samples(3, t => {
        return [[0.02,-1], [0.98,-1], [0.98,1], [0.02,1]].map(([along, sign]) => {
          const center = start + step * (along + (1 - along) * 0.47 * t);
          return sectionVertex(a, center, s => {
            const sec = a.filletSection(s, direction > 0);
            const edge = direction < 0 && front ? sec.roof : sec.limit - Math.min(0.01 * a.SL, sec.limit * 0.10);
            const d = 0.91 * sec.r + (edge - 0.91 * sec.r) * t;
            return [s * a.SL, sec.axisY + direction * d, sign * 0.35 * sec.r];
          });
        });
      });
      trimmings.push(loft(slab));
    }
  }
  group.add(namedMesh('椎体', joinGeometries(bodies), m.bone), namedMesh('神経棘と血管棘', joinGeometries(spines), m.bone));
  group.add(namedMesh('中骨に残る身', joinGeometries(trimmings), m.flesh));
}

export function addRibs(group, layer, a, species, side, m, q) {
  const sign = side === 'L' ? 1 : -1, ribs = [], count = Math.max(1, (species.vertebrae?.pre ?? 10) - 2);
  const sectionMesh = new THREE.Mesh(layer.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), inward = new THREE.Vector3(0,0,-sign), hits = [];
  for (let i = 0; i < count; i++) {
    const portion = (i + 1) / (count + 1);
    const base = a.head + (a.cavityEnd - a.head) * (0.12 + 0.76 * portion);
    const rows = samples(q + 2, t => {
      const s = base + 0.022 * t * t, sec = a.filletSection(s, false);
      const depth = 0.10 + 0.81 * t, wall = sec.wall(sec.roof + (sec.floor - sec.roof) * depth);
      const radius = Math.min((wall.boundary - wall.inside) * 0.23, a.SL * (0.0017 - 0.0013 * t));
      const sides = q < 10 ? 5 : 6;
      // 管の外周も壁の座標から作り、腹腔が閉じる尾側で骨が薄い層を突き抜けるのを防ぎます。
      return Array.from({length: sides}, (_, j) => {
        const phi = j * Math.PI * 2 / sides, station = s + radius * Math.cos(phi) / a.SL;
        const section = a.filletSection(station, false), d = section.roof + (section.floor - section.roof) * depth;
        const x = a.SL * station, y = section.axisY - d;
        ray.set(origin.set(x, y, sign * a.SL), inward);
        hits.length = 0;
        ray.intersectObject(sectionMesh, false, hits);
        const w = section.wall(d);
        const outer = hits.length ? sign * hits[0].point.z : w.boundary;
        const inner = hits.length ? sign * hits.at(-1).point.z : w.inside;
        const offset = Math.min(radius, (outer - inner) * 0.4) * Math.sin(phi);
        return [x, y, sign * ((outer + inner) / 2 + offset)];
      });
    });
    ribs.push(loft(rows, { tag: 1, capTag: 1 }));
  }
  sectionMesh.material.dispose();
  group.add(namedMesh('腹骨' + side, joinGeometries(ribs), m.bone));
}

export function pinbones(a, species, side, variations, m, q) {
  const sign = side === 'L' ? 1 : -1, count = variations.length;
  const start = Math.max(a.head + 0.018, (species.pinbones?.from ?? 30) / 100);
  const end = Math.min(a.tail, (species.pinbones?.to ?? 65) / 100);
  const geometry = tube([[0,0,0], [0.76,0,0], [1,0,0]],
    [0.0011 * a.SL, 0.00067 * a.SL, 0.00018 * a.SL], q >= 10 ? 6 : 5);
  const mesh = new THREE.InstancedMesh(geometry, m.bone, count);
  mesh.name = '血合い骨' + side;
  const along = new THREE.Vector3(1,0,0);
  for (let i = 0; i < count; i++) {
    const s = start + (end - start) * (i + 0.5) / count, pr = a.profile(s), r = a.spineRadius(s);
    const root = new THREE.Vector3(s * a.SL, pr.axisY + 0.35 * r, sign * a.groove(s, 0.35 * r));
    const v = new THREE.Vector3(pr.half * (0.17 + 0.10 * variations[i]), pr.top * 0.19, sign * pr.half * 0.66);
    const length = v.length(), rotation = new THREE.Quaternion().setFromUnitVectors(along, v.normalize());
    mesh.setMatrixAt(i, new THREE.Matrix4().compose(root, rotation, new THREE.Vector3(length, 1, 1)));
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function addOrgans(viscera, kidney, a, species, m, q) {
  const station = u => a.head + (a.cavityEnd - a.head) * u;
  // 同じ腹壁を座標系にして、胃・肝臓・鰾・腸が、魚の厚みに合わせて収まるようにします。
  function cavity(s, depth, lateral) {
    const sec = a.filletSection(s, false), d = sec.roof + depth * (sec.floor - sec.roof);
    const width = sec.wall(d).inside;
    return [s * a.SL, sec.axisY - d, lateral * width];
  }
  function sac(name, from, to, depth, height, lateral, width, mat) {
    const rows = samples(q + 5, (u, i) => {
      const fullness = i === 0 || i === q + 4 ? 0 : Math.sin(Math.PI * u) ** 0.52;
      return Array.from({length: q * 2}, (_, j) => {
        const phi = j * Math.PI / q;
        return sectionVertex(a, station(from + (to - from) * u), s =>
          cavity(s, depth + height * fullness * Math.sin(phi), lateral + width * fullness * Math.cos(phi)));
      });
    });
    viscera.add(namedMesh(name, loft(rows, { caps: [false, false] }), mat));
  }
  if (species.swimBladder !== false) sac('鰾', 0.045, 0.96, 0.18, 0.155, 0, 0.88, m.bladder ?? m.skin);
  sac('胃', 0.016, 0.76, 0.57, 0.41, -0.38, 0.58, m.stomach ?? m.organ);
  sac('肝臓', 0.006, 0.69, 0.56, 0.39, 0.55, 0.41, m.liver ?? m.organ);
  const radii = [];
  const intestine = samples(q * 6 + 1, t => {
    const s = station(0.43 + 0.51 * t), phi = 2 * Math.PI * 2.7 * t;
    const depth = 0.59 + 0.17 * Math.sin(phi), lateral = 0.50 * Math.cos(phi);
    const p = cavity(s, depth, lateral), sec = a.filletSection(s, false);
    const width = sec.wall(sec.axisY - p[1]).inside;
    radii.push(Math.min(a.SL * 0.0062, width * 0.23));
    return p;
  });
  viscera.add(namedMesh('腸のとぐろ', tube(intestine, radii, q < 10 ? 6 : 8, 4), m.organ));
  const ridge = samples(q * 2 + 1, (t, i) => Array.from({length: q + 2}, (_, j) => {
    const phi = j * 2 * Math.PI / (q + 2), scale = i === 0 || i === q * 2 ? 0 : Math.sin(t * Math.PI) ** 0.38;
    return sectionVertex(a, a.head + (a.vent - a.head) * t, s => {
      const r = a.spineRadius(s);
      return [s * a.SL, a.profile(s).axisY - r * (1.13 + 0.25 * scale * Math.sin(phi)), r * 0.62 * scale * Math.cos(phi)];
    });
  }));
  kidney.add(namedMesh('背わた', loft(ridge, { caps: [false,false] }), m.kidney ?? m.organ));
}
