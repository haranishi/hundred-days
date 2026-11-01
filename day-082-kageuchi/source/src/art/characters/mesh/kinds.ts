// OWNER: chars-art
// 5種の人物の組み立て。遊ぶカメラ（見下ろし 48°・11m）で、輪郭だけで誰か分かることを最優先にする。
//   光秀＝低く細い黒い影と頭巾／足軽＝円錐の笠と長い槍／侍＝張った肩（袖の板）／蘭丸＝細身で長い袖と紫／信長＝白い座り姿
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import type { CharacterKind } from '../../../contract/snapshot';
import { COLOR, FACE_SHAPE, HAKAMA_PLEATS, KIMONO_COLLAR, PLAYER_ARMOR_SECTIONS, PLAYER_OUTFIT as OUTFIT, SURF } from '../config';
import { B } from '../rig';
import type { Skin, Surf } from './builder';
import {
  arm,
  baseTorso,
  decal,
  drawnSword,
  fist,
  foot,
  hakama,
  head,
  HEAD,
  headCenter,
  kimonoCollar,
  kusazuri,
  lantern,
  leg,
  neck,
  obi,
  pebble,
  robeHalves,
  sheathedSword,
  sideBones,
  sleeveTube,
  dou,
  spear,
  stool,
  torso,
  type Ctx,
} from './parts';
import { bentPlate, box, cyl, ellipsoid, lathe, loft, mat, ring, tube, type Ring } from './shapes';

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** 前の開いた筒（羽織）。外と内の2枚を作る（材質は片面なので）。θ は正面（+Z）から +X 側へ測った角。 */
function openLoft(rings: readonly Ring[], seg: number, th0: number, th1: number, thick: number): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const n = rings.length;
  for (let layer = 0; layer < 2; layer++) {
    const off = layer === 0 ? 0 : -thick;
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const r = rings[i];
      for (let k = 0; k <= seg; k++) {
        const th = th0 + ((th1 - th0) * k) / seg;
        const s = Math.sin(th);
        const c = Math.cos(th);
        const rx = r.rx + off;
        const rz = r.rz + off;
        pos.push(r.c.x + rx * s, r.c.y, r.c.z + rz * c);
        const nx = s / rx;
        const nz = c / rz;
        const l = Math.hypot(nx, nz);
        const sg = layer === 0 ? 1 : -1;
        nor.push((sg * nx) / l, 0, (sg * nz) / l);
        uv.push(k / seg, i / (n - 1));
      }
    }
    const row = seg + 1;
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const a = base + i * row + k;
        const b = a + 1;
        const cc = a + row;
        const d = cc + 1;
        // 輪が上から下へ並ぶので、外向きになるよう向きを決める
        if (layer === 0) idx.push(a, cc, b, b, cc, d);
        else idx.push(a, b, cc, b, d, cc);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** 垂れる帯（頭巾の垂れ・鉢巻の端）。上端が tailA、下端が tailB に重みを寄せる。 */
function ribbon(c: Ctx, at: Vector3, len: number, w: number, color: number, surf: Surf, splay: number): void {
  const g = box(w, len, 0.006, 1, 3, 1);
  g.translate(0, -len / 2, 0);
  const top = at.y;
  const skin: Skin = {
    fn: (p) => {
      const t = Math.max(0, Math.min(1, (top - p.y) / len));
      return [
        [B.tailA, 1 - t],
        [B.tailB, t],
      ];
    },
  };
  c.b.add(g, { color, surf, skin, matrix: mat(at.x, at.y, at.z, -8, 0, splay) });
}

/** 吊るした袖の袋（振袖の袂）。上の縁は前腕に、下の縁は袖の骨（重さで下がる振り子）に重みを寄せる。 */
function sleeveBag(c: Ctx, side: 1 | -1, look: { color: number; surf: Surf; region?: 'flowers' }, h: number, depth: number): void {
  const sb = sideBones(side);
  const fa = c.W[sb.foreArm];
  const top = fa.y - 0.02;
  // r02-chars-周2: 指摘「袂が四角い箱に見える」 厚み 0.05→0.034、下の角を大きく丸め、袋の外側をふくらませる
  const g = box(0.034, h, depth, 1, 6, 6);
  g.translate(0, -h / 2, -depth * 0.32);
  const P = g.getAttribute('position');
  const zc = -depth * 0.32;
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i);
    const z = P.getZ(i);
    const t = Math.max(0, (-y - h * 0.55) / (h * 0.45));
    // 下へ行くほど前後の幅を丸く詰め（袋の丸い底）、真ん中は外へふくらむ
    const zz = zc + (z - zc) * (1 - 0.42 * t * t);
    const bulge = 0.012 * Math.sin((Math.PI * -y) / h) * (1 - Math.abs((z - zc) / (depth / 2)));
    P.setXYZ(i, P.getX(i) + side * bulge, y, zz);
  }
  g.computeVertexNormals();
  c.b.add(g, {
    ...look,
    uv: look.region ? { kind: 'geom', su: 0.4, sv: 0.4 } : undefined,
    skin: {
      fn: (p) => {
        const t = Math.max(0, Math.min(1, (top - p.y) / h));
        return [
          [sb.foreArm, 1 - t],
          [sb.sleeve, t],
        ];
      },
    },
    matrix: mat(fa.x + side * 0.03, top, fa.z),
  });
}

