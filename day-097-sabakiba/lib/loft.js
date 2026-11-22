import * as THREE from '../vendor/three.js';

export const samples = (count, fn) => Array.from({ length: count }, (_, i) => fn(i / (count - 1), i));
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = ([a, b, c], [x, y, z]) => [b * z - c * y, c * x - a * z, a * y - b * x];
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const unit = v => { const len = Math.hypot(...v); return len ? v.map(x => x / len) : [0, 0, 0]; };
const mean = points => points.reduce((acc, p) => acc.map((x, i) => x + p[i] / points.length), [0, 0, 0]);
const pointOf = v => v.p ?? v;

function areaVector(points) {
  const sum = [0, 0, 0], origin = points[0];
  for (let j = 1; j + 1 < points.length; j++) {
    const n = cross(sub(points[j], origin), sub(points[j + 1], origin));
    for (let k = 0; k < 3; k++) sum[k] += n[k];
  }
  return sum;
}

// 耳切りの前に一直線に並ぶ点を控えます。耳切り後に元の辺をすべて復元します。
// こうしないと、S面の平らな区間で蓋と側面の辺の数が合いません。
function capTriangles(points, normal, emit) {
  const axis = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  const uv = points.map(p => new THREE.Vector2(p[(axis + 1) % 3], p[(axis + 2) % 3]));
  const indices = points.map((_, i) => i);
  const ccw = Math.sign(normal[axis]);
  const extent = Math.max(...uv.map(p => p.distanceTo(uv[0])));
  const epsilon = Math.max(1e-14, extent * 1e-8);
  const turn = (a, b, c) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  function fan(boundary, center) {
    for (let j = 0; j < boundary.length; j++) emit(center, boundary[j], boundary[(j + 1) % boundary.length]);
  }
  const convex = indices.every((b, i) => {
    const a = uv.at(i - 1), c = uv[(i + 1) % uv.length];
    return ccw * turn(a, uv[b], c) >= -epsilon * a.distanceTo(c);
  });
  if (convex) { fan(indices, mean(points)); return; }
  const keep = [...indices];
  for (let i = 0; keep.length > 3 && i < keep.length; ) {
    const a = uv[keep.at(i - 1)], b = uv[keep[i]], c = uv[keep[(i + 1) % keep.length]];
    if (Math.abs(turn(a, b, c)) <= epsilon * a.distanceTo(c) &&
        (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) >= 0) {
      keep.splice(i, 1);
      i = Math.max(0, i - 1);
    } else i++;
  }
  const boundaryEdges = new Map();
  for (let i = 0; i < keep.length; i++) {
    const a = keep[i], b = keep[(i + 1) % keep.length], between = [];
    for (let j = (a + 1) % points.length; j !== b; j = (j + 1) % points.length) between.push(j);
    boundaryEdges.set(a + ',' + b, between);
    boundaryEdges.set(b + ',' + a, [...between].reverse());
  }
  for (const ear of THREE.ShapeUtils.triangulateShape(keep.map(i => uv[i]), [])) {
    let [a, b, c] = ear.map(i => keep[i]);
    if (ccw * turn(uv[a], uv[b], uv[c]) < 0) [b, c] = [c, b];
    const corners = [a, b, c], boundary = [];
    for (let i = 0; i < 3; i++) {
      const first = corners[i], next = corners[(i + 1) % 3];
      boundary.push(first, ...(boundaryEdges.get(first + ',' + next) ?? []));
    }
    if (boundary.length === 3) emit(a, b, c);
    else fan(boundary, mean(corners.map(i => points[i])));
  }
}

