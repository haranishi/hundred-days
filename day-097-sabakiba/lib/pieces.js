import * as THREE from '../vendor/three.js';
import { PIECE_IDS, PIECE_PARENT } from './contract.js';
import { createAnatomy } from './anatomy.js';
import { samples, loft, sectionVertex, namedMesh, quadrantAngle, joinGeometries } from './loft.js';
import { addHead } from './head.js';
import { addMedianFins } from './fins.js';
import { addSkeleton, addRibs, addOrgans, pinbones } from './bones.js';
import { createRng, hashString } from './rng.js';
import { makeBasicMaterials } from './materials-basic.js';
import { getSpecies } from './species/index.js';

const QUALITY = { high: [64, 56], standard: [44, 40], light: [28, 28] };

// 境目を駅として含めたうえで、残る駅を区間長に比例して配ります。
function longitudes(a, count) {
  const stops = [0, a.head, a.cavityEnd, a.tail, 1];
  const ideal = stops.slice(1).map((s, i) => (s - stops[i]) * (count - 1));
  const sizes = ideal.map(x => Math.max(1, Math.floor(x)));
  while (sizes.reduce((sum, n) => sum + n, 0) < count - 1) {
    const remainder = ideal.map((x, i) => x - sizes[i]);
    sizes[remainder.indexOf(Math.max(...remainder))]++;
  }
  const stations = [0];
  for (let k = 0; k < sizes.length; k++) {
    for (let j = 1; j <= sizes[k]; j++) {
      const t = (j / sizes[k]) ** (k === 0 ? 1.65 : 1);
      stations.push(j === sizes[k] ? stops[k + 1] : stops[k] + (stops[k + 1] - stops[k]) * t);
    }
  }
  return stations;
}

function depthLevels(q, dorsal) {
  const arc = samples(Math.max(4, Math.ceil(q / 2)) + 1, t => sec => sec.r * Math.sin(t * Math.acos(0.35)));
  if (dorsal) return [...arc, sec => sec.limit];
  return [...arc, ...samples(q + 1, t => sec => sec.roof + t * (sec.floor - sec.roof)), sec => sec.limit];
}

function fleshArc(a, center, side, dorsal, t) {
  const sign = side === 'L' ? 1 : -1, direction = dorsal ? 1 : -1;
  return sectionVertex(a, center, s => {
    const sec = a.filletSection(s, dorsal), rim = 0.35 * sec.r;
    const alpha = t * Math.acos((rim / sec.width) ** (sec.n / 2));
    const d = t === 1 ? sec.limit : sec.height * Math.sin(alpha) ** (2 / sec.n);
    const z = t === 1 ? rim : sec.width * Math.cos(alpha) ** (2 / sec.n);
    const phi = sign > 0 ? direction * alpha : Math.PI - direction * alpha;
    return { p: [s * a.SL, sec.axisY + direction * d, sign * z], n: a.surface(s, phi).n,
      nTag: 4, tag: t === 1 ? 1 : 4, uv: [s, (phi + (sign > 0 && !dorsal ? 2 * Math.PI : 0)) / (2 * Math.PI)] };
  });
}

function quarter(a, centers, side, dorsal, m, q) {
  const sign = side === 'L' ? 1 : -1, direction = dorsal ? 1 : -1;
  const levels = depthLevels(q, dorsal);
  const rows = centers.map(center => {
    const outer = samples(q + 1, t => fleshArc(a, center, side, dorsal, t));
    const inner = levels.slice(0, -1).reverse().map((depth, j) => sectionVertex(a, center, s => {
      const sec = a.filletSection(s, dorsal), d = depth(sec);
      const wall = sec.wall(d);
      return { p: [s * a.SL, sec.axisY + direction * d, sign * (dorsal ? wall.seam : wall.boundary)],
        tag: j === levels.length - 2 ? 2 : 1 };
    }));
    return [...outer, ...inner];
  });
  return namedMesh(dorsal ? '背身' : '腹身', loft(rows, { materialForTag: {3: 1} }), [m.flesh, m.cap]);
}

