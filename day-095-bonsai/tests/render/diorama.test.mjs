import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../../vendor/three.js';
import { POT_IDS } from '../../lib/contract.js';
import {
  POT_SPECS,
  TABLE_BRACKET_XS,
  TABLE_DEPTH,
  TABLE_WIDTH,
  TREE_OFFSET,
  WALL_HEIGHT,
  WALL_WIDTH,
  createDiorama,
} from '../../lib/diorama.js';
import { buildMossGeometry, buildPotGeometry } from '../../lib/diorama-geometry.js';
import {
  createMossTexture,
  createPotTexture,
  createSoilTexture,
  createTableTexture,
  createWallTexture,
  getStageTextureSize,
} from '../../lib/textures-stage.js';

const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** BufferGeometry の健全性を検証する。壊れた実装（NaN混入・範囲外インデックス・法線欠落）を検出する。 */
function inspectGeometry(geom) {
  const errors = [];
  if (!geom || !geom.attributes) return ['geometry が存在しない'];
  const pos = geom.getAttribute('position');
  const norm = geom.getAttribute('normal');
  const uv = geom.getAttribute('uv');
  const idx = geom.getIndex();

  if (!pos || pos.count < 4) errors.push(`頂点数が不足: ${pos ? pos.count : 0}`);
  if (!norm || norm.count !== pos?.count) errors.push('normal 属性の頂点数が一致しない');
  if (!uv || uv.count !== pos?.count) errors.push('uv 属性の頂点数が一致しない');
  if (!idx || idx.count < 6 || idx.count % 3 !== 0) errors.push('index 属性が三角形の倍数でない');

  if (pos) {
    for (let i = 0; i < pos.array.length; i += 1) {
      if (!Number.isFinite(pos.array[i])) { errors.push(`position[${i}] が有限値でない`); break; }
    }
  }
  if (norm) {
    for (let i = 0; i < norm.array.length; i += 1) {
      if (!Number.isFinite(norm.array[i])) { errors.push(`normal[${i}] が有限値でない`); break; }
    }
  }
  if (idx && pos) {
    for (let i = 0; i < idx.count; i += 1) {
      const v = idx.array[i];
      if (!Number.isInteger(v) || v < 0 || v >= pos.count) {
        errors.push(`index[${i}]=${v} が頂点範囲 [0, ${pos.count}) の外`);
        break;
      }
    }
  }
  return errors;
}

/** 鉢の寸法と info の整合を検査する関数（変異テストでも使用する）。 */
function verifyPotBoundsAndInfo(potId, potGeom, info) {
  const errors = [];
  const expected = {
    'oval-brown': { w: 2.9, d: 2.1, h: 0.55 },
    'round-blue': { w: 2.3, d: 2.3, h: 0.80 },
    'rect-grey': { w: 2.8, d: 1.9, h: 0.45 },
  }[potId];

  potGeom.computeBoundingBox();
  const bb = potGeom.boundingBox;
  const w = bb.max.x - bb.min.x;
  const h = bb.max.y - bb.min.y;
  const d = bb.max.z - bb.min.z;

  if (Math.abs(w - expected.w) > 0.02) errors.push(`${potId} の幅 ${w.toFixed(3)} が仕様 ${expected.w} とずれている`);
  if (Math.abs(d - expected.d) > 0.02) errors.push(`${potId} の奥行 ${d.toFixed(3)} が仕様 ${expected.d} とずれている`);
  if (Math.abs(h - expected.h) > 0.02) errors.push(`${potId} の高さ ${h.toFixed(3)} が仕様 ${expected.h} とずれている`);
  if (Math.abs(bb.max.y - info.potTopY) > 0.005) errors.push(`bbox.max.y (${bb.max.y}) が info.potTopY (${info.potTopY}) と整合しない`);
  if (Math.abs(bb.min.y - info.tableY) > 0.005) errors.push(`bbox.min.y (${bb.min.y}) が info.tableY (${info.tableY}) と整合しない`);

  if (!(info.potTopY > 0 && info.potTopY < 0.2)) errors.push(`potTopY (${info.potTopY}) の符号・範囲が不正`);
  if (!(info.tableY < 0)) errors.push(`tableY (${info.tableY}) が負でない`);
  if (!(info.wallZ < info.tableY && info.wallZ < -2.0)) errors.push(`wallZ (${info.wallZ}) の符号・大小が不正`);
  if (!(info.soilRadius > 0.5 && info.soilRadius < Math.min(expected.w, expected.d) * 0.5)) {
    errors.push(`soilRadius (${info.soilRadius}) が鉢の内径範囲と整合しない`);
  }
  if (!Array.isArray(info.treeOffset) || info.treeOffset.length !== 3 || info.treeOffset[1] !== 0) {
    errors.push('treeOffset が [x, 0, z] でない');
  } else {
    const offsetDist = Math.hypot(info.treeOffset[0], info.treeOffset[2]);
    if (!(offsetDist > 0.02 && offsetDist < info.soilRadius * 0.6)) {
      errors.push(`treeOffset の距離 (${offsetDist}) が不正（中央からずれつつ鉢内に収まるべき）`);
    }
  }
  return errors;
}