/** 籠手（前腕の布と、外側の漆の板）。 */
function kote(c: Ctx, side: 1 | -1, cloth: number): void {
  const sb = sideBones(side);
  const fa = c.W[sb.foreArm];
  const hd = c.W[sb.hand];
  c.b.add(loft([ring(fa.x, fa.y + 0.02, fa.z, 0.05), ring(fa.x, (fa.y + hd.y) / 2 + 0.03, fa.z, 0.047), ring(hd.x, hd.y + 0.02, hd.z, 0.037)], 10, { capEnd: true }), {
    color: cloth,
    surf: SURF.cloth,
    skin: { envelope: [sb.upperArm, sb.foreArm, sb.hand], sharp: 4 },
  });
  const plate = bentPlate(0.06, 0.2, 0.006, 1.2, 0, 3, 3);
  c.b.add(plate, {
    color: COLOR.lacquer,
    surf: SURF.lacquer,
    skin: { envelope: [sb.foreArm, sb.hand], sharp: 4 },
    matrix: mat(fa.x + side * 0.04, fa.y - 0.01, fa.z, 0, side * 90, 0, 1, 1, 1, 'YXZ'),
  });
  // 手の甲の板（手甲）
  c.b.add(bentPlate(0.05, 0.06, 0.005, 0.9, 0, 2, 2), {
    color: COLOR.lacquer,
    surf: SURF.lacquer,
    skin: { bone: sb.hand },
    matrix: mat(hd.x + side * 0.03, hd.y - 0.01, hd.z, 0, side * 90, 0, 1, 1, 1, 'YXZ'),
  });
}

/** 脛当（脛の前の漆の板）。 */
function suneate(c: Ctx, side: 1 | -1, top: number): void {
  const sb = sideBones(side);
  const sn = c.W[sb.shin];
  const h = top - 0.12;
  c.b.add(bentPlate(0.11, h, 0.008, 1.7, -0.1, 4, 3), {
    color: COLOR.lacquer,
    surf: SURF.lacquer,
    skin: { envelope: [sb.shin, sb.foot], sharp: 6, bias: { [sb.shin]: 3 } },
    matrix: mat(sn.x, top, sn.z + 0.058, 3, 0, 0),
  });
}

/** 脚絆（脛の布）。 */
function kyahan(c: Ctx, side: 1 | -1, color: number, r0 = 0.054, r1 = 0.04): void {
  const sb = sideBones(side);
  const sn = c.W[sb.shin];
  const ft = c.W[sb.foot];
  c.b.add(loft([ring(sn.x, sn.y - 0.03, sn.z, r0), ring(sn.x, sn.y - 0.14, sn.z - 0.006, r0 * 1.02, r0 * 1.05), ring(ft.x, ft.y + 0.05, ft.z, r1)], 10), {
    color,
    surf: SURF.cloth,
    skin: { envelope: [sb.thigh, sb.shin, sb.foot], sharp: 5 },
  });
}

/** 陣笠：黒漆の浅い円錐に、上から投影した金の木瓜紋。内側は藁の色。 */
function jingasa(c: Ctx): void {
  const hc = headCenter(c);
  const y0 = hc.y + HEAD.ry - 0.072;
  const top: [number, number][] = [
    [0.0, 0.118],
    [0.03, 0.112],
    [0.09, 0.085],
    [0.16, 0.048],
    [0.22, 0.016],
    [0.252, 0.002],
    [0.258, -0.006],
  ];
  const under: [number, number][] = [
    [0.252, -0.009],
    [0.2, 0.018],
    [0.13, 0.05],
    [0.07, 0.07],
    [0.0, 0.078],
  ];
  // r01-chars-周1: 指摘「倒れた番兵の笠が立った円盤に見える」 笠を頭の骨 → 笠の骨（倒れると外れて地面に落ちる）
  c.b.add(lathe(top, 32), {
    color: 0xffffff,
    surf: SURF.lacquer,
    region: 'mokkoHat',
    uv: { kind: 'top', cx: hc.x, cz: hc.z, d: 0.54 },
    skin: { bone: B.hat },
    matrix: mat(hc.x, y0, hc.z, -3, 0, 0),
  });
  c.b.add(lathe(under, 32), {
    color: 0x4a3b2a,
    surf: SURF.straw,
    skin: { bone: B.hat },
    matrix: mat(hc.x, y0, hc.z, -3, 0, 0),
  });
  // あご紐（頭に付いたまま）
  for (const s of [1, -1]) {
    c.b.add(tube([v(hc.x + s * 0.075, hc.y + 0.03, hc.z), v(hc.x + s * 0.07, hc.y - 0.06, hc.z + 0.02), v(hc.x, hc.y - 0.105, hc.z + 0.05)], 0.0035, 4, 6), {
      color: 0x2a2018,
      surf: SURF.cloth,
      skin: { bone: B.head },
    });
  }
}