function ribLayer(a, centers, side, m, q) {
  const sign = side === 'L' ? 1 : -1;
  const rows = centers.map(center => {
    const edge = (t, inner) => sectionVertex(a, center, s => {
      const sec = a.filletSection(s, false), d = sec.roof + t * (sec.floor - sec.roof);
      const wall = sec.wall(d);
      return { p: [s * a.SL, sec.axisY - d, sign * (inner ? wall.inside : wall.boundary)], tag: 1,
        reverseDiagonal: true };
    });
    return [...samples(q + 1, t => edge(t, false)), ...samples(q + 1, t => t).slice(1, -1).reverse().map(t => edge(t, true))];
  });
  return namedMesh('腹骨を含む層', loft(rows, { caps: [true, false], materialForTag: {3: 1} }), [m.flesh, m.cap]);
}

function skin(a, centers, side, dorsal, m, q) {
  const sign = side === 'L' ? 1 : -1, direction = dorsal ? 1 : -1;
  const rows = centers.map(center => samples(q, (_, j) => {
    const alpha = direction * quadrantAngle(j, q), phi = sign > 0 ? alpha : Math.PI - alpha;
    const v = (phi + (sign > 0 && !dorsal ? 2 * Math.PI : 0)) / (2 * Math.PI);
    return sectionVertex(a, center, s => ({ ...a.surface(s, phi), tag: 0, uv: [s, v] }));
  }));
  const surfaces = [loft(rows, { wrap: false, flip: sign * direction > 0 })];
  // 切り口に皮の厚みを返します。外縁は皮、内縁は身と同じ実頂点を使います。
  for (const tail of [false, true]) {
    const i = tail ? centers.length - 1 : 0;
    const normal = a.cutPlane(tail ? 'tail' : 'head').normal.map(v => tail ? v : -v);
    const lip = v => ({p: v.p, uv: v.uv, n: normal, tag: 3});
    const outer = [...rows[i], rows[i].at(-1)].map(lip);
    const inner = samples(q + 1, t => lip(fleshArc(a, centers[i], side, dorsal, t)));
    surfaces.push(loft([outer,inner], { wrap: false, flip: (sign * direction < 0) !== tail }));
  }
  return namedMesh(dorsal ? '背側の皮' : '腹側の皮', joinGeometries(surfaces), m.skin);
}

function tintSkin(root, anatomy, species, skinMaterial) {
  const palette = species.look?.colors ?? {};
  const back = new THREE.Color(palette.dorsal ?? '#2F4858'), flank = new THREE.Color(palette.flank ?? '#B8C7CC');
  const belly = new THREE.Color(palette.belly ?? '#EEF2F5'), c = new THREE.Color();
  root.traverse(mesh => {
    if (!mesh.isMesh || ![mesh.material].flat().includes(skinMaterial)) return;
    const geometry = mesh.geometry, attr = geometry.attributes.position, colors = [];
    for (let j = 0; j < attr.count; j++) {
      const pr = anatomy.profile(attr.getX(j) / anatomy.SL), h = attr.getY(j) - pr.axisY;
      const ratio = Math.min(1, Math.abs(h) / (h >= 0 ? pr.top || 1 : pr.bottom || 1));
      c.copy(flank).lerp(h >= 0 ? back : belly, h >= 0 ? ratio ** 1.3 : ratio);
      colors.push(c.r / Math.max(flank.r, 1e-6), c.g / Math.max(flank.g, 1e-6), c.b / Math.max(flank.b, 1e-6));
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  });
}

export function visitPieceMeshes(object, visit) {
  function walk(node) {
    if (node !== object && node.userData.pieceId && node.userData.pieceId !== object.userData.pieceId) return;
    if (node.isMesh) visit(node);
    for (const child of node.children) walk(child);
  }
  walk(object);
}

// 固体の中心は符号付き四面体の体積、開いた皮の中心は三角形の面積で重み付けします。
function centerOfPiece(object, shell) {
  const center = new THREE.Vector3(), transform = new THREE.Matrix4(), instance = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), moment = new THREE.Vector3();
  let weight = 0;
  visitPieceMeshes(object, mesh => {
    mesh.updateWorldMatrix(true, false);
    const { index, attributes } = mesh.geometry;
    for (let copy = 0; copy < (mesh.isInstancedMesh ? mesh.count : 1); copy++) {
      transform.copy(mesh.matrixWorld);
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(copy, instance); transform.multiply(instance); }
      for (let i = 0; i < index.count; i += 3) {
        a.fromBufferAttribute(attributes.position, index.getX(i)).applyMatrix4(transform);
        b.fromBufferAttribute(attributes.position, index.getX(i + 1)).applyMatrix4(transform);
        c.fromBufferAttribute(attributes.position, index.getX(i + 2)).applyMatrix4(transform);
        const normal = ab.subVectors(b, a).cross(ac.subVectors(c, a));
        const w = shell ? normal.length() / 2 : normal.dot(a) / 6;
        weight += w;
        center.addScaledVector(moment.copy(a).add(b).add(c), w / (shell ? 3 : 4));
      }
    }
  });
  return { weight, center: center.multiplyScalar(weight ? 1 / weight : 0) };
}

