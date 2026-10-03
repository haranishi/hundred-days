// OWNER: city
// 通りの暮らしの形（r01-city）：道の小物・船・遠景の車。近景・中景の車は carGeometry.ts、人は personGeometry.ts。
// 車と人は大きさ1の形を作り、インスタンスの行列で実寸（長さ・幅・高さ、背の高さ）に伸ばす。
// 頂点の属性（lifeSoup.ts）：aPaint（1 = インスタンスの色を塗る車体・上着、2 = 上着の色から決めるズボン）、
// aSurf（粗さ・金属度）、aEmit（灯火の光）。
import { Color, type BufferGeometry } from 'three';
import { LifeSoup } from './lifeSoup';

export { carMidShapes, carShapes } from './carGeometry';
export { PERSON_VARIANTS, personFarShapes, personShapes } from './personGeometry';

const GLASS = 0x0d1114;
const PAINT = 1;

/** 車の遠景の形（240m より先）：車体と客室の2つの箱（添字は CAR_TYPES の shape）。 */
export function carFarShapes(): BufferGeometry[] {
  const make = (cabin: [number, number, number, number] | null): BufferGeometry => {
    const s = new LifeSoup();
    s.set(0xffffff, PAINT, 0.4, 0.3);
    s.box([-0.5, 0.12, -0.5], [0.5, cabin ? cabin[0] : 1, 0.5]);
    if (cabin) {
      s.set(0x3a3d40, 0, 0.2, 0.2);
      s.box([-0.45, cabin[0], cabin[2]], [0.45, cabin[1], cabin[3]]);
    }
    return s.geometry();
  };
  const sedan = make([0.55, 0.97, -0.3, 0.2]);
  const box = make([0.6, 0.98, -0.48, 0.3]);
  const plain = make(null);
  // 同じ形は同じ物を渡す（lodPool.ts が1つの InstancedMesh にまとめ、描画命令が減る）
  return [sedan, box, sedan, plain, plain, make([0.58, 0.97, -0.42, 0.22]), box];
}

// ---- 道の小物（実寸で作る。添字は world/streetLife.ts の FURNITURE_KINDS） ----

function hydrant(): BufferGeometry {
  const s = new LifeSoup();
  s.set(0x9b1e18, 0, 0.5, 0.1);
  s.box([-0.12, 0, -0.12], [0.12, 0.62, 0.12]);
  s.box([-0.2, 0.36, -0.05], [0.2, 0.46, 0.05]);
  s.set(0xc9a227, 0, 0.5, 0.2);
  s.box([-0.14, 0.62, -0.14], [0.14, 0.72, 0.14]);
  // 標識の柱と丸い板（赤地に意味を持たない白い模様は描かない。地の色だけ）
  s.set(0x8a8c8e, 0, 0.5, 0.5);
  s.box([0.3, 0, -0.03], [0.36, 2.5, 0.03]);
  s.set(0xa3231b, 0, 0.5, 0);
  s.box([0.1, 2.05, -0.02], [0.56, 2.5, 0.02]);
  return s.geometry();
}

function bin(): BufferGeometry {
  const s = new LifeSoup();
  s.set(0x4e6f5e, 0, 0.55, 0.2);
  s.box([-0.22, 0, -0.2], [0.22, 0.82, 0.2]);
  s.set(0x2c2e30, 0, 0.5, 0.3);
  s.box([-0.23, 0.82, -0.21], [0.23, 0.88, 0.21]);
  return s.geometry();
}

function vending(): BufferGeometry {
  const s = new LifeSoup();
  // 自動販売機：白い箱、正面の上半分に商品の並ぶ明るい窓、下に取り出し口（正面は +z）
  s.set(0xe6e4df, 0, 0.45, 0.1);
  s.box([-0.5, 0, -0.38], [0.5, 1.83, 0.38]);
  s.set(0xf2efe6, 0, 0.3, 0, 0.35);
  s.box([-0.43, 0.98, 0.38], [0.43, 1.72, 0.395]);
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 6; k++) {
      const hue = [0xb8412e, 0x2f5e8c, 0x3b7a4a, 0xd0a13a, 0x7b3f6e, 0xe0e0dc][(r * 2 + k) % 6];
      s.set(hue, 0, 0.4, 0, 0.25);
      const x = -0.38 + k * 0.13;
      const y = 1.05 + r * 0.22;
      s.box([x, y, 0.395], [x + 0.09, y + 0.15, 0.41]);
    }
  }
  s.set(0x1a1b1c, 0, 0.5, 0.2);
  s.box([-0.36, 0.18, 0.38], [0.36, 0.4, 0.395]);
  return s.geometry();
}

