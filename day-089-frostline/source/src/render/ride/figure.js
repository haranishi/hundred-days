import {equipmentGear,upperEquipment,skinBoneForGear} from './gear-parts.js';
// 滑走者と板。形は tools/ridergen が作ったデータ（public/models/rider-v1.*）を読み、骨つきの面として描く。
// 骨は親子にせず、姿勢の計算（pose.js）の関節から skeleton-math.js が作る「立った姿勢からの変換」を、世界の行列としてそのまま入れる。
// 一人称では、カメラのすぐ下にある上半身を描かない：面を「上半身」と「それ以外」の 2 つに分けておき、片方を隠す。
import * as THREE from 'three/webgpu';
import { attribute, float, mix, smoothstep, positionGeometry, normalView, positionView, dFdx, dFdy, fwidth, cross, dot, normalize, sign, abs, sin, uniform } from 'three/tsl';
import { readRiderData } from './rider-data.js';
import { createSkeletonState, solveSkeleton, BONE_NAMES } from './skeleton-math.js';

/** 部位ごとの質感 [粗さ, 金属らしさ, 布の織り目の強さ]。名前はデータの parts と合わせる */
const SURFACE = {
  jacket: [0.82, 0, 1], pants: [0.9, 0, 1], mittens: [0.78, 0, 0.6], gaiter: [0.92, 0, 0.8], hood: [0.84, 0, 1],
  helmet: [0.36, 0.05, 0], goggleFrame: [0.5, 0, 0], lens: [0.12, 0.85, 0], goggleBand: [0.85, 0, 0.7],
  boots: [0.62, 0, 0.2], bindings: [0.45, 0.25, 0], pack: [0.8, 0, 0.9], board: [0.32, 0.05, 0], metalEdge: [0.3, 0.9, 0],
  skiSide:[.55,.1,0],skiBindingBody:[.5,.2,0],skiCuff:[.8,0,.6],ski:[.32,.05,0], skiEdge:[.3,.9,0], skiBinding:[.4,.3,0], poleShaft:[.28,.8,0], poleGrip:[.8,0,0], poleBasket:[.65,0,0], poleStrap:[.8,0,.4],
  trim: [0.7, 0, 0], straps: [0.75, 0, 0.5], graphic: [0.32, 0.05, 0], boardBase: [0.25, 0, 0],
};
const DEFAULT_SURFACE = [0.8, 0, 0.5];
/**
 * 一人称で隠す骨と部位（頭・胴・腕ぜんぶ）。腰から下と板は残す＝下を向くと、自分の足もとが見える。
 * 2026-11-11：前腕と手も隠すことにした。上腕だけを隠すと、前腕の筒の切り口が目の前に来て、中空の筒が画面の 3 分の 1 を塞いだ（体験の採点 1 周目）
 */