function computeProjectedAreaXZ(geom) {
  const pos = geom.getAttribute('position');
  const idx = geom.getIndex();
  let area = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.array[i];
    const b = idx.array[i + 1];
    const c = idx.array[i + 2];
    const ax = pos.getX(a);
    const az = pos.getZ(a);
    area += Math.abs((pos.getX(b) - ax) * (pos.getZ(c) - az) - (pos.getX(c) - ax) * (pos.getZ(b) - az)) * 0.5;
  }
  return area;
}

/** 棚ジオメトリから棚板下の持ち送り（三角形の支え）を抽出し、個数・壁密着・三角形断面を検査する。 */
function inspectShelfBrackets(tableGeom, wallZ) {
  const pos = tableGeom.getAttribute('position');
  const boardBotY = -0.24;
  const lowerPts = [];
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    if (y < boardBotY - 1e-3) {
      lowerPts.push({ x: pos.getX(i), y, z: pos.getZ(i) });
    }
  }
  if (lowerPts.length === 0) return { count: 0, errors: ['棚板の下に持ち送りの頂点が存在しない'] };

  lowerPts.sort((a, b) => a.x - b.x);
  const clusters = [];
  let cur = [lowerPts[0]];
  for (let i = 1; i < lowerPts.length; i += 1) {
    if (lowerPts[i].x - lowerPts[i - 1].x > 0.5) {
      clusters.push(cur);
      cur = [];
    }
    cur.push(lowerPts[i]);
  }
  clusters.push(cur);

  const errors = [];
  if (clusters.length < 2 || clusters.length > 3) {
    errors.push(`持ち送りの個数 (${clusters.length}) が 2〜3 個の範囲外`);
  }

  for (let c = 0; c < clusters.length; c += 1) {
    const pts = clusters[c];
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    let minZ = Infinity;
    let maxZ = -Infinity;
    let touchesBoardUnderside = false;
    let frontMinY = Infinity;
    let rearMinY = Infinity;

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      if (x < minX - 1e-3 || x > maxX + 1e-3) continue;
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y <= boardBotY + 1e-3) {
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        if (Math.abs(y - boardBotY) < 1e-3) touchesBoardUnderside = true;
        if (z > 0.5) frontMinY = Math.min(frontMinY, y);
        if (z < 0.0) rearMinY = Math.min(rearMinY, y);
      }
    }
    if (Math.abs(minZ - wallZ) > 1e-3) {
      errors.push(`持ち送り[${c}] の後ろ端 (${minZ.toFixed(3)}) が壁 (${wallZ}) に密着していない`);
    }
    if (!touchesBoardUnderside) {
      errors.push(`持ち送り[${c}] が棚板下面 (${boardBotY}) に接続していない`);
    }
    if (!(frontMinY > -0.45 && rearMinY < -1.10 && maxZ > 0.8)) {
      errors.push(`持ち送り[${c}] が手前浅く奥深い三角形断面になっていない (frontMinY=${frontMinY.toFixed(2)}, rearMinY=${rearMinY.toFixed(2)})`);
    }
  }
  return { count: clusters.length, errors };
}

