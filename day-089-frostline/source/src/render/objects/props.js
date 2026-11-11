// 建物・橋・リフト・針葉樹・岩の形（tools/propgen が作ったデータ）を読み、山のデータが持つ場所（world.json の structures）へ置く。
// 針葉樹と岩は、木や岩を並べて描く部品（scatter.js）へ「形」として渡す。集落とリフトは、ここで 1 つずつ置く。
import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, float, length, max, min, modelPosition, positionLocal, vec3 } from 'three/tsl';
import { readPropData } from './prop-data.js';

/** 質感の番号（データの決まり：0 木・1 石・2 雪・3 鋼・4 硝子・5 葉・6 幹）ごとの [粗さ, 金属らしさ] */
const SURFACE = [[0.86, 0], [0.92, 0], [0.82, 0], [0.42, 0.75], [0.08, 0.1], [0.9, 0], [0.92, 0]];
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export async function loadProps(base = 'models/props-v1') {
  const [jsonResponse, binResponse] = await Promise.all([fetch(`${base}.json`), fetch(`${base}.bin`)]);
  if (!jsonResponse.ok || !binResponse.ok) throw new Error(`建物と木の形のデータを読めません（${jsonResponse.status}・${binResponse.status}）`);
  return readPropData(await binResponse.arrayBuffer(), await jsonResponse.json());
}

/**
 * 形のデータ 1 つを、描ける形にする。色はデータでは sRGB なので、計算用の値へ直す。
 * @param {object} mesh readPropData の meshes の 1 つ
 * @param {{scale?:[number,number,number], surface?:boolean}} options scale：頂点へ掛ける拡大（木や岩を「高さ 1」へそろえるのに使う）
 */
export function propGeometry(mesh, { scale = [1, 1, 1], surface = true } = {}) {
  const count = mesh.position.length / 3;
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), color = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      position[i * 3 + k] = mesh.position[i * 3 + k] * scale[k];
      normal[i * 3 + k] = mesh.normal[i * 3 + k] / scale[k]; // 拡大が軸で違うとき、法線は逆の比で直す
      color[i * 3 + k] = toLinear(mesh.color[i * 3 + k]) * (1 - 0.45 * mesh.ao[i]); // くぼみの陰を色に入れる
    }
    const n = Math.hypot(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]) || 1;
    normal[i * 3] /= n; normal[i * 3 + 1] /= n; normal[i * 3 + 2] /= n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  if (surface) {
    const surf = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) { const s = SURFACE[mesh.material[i]] ?? SURFACE[0]; surf[i * 2] = s[0]; surf[i * 2 + 1] = s[1]; }
    g.setAttribute('surf', new THREE.BufferAttribute(surf, 2));
  }
  g.setIndex(new THREE.BufferAttribute(mesh.index, 1));
  return g;
}

/**
 * 針葉樹と岩を、scatter.js が使う「高さ 1 の形」の表にする：[種類][変種][細かさの段]。
 * 樹氷（monster）の形は持たない（谷と湖のマップでは出さない）。呼ぶたびに新しい形を作る（段の切り替えで捨てられるため）。
 */
export function propShapes(props) {
  const lods = ['near', 'mid', 'far'];
  const pick = (name, lod) => props.meshes.find(m => m.name === name && m.lod === lod) ?? props.meshes.find(m => m.name === name);
  const fir = (name) => lods.map((lod) => { const m = pick(name, lod), h = m.metadata.bounds.size[1]; return propGeometry(m, { scale: [1 / h, 1 / h, 1 / h], surface: false }); });
  // 岩は、当たりの半径から大きさを決める（scatter.js：高さ＝半径 × 2.2）。横幅が当たりの直径とほぼ合うように、横だけ縮める
  const rock = (name, mirror) => lods.map(() => {
    const m = pick(name, 'near'), size = m.metadata.bounds.size, h = size[1], half = Math.max(size[0], size[2]) / 2 / h, side = 0.45 / half;
    const g = propGeometry(m, { scale: [side / h, 1 / h, side / h], surface: false });
    if (mirror) g.rotateY(Math.PI * 0.6);
    return g;
  });
  return { tree: ['fir-a', 'fir-b', 'fir-c'].map(fir), rock: [rock('boulder-a', false), rock('boulder-b', false), rock('boulder-a', true)] };
}

