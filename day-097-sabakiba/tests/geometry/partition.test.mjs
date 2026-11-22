import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { buildFishModel, visitPieceMeshes } from '../../lib/pieces.js';
import { measure } from '../../tools/geometry-report.mjs';

// 二つの斜面の間だけを積分し、皮・背骨の溝・腹腔の占める幅を別々に求めます。
function trunkRegions(a) {
  const head = a.cutPlane('head'), tail = a.cutPlane('tail');
  let envelope = 0, skin = 0, skeleton = 0, cavity = 0;
  const dx = a.SL / 480;
  for (let i = 0; i < 480; i++) {
    const s = (i + 0.5) / 480, x = s * a.SL, pr = a.profile(s);
    if (x < a.point('headCutBottom')[0] || s > a.tail + 0.014) continue;
    for (const up of [true,false]) {
      const h = up ? pr.top : pr.bottom, n = up ? pr.nTop : pr.nBottom, sec = a.filletSection(s, up);
      for (let j = 0; j < 112; j++) {
        const t = (j + 0.5) / 112, d = h * t, y = pr.axisY + (up ? d : -d);
        const distance = plane => (x - plane.point[0]) * plane.normal[0] + (y - plane.point[1]) * plane.normal[1];
        if (distance(head) < 0 || distance(tail) > 0) continue;
        const outer = pr.half * (1 - t ** n) ** (1 / n), underSkin = sec.widthAt(d);
        const wall = sec.wall(d), center = Math.min(wall.seam, underSkin), weight = 2 * dx * h / 112;
        envelope += weight * outer; skin += weight * (outer - underSkin);
        skeleton += weight * center;
        if (!up) cavity += weight * (Math.min(underSkin, wall.inside) - center);
      }
    }
  }
  return {envelope, skin, skeleton, cavity};
}

test('実メッシュの身6塊と、独立に積分した皮・骨の領域・腹腔を合わせると胴の外形に収まります', () => {
  for (const quality of ['light','standard','high']) {
    const fish = buildFishModel('aji', {quality}), r = trunkRegions(fish.anatomy);
    let meat = 0;
    for (const side of ['L','R']) for (const name of ['dorsal','ventral','strip']) {
      // 腹骨は層の中に埋まるため、その体積は層に含まれます。
      meat += measure(fish.pieces[side + '.' + name].object.children[0]).volume;
    }
    const ratio = (meat + r.skin + r.skeleton + r.cavity) / r.envelope;
    assert.ok(r.skin > 0 && r.skeleton > 0 && r.cavity > 0);
    assert.ok(Math.abs(1 - ratio) < 0.05, `${quality} ${ratio}`);
    fish.dispose();
  }
});

test('腹骨の全頂点が、軽め・標準・高画質で実際に表示する腹骨層の2面の間にあります', () => {
  const mat = new THREE.MeshBasicMaterial({side: THREE.DoubleSide}), ray = new THREE.Raycaster();
  const inward = new THREE.Vector3(), origin = new THREE.Vector3();
  for (const quality of ['light','standard','high']) {
    const fish = buildFishModel('aji', {quality});
    for (const [side, sign] of [['L',1], ['R',-1]]) {
      const [layer, ribs] = fish.pieces[side + '.strip'].object.children;
      const skin = new THREE.Mesh(layer.geometry, mat), pos = ribs.geometry.attributes.position;
      inward.set(0,0,-sign);
      for (let i = 0; i < pos.count; i++) {
        ray.set(origin.set(pos.getX(i), pos.getY(i), sign * 5), inward);
        const hits = ray.intersectObject(skin, false);
        assert.ok(hits.length >= 2);
        const z = sign * pos.getZ(i);
        assert.ok(z <= sign * hits[0].point.z + 1e-5 && z >= sign * hits.at(-1).point.z - 1e-5);
      }
    }
    fish.dispose();
  }
  mat.dispose();
});