function createMockCanvasFactory() {
  return (w, h) => ({
    width: w,
    height: h,
    getContext(type) {
      if (type !== '2d') return null;
      return {
        lineCap: 'round',
        strokeStyle: '',
        lineWidth: 1,
        createImageData(iw, ih) {
          return { width: iw, height: ih, data: new Uint8ClampedArray(iw * ih * 4) };
        },
        putImageData(img) { this._lastImageData = img; },
        beginPath() {},
        moveTo() {},
        lineTo() {},
        quadraticCurveTo() {},
        stroke() {},
      };
    },
  });
}

test('createCanvas=null および () => null で質感なしでも例外なく生成でき、全メッシュが揃う', () => {
  const d1 = createDiorama(THREE, { gfx: 'test', seed: 7, createCanvas: null });
  const d2 = createDiorama(THREE, { gfx: 'test', seed: 7, createCanvas: () => null });

  for (const d of [d1, d2]) {
    assert.ok(d.group instanceof THREE.Group);
    assert.ok(d.treeAnchor instanceof THREE.Group);
    assert.equal(d.treeAnchor.position.x, 0);
    assert.equal(d.treeAnchor.position.y, 0);
    assert.equal(d.treeAnchor.position.z, 0);

    const names = [];
    d.group.traverse((obj) => {
      if (obj.isMesh) {
        names.push(obj.name);
        assert.deepEqual(inspectGeometry(obj.geometry), [], `${obj.name} のジオメトリ不備`);
        assert.equal(obj.material.map, null, 'createCanvas=null のときは map を持たない');
      }
    });
    assert.deepEqual(names.sort(), ['moss', 'pot', 'soil', 'stones', 'table', 'wall']);
    d.dispose();
  }
});

test('3種の鉢のジオメトリ・bounding box・寸法・色・質感の違いと info の整合', () => {
  const diorama = createDiorama(THREE, { gfx: 'high', seed: 11, createCanvas: null });
  const seenColors = new Set();
  const seenSizes = new Set();

  for (const potId of POT_IDS) {
    diorama.setPot(potId);
    const potMesh = diorama.group.getObjectByName('pot');
    const tableMesh = diorama.group.getObjectByName('table');
    const potStage = diorama.group.getObjectByName('potStage');
    assert.ok(potMesh && tableMesh && potStage);

    assert.deepEqual(inspectGeometry(potMesh.geometry), []);
    assert.deepEqual(verifyPotBoundsAndInfo(potId, potMesh.geometry, diorama.info), []);

    assert.ok(Math.abs(tableMesh.position.y - diorama.info.tableY) < 1e-6);
    assert.ok(Math.abs(potStage.position.x - (-diorama.info.treeOffset[0])) < 1e-6);
    assert.ok(Math.abs(potStage.position.z - (-diorama.info.treeOffset[2])) < 1e-6);

    const hex = `#${potMesh.material.color.getHexString()}`;
    assert.equal(hex, POT_SPECS[potId].color);
    seenColors.add(hex);

    const bb = potMesh.geometry.boundingBox;
    const sizeKey = `${(bb.max.x - bb.min.x).toFixed(2)}x${(bb.max.z - bb.min.z).toFixed(2)}x${(bb.max.y - bb.min.y).toFixed(2)}`;
    seenSizes.add(sizeKey);
  }

  assert.equal(seenColors.size, 3);
  assert.equal(seenSizes.size, 3);
  diorama.dispose();
});