/** 髷（月代を剃った頭頂に、後ろから前へ折り返した髪の束）と、横の髪。 */
function mage(c: Ctx): void {
  const hc = headCenter(c);
  c.b.add(tube([v(hc.x, hc.y + HEAD.ry * 0.82, hc.z - 0.06), v(hc.x, hc.y + HEAD.ry + 0.012, hc.z - 0.02), v(hc.x, hc.y + HEAD.ry + 0.008, hc.z + 0.035)], 0.011, 6, 6), {
    color: COLOR.hair,
    surf: SURF.hair,
    skin: { bone: B.head },
  });
  // 鬢（こめかみから耳の上の髪）：顔の半球の横を髪の色で覆う薄い板
  for (const s of [1, -1]) {
    c.b.add(bentPlate(0.07, 0.07, 0.006, 1.3, 0, 3, 3), {
      color: COLOR.hair,
      surf: SURF.hair,
      skin: { bone: B.head },
      matrix: mat(hc.x + s * HEAD.rx * 0.93, hc.y + 0.05, hc.z - 0.012, 0, s * 90, 0, 1, 1, 1, 'YXZ'),
    });
  }
}

/** 侍の頭：鉢巻（白）と額の鉢金、頭頂の髷、後ろの結び目から垂れる2本の端。 */
function hachimaki(c: Ctx): void {
  const hc = headCenter(c);
  // r00-shape: 指摘「鉢金が目隠しに見える」 額の中ほど（中心+0.035）→ 眉の上（中心+0.06）
  const y = hc.y + 0.06;
  c.b.add(loft([ring(hc.x, y - 0.017, hc.z - 0.006, HEAD.rx * 1.0, HEAD.rz * 1.0), ring(hc.x, y + 0.017, hc.z - 0.01, HEAD.rx * 0.93, HEAD.rz * 0.93)], 18), {
    color: COLOR.hachimaki,
    surf: SURF.cloth,
    skin: { bone: B.head },
  });
  c.b.add(bentPlate(0.095, 0.042, 0.004, 1.1, 0, 4, 2), {
    color: COLOR.iron,
    surf: { r: 0.42, m: 0.9 },
    skin: { bone: B.head },
    matrix: mat(hc.x, y + 0.02, hc.z + HEAD.rz * 0.93, -14, 0, 0),
  });
  mage(c);
  const knot = c.W[B.tailA];
  c.b.add(ellipsoid(0.02, 0.016, 0.014, 6, 5), { color: COLOR.hachimaki, surf: SURF.cloth, skin: { bone: B.head }, matrix: mat(knot.x, knot.y, knot.z) });
  ribbon(c, knot.clone().add(v(0.012, -0.004, -0.004)), 0.11, 0.028, COLOR.hachimaki, SURF.cloth, 8);
  ribbon(c, knot.clone().add(v(-0.012, -0.004, -0.004)), 0.1, 0.028, COLOR.hachimaki, SURF.cloth, -10);
}

/** 頭の上半分を覆う髪（蘭丸の前髪と結い髪）。 */
function ranHair(c: Ctx): void {
  const hc = headCenter(c);
  const cap = ellipsoid(HEAD.rx * 1.06, HEAD.ry * 1.05, HEAD.rz * 1.07, 16, 10);
  // 上半分だけ残す（顔の前は額まで）
  const P = cap.getAttribute('position');
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i);
    const z = P.getZ(i);
    const limit = z > 0 ? HEAD.ry * 0.3 : -HEAD.ry * 0.25;
    if (y < limit) P.setY(i, limit + (y - limit) * 0.15);
  }
  cap.computeVertexNormals();
  c.b.add(cap, { color: COLOR.hair, surf: SURF.hair, skin: { bone: B.head }, matrix: mat(hc.x, hc.y + 0.004, hc.z - 0.004) });
  // 前髪（額に下がる房）
  c.b.add(bentPlate(0.13, 0.055, 0.012, 1.5, 0.1, 5, 2), {
    color: COLOR.hair,
    surf: SURF.hair,
    skin: { bone: B.head },
    matrix: mat(hc.x, hc.y + HEAD.ry * 0.62, hc.z + HEAD.rz * 0.88, -18, 0, 0),
  });
  // 結い髪（後ろで束ねて垂らす）と元結
  const knot = c.W[B.tailA];
  c.b.add(cyl(0.017, 0.017, 0.03, 8), { color: COLOR.white, surf: SURF.cloth, skin: { bone: B.tailA }, matrix: mat(knot.x, knot.y - 0.01, knot.z) });
  c.b.add(loft([ring(knot.x, knot.y - 0.02, knot.z - 0.004, 0.017, 0.015), ring(knot.x, knot.y - 0.1, knot.z - 0.012, 0.02, 0.016), ring(knot.x, knot.y - 0.2, knot.z - 0.02, 0.008, 0.006)], 8, { capEnd: true }), {
    color: COLOR.hair,
    surf: SURF.hair,
    skin: {
      fn: (p) => {
        const t = Math.max(0, Math.min(1, (knot.y - 0.02 - p.y) / 0.18));
        return [
          [B.tailA, 1 - t],
          [B.tailB, t],
        ];
      },
    },
  });
}