// 頂点の tag は次の頂点へ向かう辺の材質区分です。異なる区分の境界で法線を分けます。
// 開いた輪では wrap:false、点に収束する端や殻には caps:[false,false] を渡します。
export function loft(rings, { wrap = true, caps = [wrap, wrap], capContours = [], flip, tag = 4, capTag = 3, materialForTag = {} } = {}) {
  const count = rings[0]?.length, last = rings.length - 1;
  if (last < 1 || count < 2 || !rings.every(r => r.length === count)) throw new RangeError('輪の頂点数をそろえます。');
  const rows = rings.map(r => r.map(v => pointOf(v).map(Math.fround)));
  if (flip === undefined) {
    const normal = areaVector(rows[Math.floor(rings.length / 2)]);
    flip = dot(normal, sub(mean(rows[last]), mean(rows[0]))) < 0;
  }
  const positions = [], normals = [], uvs = [], tags = [], provided = [], groups = new Map(), vertices = new Map();
  function vertex(key, p, uv, n, seg) {
    if (vertices.has(key)) return vertices.get(key);
    const id = positions.length / 3;
    vertices.set(key, id);
    positions.push(...p); normals.push(...(n ?? [0, 0, 0])); provided.push(!!n);
    uvs.push(...uv); tags.push(seg);
    return id;
  }
  function face(a, b, c, seg) {
    if (flip) [b, c] = [c, b];
    const p = id => [positions[id * 3], positions[id * 3 + 1], positions[id * 3 + 2]];
    const n = cross(sub(p(b), p(a)), sub(p(c), p(a)));
    if (dot(n, n) < 1e-28) return;
    const material = materialForTag[seg] ?? 0;
    if (!groups.has(material)) groups.set(material, []);
    groups.get(material).push(a, b, c);
    for (const id of [a, b, c]) {
      if (!provided[id]) for (let k = 0; k < 3; k++) normals[id * 3 + k] += n[k];
    }
  }
  function sideVertex(i, j, seg, endOfWrap = false) {
    const v = rings[i][j], n = v.nTag === undefined || v.nTag === seg ? v.n : undefined;
    const seam = endOfWrap && v.wrapUV;
    return vertex(i + '/' + j + '/' + seg + (seam ? '/端' : ''), rows[i][j], seam || v.uv || [i / last, j / count], n, seg);
  }
  for (let i = 0; i < last; i++) {
    for (let j = 0; j < count - (wrap ? 0 : 1); j++) {
      const k = (j + 1) % count, seg = rings[i][j].tag ?? tag;
      const a = sideVertex(i, j, seg), b = sideVertex(i, k, seg, k === 0);
      const c = sideVertex(i + 1, k, seg, k === 0), d = sideVertex(i + 1, j, seg);
      if (rings[i][j].reverseDiagonal) { face(a, b, c, seg); face(a, c, d, seg); }
      else { face(a, b, d, seg); face(b, c, d, seg); }
    }
  }
  for (const i of [0, last]) {
    if (!caps[i === 0 ? 0 : 1]) continue;
    const contour = capContours[i === 0 ? 0 : 1];
    const pts = contour ? contour.map(v => pointOf(v).map(Math.fround)) : rows[i], area = areaVector(pts);
    if (Math.hypot(...area) < 1e-12) continue;
    const n = unit(area).map(x => (i === 0) !== !!flip ? -x : x);
    function capVertex(v) {
      const p = typeof v === 'number' ? pts[v] : v.map(Math.fround);
      return vertex('c' + i + '/' + v, p, [p[1], p[2]], n, capTag);
    }
    capTriangles(pts, area, (a, b, c) => {
      if (i === 0) [b, c] = [c, b];
      face(capVertex(a), capVertex(b), capVertex(c), capTag);
    });
  }
  for (let i = 0; i < normals.length; i += 3) {
    const n = unit(normals.slice(i, i + 3));
    // 円錐の頂点が輪の複数の角に重なる場合は、使われなかった頂点も有限に保ちます。
    if (!n.some(Boolean)) n[0] = 1;
    normals[i] = n[0]; normals[i + 1] = n[1]; normals[i + 2] = n[2];
  }
  const geometry = new THREE.BufferGeometry(), indices = [];
  for (const [material, faces] of groups) {
    geometry.addGroup(indices.length, faces.length, material);
    for (const id of faces) indices.push(id);
  }
  geometry.setIndex(indices);
  for (const [key, array, size] of [['position', positions, 3], ['normal', normals, 3], ['uv', uvs, 2], ['aSeg', tags, 1]]) {
    geometry.setAttribute(key, new THREE.Float32BufferAttribute(array, size));
  }
  return geometry;
}