/**
 * 集落（山荘・小屋・橋）とリフト（乗り場・柱・索・椅子）を置く。
 * 向きの決まり（山のデータ）：yaw は北（−Z）を 0 として時計回り。建物の「長さ」の軸が、その向きを向く。形のデータは、長さの軸が +X、正面が −Z。
 * @param {{scene:object, world:object, props:object}} deps
 */
export function createStructures({ scene, world, props }) {
  const s = world.meta.structures;
  const group = new THREE.Group();
  group.name = 'structures';
  const disposables = [];
  if (!s || !props) { scene.add(group); return { group, dispose() { scene.remove(group); } }; }

  const material = new THREE.MeshStandardNodeMaterial({ vertexColors: true });
  const surf = attribute('surf', 'vec2');
  material.roughnessNode = surf.x;
  material.metalnessNode = surf.y;
  disposables.push(material);
  // リフトの柱だけの材質：遠くでは、柱を太く描く（150 m より先で、距離に比べて太らせる。最大 5 倍）。
  // 柱は太さ 0.7 m ほどで、500 m 先では 1 画素より細くなり、谷の向こうや湖の岸からは、リフトがどこにあるか見えなかった
  // （見た目の採点 2・3 周目「リフトが、どの絵にも写らない」）。近くでは、元の太さのまま
  const towerMaterial = new THREE.MeshStandardNodeMaterial({ vertexColors: true });
  towerMaterial.roughnessNode = surf.x;
  towerMaterial.metalnessNode = surf.y;
  const fat = min(max(float(1), length(modelPosition.sub(cameraPosition)).div(150)), float(5));
  towerMaterial.positionNode = positionLocal.mul(vec3(fat, 1, fat));
  disposables.push(towerMaterial);
  const geometries = new Map();
  const geometryOf = (name) => {
    if (!geometries.has(name)) { const m = props.meshes.find(v => v.name === name); const g = m ? propGeometry(m) : null; geometries.set(name, g); if (g) disposables.push(g); }
    return geometries.get(name);
  };
  function place(name, x, y, z, rotationY, scale = [1, 1, 1]) {
    const g = geometryOf(name); if (!g) return null;
    const mesh = new THREE.Mesh(g, name === 'lift-tower' ? towerMaterial : material);
    mesh.position.set(x, y, z); mesh.rotation.y = rotationY; mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = name;
    group.add(mesh); return mesh;
  }
  const lengthAxis = (yaw) => Math.PI / 2 - yaw; // 形の +X を、山のデータの「長さ」の向きへ

  if (s.lodge) place('lodge', s.lodge.x, s.lodge.y, s.lodge.z, lengthAxis(s.lodge.yaw));
  for (const c of s.chalets ?? []) place(['chalet-a', 'chalet-b', 'chalet-c'][c.variant % 3] ?? 'chalet-a', c.x, c.y, c.z, lengthAxis(c.yaw));
  if (s.bridge) {
    // 橋の床の高さは、山のデータの問い合わせ（重ねる面）と合わせる：両端の雪の面が、岸の高さへ来るように置く
    // （問い合わせの床：端で b.y、中央で b.y＋rise。形のデータの雪の面：端で snowTopOffset、中央で snowTopOffset＋rise）
    const b = s.bridge, deck = props.meshes.find(v => v.name === 'bridge')?.metadata.deck;
    place('bridge', b.x, b.y - (deck?.snowTopOffset ?? 1.1), b.z, lengthAxis(b.yaw));
  }
  const lift = s.lift;
  if (lift?.base && lift?.top) {
    const dx = lift.top.x - lift.base.x, dz = lift.top.z - lift.base.z, heading = Math.atan2(dx, -dz);
    const sideX = Math.cos(heading), sideZ = Math.sin(heading);
    place('lift-station', lift.base.x, lift.base.y, lift.base.z, Math.PI / 2 - heading);
    place('lift-station', lift.top.x, lift.top.y, lift.top.z, Math.PI / 2 - heading + Math.PI);
    const towerHeight = props.meshes.find(v => v.name === 'lift-tower')?.metadata.bounds.size[1] ?? 10;
    // 索が通る点：乗り場の屋根の高さ → 柱の上 → 山頂側の乗り場
    const supports = [{ x: lift.base.x, y: lift.base.y + 5.2, z: lift.base.z }];
    for (const t of lift.towers ?? []) {
      const y = Number.isFinite(t.y) && t.y > 0 ? t.y : world.heightAt(t.x, t.z), h = t.height ?? 10;
      place('lift-tower', t.x, y, t.z, -heading, [1, h / towerHeight, 1]);
      supports.push({ x: t.x, y: y + h - 0.35, z: t.z });
    }
    supports.push({ x: lift.top.x, y: lift.top.y + 5.2, z: lift.top.z });
    // 索：上りと下りの 2 本。細い筒を、支点から支点へ渡す
    const cableGeometry = new THREE.CylinderGeometry(0.03, 0.03, 1, 5, 1, true);
    cableGeometry.translate(0, 0.5, 0);
    const cableMaterial = new THREE.MeshStandardNodeMaterial({ color: 0x1b1f24, roughness: 0.5, metalness: 0.7 });
    const cables = new THREE.InstancedMesh(cableGeometry, cableMaterial, (supports.length - 1) * 2);
    const chairGeometry = geometryOf('lift-chair');
    const chairTop = props.meshes.find(v => v.name === 'lift-chair')?.metadata.bounds.size[1] ?? 3.3;
    const chairSpots = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), a = new THREE.Vector3(), d = new THREE.Vector3(), one = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let n = 0, travelled = 0;
    const offset = 2.6, spacing = 42;
    for (let i = 0; i < supports.length - 1; i++) for (const side of [-1, 1]) {
      const p0 = supports[i], p1 = supports[i + 1];
      a.set(p0.x + sideX * offset * side, p0.y, p0.z + sideZ * offset * side);
      d.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
      const length = d.length(); d.multiplyScalar(1 / length);
      q.setFromUnitVectors(up, d); one.set(1, length, 1);
      m4.compose(a, q, one); cables.setMatrixAt(n++, m4);
      // 椅子：索に沿って、決まった間隔で吊る（上りは山を向き、下りは谷を向く）
      if (side === 1) travelled = (travelled + length) % spacing;
      for (let t = (side === 1 ? spacing - travelled : spacing / 2); t < length; t += spacing) {
        chairSpots.push({ x: a.x + d.x * t, y: a.y + d.y * t - chairTop, z: a.z + d.z * t, rotation: side === 1 ? -heading : -heading + Math.PI });
      }
    }
    cables.castShadow = false; cables.name = 'lift-cables';
    group.add(cables); disposables.push(cableGeometry, cableMaterial);
    if (chairGeometry && chairSpots.length) {
      const chairs = new THREE.InstancedMesh(chairGeometry, material, chairSpots.length);
      chairSpots.forEach((c, i) => { q.setFromAxisAngle(up, c.rotation); m4.compose(a.set(c.x, c.y, c.z), q, one.set(1, 1, 1)); chairs.setMatrixAt(i, m4); });
      chairs.castShadow = true; chairs.name = 'lift-chairs'; chairs.frustumCulled = false;
      group.add(chairs);
    }
  }
  scene.add(group);
  return { group, dispose() { scene.remove(group); for (const item of disposables) item.dispose?.(); } };
}
