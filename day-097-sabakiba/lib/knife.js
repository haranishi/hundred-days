// 単位はcm。原点は刃線の中点、+xは切っ先、+yは峰。道具の姿勢は魚の座標で決める。
// 刃の接触点は折れ線の弧長上に置く。表面では接線を刃の長軸、外向き法線を峰の基準とし、
// angleDeg だけ切る平面を傾ける。刃元から引くときは長軸を反転する。こする道具は峰を進行方向に寝かせる。
// 骨沿いでは切っ先を接線へ向け、S面に寝かせた刃を骨からわずかに起こす。腹骨では刃先を腹へ向ける。
// 骨抜きは先を小骨の列に当て、柄を頭側へ倒す。窓の外の接近・離脱だけ接触点を外向きに浮かせる。
// 同じ純関数を時間側からも使い、時間を読むだけの画面では three を読み込まずに済むようにする。
import * as THREE from '../vendor/three.js';
import { TOOL_IDS } from './contract.js';
export { knifePose } from './timeline.js';

const BLADES = {
  deba:  { length: 16, height: 5,   thick: 0.52, handle: 11, tip: 0.61 },
  yanagi:{ length: 24, height: 3.2, thick: 0.31, handle: 12, tip: 0.68 },
  petty: { length: 13, height: 2.6, thick: 0.22, handle: 9,  tip: 0.47 },
};

function steel(color, roughness) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.86, roughness });
}

function mesh(name, geometry, material) {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = true;
  return part;
}

// 断面は刃線・左右のしのぎ・峰で囲む五角形。幅のある峰から薄い刃先までを斜面でつなぐ。
function bladeGeometry({ length, height, thick, tip }) {
  const stations = [
    // 刃元からの位置、刃線の高さ、峰の高さ、厚みの倍率
    [0, 0, 0.95, 1], [0.20, 0, 1, 0.96], [0.50, 0, 0.97, 0.81],
    [0.68, 0.045, 0.92, 0.67], [0.83, tip * 0.31, 0.83, 0.48], [0.94, tip * 0.69, tip + 0.12, 0.22],
  ];
  const rings = stations.map(([along, low, high, width]) => {
    const x = (along - 0.5) * length;
    const edge = low * height, spine = high * height, half = thick * width / 2;
    const ridge = edge + (spine - edge) * 0.32;
    return [[x, edge, 0], [x, ridge, half], [x, spine, half], [x, spine, -half], [x, ridge, -half]];
  });
  const tipPoint = [length / 2, height * tip, 0];
  const faces = [[], []];
  const tri = (material, a, b, c) => faces[material].push(...a, ...b, ...c);
  for (let j = 1; j < 4; j++) tri(0, rings[0][0], rings[0][j], rings[0][j + 1]);
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i], next = rings[i + 1];
    for (let j = 0; j < ring.length; j++) {
      const k = (j + 1) % ring.length;
      const bevel = j === 0 || j === 4 ? 1 : 0;
      if (next) {
        tri(bevel, ring[j], next[j], next[k]);
        tri(bevel, ring[j], next[k], ring[k]);
      } else tri(bevel, ring[j], tipPoint, ring[k]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces.flat(), 3));
  geometry.addGroup(0, faces[0].length / 3, 0);
  geometry.addGroup(faces[0].length / 3, faces[1].length / 3, 1);
  geometry.computeVertexNormals();
  return geometry;
}

function grip(group, jointX, y, length, radius, materials, z = 0) {
  const sleeve = 1.5;
  const wood = mesh('handle', new THREE.CylinderGeometry(radius, radius * 0.9, length, 20), materials.wood);
  wood.geometry.rotateZ(-Math.PI / 2);
  wood.geometry.scale(1, 1, 0.73);
  wood.position.set(jointX - sleeve - length / 2, y, z);
  const ferrule = mesh('ferrule', new THREE.CylinderGeometry(radius * 0.95, radius, sleeve, 20), materials.steel);
  ferrule.geometry.rotateZ(-Math.PI / 2);
  ferrule.geometry.scale(1, 1, 0.73);
  ferrule.position.set(jointX - sleeve / 2, y, z);
  group.add(wood, ferrule);
  for (const offset of [0.26, 0.72]) {
    const rivet = mesh('rivet', new THREE.CylinderGeometry(0.14, 0.14, radius * 1.52, 12), materials.bevel);
    rivet.geometry.rotateX(Math.PI / 2);
    rivet.position.set(jointX - sleeve - length * offset, y, z);
    group.add(rivet);
  }
}