test('影の設定と壁・壁付け飾り棚の寸法（壁90×50以上・棚の板14〜16・持ち送り2〜3個・板の後ろ端が壁に密着）', () => {
  const diorama = createDiorama(THREE, { gfx: 'low', seed: 3, createCanvas: null });
  const pot = diorama.group.getObjectByName('pot');
  const table = diorama.group.getObjectByName('table');
  const wall = diorama.group.getObjectByName('wall');
  const soil = diorama.group.getObjectByName('soil');
  const moss = diorama.group.getObjectByName('moss');

  assert.equal(pot.castShadow, true);
  assert.equal(pot.receiveShadow, true);
  assert.equal(table.castShadow, false);
  assert.equal(table.receiveShadow, true);
  assert.equal(wall.receiveShadow, true);
  assert.equal(soil.receiveShadow, true);
  assert.equal(moss.receiveShadow, true);

  table.geometry.computeBoundingBox();
  const tbb = table.geometry.boundingBox;
  const tableW = tbb.max.x - tbb.min.x;
  const tableD = tbb.max.z - tbb.min.z;
  assert.ok(tableW >= 14.0 && tableW <= 16.0 && Math.abs(tableW - TABLE_WIDTH) < 1e-4, `棚板の長さ (${tableW}) は 14〜16 の範囲`);
  assert.ok(tableD >= 4.2 && Math.abs(tableD - TABLE_DEPTH) < 1e-4, `棚板の奥行 (${tableD}) は 4.2 以上`);
  assert.ok(Math.abs(tbb.max.y - 0.0) < 1e-4, '棚板のローカル上面は 0（position.y = tableY）');
  assert.ok(Math.abs(tbb.min.z - diorama.info.wallZ) < 1e-4, `棚板の後ろ端 (${tbb.min.z}) が壁 (${diorama.info.wallZ}) に隙間なくくっついていること`);

  const bracketCheck = inspectShelfBrackets(table.geometry, diorama.info.wallZ);
  assert.deepEqual(bracketCheck.errors, []);
  assert.equal(bracketCheck.count, TABLE_BRACKET_XS.length);

  wall.geometry.computeBoundingBox();
  const wbb = wall.geometry.boundingBox;
  const wallW = wbb.max.x - wbb.min.x;
  const wallH = wbb.max.y - wbb.min.y;
  assert.ok(wallW >= 90.0 && Math.abs(wallW - WALL_WIDTH) < 1e-4, `壁の幅 (${wallW}) は 90.0 以上`);
  assert.ok(wallH >= 50.0 && Math.abs(wallH - WALL_HEIGHT) < 1e-4, `壁の高さ (${wallH}) は 50.0 以上`);
  assert.ok(Math.abs(wall.position.z - diorama.info.wallZ) < 1e-6, '壁のZ位置は info.wallZ');
  assert.ok(Math.abs(wbb.min.z) < 1e-5 && Math.abs(wbb.max.z) < 1e-5, '壁は単一平面（手前に折れる別シートを持たない）');

  const wallUv = wall.geometry.getAttribute('uv');
  let maxU = 0;
  let maxV = 0;
  for (let i = 0; i < wallUv.count; i += 1) {
    maxU = Math.max(maxU, wallUv.getX(i));
    maxV = Math.max(maxV, wallUv.getY(i));
  }
  assert.ok(Math.abs(wallW / maxU - 11.0) < 0.2 && Math.abs(wallH / maxV - 11.2) < 0.2, '壁を広げた分だけ repeat を増やし模様の実寸を保つ');

  for (const mesh of [soil, moss, table]) {
    const pos = mesh.geometry.getAttribute('position');
    const norm = mesh.geometry.getAttribute('normal');
    let topUpCount = 0;
    let topTotal = 0;
    const maxY = mesh.geometry.boundingBox.max.y;
    for (let i = 0; i < pos.count; i += 1) {
      if (pos.getY(i) >= maxY - 0.015) {
        topTotal += 1;
        if (norm.getY(i) > 0.3) topUpCount += 1;
      }
    }
    assert.ok(topTotal > 0 && topUpCount / topTotal > 0.75, `${mesh.name} の上面法線が上(+Y)を向いていない (${topUpCount}/${topTotal})`);
  }

  diorama.dispose();
});