/** 信長の茶筅髷：後頭部の上で束ね、紐を巻いた先が茶筅のように上へ開く。 */
function chasen(c: Ctx): void {
  const k = c.W[B.tailA];
  const dir = v(0, 0.75, -0.66).normalize();
  const p1 = k.clone().addScaledVector(dir, 0.045);
  const p2 = k.clone().addScaledVector(dir, 0.11);
  c.b.add(loft([ring(k.x, k.y, k.z, 0.016), { c: p1, rx: 0.015, rz: 0.015 }], 8, { capStart: true, ref: v(1, 0, 0) }), {
    color: 0x7a2424,
    surf: SURF.silk,
    skin: { bone: B.tailA },
  });
  c.b.add(loft([{ c: p1, rx: 0.012, rz: 0.012 }, { c: p1.clone().lerp(p2, 0.5), rx: 0.02, rz: 0.018 }, { c: p2, rx: 0.03, rz: 0.026 }], 8, { capEnd: true, ref: v(1, 0, 0) }), {
    color: COLOR.hair,
    surf: SURF.hair,
    skin: { bone: B.tailA },
  });
}

/** 体の寸法と骨の位置から、種類ごとの形を組む。 */
export function buildKind(c: Ctx, kind: CharacterKind): void {
  switch (kind) {
    case 'player':
      return buildPlayer(c);
    case 'ashigaru':
      return buildAshigaru(c);
    case 'samurai':
      return buildSamurai(c);
    case 'ranmaru':
      return buildRanmaru(c);
    case 'nobunaga':
      return buildNobunaga(c);
  }
}

function buildPlayer(c: Ctx): void {
  const sumi = { color: COLOR.sumi, surf: SURF.cloth };
  const sumiL = { color: COLOR.sumiLight, surf: SURF.cloth };
  const t = baseTorso(0.9, 0.94);
  torso(c, t, sumi, 0.012);
  kimonoCollar(c, t, { color: OUTFIT.sleeve.color, surf: SURF.cloth }, 0.012, 'player');
  // 暗い漆の胴（低い胴丸）。艶だけで体の丸みが読めるようにする
  // r02-chars-周2: 指摘「光秀の漆の胴に暖色の照り返しが太い帯で出て、闇に溶けない」 粗さ 0.3 → 0.46
  dou(c, PLAYER_ARMOR_SECTIONS, { color: COLOR.sumiLacquer, surf: { ...SURF.lacquerMatte, r: OUTFIT.armor.r } });
  obi(c, { color: OUTFIT.belt.color, surf: SURF.cloth }, OUTFIT.belt.y, OUTFIT.belt.h, OUTFIT.belt.rx, OUTFIT.belt.rz);
  playerGear(c);
  // 背の水色桔梗（遊ぶカメラは後ろ上から見るので、背が名札になる）
  // r03-chars-周3: 指摘「遊ぶ角度（後ろ上から）で背の紋が数画素しかなく、光秀だと分かる手がかりが弱い」 一辺 0.11→0.13m
  decal(c, 'kikyoBack', v(0, 1.17, -0.128), 180, 0.13, 0.13, 0.9, { envelope: [B.spine, B.chest], sharp: 3 }, SURF.lacquer);
  neck(c, sumi, 0.05);
  head(c, { face: 'facePlayer', back: sumi, scale: 1.07, ears: false, shape: FACE_SHAPE.player });
  // 頭巾の結び目と垂れ
  const knot = c.W[B.tailA];
  c.b.add(ellipsoid(0.026, 0.02, 0.018, 6, 5), { ...sumi, skin: { bone: B.head }, matrix: mat(knot.x, knot.y, knot.z) });
  ribbon(c, knot.clone().add(v(0.012, -0.006, -0.006)), 0.13, 0.034, COLOR.sumi, SURF.cloth, 6);
  ribbon(c, knot.clone().add(v(-0.012, -0.006, -0.006)), 0.12, 0.032, COLOR.sumi, SURF.cloth, -8);
  for (const side of [1, -1] as const) {
    arm(c, side, sumi, [0.046, 0.043, 0.038, 0.037, 0.029], { rise: OUTFIT.sleeve.underRise, inset: OUTFIT.sleeve.underInset });
    // r07-chars: 肩から肘の下までを小袖で包み、細い下腕・手甲との段差で関節を読ませる。
    const sl = OUTFIT.sleeve;
    sleeveTube(c, side, { color: sl.color, surf: SURF.cloth }, sl.top, sl.end, sl.to, 0, sl.shoulderRise);
    const sb = sideBones(side);
    const end = c.W[sb.foreArm].clone().lerp(c.W[sb.hand], sl.to);
    c.b.add(loft([ring(end.x, end.y + OUTFIT.cuff.h, end.z, OUTFIT.cuff.rx, OUTFIT.cuff.rz), ring(end.x, end.y, end.z, OUTFIT.cuff.rx, OUTFIT.cuff.rz)], 12), {
      color: OUTFIT.belt.color, surf: SURF.cloth, skin: { envelope: [sb.upperArm, sb.foreArm], sharp: 4 },
    });
    fist(c, side, sumiL);
    // 手甲
    const hd = c.W[sideBones(side).hand];
    c.b.add(bentPlate(0.048, 0.07, 0.006, 0.9, 0, 2, 2), {
      ...sumiL,
      skin: { bone: sideBones(side).hand },
      matrix: mat(hd.x + side * 0.028, hd.y + 0.005, hd.z, 0, side * 90, 0, 1, 1, 1, 'YXZ'),
    });
    // 裁着袴（腿は太く、膝から下は脚絆で細く締める）
    leg(c, side, sumi, [0.098, 0.088, 0.064, 0.05, 0.034]);
    kyahan(c, side, COLOR.sumiLight, 0.05, 0.038);
    for (const below of OUTFIT.legTies.belowKnee) {
      const sn = c.W[sb.shin];
      const r = OUTFIT.legTies.r * (1 - below);
      c.b.add(loft([ring(sn.x, sn.y - below, sn.z, r), ring(sn.x, sn.y - below - OUTFIT.legTies.h, sn.z, r)], 12), {
        color: OUTFIT.legTies.color, surf: SURF.cloth, skin: { bone: sb.shin },
      });
    }
    foot(c, side, sumi, 'waraji');
  }
  hakama(c, sumi, { waistY: 1.0, hemY: 0.43, hip: 0.112, knee: 0.08, hem: 0.066, pleats: OUTFIT.pleats.count, pleatAmp: OUTFIT.pleats.amp });
  sheathedSword(c, 0.5, 0.15, COLOR.sumiLacquer);
  drawnSword(c, 0.5, 0.15);
  pebble(c);
}

