import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../vendor/three.js';
import { SPECIES } from '../../lib/species/index.js';
import { PIECE_IDS, PIECE_PARENT } from '../../lib/contract.js';
import { buildFishModel, visitPieceMeshes } from '../../lib/pieces.js';
import { measure, envelopeVolume } from '../../tools/geometry-report.mjs';
import { preparePreview, previewOptions } from '../../tools/geometry-view.mjs';

const budgets = {light: 20000, standard: 45000, high: 90000};
const originalAji = {light: 19736, standard: 34750, high: 55246};

function fingerprint(fish) {
  const hash = createHash('sha256');
  for (const piece of Object.values(fish.pieces)) {
    hash.update(JSON.stringify([piece.id, piece.kind, piece.pivot, piece.triangles]));
    visitPieceMeshes(piece.object, mesh => {
      hash.update(mesh.name);
      hash.update(JSON.stringify(mesh.geometry.groups));
      for (const attr of [mesh.geometry.index, ...Object.values(mesh.geometry.attributes), mesh.instanceMatrix]) {
        if (attr) hash.update(Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength));
      }
    });
  }
  return hash.digest('hex');
}

// 頭と尾の斜面の間だけを積分します。腹腔・骨・皮を除いた肉の実体積と比較します。
function fleshVolume(a) {
  const head = a.cutPlane('head'), tail = a.cutPlane('tail');
  const distance = (plane, x, y) => (x - plane.point[0]) * plane.normal[0] + (y - plane.point[1]) * plane.normal[1];
  let sum = 0;
  for (let i = 0; i < 480; i++) {
    const s = (i + 0.5) / 480, x = s * a.SL;
    for (const up of [false, true]) {
      const section = a.filletSection(s, up), dy = section.limit / 112;
      for (let j = 0; j < 112; j++) {
        const d = dy * (j + 0.5), y = section.axisY + (up ? d : -d);
        if (distance(head, x, y) < 0 || distance(tail, x, y) > 0) continue;
        const wall = section.wall(d);
        sum += 2 * (section.widthAt(d) - (up ? wall.seam : wall.inside)) * dy * a.SL / 480;
      }
    }
  }
  return sum;
}

function checkFinlets(fish, sp) {
  const a = fish.anatomy, bySide = {dorsal: [], anal: []};
  for (const fin of fish.pieces.bone.object.children.filter(m => m.name === '小離ビレ')) {
    const p = fin.geometry.attributes.position, sign = Math.sign(p.getY(0));
    let start = 1, end = 0, height = 0;
    for (let i = 0; i < p.count; i++) {
      const s = p.getX(i) / a.SL;
      start = Math.min(s, start); end = Math.max(s, end);
      height = Math.max(height, sign * (p.getY(i) - a.flank(s, sign)[1]));
    }
    bySide[sign > 0 ? 'dorsal' : 'anal'].push({start, end, height});
  }
  for (const [side, list] of Object.entries(bySide)) {
    assert.equal(list.length, sp.fins.finlets[side]);
    const main = side === 'dorsal' ? sp.fins.dorsal.at(-1) : sp.fins.anal;
    let previousEnd = main.end / 100, previousHeight = Infinity;
    for (const fin of list.sort((a, b) => a.start - b.start)) {
      assert.ok(fin.start > previousEnd && fin.end < 1);
      assert.ok(fin.height > 0 && fin.height < previousHeight);
      previousEnd = fin.end; previousHeight = fin.height;
    }
  }
}

function checkCutFaces(fish) {
  const a = fish.anatomy;
  function faces(geometry, include) {
    const {position, aSeg} = geometry.attributes, keys = new Set(), index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const ids = [index[i], index[i + 1], index[i + 2]];
      if (!ids.every(j => include(aSeg.getX(j), position.getX(j), position.getY(j), position.getZ(j)))) continue;
      keys.add(ids.map(j => [position.getX(j), position.getY(j), position.getZ(j)].join(',')).sort().join('|'));
    }
    return keys;
  }
  const horizontal = seg => seg === 2;
  const boundary = (seg, x, y, z) => {
    const s = x / a.SL;
    if (seg !== 1 || s > a.cavityEnd + 1e-7) return false;
    const sec = a.filletSection(s, false), depth = sec.axisY - y;
    return depth >= sec.roof - 1e-6 && depth <= sec.floor + 1e-6 && Math.abs(Math.abs(z) - sec.wall(depth).boundary) < 2e-6;
  };
  for (const side of ['L', 'R']) {
    const geo = part => fish.pieces[side + '.' + part].object.children[0].geometry;
    const dorsal = faces(geo('dorsal'), horizontal), ventral = geo('ventral');
    assert.ok(dorsal.size > 0);
    assert.deepEqual(dorsal, faces(ventral, horizontal));
    const strip = faces(geo('strip'), boundary), adjoining = faces(ventral, boundary);
    assert.ok(adjoining.size > 0);
    for (const face of adjoining) assert.ok(strip.has(face), '腹骨層と腹身の合わせ面');
  }
  for (const id of ['head', 'L.dorsal', 'R.dorsal', 'L.ventral', 'R.ventral', 'L.strip', 'R.strip']) {
    const {position, normal, aSeg} = fish.pieces[id].object.children[0].geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      if (aSeg.getX(i) !== 3) continue;
      const x = position.getX(i), y = position.getY(i), front = x < a.SL / 2;
      const plane = a.cutPlane(front ? 'head' : 'tail');
      const dist = (x - plane.point[0]) * plane.normal[0] + (y - plane.point[1]) * plane.normal[1];
      const agreement = normal.getX(i) * plane.normal[0] + normal.getY(i) * plane.normal[1];
      assert.ok(Math.abs(dist) < 5e-6 && agreement * (front && id !== 'head' ? -1 : 1) > 0.9999, id);
    }
  }
}