export function sectionVertex(anatomy, center, fn) {
  const s = anatomy.stationOnSection(center, t => pointOf(fn(t))[1]);
  return fn(s);
}

// 点列に沿う管。前の輪の軸を次の接平面へ投影し、曲がった肋骨のねじれを抑えます。
export function tube(points, radii, sides = 6, tag = 1) {
  let firstAxis;
  const rings = points.map((p, i) => {
    const tangent = unit(sub(points[Math.min(i + 1, points.length - 1)], points[Math.max(0, i - 1)]));
    if (!firstAxis) firstAxis = Math.abs(tangent[1]) < 0.85 ? [0, 1, 0] : [0, 0, 1];
    const second = unit(cross(tangent, firstAxis));
    firstAxis = unit(cross(second, tangent));
    const radius = typeof radii === 'number' ? radii : radii[i];
    return Array.from({ length: sides }, (_, j) => {
      const phi = j * 2 * Math.PI / sides;
      return { p: p.map((v, k) => v + radius * (firstAxis[k] * Math.cos(phi) + second[k] * Math.sin(phi))), tag };
    });
  });
  return loft(rings, { flip: false, capTag: tag });
}

export function ellipsoid(center, axes, slices, sides, tag) {
  const rings = samples(slices + 1, (t, i) => {
    const x = -Math.cos(t * Math.PI), radius = i === 0 || i === slices ? 0 : Math.sin(t * Math.PI);
    return Array.from({ length: sides }, (_, j) => {
      const phi = 2 * Math.PI * j / sides, v = [x, radius * Math.cos(phi), radius * Math.sin(phi)];
      return { p: v.map((k, n) => center[n] + axes[n] * k), n: unit(v.map((k, n) => k / axes[n])), tag };
    });
  });
  return loft(rings, { caps: [false, false], flip: false });
}

export function namedMesh(name, geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

// 同じ材質を持つ小さな骨やヒレのすじを、まとめて1回で描画します。
export function joinGeometries(parts, keepGroups = false) {
  const geometry = new THREE.BufferGeometry(), indices = [];
  const fields = { position: [], normal: [], uv: [], aSeg: [] };
  for (const part of parts) {
    const offset = fields.aSeg.length;
    if (keepGroups) for (const g of part.groups) geometry.addGroup(indices.length + g.start, g.count, g.materialIndex);
    for (const [name, array] of Object.entries(fields)) {
      for (const value of part.attributes[name].array) array.push(value);
    }
    for (const j of part.index.array) indices.push(offset + j);
    part.dispose();
  }
  geometry.setIndex(indices);
  for (const [name, array] of Object.entries(fields)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(array, name === 'uv' ? 2 : name === 'aSeg' ? 1 : 3));
  }
  return geometry;
}

export const bandAngle = 0.085;
export function quadrantAngle(j, q) {
  return j === q ? Math.PI / 2 : j / (q - 1) * (Math.PI / 2 - bandAngle);
}

export function bodyRing(a, center, q) {
  return Array.from({ length: 4 * q }, (_, i) => {
    const quadrant = Math.floor(i / q), j = i % q;
    const phi = quadrant % 2 === 0 ? quadrant * Math.PI / 2 + quadrantAngle(j, q)
      : (quadrant + 1) * Math.PI / 2 - quadrantAngle(q - j, q);
    return sectionVertex(a, center, s => ({ ...a.surface(s, phi), tag: 0, uv: [s, phi / (2 * Math.PI)], wrapUV: i === 0 && [s, 1] }));
  });
}