test('苔の色（くすんだ深い緑 #3f5a2e〜#6b8a4c）・被覆率（約6割）・控えめな根元の盛り上がり（0.02〜0.04以下）・石の半埋まり接地', () => {
  const diorama = createDiorama(THREE, { gfx: 'high', seed: 11, createCanvas: null });
  const soil = diorama.group.getObjectByName('soil');
  const moss = diorama.group.getObjectByName('moss');
  const stones = diorama.group.getObjectByName('stones');

  const baseLinR = moss.material.color.r;
  const baseLinG = moss.material.color.g;
  const baseLinB = moss.material.color.b;
  const vCol = moss.geometry.getAttribute('color');
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0; i < vCol.count; i += 1) {
    sumR += linearToSrgb(Math.min(1, Math.max(0, baseLinR * vCol.getX(i))));
    sumG += linearToSrgb(Math.min(1, Math.max(0, baseLinG * vCol.getY(i))));
    sumB += linearToSrgb(Math.min(1, Math.max(0, baseLinB * vCol.getZ(i))));
  }
  const avgR = sumR / vCol.count;
  const avgG = sumG / vCol.count;
  const avgB = sumB / vCol.count;
  assert.ok(avgG > avgR && avgR > avgB, `苔の平均色 (${avgR.toFixed(3)}, ${avgG.toFixed(3)}, ${avgB.toFixed(3)}) が緑系でない`);
  assert.ok(avgG >= 0.28 && avgG <= 0.46, `苔の平均緑明度 (${avgG.toFixed(3)}) が #3f5a2e〜#6b8a4c の範囲から外れている`);
  assert.ok(avgR / avgG >= 0.68 && avgB / avgG >= 0.50, `苔の彩度が高すぎる (R/G=${(avgR / avgG).toFixed(2)}, B/G=${(avgB / avgG).toFixed(2)})`);

  const soilPos = soil.geometry.getAttribute('position');
  const soilIdx = soil.geometry.getIndex();
  let soilTopArea = 0;
  for (let i = 0; i < soilIdx.count; i += 3) {
    const a = soilIdx.array[i];
    const b = soilIdx.array[i + 1];
    const c = soilIdx.array[i + 2];
    if (soilPos.getY(a) > -0.04 && soilPos.getY(b) > -0.04 && soilPos.getY(c) > -0.04) {
      const ax = soilPos.getX(a);
      const az = soilPos.getZ(a);
      soilTopArea += Math.abs((soilPos.getX(b) - ax) * (soilPos.getZ(c) - az) - (soilPos.getX(c) - ax) * (soilPos.getZ(b) - az)) * 0.5;
    }
  }
  const coverRatio = computeProjectedAreaXZ(moss.geometry) / soilTopArea;
  assert.ok(coverRatio >= 0.50 && coverRatio <= 0.74, `苔の被覆率 (${coverRatio.toFixed(3)}) が約6割の範囲でない`);

  const mPos = moss.geometry.getAttribute('position');
  let nearSumY = 0;
  let nearCount = 0;
  let farSumY = 0;
  let farCount = 0;
  for (let i = 0; i < mPos.count; i += 1) {
    const dTree = Math.hypot(mPos.getX(i) - TREE_OFFSET[0], mPos.getZ(i) - TREE_OFFSET[2]);
    if (dTree < 0.20) {
      nearSumY += mPos.getY(i);
      nearCount += 1;
    } else if (dTree > 0.45) {
      farSumY += mPos.getY(i);
      farCount += 1;
    }
  }
  assert.ok(nearCount > 5 && farCount > 20, '根元付近および外周の苔頂点が存在すること');
  assert.ok(nearSumY / nearCount > farSumY / farCount + 0.010, '木の根元の周りの苔が外周より緩やかに高くなっていない');

  stones.geometry.computeBoundingBox();
  moss.geometry.computeBoundingBox();
  const sbb = stones.geometry.boundingBox;
  const mbb = moss.geometry.boundingBox;
  assert.ok(mbb.max.y >= 0.02 && mbb.max.y <= 0.04, `苔の最大高さ (${mbb.max.y.toFixed(4)}) が 0.02〜0.04 の範囲外（根張りを埋めてしまう）`);
  assert.ok(sbb.min.y < -0.025, `石の下端 (${sbb.min.y.toFixed(3)}) が苔・土の中に埋まっていない`);
  assert.ok(sbb.max.y > mbb.max.y * 0.65 && sbb.max.y < 0.11, `石の上端 (${sbb.max.y.toFixed(3)}) の露出高さが適切でない`);

  diorama.dispose();
});