function busStop(): BufferGeometry {
  const s = new LifeSoup();
  // 屋根付きの停留所：後ろの板・屋根・ベンチ・丸い標識の柱（道は -z の側）
  s.set(0x6b6f72, 0, 0.45, 0.6);
  s.box([-1.6, 0, 0.55], [-1.52, 2.45, 0.63]);
  s.box([1.52, 0, 0.55], [1.6, 2.45, 0.63]);
  s.set(0x9fb2b8, 0, 0.1, 0.1);
  s.box([-1.52, 0.2, 0.57], [1.52, 2.2, 0.61]);
  s.set(0x5a5e61, 0, 0.5, 0.5);
  s.box([-1.8, 2.45, -0.4], [1.8, 2.55, 0.7]);
  s.set(0x6d5a44, 0, 0.7, 0);
  s.box([-1.1, 0.42, 0.25], [1.1, 0.48, 0.55]);
  s.set(0x8a8c8e, 0, 0.5, 0.5);
  s.box([2.2, 0, -0.03], [2.26, 2.7, 0.03]);
  s.set(0x2b5c8a, 0, 0.4, 0);
  s.box([2.0, 2.3, -0.02], [2.46, 2.76, 0.02]);
  return s.geometry();
}

function pole(): BufferGeometry {
  const s = new LifeSoup();
  // 電柱：灰色のコンクリートの柱と、上の腕木・碍子の箱・変圧器
  s.set(0x8f8d88, 0, 0.8, 0);
  s.box([-0.16, 0, -0.16], [0.16, 12, 0.16]);
  s.set(0x5b5d5e, 0, 0.6, 0.4);
  s.box([-0.9, 10.6, -0.06], [0.9, 10.72, 0.06]);
  s.box([-0.7, 9.2, -0.06], [0.7, 9.3, 0.06]);
  s.set(0x9ea39e, 0, 0.5, 0.2);
  s.box([0.16, 7.2, -0.28], [0.62, 8.2, 0.28]);
  return s.geometry();
}

function bench(): BufferGeometry {
  const s = new LifeSoup();
  // 公園のベンチ：木の座面と背、鉄の脚（正面は +z）
  s.set(0x6d5540, 0, 0.7, 0);
  s.box([-0.85, 0.42, -0.2], [0.85, 0.47, 0.22]);
  s.box([-0.85, 0.52, -0.26], [0.85, 0.82, -0.22]);
  s.set(0x2e3032, 0, 0.5, 0.5);
  for (const x of [-0.72, 0.72]) s.box([x - 0.03, 0, -0.24], [x + 0.03, 0.82, 0.2]);
  return s.geometry();
}

function bollard(): BufferGeometry {
  const s = new LifeSoup();
  s.set(0x2a2c2e, 0, 0.55, 0.4);
  s.box([-0.18, 0, -0.18], [0.18, 0.55, 0.18]);
  s.box([-0.26, 0.55, -0.26], [0.26, 0.68, 0.26]);
  return s.geometry();
}

/** コンテナ（大きさ1：幅 x・高さ y・長さ z をインスタンスで伸ばす）。側面は塗り、端の扉は少し暗い。 */
function container(): BufferGeometry {
  const s = new LifeSoup();
  s.set(0xffffff, PAINT, 0.6, 0.35);
  s.box([-0.5, 0, -0.5], [0.5, 1, 0.5]);
  s.set(new Color(0.55, 0.55, 0.55), PAINT, 0.6, 0.35);
  s.box([-0.49, 0.02, 0.5], [0.49, 0.98, 0.502]);
  // 上の縁と下の縁の枠（暗い線）
  s.set(new Color(0.45, 0.45, 0.45), PAINT, 0.6, 0.35);
  s.box([-0.502, 0.94, -0.5], [0.502, 1.0, 0.5]);
  s.box([-0.502, 0.0, -0.5], [0.502, 0.05, 0.5]);
  return s.geometry();
}