function plate(name, outline, thickness, material, z = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(...outline[0]);
  for (const point of outline.slice(1)) shape.lineTo(...point);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, z - thickness / 2);
  return mesh(name, geometry, material);
}

function shears(group, materials) {
  for (const sign of [-1, 1]) {
    const outline = [[-5.7, -1.1], [-5.4, -1.45], [-1, -0.28], [4.7, 0.60], [4.9, 0.76], [1.5, 0.70], [-1.2, 0.42]];
    group.add(plate('blade', outline.map(([x, y]) => [x, y * sign]), 0.13, materials.steel, sign * 0.067));
    const loop = mesh('finger-loop', new THREE.TorusGeometry(1.25, 0.26, 8, 28), materials.grip);
    loop.scale.set(1.4, 0.8, 0.9);
    loop.position.set(-6.5, -1.57 * sign, 0);
    group.add(loop);
  }
  const pivot = mesh('pivot', new THREE.CylinderGeometry(0.32, 0.32, 0.40, 16), materials.bevel);
  pivot.geometry.rotateX(Math.PI / 2);
  pivot.position.x = -1;
  group.add(pivot);
}

function tweezers(group, materials) {
  for (const sign of [-1, 1]) {
    // 頭側へ引く方向が分かるように、つかむ先端を原点で閉じ、握る所に隙間を残す。
    const outline = [[0, 0], [-0.34, 0.03], [-2.3, 0.44], [-7.8, 0.08], [-8.7, 0], [-8.7, 0.16],
      [-7.8, 0.25], [-2.3, 0.63], [-0.18, 0.22]];
    group.add(plate('jaw', outline.map(([x, y]) => [x, sign * y]), 0.66, materials.steel));
  }
}

function scaler(group, materials) {
  grip(group, -2, 0, 9.2, 0.85, materials, 0.78);
  const head = mesh('head', new THREE.CylinderGeometry(1, 1, 0.32, 24), materials.steel);
  head.geometry.rotateX(Math.PI / 2);
  head.scale.set(2.4, 1.30, 1);
  head.position.z = 0.44;
  group.add(head);
  for (let row = -1; row <= 1; row++) {
    for (let col = -2; col <= 2; col++) {
      const tooth = mesh('tooth', new THREE.ConeGeometry(0.20, 0.30, 4), materials.bevel);
      tooth.geometry.rotateX(-Math.PI / 2);
      tooth.position.set(col * 0.67, row * 0.56, 0.15);
      group.add(tooth);
    }
  }
}

// 親指（手開き）。原点は指の腹の先（接触点）、+xが指先の向き、爪は+y側。円柱と箱だけで作る（閉じた面）。
function thumb(group) {
  const skinTone = new THREE.MeshStandardMaterial({ color: 0xe6b595, roughness: 0.58 });
  const finger = mesh('finger', new THREE.CylinderGeometry(0.82, 0.9, 5.6, 20), skinTone);
  finger.geometry.rotateZ(-Math.PI / 2);
  finger.geometry.scale(1, 1, 0.82);
  finger.position.set(-2.8, 0, 0);
  group.add(finger);
  const nail = mesh('nail', new THREE.BoxGeometry(1.5, 0.16, 1.1), new THREE.MeshStandardMaterial({ color: 0xf6dcd0, roughness: 0.3 }));
  nail.position.set(-0.95, 0.74, 0);
  group.add(nail);
}

export function buildKnife(tool) {
  if (!TOOL_IDS.includes(tool)) throw new RangeError('道具の名前が登録されていません。');
  const group = new THREE.Group();
  group.userData.tool = tool;
  group.name = tool;
  const materials = {
    steel: steel(0xb8c2c6, 0.31), bevel: steel(0xe6eff0, 0.19),
    wood: new THREE.MeshStandardMaterial({ color: 0xae7846, roughness: 0.63 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x343d3c, roughness: 0.59 }),
  };
  if (BLADES[tool]) {
    const spec = BLADES[tool];
    // 刃は半透明にして、刃の下の切り線と身の様子が見えるようにする（柄・口金・鋲は不透明のまま）。
    const ghost = (m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.74; c.depthWrite = false; return c; };
    group.add(mesh('blade', bladeGeometry(spec), [ghost(materials.steel), ghost(materials.bevel)]));
    grip(group, -spec.length / 2, spec.height * 0.66, spec.handle, tool === 'petty' ? 1.0 : 1.23, materials);
  } else if (tool === 'shears') shears(group, materials);
  else if (tool === 'tweezers') tweezers(group, materials);
  else if (tool === 'thumb') thumb(group);
  else scaler(group, materials);
  return group;
}
