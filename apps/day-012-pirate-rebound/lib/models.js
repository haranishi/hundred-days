/* 3Dモデル。ファイルは読み込まず、全部ここで頂点を置いて組み立てる。

   面は3頂点でも4頂点でもよい（塗るだけなので）。色は [r,g,b]。
   低ポリなのは手抜きではなく、逆光のシルエットで見せる画作りに合わせた選択。 */

const IRON = [104, 112, 126];   // 濃紺の海に対して沈まない明るさ（体験評価3周目）
const IRON_DARK = [54, 58, 68];
const WOOD = [122, 84, 52];
const WOOD_DARK = [86, 58, 36];
const SAIL = [232, 214, 186];
const SAIL_SHADE = [198, 176, 148];
const FEATHER = [238, 238, 236];
const FEATHER_DARK = [176, 178, 184];

const face = (v, color) => ({ v, color });

/** 八面体を分割して球にする。subdivisions=1 で32面。砲弾はこれで足りる。 */
export function makeSphere(radius = 1, subdivisions = 1, color = IRON) {
  let vertices = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
  ];
  let triangles = [
    [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
    [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]
  ];

  for (let step = 0; step < subdivisions; step += 1) {
    const next = [];
    const middles = new Map();
    const middle = (a, b) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (middles.has(key)) return middles.get(key);
      const p = [0, 1, 2].map((axis) => (vertices[a][axis] + vertices[b][axis]) / 2);
      const length = Math.hypot(...p) || 1;
      vertices.push([p[0] / length, p[1] / length, p[2] / length]);
      middles.set(key, vertices.length - 1);
      return vertices.length - 1;
    };
    for (const [a, b, c] of triangles) {
      const ab = middle(a, b);
      const bc = middle(b, c);
      const ca = middle(c, a);
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    triangles = next;
  }

  vertices = vertices.map((p) => p.map((value) => value * radius));
  // 上半分と下半分でわずかに色を変える。真球でも回転が見えるようにするため
  const faces = triangles.map((v) => {
    const high = v.every((index) => vertices[index][1] >= 0);
    return face(v, high ? color : color.map((channel) => channel * 0.78));
  });
  return { vertices, faces };
}

/** カモメ。flap は羽ばたきの角度(ラジアン)。翼だけがそこで動く。 */
export function makeGull(flap = 0) {
  const lift = Math.sin(flap) * 0.42;
  return {
    vertices: [
      [0, 0, 0.55], [0, 0.12, -0.1], [0, -0.1, -0.35], [0.14, 0, 0.05], [-0.14, 0, 0.05],
      [0.95, lift, -0.1], [0.5, lift * 0.6, 0.28],
      [-0.95, lift, -0.1], [-0.5, lift * 0.6, 0.28]
    ],
    faces: [
      face([0, 3, 1], FEATHER), face([0, 1, 4], FEATHER),
      face([0, 2, 3], FEATHER_DARK), face([0, 4, 2], FEATHER_DARK),
      face([3, 6, 5], FEATHER), face([3, 5, 1], FEATHER_DARK),
      face([4, 1, 7], FEATHER_DARK), face([4, 7, 8], FEATHER)
    ]
  };
}

/* 敵船。奥に置いて逆光のシルエットで見せるので、細部は要らない。

   段（lib/damage.js）を渡すと、その段まで壊れた姿を返す。
   壊れ方の順は「帆 → マスト → 船体」。遠くの小さいシルエットなので、
   細かい欠けではなく**輪郭が変わる**壊し方でないと、崩れたことが伝わらない。 */