test('画質の段が下がると苔の頂点数と質感の辺が小さくなる', () => {
  const levels = ['high', 'mid', 'low', 'test'];
  assert.deepEqual(levels.map(getStageTextureSize), [1024, 512, 256, 128]);
  const counts = levels.map((gfx) => {
    const geometry = buildMossGeometry(THREE, 'oval-brown', { gfx, seed: 5 });
    const count = geometry.getAttribute('position').count;
    geometry.dispose();
    return count;
  });
  assert.ok(counts.slice(1).every((count, i) => count < counts[i]), counts.join(' > '));
});

test('setMoisture と setLook: 土の濃さ変化、季節による壁・卓の微細な色味変化、苔の不変性', () => {
  const diorama = createDiorama(THREE, { gfx: 'test', seed: 9, createCanvas: null });
  const soil = diorama.group.getObjectByName('soil');
  const wall = diorama.group.getObjectByName('wall');
  const table = diorama.group.getObjectByName('table');
  const moss = diorama.group.getObjectByName('moss');

  diorama.setMoisture(0.0);
  const dryLum = soil.material.color.r + soil.material.color.g + soil.material.color.b;
  diorama.setMoisture(0.5);
  const midLum = soil.material.color.r + soil.material.color.g + soil.material.color.b;
  diorama.setMoisture(1.0);
  const wetLum = soil.material.color.r + soil.material.color.g + soil.material.color.b;
  assert.ok(dryLum > midLum && midLum > wetLum, '土は乾いていると明るく、濡れると濃く（暗く）なる');

  const mossHexBefore = moss.material.color.getHexString();
  const wallSeasonColors = {};
  const tableSeasonColors = {};
  for (const [season, color] of [
    ['spring', [0.65, 0.82, 0.42]],
    ['summer', [0.24, 0.55, 0.22]],
    ['autumn', [0.85, 0.27, 0.16]],
    ['winter', [0.42, 0.35, 0.30]],
  ]) {
    diorama.setLook({ season, color });
    wallSeasonColors[season] = wall.material.color.clone();
    tableSeasonColors[season] = table.material.color.clone();
    assert.equal(moss.material.color.getHexString(), mossHexBefore);
  }

  assert.ok(wallSeasonColors.spring.r > wallSeasonColors.summer.r);
  assert.ok(wallSeasonColors.summer.g > wallSeasonColors.winter.g);
  assert.ok(wallSeasonColors.autumn.r > wallSeasonColors.winter.r);
  const diffSpringWinter = Math.hypot(
    wallSeasonColors.spring.r - wallSeasonColors.winter.r,
    wallSeasonColors.spring.g - wallSeasonColors.winter.g,
    wallSeasonColors.spring.b - wallSeasonColors.winter.b,
  );
  assert.ok(diffSpringWinter > 0.005 && diffSpringWinter < 0.15, `季節の色味変化幅が適切でない: ${diffSpringWinter}`);
  assert.notEqual(tableSeasonColors.autumn.getHexString(), tableSeasonColors.winter.getHexString());
  diorama.dispose();
});