export function buildFishModel(species, { quality = 'standard', rng, materialFactory = makeBasicMaterials } = {}) {
  if (typeof species === 'string') species = getSpecies(species);
  if (!species?.sizeCm) throw new RangeError('魚の寸法データが見つかりません。');
  const settings = Object.hasOwn(QUALITY, quality) && QUALITY[quality];
  if (!settings) throw new RangeError(`画質「${quality}」はありません。`);
  const [segments, sides] = settings, q = sides / 4, a = createAnatomy(species, {segments});
  const source = typeof rng === 'number' ? createRng(rng) : rng ?? createRng(hashString(species.id));
  const m = materialFactory(species, { quality, rng: source.fork?.('材質') ?? source }), group = new THREE.Group(), pieces = {};
  group.name = species.name ?? species.id;
  const centers = longitudes(a, segments), trunk = centers.filter(s => s >= a.head && s <= a.tail);
  const objects = Object.fromEntries(PIECE_IDS.map(id => [id, new THREE.Group()]));
  const local = source.fork?.('血合い骨') ?? source;
  const variations = Array.from({length: species.pinbones?.count ?? 20}, () => typeof local === 'function' ? local() : local.next());
  addHead(objects.head, a, species, centers.filter(s => s <= a.head), m, q);
  addSkeleton(objects.bone, a, species, m, q);
  addMedianFins(objects.bone, a, species, centers, m, q);
  addOrgans(objects.viscera, objects.kidney, a, species, m, q);
  for (const side of ['L', 'R']) {
    for (const dorsal of [true, false]) {
      objects[side + (dorsal ? '.dorsal' : '.ventral')].add(quarter(a, trunk, side, dorsal, m, q));
      objects['skin.' + side].add(skin(a, trunk, side, dorsal, m, q));
    }
    const layer = ribLayer(a, trunk.filter(s => s <= a.cavityEnd), side, m, q);
    objects[side + '.strip'].add(layer);
    addRibs(objects[side + '.strip'], layer, a, species, side, m, q);
    objects['pinbones.' + side] = pinbones(a, species, side, variations, m, q);
  }
  const materials = new Set(Object.values(m).filter(mat => mat?.isMaterial)), geometries = new Set();
  const centroid = new THREE.Vector3();
  let volume = 0;
  for (const id of PIECE_IDS) {
    const object = objects[id], parent = objects[PIECE_PARENT[id]] ?? group;
    object.name = id; object.userData.pieceId = id;
    tintSkin(object, a, species, m.skin);
    let triangles = 0;
    visitPieceMeshes(object, mesh => {
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * (mesh.isInstancedMesh ? mesh.count : 1);
      geometries.add(mesh.geometry);
      for (const mat of [mesh.material].flat()) materials.add(mat);
    });
    const shell = id.startsWith('skin.'), mass = centerOfPiece(object, shell), pivot = mass.center.toArray();
    if (!shell) { centroid.addScaledVector(mass.center, mass.weight); volume += mass.weight; }
    const kind = id.startsWith('pinbones.') || id === 'bone' ? 'bone' : id.startsWith('skin.') ? 'skin'
      : id === 'head' ? 'composite' : id === 'viscera' || id === 'kidney' ? 'organ' : 'flesh';
    pieces[id] = { id, object, pivot, kind, group: parent, triangles };
  }
  group.userData.centroid = centroid.multiplyScalar(1 / volume).toArray();
  for (const piece of Object.values(pieces)) piece.group.add(piece.object);
  group.updateMatrixWorld(true);
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const object of Object.values(objects)) if (object.isInstancedMesh) object.dispose();
    for (const geometry of geometries) geometry.dispose();
    if (typeof m.dispose === 'function') m.dispose();
    else for (const mat of materials) mat.dispose();
  }
  return { group, anatomy: a, pieces, materials: m, dispose };
}