/** r07-chars: 胴の前の綴じ糸、腰の結び紐と小袋。背の桔梗を横切らず、刃側と袋側を分ける。 */
function playerGear(c: Ctx): void {
  const armorSkin: Skin = { envelope: [B.hips, B.spine, B.chest], sharp: 3 };
  for (const y of OUTFIT.armor.rows) {
    const paths: Vector3[] = [];
    // 既存胴の上下径に沿う、前面だけの板の縁。
    let lower = PLAYER_ARMOR_SECTIONS[0] as readonly number[];
    let upper = lower;
    for (const section of PLAYER_ARMOR_SECTIONS) {
      upper = section;
      if (section[0] >= y) break;
      lower = section;
    }
    const f = upper[0] === lower[0] ? 0 : (y - lower[0]) / (upper[0] - lower[0]);
    const rx = lower[1] + (upper[1] - lower[1]) * f + OUTFIT.armor.cordLift;
    const rz = lower[2] + (upper[2] - lower[2]) * f + OUTFIT.armor.cordLift;
    const zc = lower[3] + (upper[3] - lower[3]) * f;
    for (let i = 0; i <= OUTFIT.armor.samples; i++) {
      const th = -OUTFIT.armor.arc + 2 * OUTFIT.armor.arc * i / OUTFIT.armor.samples;
      paths.push(v(Math.sin(th) * rx, y, zc + Math.cos(th) * rz));
    }
    c.b.add(tube(paths, OUTFIT.armor.cordR, OUTFIT.armor.samples, 5), {
      color: OUTFIT.armor.color, surf: SURF.cloth, skin: armorSkin,
    });
  }
  const k = OUTFIT.knot;
  const [x, y, z] = k.at;
  const loops = [
    [v(x, y, z), v(x - k.tail / 3, y + k.tail / 4, z), v(x - k.tail / 2, y, z), v(x, y, z)],
    [v(x, y, z), v(x + k.tail / 3, y + k.tail / 4, z), v(x + k.tail / 2, y, z), v(x, y, z)],
    [v(x, y, z), v(x - k.tail / 5, y - k.tail / 2, z), v(x - k.tail / 4, y - k.tail, z)],
    [v(x, y, z), v(x + k.tail / 5, y - k.tail / 2, z), v(x + k.tail / 3, y - k.tail * 0.85, z)],
  ];
  for (const path of loops) c.b.add(tube(path, k.r, 10, 6), { color: k.color, surf: SURF.cloth, skin: { bone: B.hips } });
  const p = OUTFIT.pouch;
  const [px, py, pz] = p.at;
  c.b.add(loft([
    ring(px, py + p.h / 2, pz, p.rx * 0.65, p.rz * 0.6),
    ring(px, py + p.h / 4, pz, p.rx, p.rz), ring(px, py - p.h / 4, pz, p.rx, p.rz),
    ring(px, py - p.h / 2, pz, p.rx * 0.6, p.rz * 0.6),
  ], 12, { capStart: true, capEnd: true }), { color: p.color, surf: SURF.cloth, skin: { bone: B.hips } });
  c.b.add(tube([v(px, py + p.h / 2, pz), v(px, OUTFIT.belt.y, pz), v(px * 0.8, OUTFIT.belt.y + OUTFIT.belt.h / 2, pz)], k.r, 8, 6), {
    color: k.color, surf: SURF.cloth, skin: { bone: B.hips },
  });
  for (const side of [-1, 1]) for (const ry of OUTFIT.rivet.y) c.b.add(ellipsoid(OUTFIT.rivet.r, OUTFIT.rivet.r, OUTFIT.rivet.r / 2, 6, 4), {
    color: COLOR.iron, surf: SURF.iron, skin: armorSkin, matrix: mat(side * OUTFIT.rivet.x, ry, OUTFIT.rivet.forward),
  });
}