/** 岸壁の柵（2.5m ぶん、x の外側が水）。 */
function rail(): BufferGeometry {
  const s = new LifeSoup();
  s.set(0xb9bcbd, 0, 0.45, 0.6);
  s.box([-0.04, 0, -0.04], [0.04, 1.1, 0.04]);
  s.box([-0.035, 1.02, -1.25], [0.035, 1.1, 1.25]);
  s.box([-0.025, 0.55, -1.25], [0.025, 0.6, 1.25]);
  return s.geometry();
}

export function furnitureShapes(): BufferGeometry[] {
  return [hydrant(), bin(), vending(), busStop(), pole(), bench(), bollard(), container(), rail()];
}

// ---- 船（大きさ1＝全長。インスタンスで全長に伸ばす。水面が y=0） ----

function smallBoat(cabinH: number, cabinLen: number): BufferGeometry {
  const s = new LifeSoup();
  // 船体：へさきが斜めに上がる側面の形
  s.set(0xffffff, PAINT, 0.4, 0.1);
  s.prism(
    [
      [-0.5, -0.04],
      [0.3, -0.04],
      [0.5, 0.11],
      [-0.5, 0.1],
    ],
    0.3,
  );
  s.set(0x1e2a33, 0, 0.5, 0.1);
  s.box([-0.155, -0.02, -0.49], [0.155, 0.02, 0.28]);
  // 甲板と操舵室
  s.set(0xcfcac0, 0, 0.7, 0);
  s.box([-0.14, 0.1, -0.48], [0.14, 0.105, 0.36]);
  s.set(0xf0eee8, 0, 0.5, 0.1);
  s.box([-0.1, 0.1, -0.2], [0.1, 0.1 + cabinH, -0.2 + cabinLen]);
  s.set(GLASS, 0, 0.06, 0.2);
  s.box([-0.102, 0.1 + cabinH * 0.55, -0.2 + cabinLen * 0.3], [0.102, 0.1 + cabinH * 0.9, -0.2 + cabinLen - 0.01]);
  return s.geometry();
}

function cargoShip(): BufferGeometry {
  const s = new LifeSoup();
  // 船体（塗り）・喫水線の赤い帯・船首の反り
  s.set(0xffffff, PAINT, 0.45, 0.2);
  s.prism(
    [
      [-0.5, -0.03],
      [0.42, -0.03],
      [0.5, 0.1],
      [-0.5, 0.09],
    ],
    0.16,
  );
  s.set(0x6b1f1a, 0, 0.6, 0.1);
  s.box([-0.0805, -0.035, -0.5], [0.0805, 0.0, 0.43]);
  // 船倉の蓋（暗い灰色の箱の列）
  for (let k = 0; k < 5; k++) {
    const z0 = -0.28 + k * 0.14;
    s.set(k % 2 === 0 ? 0x3a3f44 : 0x444a4f, 0, 0.6, 0.3);
    s.box([-0.065, 0.09, z0], [0.065, 0.11, z0 + 0.12]);
  }
  // 船尾の居住区（白）・煙突・窓の帯
  s.set(0xe8e6e0, 0, 0.5, 0.1);
  s.box([-0.075, 0.09, -0.48], [0.075, 0.2, -0.37]);
  s.box([-0.05, 0.2, -0.47], [0.05, 0.235, -0.39]);
  s.set(GLASS, 0, 0.06, 0.2);
  s.box([-0.076, 0.17, -0.47], [0.076, 0.185, -0.38]);
  s.set(0x2b2d30, 0, 0.5, 0.2);
  s.box([-0.015, 0.2, -0.485], [0.015, 0.27, -0.455]);
  return s.geometry();
}

/** 船の形（添字は world/streetLife.ts の BoatKind の順：small・launch・ship）。 */
export function boatShapes(): BufferGeometry[] {
  return [smallBoat(0.1, 0.22), smallBoat(0.16, 0.34), cargoShip()];
}