export function makeEnemyShip(stage = 0) {
  const level = Math.max(0, Math.floor(stage) || 0);

  const hull = [
    [-3.2, 0, -1.4], [3.2, 0, -1.4], [3.9, 1.5, -1.8], [-3.9, 1.5, -1.8],
    [-3.2, 0, 1.4], [3.2, 0, 1.4], [3.9, 1.5, 1.8], [-3.9, 1.5, 1.8]
  ];
  // マストは折れると上端が落ちて、少し傾く
  const mastTop = level >= 3 ? 5.4 : 8.4;
  const lean = level >= 3 ? 0.9 : 0;
  const mast = [
    [-0.16, 1.5, -0.16], [0.16, 1.5, -0.16], [0.16, 1.5, 0.16], [-0.16, 1.5, 0.16],
    [-0.16 + lean, mastTop, -0.16], [0.16 + lean, mastTop, -0.16],
    [0.16 + lean, mastTop, 0.16], [-0.16 + lean, mastTop, 0.16]
  ];
  // 上の帆は、落ちる前に一度「裂ける」（上辺が縮んで垂れる）
  const tornTop = level >= 1 ? 6.3 : 7.4;
  const tornWidth = level >= 1 ? 0.5 : 1.4;
  const sails = [
    [-2.5, 2.6, 0], [2.5, 2.6, 0], [2.1, 5.0, 0], [-2.1, 5.0, 0],
    [-1.8, 5.4, 0], [1.8, 5.4, 0], [tornWidth, tornTop, 0], [-tornWidth, tornTop, 0]
  ];

  let vertices = [...hull, ...mast, ...sails];
  const m = hull.length;
  const s = hull.length + mast.length;

  const faces = [
    face([3, 2, 6, 7], WOOD), face([0, 1, 5, 4], WOOD_DARK),
    face([0, 4, 7, 3], WOOD_DARK), face([1, 2, 6, 5], WOOD_DARK),
    face([4, 5, 6, 7], WOOD), face([0, 3, 2, 1], WOOD_DARK),
    face([m + 0, m + 1, m + 5, m + 4], WOOD_DARK), face([m + 2, m + 3, m + 7, m + 6], WOOD_DARK)
  ];
  if (level < 4) faces.push(face([s + 0, s + 1, s + 2, s + 3], SAIL));
  if (level < 2) faces.push(face([s + 4, s + 5, s + 6, s + 7], SAIL_SHADE));

  /* 船体が傾く。奥の小さいシルエットでは、部品が減るより傾きのほうが強く伝わる。
     水面より下へは沈めない（海を線で描いているだけなので、沈めると海の上に浮いて見える）。 */
  if (level >= 5) {
    const roll = level >= 6 ? 0.42 : 0.18;
    const drop = level >= 6 ? 0.2 : 0.06;
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    vertices = vertices.map(([x, y, z]) => [x * cos - y * sin, x * sin + y * cos - drop, z]);
  }

  return { vertices, faces };
}

/** 自分の船の船首。画面の下から手前に突き出す。ここが「打つ場所」の目印になる。
    横に広げると海が隠れてただの箱に見えるので、幅は狭く、舷（ふなべり）を立てて奥行きを出す。 */
export function makeBow() {
  return {
    vertices: [
      [-0.62, 0, 0], [0.62, 0, 0], [0.30, 0, 1.55], [-0.30, 0, 1.55],
      [-0.70, 0.34, 0], [0.70, 0.34, 0], [0.34, 0.34, 1.62], [-0.34, 0.34, 1.62],
      [0, 0.54, 2.00]
    ],
    faces: [
      face([0, 1, 2, 3], WOOD),
      face([0, 3, 7, 4], WOOD_DARK), face([1, 5, 6, 2], WOOD_DARK),
      face([4, 7, 6, 5], WOOD), face([3, 2, 6, 7], WOOD_DARK),
      face([7, 8, 6], WOOD)
    ]
  };
}

/** 打ち返す櫂。振りは描くときに回して出す。 */
export function makeOar() {
  return {
    vertices: [
      [-0.07, 0, 0], [0.07, 0, 0], [0.07, 0, 1.9], [-0.07, 0, 1.9],
      [-0.26, 0, 1.9], [0.26, 0, 1.9], [0.2, 0, 2.75], [-0.2, 0, 2.75],
      [-0.07, 0.13, 0], [0.07, 0.13, 0], [0.07, 0.13, 1.9], [-0.07, 0.13, 1.9]
    ],
    faces: [
      face([8, 9, 10, 11], WOOD), face([0, 1, 2, 3], WOOD_DARK),
      face([0, 8, 11, 3], WOOD_DARK), face([1, 2, 10, 9], WOOD_DARK),
      face([4, 5, 6, 7], WOOD), face([7, 6, 5, 4], WOOD_DARK)
    ]
  };
}

export const PALETTE = { IRON, IRON_DARK, WOOD, SAIL, FEATHER };