function buildAshigaru(c: Ctx): void {
  const under = { color: COLOR.ashiUnder, surf: SURF.cloth };
  const skin = { color: COLOR.skin, surf: SURF.skin };
  const t = baseTorso(1, 1);
  torso(c, t, under, 0.01);
  // 紺の威の胴丸
  dou(c, [[0.91, 0.18, 0.138, -0.004], [0.98, 0.174, 0.132, 0.0], [1.06, 0.17, 0.13, 0.006], [1.15, 0.178, 0.138, 0.01], [1.24, 0.19, 0.142, 0.01], [1.31, 0.192, 0.136, 0.004]], { color: COLOR.navy, surf: SURF.silk, region: 'odoshi' });
  // 胸板と押付（胴の上の縁の漆の板）と、肩上（わたがみ）
  c.b.add(loft([ring(0, 1.3, 0.008, 0.2, 0.142), ring(0, 1.345, 0.0, 0.178, 0.122)], 20), {
    color: COLOR.lacquer,
    surf: SURF.lacquer,
    skin: { envelope: [B.spine, B.chest], sharp: 3 },
  });
  for (const s of [1, -1]) {
    c.b.add(tube([v(s * 0.1, 1.33, 0.12), v(s * 0.11, 1.405, 0.03), v(s * 0.11, 1.405, -0.04), v(s * 0.1, 1.33, -0.12)], 0.013, 5, 8), {
      color: COLOR.lacquer,
      surf: SURF.lacquer,
      skin: { envelope: [B.chest, B.neck], sharp: 3, bias: { [B.chest]: 3 } },
    });
  }
  kusazuri(c, { color: COLOR.navy, surf: SURF.silk, region: 'odoshi' }, { y: 0.955, rx: 0.184, rz: 0.142, count: 7, w: 0.13, h: 0.25, tilt: 13 });
  neck(c, skin);
  head(c, { face: 'face', back: { color: COLOR.hair, surf: SURF.hair }, shape: FACE_SHAPE.ashigaru });
  // r01-chars-周1: 指摘「笠が外れた足軽が坊主頭に見える」 頭の形だけ → 髷と鬢を足す（笠の下に隠れている）
  mage(c);
  jingasa(c);
  for (const side of [1, -1] as const) {
    arm(c, side, under);
    // r02-chars-周2: 指摘「足軽の上腕が太く、肩当てのように見える」 袖の太さ 0.066→0.058
    sleeveTube(c, side, under, 0.058, 0.052, 0.15);
    kote(c, side, COLOR.navy);
    fist(c, side, skin);
    leg(c, side, under, [0.086, 0.07, 0.054, 0.05, 0.034]);
    kyahan(c, side, COLOR.tabiNavy);
    suneate(c, side, 0.43);
    foot(c, side, { color: COLOR.tabiNavy, surf: SURF.cloth }, 'waraji');
  }
  hakama(c, under, { waistY: 0.98, hemY: 0.42, hip: 0.118, knee: 0.092, hem: 0.08 });
  spear(c);
  lantern(c);
  pebble(c);
}