test('setPot の往復でリソースが増えず、古い鉢のジオメトリ・マテリアル・テクスチャが dispose される', () => {
  const createCanvas = createMockCanvasFactory();
  const diorama = createDiorama(THREE, { gfx: 'test', seed: 12, createCanvas });

  const countLiveMeshes = () => {
    const geoms = new Set();
    const mats = new Set();
    let meshes = 0;
    diorama.group.traverse((obj) => {
      if (obj.isMesh) {
        meshes += 1;
        geoms.add(obj.geometry);
        mats.add(obj.material);
      }
    });
    return { meshes, geoms: geoms.size, mats: mats.size };
  };

  const initialCounts = countLiveMeshes();
  assert.equal(initialCounts.meshes, 6);

  let disposedGeoms = 0;
  let disposedMats = 0;
  let disposedTexs = 0;

  const hookActivePotDisposals = () => {
    const potStage = diorama.group.getObjectByName('potStage');
    for (const child of potStage.children) {
      child.geometry.addEventListener('dispose', () => { disposedGeoms += 1; });
      child.material.addEventListener('dispose', () => { disposedMats += 1; });
      if (child.material.map && child.name === 'pot') {
        child.material.map.addEventListener('dispose', () => { disposedTexs += 1; });
      }
    }
  };

  for (let round = 0; round < 3; round += 1) {
    for (const potId of POT_IDS) {
      hookActivePotDisposals();
      diorama.setPot(potId);
      assert.deepEqual(countLiveMeshes(), initialCounts, 'setPot の往復でメッシュ・ジオメトリ・マテリアル数が増えてはならない');
    }
  }

  assert.equal(disposedGeoms, 9 * 4);
  assert.equal(disposedMats, 9 * 4);
  assert.equal(disposedTexs, 9);

  diorama.dispose();
  assert.equal(countLiveMeshes().meshes, 0);
  diorama.setPot('round-blue');
  diorama.setMoisture(0.9);
  diorama.setLook({ season: 'spring', color: [0.5, 0.7, 0.4] });
  diorama.update(0.016);
  assert.equal(countLiveMeshes().meshes, 0, 'dispose 後に setPot を呼んでも再生成しない');
});

test('決定性: 同じ seed なら同じ頂点と質感、違う seed なら違う頂点と質感になる', () => {
  const g1 = buildPotGeometry(THREE, 'round-blue', { gfx: 'low', seed: 42 });
  const g2 = buildPotGeometry(THREE, 'round-blue', { gfx: 'low', seed: 42 });
  const g3 = buildPotGeometry(THREE, 'round-blue', { gfx: 'low', seed: 43 });

  assert.deepEqual(g1.getAttribute('position').array, g2.getAttribute('position').array);
  assert.notDeepEqual(g1.getAttribute('position').array, g3.getAttribute('position').array);

  const d1 = createDiorama(THREE, { gfx: 'test', seed: 77, createCanvas: null });
  const d2 = createDiorama(THREE, { gfx: 'test', seed: 77, createCanvas: null });
  const d3 = createDiorama(THREE, { gfx: 'test', seed: 78, createCanvas: null });

  for (const name of ['pot', 'soil', 'moss', 'stones', 'table']) {
    const p1 = d1.group.getObjectByName(name).geometry.getAttribute('position').array;
    const p2 = d2.group.getObjectByName(name).geometry.getAttribute('position').array;
    const p3 = d3.group.getObjectByName(name).geometry.getAttribute('position').array;
    assert.deepEqual(p1, p2, `${name} が同じ seed で一致しない`);
    assert.notDeepEqual(p1, p3, `${name} が違う seed でも同じ頂点になっている`);
  }

  const createCanvas = createMockCanvasFactory();
  const t1 = createTableTexture(THREE, { gfx: 'test', seed: 55, createCanvas });
  const t2 = createTableTexture(THREE, { gfx: 'test', seed: 55, createCanvas });
  const t3 = createTableTexture(THREE, { gfx: 'test', seed: 56, createCanvas });
  assert.equal(t1.colorSpace, THREE.SRGBColorSpace);
  assert.equal(t1.wrapS, THREE.RepeatWrapping);
  assert.equal(t1.wrapT, THREE.RepeatWrapping);

  for (const fn of [
    (s) => createPotTexture(THREE, 'oval-brown', { gfx: 'test', seed: s, createCanvas }),
    (s) => createSoilTexture(THREE, { gfx: 'test', seed: s, createCanvas }),
    (s) => createMossTexture(THREE, { gfx: 'test', seed: s, createCanvas }),
    (s) => createWallTexture(THREE, { gfx: 'test', seed: s, createCanvas }),
  ]) {
    const tex = fn(10);
    assert.ok(tex instanceof THREE.CanvasTexture);
    tex.dispose();
  }
  t1.dispose();
  t2.dispose();
  t3.dispose();
  d1.dispose();
  d2.dispose();
  d3.dispose();
});