const UPPER_BONES = new Set(['abdomen', 'chest', 'neck', 'head', 'upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'handL', 'handR', 'clavicleL', 'clavicleR']);
const UPPER_PARTS = new Set(['helmet', 'goggleFrame', 'lens', 'goggleBand', 'hood', 'gaiter', 'pack', 'straps', 'mittens']);

export async function loadRiderData(base = 'models/rider-v1') {
  const [jsonResponse, binResponse] = await Promise.all([fetch(`${base}.json`), fetch(`${base}.bin`)]);
  if (!jsonResponse.ok || !binResponse.ok) throw new Error(`滑走者のデータを読めません（${jsonResponse.status}・${binResponse.status}）`);
  return readRiderData(await binResponse.arrayBuffer(), await jsonResponse.json());
}

/** 布の細かい凹凸を、法線の傾きとして足す（面の形は変えない）。h は高さの場（m ではなく、相対の量） */
function bumpNormal(h, strength) {
  const dpdx = dFdx(positionView), dpdy = dFdy(positionView);
  const dhdx = dFdx(h), dhdy = dFdy(h);
  const r1 = cross(dpdy, normalView), r2 = cross(normalView, dpdx);
  const det = dot(dpdx, r1);
  const grad = sign(det).mul(dhdx.mul(r1).add(dhdy.mul(r2))).mul(strength);
  return normalize(abs(det).mul(normalView).sub(grad));
}

/**
 * @param {object} data loadRiderData の結果
 * @param {{detail?:boolean}} options detail：布の織り目としわを描くか（低い画質の段では省く）
 */
export function createFigure(data, options = {}) {
  const group = new THREE.Group();
  group.name = 'rider';
  const count = data.position.length / 3;
  const parts = data.parts;
  const upperBone = BONE_NAMES.map(name => UPPER_BONES.has(name));
  const upperPart = parts.map(p => UPPER_PARTS.has(p.name));

  // 頂点の値：色（部位の色）・質感・細部（しわ・揺れ・陰・縫い目）
  // 色は 2 つ持つ：部位の色と、切り替えの先の色（上着の下半分・板の柄）。どちらを出すかは、頂点のなめらかな値 tone のしきい値で決める
  const color = new Float32Array(count * 3), color2 = new Float32Array(count * 3), surf = new Float32Array(count * 4), detail = new Float32Array(count * 4);
  const upper = new Uint8Array(count);
  const partColor = parts.map(p => new THREE.Color(p.color));
  const partColor2 = parts.map(p => new THREE.Color(p.secondaryColor ?? p.color));
  function paint() {
    for (let i = 0; i < count; i++) {
      const c = partColor[data.part[i]], d = partColor2[data.part[i]];
      color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b;
      color2[i * 3] = d.r; color2[i * 3 + 1] = d.g; color2[i * 3 + 2] = d.b;
    }
  }
  paint();
  for (let i = 0; i < count; i++) {
    const part = parts[data.part[i]], s = SURFACE[part.name] ?? DEFAULT_SURFACE;
    surf[i * 4] = s[0]; surf[i * 4 + 1] = s[1]; surf[i * 4 + 2] = s[2]; surf[i * 4 + 3] = data.tone ? data.tone[i] : 1;
    detail[i * 4] = data.wrinkle[i]; detail[i * 4 + 1] = data.flutter[i]; detail[i * 4 + 2] = data.ao[i]; detail[i * 4 + 3] = data.seam[i];
    let weight = 0;
    for (let k = 0; k < 4; k++) if (upperBone[data.skinIndex[i * 4 + k]]) weight += data.skinWeight[i * 4 + k];
    upper[i] = upperEquipment(part.name) ?? (weight > 0.5 || upperPart[data.part[i]] ? 1 : 0);
  }
  // 三角形を、上半身（3 頂点とも上半身）とそれ以外へ分ける
  const lowerIndex = [], upperIndex = [];
  const gearIndices = {board:[[],[]],ski:[[],[]]};
  for (let t = 0; t < data.index.length; t += 3) {
    const a = data.index[t], b = data.index[t + 1], c = data.index[t + 2];
    const isUpper=upper[a] && upper[b] && upper[c];
    const gear=equipmentGear(parts[data.part[a]].name,data.skinIndex[a*4]);
    if(gear)gearIndices[gear][isUpper?1:0].push(a,b,c);
    else (isUpper ? upperIndex : lowerIndex).push(a,b,c);
  }
  const skinIndices=Uint16Array.from(data.skinIndex);
  let appliedGear=null;
  const shared = {
    position: new THREE.BufferAttribute(data.position, 3),
    normal: new THREE.BufferAttribute(data.normal, 3),
    skinIndex: new THREE.Uint16BufferAttribute(skinIndices, 4),
    skinWeight: new THREE.BufferAttribute(data.skinWeight, 4),
    color: new THREE.BufferAttribute(color, 3),
    color2: new THREE.BufferAttribute(color2, 3),
    surf: new THREE.BufferAttribute(surf, 4),
    detail: new THREE.BufferAttribute(detail, 4),
  };
  function geometryOf(index) {
    const g = new THREE.BufferGeometry();
    for (const [name, value] of Object.entries(shared)) g.setAttribute(name, value);
    g.setIndex(index);
    // 骨で動くので、元の形の範囲では判定できない。視野の外でも描く（1 体だけなので軽い）
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3);
    return g;
  }

  // 材質：部位の色に、くぼみの陰と縫い目の線を掛ける。布には、織り目としわの細かい凹凸を法線で足す
  const material = new THREE.MeshStandardNodeMaterial();
  const vColor = attribute('color', 'vec3'), vColor2 = attribute('color2', 'vec3'), vSurf = attribute('surf', 'vec4'), vDetail = attribute('detail', 'vec4');
  const ao = mix(float(0.55), float(1), vDetail.z);
  // 縫い目：頂点の値は「いちばん近い線までの距離」（0〜1 が 0〜4 cm）。画素ごとにしきい値で切るので、面が粗くても細い線になる
  const seam = float(1).sub(smoothstep(0.04, 0.06, vDetail.w));
  // 色の切り替え：128/255 が境目（データを作る道具の決まり）
  const tone = smoothstep(127 / 255, 129 / 255, vSurf.w);
  material.colorNode = mix(vColor2, vColor, tone).mul(ao).mul(mix(float(1), float(0.5), seam));
  material.roughnessNode = vSurf.x;
  material.metalnessNode = vSurf.y;
  const detailOn = uniform(options.detail === false ? 0 : 1);
  if (options.detail !== false) {
    // 織り目：立った姿勢の座標に貼り付ける（体が動いても、布の上で流れない）。しわ：関節まわりだけ
    const p = positionGeometry;
    // 模様が画素より細かくなる距離では消す（消さないと、遠くで点のちらつきと干渉の縞になる：2026-11-10 の実画面）
    const footprint = fwidth(p).length(); // 1 画素あたりの長さ（m）
    const weaveFade = float(1).sub(smoothstep(0.0006, 0.0018, footprint));
    const foldFade = float(1).sub(smoothstep(0.012, 0.035, footprint));
    const weave = sin(p.x.mul(1700)).mul(sin(p.y.mul(1700))).add(sin(p.z.mul(1700)).mul(sin(p.y.mul(1300).add(1.3))));
    const fold = sin(p.y.mul(95).add(sin(p.x.mul(40).add(p.z.mul(31))).mul(2.2))).mul(vDetail.x);
    const height = weave.mul(0.00005).mul(vSurf.z).mul(weaveFade).add(fold.mul(0.0012).mul(foldFade));
    material.normalNode = bumpNormal(height, detailOn);
  }

  const bones = BONE_NAMES.map(name => { const b = new THREE.Bone(); b.name = name; b.matrixAutoUpdate = false; return b; });
  const root = new THREE.Group();
  for (const b of bones) root.add(b);
  group.add(root);
  // 骨の計算は、逆の変換まで含めた行列を出す。ここでは「元の姿勢＝恒等」として結び付ける
  const identity = bones.map(() => new THREE.Matrix4());
  const skeleton = new THREE.Skeleton(bones, identity);
  function meshOf(index, name) {
    const mesh = new THREE.SkinnedMesh(geometryOf(index), material);
    mesh.name = name;
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.bindMode = THREE.DetachedBindMode; // 面の置き場所に関係なく、骨の世界の行列だけで決める
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  }
  const lowerMesh = meshOf(lowerIndex, 'rider-lower');
  const upperMesh = meshOf(upperIndex, 'rider-upper');
  const gearMeshes=Object.fromEntries(Object.entries(gearIndices).map(([gear,indices])=>[gear,indices.map((index,i)=>meshOf(index,gear+(i?'-upper':'-lower')))]));
  for(const meshes of Object.values(gearMeshes))for(const mesh of meshes)mesh.visible=false;
  const state = createSkeletonState();

  /**
   * @param {object} pose pose.js の出力
   * @param {{firstPerson?:boolean, stance?:number}} opts
   */
  function apply(pose, opts = {}) {
    const gear=pose.gear==='ski'?'ski':'board';
    if(gear!==appliedGear){
      for(let i=0;i<count;i++)if(parts[data.part[i]].name==='mittens')for(let k=0;k<4;k++){
        const bone=data.skinIndex[i*4+k];shared.skinIndex.array[i*4+k]=skinBoneForGear('mittens',bone,gear);
      }
      shared.skinIndex.needsUpdate=true;appliedGear=gear;
    }
    const matrices = solveSkeleton(pose, opts.stance === -1 ? -1 : 1, state);
    for (let i = 0; i < bones.length; i++) {
      bones[i].matrix.fromArray(matrices, i * 16);
      bones[i].matrixWorld.copy(bones[i].matrix);
    }
    upperMesh.visible = !opts.firstPerson;
    // 中身の無い入れ物は、描かない（スノーボードには「一人称で隠す側」の道具が無く、面が 0 枚の入れ物ができる。
    // そのまま描くと、WebGPU が「0 枚を描いている」と警告を出す：指の操作の検査が、警告で落ちた）
    for(const [gear,meshes]of Object.entries(gearMeshes))for(let i=0;i<2;i++)meshes[i].visible=meshes[i].geometry.index.count>0&&gear===(pose.gear==='ski'?'ski':'board')&&(!i||!opts.firstPerson);
  }

  return {
    group, apply,
    /** 部位の色を変える（例：{ jacket: '#2f6fb0' }）。進み具合のごほうびなどに使う */
    setColors(map) {
      // 例：{ jacket: '#2f6fb0', jacket2: '#17385c' }（名前に 2 を付けると、切り替えの先の色）
      for (const p of parts) { if (map[p.name]) partColor[p.id].set(map[p.name]); if (map[`${p.name}2`]) partColor2[p.id].set(map[`${p.name}2`]); else if (map[p.name] && !p.secondaryColor) partColor2[p.id].set(map[p.name]); }
      paint(); shared.color.needsUpdate = true; shared.color2.needsUpdate = true;
    },
    stats: { triangles: data.index.length / 3, vertices: count },
    dispose() {
      for(const meshes of Object.values(gearMeshes))for(const mesh of meshes)mesh.geometry.dispose();
      lowerMesh.geometry.dispose(); upperMesh.geometry.dispose(); material.dispose(); skeleton.dispose?.();
      group.removeFromParent();
    },
  };
}