function buildSamurai(c: Ctx): void {
  const under = { color: 0x2c2724, surf: SURF.cloth };
  const skin = { color: COLOR.skin, surf: SURF.skin };
  const t = baseTorso(1.04, 1.02);
  torso(c, t, under, 0.01);
  dou(c, [[0.92, 0.19, 0.142, -0.004], [0.99, 0.184, 0.136, 0.0], [1.07, 0.18, 0.134, 0.006], [1.16, 0.188, 0.142, 0.01], [1.25, 0.2, 0.146, 0.01], [1.315, 0.202, 0.14, 0.004]], { color: COLOR.maroon, surf: SURF.silk, region: 'odoshi' });
  c.b.add(loft([ring(0, 1.3, 0.008, 0.21, 0.146), ring(0, 1.35, 0.0, 0.188, 0.126)], 20), {
    color: COLOR.samuLacquer,
    surf: SURF.lacquer,
    skin: { envelope: [B.spine, B.chest], sharp: 3 },
  });
  kusazuri(c, { color: COLOR.maroon, surf: SURF.silk, region: 'odoshi' }, { y: 0.955, rx: 0.194, rz: 0.15, count: 5, w: 0.16, h: 0.17, tilt: 12 });
  // 佩楯（腿の前の板の前掛け）
  for (const side of [1, -1] as const) {
    c.b.add(bentPlate(0.17, 0.3, 0.01, 0.75, 0.12, 4, 4), {
      color: COLOR.maroon,
      surf: SURF.silk,
      region: 'odoshi',
      uv: { kind: 'geom', su: 0.5, sv: 0.6 },
      skin: {
        fn: (p) => {
          const tt = Math.max(0, Math.min(1, (0.86 - p.y) / 0.3));
          return [
            [B.hips, 1 - tt * 0.85],
            [sideBones(side).thigh, tt * 0.85],
          ];
        },
      },
      matrix: mat(side * 0.09, 0.88, 0.14, -6, side * 8, 0, 1, 1, 1, 'YXZ'),
    });
  }
  neck(c, skin);
  head(c, { face: 'face', back: { color: COLOR.hair, surf: SURF.hair }, shape: FACE_SHAPE.samurai });
  hachimaki(c);
  for (const side of [1, -1] as const) {
    const sb = sideBones(side);
    arm(c, side, under);
    sleeveTube(c, side, under, 0.07, 0.058, 0.15);
    kote(c, side, COLOR.maroon);
    fist(c, side, skin);
    // 袖（肩の大きな板）：外へ張り出し、下ほど外へ開く。これが「張った肩」の輪郭を作る
    // r00-shape: 指摘「袖の板が袖の筒に埋まって見えない」 板の上端の中心 x=0.22 → 0.265、外への開き 16° → 24°
    // r01-chars-周1: 指摘「遊ぶ角度で侍の張った肩が弱く、光秀と同じ暗い人影に見える」
    //   袖の板 幅 0.22→0.25・高さ 0.26→0.27・外への開き 24°→32°、色を明るい緋へ（maroon → sodeRed）
    const so = c.W[sb.sode];
    c.b.add(bentPlate(0.25, 0.27, 0.016, 0.42, 0.18, 4, 4), {
      color: COLOR.sodeRed,
      surf: SURF.silk,
      region: 'odoshi',
      uv: { kind: 'geom', su: 0.6, sv: 0.6 },
      skin: { bone: sb.sode },
      matrix: mat(so.x + side * 0.1, so.y + 0.05, so.z, -32, side * 90, 0, 1, 1, 1, 'YXZ'),
    });
    c.b.add(bentPlate(0.25, 0.034, 0.022, 0.42, 0, 4, 1), {
      color: COLOR.samuLacquer,
      surf: SURF.lacquer,
      skin: { bone: sb.sode },
      matrix: mat(so.x + side * 0.1, so.y + 0.055, so.z, -32, side * 90, 0, 1.03, 1, 1.2, 'YXZ'),
    });
    leg(c, side, under, [0.09, 0.075, 0.056, 0.05, 0.034]);
    kyahan(c, side, 0x2a2622);
    suneate(c, side, 0.44);
    foot(c, side, { color: 0x2a2622, surf: SURF.cloth }, 'waraji');
  }
  hakama(c, { color: COLOR.samuHakama, surf: SURF.cloth }, { waistY: 0.98, hemY: 0.43, hip: 0.126, knee: 0.1, hem: 0.084, pleats: 7 });
  sheathedSword(c, 0.72, 0.25, COLOR.lacquer);
  drawnSword(c, 0.72, 0.25);
}

function buildRanmaru(c: Ctx): void {
  const kosode = { color: 0xffffff, surf: SURF.silk, region: 'flowers' as const };
  const skin = { color: 0xd2a585, surf: SURF.skin };
  const t = baseTorso(0.92, 0.94);
  torso(c, t, kosode, 0.014, 18, 1.0);
  obi(c, { color: 0x2a2233, surf: SURF.silk }, 1.02, 0.06, 0.146, 0.11);
  // r06-chars: 首を巻く輪だけだった襟を、白い下襟と紫の左前の合わせへ。
  kimonoCollar(c, t, { color: COLOR.purple, surf: SURF.silk }, 0.014, 'ranmaru');
  neck(c, skin, 0.044);
  head(c, { face: 'faceRan', back: { color: COLOR.hair, surf: SURF.hair }, scale: 0.97, shape: FACE_SHAPE.ranmaru });
  ranHair(c);
  for (const side of [1, -1] as const) {
    arm(c, side, skin, [0.044, 0.041, 0.036, 0.036, 0.027]);
    sleeveTube(c, side, kosode, 0.074, 0.07, 0.8, 1.0);
    // r01-chars-周1: 指摘「影絵で蘭丸の長い袖が輪郭に出ない」 袂 高さ 0.36→0.47・奥行き 0.25→0.3
    sleeveBag(c, side, { color: 0xffffff, surf: SURF.silk, region: 'flowers' }, 0.47, 0.3);
    fist(c, side, skin);
    leg(c, side, skin, [0.08, 0.064, 0.05, 0.046, 0.031]);
    foot(c, side, { color: COLOR.white, surf: SURF.cloth }, 'zori');
  }
  // r06-chars: 折り目は形と法線の両方へ反映し、長い袴を滑らかな筒に見せない。
  hakama(c, { color: COLOR.ranHakama, surf: SURF.silk }, { waistY: 1.04, hemY: 0.11, hip: 0.14, knee: 0.14, hem: 0.15, pleats: HAKAMA_PLEATS.ranmaru.count, pleatAmp: HAKAMA_PLEATS.ranmaru.amp });
  sheathedSword(c, 0.68, 0.23, 0x2a1416);
  drawnSword(c, 0.68, 0.23);
}

