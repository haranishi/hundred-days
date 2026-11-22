import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildFishModel, visitPieceMeshes } from '../../lib/pieces.js';
import { getSpecies } from '../../lib/species/index.js';
import { createRng, mulberry32, hashString } from '../../lib/rng.js';
import { valueNoise2, valueNoise3, tileNoise2 } from '../../lib/noise.js';
import { measure } from '../../tools/geometry-report.mjs';

function digest(fish) {
  const hash = createHash('sha256');
  for (const p of Object.values(fish.pieces)) {
    hash.update(JSON.stringify([p.id,p.kind,p.pivot,p.triangles]));
    visitPieceMeshes(p.object, m => {
      hash.update(m.name);
      hash.update(JSON.stringify(m.geometry.groups));
      for (const attr of [m.geometry.index,...Object.values(m.geometry.attributes),m.instanceMatrix].filter(Boolean)) {
        hash.update(Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength));
      }
    });
  }
  return hash.digest('hex');
}

test('同じ種で全画質の全頂点・面・材質区分・小骨行列を再生成できます', () => {
  for (const quality of ['light','standard','high']) {
    const one = buildFishModel('aji', {quality,rng:createRng(43)});
    const two = buildFishModel('aji', {quality,rng:createRng(43)});
    assert.equal(digest(one), digest(two));
    one.dispose(); two.dispose();
  }
  const one = buildFishModel('aji', {quality:'light',rng:42}), two = buildFishModel('aji', {quality:'light',rng:43});
  assert.notDeepEqual(one.pieces['pinbones.L'].object.instanceMatrix.array, two.pieces['pinbones.L'].object.instanceMatrix.array);
  assert.deepEqual(one.pieces.head.object.children[0].geometry.attributes.position.array,
    two.pieces.head.object.children[0].geometry.attributes.position.array);
  one.dispose(); two.dispose();
});

test('吻から尾柄までの駅数と頭の各断面の頂点数が画質表に一致します', () => {
  for (const [quality, axial, radial] of [['light',28,28],['standard',44,40],['high',64,56]]) {
    const fish = buildFishModel('aji', {quality}), a = fish.anatomy, xs = new Set();
    const head = fish.pieces.head.object.getObjectByName('頭と切り口').geometry;
    for (const g of [head, fish.pieces['skin.L'].object.children[0].geometry,
      fish.pieces.bone.object.getObjectByName('尾柄とヒレの付け根の皮').geometry]) {
      const {position, aSeg, uv} = g.attributes;
      for (let i = 0; i < position.count; i++) {
        if (aSeg.getX(i) !== 0 || Math.abs(position.getY(i)) > 1e-6 || position.getZ(i) < 0 || uv.getY(i) !== 0) continue;
        xs.add(position.getX(i));
      }
    }
    assert.equal(xs.size, axial);
    const x = [...xs].sort((u,v) => u-v)[1], ring = new Set(), pos = head.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getX(i) === x) ring.add(pos.getY(i) + '/' + pos.getZ(i));
    assert.equal(ring.size, radial);
    assert.ok(Math.abs(Math.max(...xs) - a.SL) < 1e-6);
    fish.dispose();
  }
});

test('丸い魚と平たい魚を同じ生成経路で作り、目の側とぜいごの無い側線も扱えます', () => {
  for (const family of ['round','flat']) {
    const base = getSpecies('aji'), flat = family === 'flat';
    const sp = {...base, family, id: flat ? 'hirame' : 'sanma', scutes: {count:0}, sizeCm: {typical: flat ? 45 : 28},
      shape: {...base.shape,maxDepth: flat ? 45 : 12, maxWidth:6}, vertebrae: {pre:14,caudal:21}};
    const fish = buildFishModel(sp), a = fish.anatomy;
    const iris = fish.pieces.head.object.children.filter(mesh => mesh.name.startsWith('虹彩'));
    assert.equal(iris.length, 2);
    assert.equal(iris.filter(mesh => mesh.name.includes('L')).length, flat ? 2 : 1);
    for (const piece of Object.values(fish.pieces)) if (piece.kind !== 'skin') assert.ok(measure(piece.object).closed, piece.id);
    assert.ok(a.curve('scuteRow','R').points.length >= 32);
    assert.ok(a.curve('engawaCut','L').points.every(p => a.inside(p)));
    fish.dispose();
  }
});

test('Day95の乱数は状態を往復でき、値ノイズはタイルの縁で連続します', () => {
  const seed = hashString('アジ'), rng = createRng(seed), raw = mulberry32(seed), state = rng.state();
  const first = Array.from({length:10}, () => rng.next());
  assert.deepEqual(first, Array.from({length:10}, raw));
  rng.setState(state);
  assert.deepEqual(first, Array.from({length:10}, () => rng.next()));
  const state2 = rng.state();
  assert.equal(rng.fork('皮').next(), rng.fork('皮').next());
  assert.equal(rng.state(), state2);
  for (const t of [-0.25,0,0.125,1,5.7]) {
    assert.ok(Math.abs(tileNoise2(t,0.37,13,seed) - tileNoise2(t+1,0.37,13,seed)) < 1e-12);
    assert.ok(Math.abs(tileNoise2(-0.2,t,7,seed) - tileNoise2(-0.2,t+1,7,seed)) < 1e-12);
    for (const n of [valueNoise2(t,1,seed),valueNoise3(-1,t,2,seed)]) assert.ok(n >= 0 && n <= 1);
  }
});