function checkAbdomen(fish, sp, quality) {
  const a = fish.anatomy, plane = a.cutPlane('head');
  const material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
  const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), direction = new THREE.Vector3(), hits = [];
  const walls = {};
  function cast(wall, x, y, z, sign) {
    ray.set(origin.set(x, y, z), direction.set(0, 0, sign));
    hits.length = 0;
    ray.intersectObject(wall, false, hits);
  }
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const [layer, ribs] = fish.pieces[side + '.strip'].object.children;
    const wall = new THREE.Mesh(layer.geometry, material), p = ribs.geometry.attributes.position;
    walls[sign] = wall;
    function inLayer(x, y, z, tolerance) {
      cast(wall, x, y, sign * a.SL, -sign);
      assert.ok(hits.length >= 2 && sign * z <= sign * hits[0].point.z + tolerance &&
        sign * z >= sign * hits.at(-1).point.z - tolerance, '腹骨');
    }
    for (let i = 0; i < p.count; i++) inLayer(p.getX(i), p.getY(i), p.getZ(i), 1e-5);
    const index = ribs.geometry.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const [j, k, l] = index.subarray(i, i + 3);
      const x = (p.getX(j) + p.getX(k) + p.getX(l)) / 3;
      const y = (p.getY(j) + p.getY(k) + p.getY(l)) / 3;
      const z = (p.getZ(j) + p.getZ(k) + p.getZ(l)) / 3;
      // 元のアジは軽めの面内で最大0.011 cmの弦近似誤差があります。
      inLayer(x, y, z, sp.id === 'aji' && quality === 'light' ? 0.011 : 1e-5);
    }
  }
  const organs = fish.pieces.viscera.object;
  assert.equal(!!organs.getObjectByName('鰾'), sp.swimBladder);
  assert.equal(!!organs.getObjectByName('胃'), sp.stomach !== false);
  for (const mesh of organs.children) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), sign = z < 0 ? -1 : 1;
      assert.ok(x / a.SL < a.cavityEnd && (x-plane.point[0])*plane.normal[0] + (y-plane.point[1])*plane.normal[1] >= -1e-5);
      const sec = a.filletSection(x / a.SL, false), d = sec.axisY - y;
      assert.ok(d > sec.roof && d < sec.floor && Math.abs(z) <= sec.wall(d).inside + 1e-5, mesh.name);
      cast(walls[sign], x, y, 0, sign);
      assert.ok(hits.length && Math.abs(z) <= hits[0].distance + 1e-5, mesh.name);
    }
  }
  material.dispose();
}