test('変異検査: 鉢の寸法・添字・NaN・info・棚の持ち送り不整合をわざと壊すと確実に検出して落ちる', () => {
  const diorama = createDiorama(THREE, { gfx: 'test', seed: 1, createCanvas: null });
  const potGeom = diorama.group.getObjectByName('pot').geometry;
  const tableGeom = diorama.group.getObjectByName('table').geometry;

  const badNanGeom = potGeom.clone();
  badNanGeom.getAttribute('position').array[15] = NaN;
  assert.ok(inspectGeometry(badNanGeom).some((e) => /有限値でない/.test(e)));

  const badIdxGeom = potGeom.clone();
  badIdxGeom.getIndex().array[0] = 999999;
  assert.ok(inspectGeometry(badIdxGeom).some((e) => /頂点範囲/.test(e)));

  const badScaleGeom = potGeom.clone();
  badScaleGeom.scale(1.2, 1.0, 1.0);
  assert.ok(verifyPotBoundsAndInfo('oval-brown', badScaleGeom, diorama.info).some((e) => /幅/.test(e)));

  assert.ok(verifyPotBoundsAndInfo('oval-brown', potGeom, { ...diorama.info, potTopY: -0.1 }).length > 0);
  assert.ok(verifyPotBoundsAndInfo('oval-brown', potGeom, { ...diorama.info, tableY: 0.2 }).length > 0);
  assert.ok(verifyPotBoundsAndInfo('oval-brown', potGeom, { ...diorama.info, wallZ: 1.0 }).length > 0);
  assert.ok(verifyPotBoundsAndInfo('oval-brown', potGeom, { ...diorama.info, treeOffset: [0, 0, 0] }).length > 0);

  // 棚から壁を離した変異（隙間あり）を検出すること
  assert.ok(inspectShelfBrackets(tableGeom, diorama.info.wallZ - 0.2).errors.some((e) => /密着していない/.test(e)));

  diorama.dispose();
});

test('遅延の舞台は質感を順に適用し、鉢を交換しても共通の質感を再利用する', async () => {
  const create = createMockCanvasFactory();
  let allocations = 0;
  const diorama = createDiorama(THREE, {
    gfx: 'low', deferTextures: true, createCanvas(w, h) { allocations += 1; return create(w, h); },
  });
  const names = ['table', 'wall', 'soil', 'moss', 'pot'];
  const material = (name) => diorama.group.getObjectByName(name).material;
  assert.deepEqual(names.map((name) => material(name).map), names.map(() => null));
  assert.equal(allocations, 0);
  const loaded = [];
  await diorama.prepare(async (name, work) => {
    assert.equal(allocations, loaded.length);
    assert.equal(material(name).map, null);
    await Promise.resolve();
    work();
    loaded.push(name);
    assert.equal(material(name).map.image.width, 256);
    assert.equal(material(name).bumpMap, material(name).map);
    assert.equal(material(name).version, 1);
  });
  assert.deepEqual(loaded, names);

  const shared = names.slice(0, -1).map((name) => material(name).map);
  let disposed = 0;
  material('pot').map.addEventListener('dispose', () => { disposed += 1; });
  diorama.setPot('round-blue');
  assert.equal(disposed, 1);
  assert.equal(material('pot').map, null);
  let finish;
  const oldPot = diorama.preparePot(async (_name, work) => {
    await new Promise((resolve) => { finish = resolve; });
    work();
  });
  diorama.setPot('rect-grey');
  finish();
  await oldPot;
  assert.equal(allocations, 5);
  assert.equal(material('pot').map, null);

  await diorama.preparePot(async (name, work) => {
    assert.equal(name, 'pot');
    assert.equal(material(name).map, null);
    work();
  });
  assert.equal(allocations, 6);
  assert.ok(material('pot').map);
  assert.deepEqual(names.slice(0, -1).map((name) => material(name).map), shared);
  diorama.dispose();
});