function buildNobunaga(c: Ctx): void {
  const robe = { color: COLOR.nightRobe, surf: SURF.clothSoft };
  const skin = { color: COLOR.skin, surf: SURF.skin };
  const t = baseTorso(1.02, 1.0);
  torso(c, t, robe, 0.016);
  // r06-chars: 胸に貼った肌色の三角だけだった襟元を、白い下襟と生成りの合わせへ。
  kimonoCollar(c, t, { color: KIMONO_COLLAR.nobunaga.color, surf: SURF.clothSoft }, 0.016, 'nobunaga');
  obi(c, { color: 0x3b3a3f, surf: SURF.cloth }, 1.0, 0.045, 0.162, 0.124);
  // r01-chars-周1: 指摘「崩れると裾の筒が股の間で引き伸ばされる」 1本の筒（robeSkirt）→ 左右2枚（robeHalves）
  robeHalves(c, robe, { waistY: 1.02, hemY: 0.085, waist: 0.15, hip: 0.142, knee: 0.13, hem: 0.14 });
  neck(c, skin);
  head(c, { face: 'faceNobu', back: { color: COLOR.hair, surf: SURF.hair }, shape: FACE_SHAPE.nobunaga });
  chasen(c);
  for (const side of [1, -1] as const) {
    arm(c, side, skin);
    sleeveTube(c, side, robe, 0.08, 0.078, 0.82);
    sleeveBag(c, side, { color: COLOR.nightRobe, surf: SURF.clothSoft }, 0.26, 0.24);
    fist(c, side, skin);
    leg(c, side, skin, [0.088, 0.072, 0.054, 0.05, 0.034]);
    foot(c, side, skin, 'none');
  }
  // 黒い羽織を肩に掛ける（前は開き、腰の下まで）。背に白の木瓜紋
  // r02-chars-周2: 指摘「羽織が背中の黒い板に見え、正面から見えない」
  //   肩の上に載る幅（0.245→0.29）にし、前の開きを ±54°→±38° に狭め、肩から空の袖を下げる
  const rings: Ring[] = [
    ring(0, 1.43, -0.016, 0.16, 0.1),
    ring(0, 1.395, -0.014, 0.27, 0.165),
    ring(0, 1.32, -0.012, 0.295, 0.178),
    ring(0, 1.16, -0.012, 0.29, 0.186),
    // r03-chars-周3: 指摘「後ろから見ると黒い羽織が背の大半を覆い、白い座り姿が弱い」 裾の高さ 0.86→0.95m
    ring(0, 1.06, -0.01, 0.285, 0.19),
    ring(0, 0.95, -0.01, 0.288, 0.196),
  ];
  const top = rings[0].c.y;
  const capeSkin: Skin = {
    fn: (p) => {
      const tt = Math.max(0, Math.min(1, (top - 0.08 - p.y) / 0.45));
      return [
        [B.chest, 1 - tt],
        [B.cape, tt],
      ];
    },
  };
  c.b.add(openLoft(rings, 24, Math.PI * 0.21, Math.PI * 1.79, 0.012), { color: COLOR.haori, surf: SURF.cloth, skin: capeSkin });
  // 空の袖：肩の外に下がる黒い袋（腕は通していない）
  for (const s of [1, -1]) {
    const g = box(0.05, 0.34, 0.3, 1, 4, 3);
    g.translate(0, -0.17, -0.02);
    const P = g.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i);
      const t = Math.max(0, (-y - 0.2) / 0.14);
      P.setXYZ(i, P.getX(i), y, P.getZ(i) * (1 - 0.3 * t * t));
    }
    g.computeVertexNormals();
    c.b.add(g, { color: COLOR.haori, surf: SURF.cloth, skin: capeSkin, matrix: mat(s * 0.305, 1.37, -0.01, 0, 0, s * 4) });
  }
  decal(c, 'haoriMon', v(0, 1.21, -0.012 - 0.184 - 0.004), 180, 0.085, 0.085, 0.7, { bone: B.cape });
  stool(c, 0.4);
}

/** 背丈の目安（頭の頂、笠を含まない）。 */
export function headTop(c: Ctx): number {
  return headCenter(c).y + HEAD.ry;
}

/** 一部の種類にだけある付属品（形が無い骨は大きさ0にしても描画に影響しない）。 */
export function propsOf(kind: CharacterKind): { spear: boolean; lantern: boolean; sword: boolean; stool: boolean; sleeves: boolean; sode: boolean } {
  return {
    spear: kind === 'ashigaru',
    lantern: kind === 'ashigaru',
    sword: kind === 'player' || kind === 'samurai' || kind === 'ranmaru',
    stool: kind === 'nobunaga',
    sleeves: kind === 'ranmaru' || kind === 'nobunaga',
    sode: kind === 'samurai',
  };
}

export { box, cyl, ellipsoid };