for (const sp of Object.values(SPECIES)) {
  for (const [quality, budget] of Object.entries(budgets)) {
    test(`${sp.name}・${quality}の閉じた立体、身と骨の収まり、離れビレ、予算、再現性を確かめます`, () => {
      const fish = buildFishModel(sp.id, {quality, rng: 97}), volumes = {};
      assert.deepEqual(Object.keys(fish.pieces), PIECE_IDS);
      let triangles = 0, flesh = 0, solids = 0;
      for (const piece of Object.values(fish.pieces)) {
        const {id, object} = piece, stats = measure(object);
        assert.equal(object.userData.pieceId, id);
        assert.equal(object.parent, fish.pieces[PIECE_PARENT[id]]?.object ?? fish.group);
        assert.ok(piece.pivot.every(Number.isFinite) && stats.centroid.every(Number.isFinite), id);
        assert.equal(stats.triangles, piece.triangles);
        if (id.startsWith('pinbones.')) {
          if (sp.pinbones.count === 0) {
            assert.ok(object.isGroup && object.children.length === 0);
            assert.equal(stats.triangles, 0);
            continue;
          }
          assert.ok(object.isInstancedMesh);
          assert.equal(object.count, sp.pinbones.count);
        }
        triangles += stats.triangles;
        volumes[id] = stats.volume;
        assert.ok(stats.triangles > 0 && stats.normalError < 1e-6, id);
        assert.equal(stats.badAttributes + stats.degenerate + stats.nonmanifold + stats.twisted, 0, id);
        if (piece.kind === 'skin') assert.ok(stats.boundary > 0, id);
        else {
          assert.ok(stats.closed && stats.volume > 0, id);
          solids += stats.volume;
          visitPieceMeshes(object, mesh => {
            const solid = measure(mesh);
            assert.ok(solid.closed && solid.volume > 0, mesh.name);
            if (piece.kind === 'flesh' && mesh.material !== fish.materials.bone) flesh += solid.volume;
          });
        }
        for (let k = 0; k < 3; k++) {
          assert.ok(stats.min[k] >= fish.anatomy.bounds.min[k] - 1e-5 && stats.max[k] <= fish.anatomy.bounds.max[k] + 1e-5, id);
        }
        if (id === 'head') assert.equal(stats.min[0], 0);
        if (id === 'bone') assert.equal(stats.max[0], fish.anatomy.TL);
      }
      for (const part of ['dorsal', 'ventral', 'strip']) assert.ok(Math.abs(volumes['L.' + part] / volumes['R.' + part] - 1) < 0.01);
      assert.ok(Math.abs(flesh / fleshVolume(fish.anatomy) - 1) < 0.05);
      assert.ok(Math.abs(solids / envelopeVolume(fish.anatomy) - 1) < 0.06);
      assert.ok(triangles <= budget, `${triangles} > ${budget}`);
      if (sp.id === 'aji') assert.equal(triangles, originalAji[quality]);
      checkFinlets(fish, sp);
      checkCutFaces(fish);
      checkAbdomen(fish, sp, quality);
      const copy = buildFishModel(sp, {quality, rng: 97});
      assert.equal(fingerprint(copy), fingerprint(fish));
      copy.dispose(); fish.dispose();
    });
  }
}

test('ヒラメは左の目が2つあり、背腹のヒレが体を縁取り、無眼側に斑紋がありません', () => {
  const fish = buildFishModel('hirame'), a = fish.anatomy, sp = SPECIES.hirame;
  const eyes = fish.pieces.head.object.children.filter(m => m.name.startsWith('虹彩'));
  assert.equal(eyes.length, 2);
  const [lower, upper] = eyes.map(eye => measure(eye));
  assert.ok(lower.min[2] > 0 && upper.min[2] > 0);
  assert.ok(upper.centroid[0] > lower.centroid[0] && upper.centroid[1] > lower.centroid[1]);
  for (const [name, data, sign] of [['第1背ビレ', sp.fins.dorsal[0], 1], ['尻ビレ', sp.fins.anal, -1]]) {
    const p = fish.pieces.bone.object.getObjectByName(name).geometry.attributes.position, roots = new Set();
    for (let i = 0; i < p.count; i++) {
      const s = p.getX(i) / a.SL;
      if (Math.abs(p.getY(i) - a.flank(s, sign)[1]) < 1e-5) roots.add(s);
    }
    assert.ok(roots.size >= 32);
    assert.ok(Math.abs(Math.min(...roots) - data.origin / 100) < 1e-6);
    assert.ok(Math.abs(Math.max(...roots) - data.end / 100) < 1e-6);
  }
  const blindColor = new THREE.Color(sp.look.blindSide), base = fish.materials.skin.color;
  for (const side of ['L', 'R']) {
    const shades = new Set();
    for (const mesh of fish.pieces['skin.' + side].object.children) {
      const {color, aSeg, position} = mesh.geometry.attributes;
      for (let i = 0; i < color.count; i++) {
        if (aSeg.getX(i) || Math.abs(position.getY(i)) > 1e-5) continue;
        const c = new THREE.Color(color.getX(i), color.getY(i), color.getZ(i)).multiply(base);
        shades.add(c.getHexString());
        if (side === 'R') assert.equal(c.getHexString(), blindColor.getHexString());
        else assert.ok(c.r > c.b && c.r < blindColor.r);
      }
    }
    assert.ok(side === 'L' ? shades.size > 5 : shades.size === 1);
  }
  fish.dispose();
});

test('イワシの空の小骨を単独でも指定でき、全魚種の表に未定義の座標が出ません', () => {
  const fish = buildFishModel('iwashi');
  assert.ok(preparePreview(fish, previewOptions('?only=pinbones.L')).isEmpty());
  assert.ok(!preparePreview(fish, previewOptions('')).isEmpty());
  fish.dispose();
  const cli = fileURLToPath(new URL('../../tools/geometry-report.mjs', import.meta.url));
  const report = spawnSync(process.execPath, [cli, 'all', 'standard'], {encoding: 'utf8'});
  assert.equal(report.status, 0, report.stderr);
  for (const sp of Object.values(SPECIES)) assert.ok(report.stdout.includes(sp.name), sp.id);
  assert.doesNotMatch(report.stdout, /NaN|Infinity/);
});