test('胃・腸・肝臓・鰾の全頂点が頭の切断面と腹腔後端の間に収まります', () => {
  const fish = buildFishModel('aji'), a = fish.anatomy, plane = a.cutPlane('head');
  const organs = fish.pieces.viscera.object.children;
  assert.deepEqual(organs.map(m => m.name).sort(), ['胃','腸のとぐろ','肝臓','鰾'].sort());
  for (const mesh of organs) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const [x,y,z] = [p.getX(i),p.getY(i),p.getZ(i)], s = x / a.SL, sec = a.filletSection(s, false), d = sec.axisY - y;
      assert.ok(plane.normal[0] * (x - plane.point[0]) + plane.normal[1] * (y - plane.point[1]) >= -1e-5);
      assert.ok(s < a.cavityEnd && d > sec.roof && d < sec.floor, mesh.name);
      assert.ok(Math.abs(z) <= sec.wall(d).inside + 1e-5, mesh.name);
    }
  }
  fish.dispose();
});

test('内臓から体側への距離を実メッシュで測っても、3画質とも腹壁を突き抜けません', () => {
  const mat = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
  const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), direction = new THREE.Vector3();
  for (const quality of ['light','standard','high']) {
    const fish = buildFishModel('aji', {quality});
    const walls = ['L','R'].map(side => new THREE.Mesh(fish.pieces[side + '.strip'].object.children[0].geometry, mat));
    for (const mesh of fish.pieces.viscera.object.children) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i);
        ray.set(origin.set(p.getX(i), p.getY(i), 0), direction.set(0,0,z < 0 ? -1 : 1));
        const hit = ray.intersectObject(walls[z < 0 ? 1 : 0], false)[0];
        assert.ok(hit && hit.distance + 1e-5 >= Math.abs(z), mesh.name);
      }
    }
    fish.dispose();
  }
  mat.dispose();
});

test('背骨は糸巻き形の24椎で、溝との半径差が0.02 cmに収まります', () => {
  const fish = buildFishModel('aji'), a = fish.anatomy;
  const g = fish.pieces.bone.object.getObjectByName('椎体').geometry;
  const pos = g.attributes.position, radii = [];
  for (let i = 0; i < pos.count; i++) {
    const s = pos.getX(i) / a.SL, y = pos.getY(i) - a.profile(s).axisY, z = pos.getZ(i);
    if (Math.abs(y) > 1e-6 || z <= 0.05) continue;
    radii.push({s, r: z});
    assert.ok(a.spineRadius(s) - z > -1e-6 && a.spineRadius(s) - z < 0.02);
  }
  const rings = [...new Map(radii.map(p => [p.s,p])).values()].sort((a,b) => a.s-b.s);
  const waists = rings.filter((p, i) => i && i < rings.length - 1 && p.r < rings[i-1].r && p.r < rings[i+1].r);
  assert.equal(waists.length, 24);
  for (const side of ['L','R']) {
    const mesh = fish.pieces['pinbones.' + side].object;
    assert.ok(mesh.isInstancedMesh);
    assert.equal(mesh.count, 20);
    for (let i = 0; i < mesh.count; i++) {
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix);
      const root = new THREE.Vector3().setFromMatrixPosition(matrix), s = root.x / a.SL, r = a.spineRadius(s);
      assert.ok(s > 0.30 && s < 0.65);
      assert.ok(Math.abs(root.y - a.profile(s).axisY - 0.35 * r) < 1e-6);
      assert.ok(Math.abs(Math.abs(root.z) - a.groove(s, 0.35 * r)) < 1e-6);
    }
  }
  fish.dispose();
});

test('皮のUVはFLFを再現し、頭のつなぎ目も一周分をまたいで補間しません', () => {
  const fish = buildFishModel('aji'), a = fish.anatomy;
  for (const id of ['skin.L','skin.R']) visitPieceMeshes(fish.pieces[id].object, mesh => {
    const {uv, position, aSeg} = mesh.geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      assert.ok(Math.abs(position.getX(i) / a.SL - u) < 1e-6 && v >= 0 && v <= 1);
      if (aSeg.getX(i) === 0) {
        const p = a.surface(u, v * Math.PI * 2).p;
        assert.ok(Math.hypot(position.getX(i)-p[0], position.getY(i)-p[1], position.getZ(i)-p[2]) < 1e-5);
      }
    }
  });
  const g = fish.pieces.head.object.children[0].geometry, ids = g.index.array;
  for (let j = 0; j < ids.length; j += 3) {
    if (g.attributes.aSeg.getX(ids[j]) !== 0) continue;
    const vs = Array.from(ids.slice(j,j+3), k => g.attributes.uv.getY(k));
    assert.ok(Math.max(...vs) - Math.min(...vs) < 0.1);
  }
  fish.dispose();
});
