// OWNER: world-art
// 透かし：カメラと人物の間にある屋根・壁・塀・木・竹・鐘を、人物の周りだけ抜く。
// 材質の側は SEE_GLSL の kgSeeThrough を最初に呼ぶだけ（materials.ts の see: true）。毎コマは uniform を書き換えるだけで、
// シェーダーは作り直さない。影は three の深さだけの材質で描くので、透かしは影に入らない（抜いても影は残る）。
// r02-fix-visual: 指摘「鐘楼の屋根と松が、カメラが建物の外にいる形でもプレイヤーと居眠り番を覆う」
//   旧：プレイヤーの胸だけを中心に半径 1.9m、中心でも 88% しか抜かず、全部抜くのは内側 5 割
//   新：プレイヤー＋ほかの人物（契約の others、最大2人）を中心にし、半径 2.5m（ほかの人物 2.0m）、内側 7 割を 94% 抜く。
//       カメラが遠いときも画面の上で小さくなりすぎないよう、角の半径に下限を置く
// r03-fix-visual: 指摘「闇でも屋根越しに見ると足元が周りの約 2.5 倍明るい円になる（灯りの中に見える）」
//   原因（確かめた）：影ではない。カメラが建物の「箱」（外形＋2m、棟＋1.2m。町屋の列は棟の 6m 上まで）に入ると、その建物を
//   画面全体で 4×4 の網点で 75% 抜いていた。残った 25% の暗い瓦の点と、その網目の深さに N8AO が反応した暗がりが、地面に暗い幕を
//   掛ける。足元だけは人物の透かし（94%）で幕が外れるので、正しい明るさの地面が「明るい円」に見えていた。遊ぶカメラ（高さ約 9m）は
//   屋根の上にいることが多いので、本堂の北や南の通りではほぼいつも起きていた
//   新：①箱に入った建物は、全体に幕を掛けず、プレイヤーを中心に大きな穴（半径 6m、内側 4.5m は全部抜く）を開ける。
//         抜くのはプレイヤーの面より手前だけ。屋根の上のカメラでも遊ぶ場所は見え、足元のまわりに暗い幕が残らない。
//         カメラが本当に屋根の下にいるとき（CPU で屋根の面の高さと比べる）だけ、カメラのすぐ近くも抜く
//       ②人物の透かしは内側を全部抜き、縁の帯を細くする。網点は 4×4 の格子をやめて細かいノイズにし、遊ぶ間はコマごとにずらす
//       ③抜いた縁の屋根の側を少し暗くして、灯りではなく切り口に見せる
//   幕を外すだけ（屋根の上のカメラは何もしない）案は捨てた：本堂の北や南の通りで、屋根が画面の下半分を覆い、2.5m の穴しか見えなくなった
import { Vector3, Vector4, type PerspectiveCamera } from 'three';
import type { ArtSeeThrough } from '../../contract/art';

export const SEE = {
  /** プレイヤーの位置での抜く半径（m）。r02-fix-visual 1.9→2.5 */
  radius: 2.5,
  /** ほかの人物（当て身・討ち取りの相手）の位置での抜く半径（m） */
  otherRadius: 2.0,
  /** 角の半径の下限（ラジアン）。遠いカメラでも穴が画面で小さくなりすぎない */
  minAngle: 0.075,
  /** 人物の手前この距離（m）より奥は抜かない（人物のすぐ横の壁は残す） */
  margin: 0.7,
  /** 半径のうち、全部抜く内側の割合。r02-fix-visual 0.5→0.7、r03-fix-visual 0.7→0.8（網点の帯を細く） */
  inner: 0.8,
  /** 抜く中心の、足元からの高さ（m）。ほかの人物は座っていることがあるので低め */
  chest: 1.0,
  otherChest: 0.85,
  /** ほかの人物の数の上限（契約：最大2つ） */
  maxOthers: 2,
  /**
   * カメラが屋根の面の見積もり＋この高さ（m）より下にいるときだけ「中」とする（r03-fix-visual）。
   * 見積もりは反りの分だけ高めに出るので、負の値で「はっきり屋根の下」に絞る
   */
  roofMargin: -0.3,
  /** 抜いた縁の屋根の側を暗くする強さ（0..1。r03-fix-visual） */
  edgeShade: 0.45,
  /** 箱に入った建物に開ける穴の半径（m）と、全部抜く内側の割合（r03-fix-visual。旧：建物全体を 75% の網点） */
  insideRadius: 6.0,
  insideInner: 0.75,
  /** 屋根の下にいるとき、カメラからこの距離（m）までを抜く（near0 まで全部、near1 で 0） */
  near0: 3.5,
  near1: 6.0,
};

/** 中に入ったら薄くする箱の数の上限（建物4＋町屋の列4＋余り）。GLSL の配列の長さと同じ。 */
export const INSIDE_MAX = 10;

export const SEE_UNIFORMS = {
  /** 抜く中心（xyz：胸の位置、w：半径。0 で使わない）。0 番がプレイヤー、1・2 番がほかの人物 */
  uKgSeeT: { value: [new Vector4(), new Vector4(), new Vector4()] },
  /** x: 角の半径の下限, y: 手前の余白, z: 効き（0..1）, w: 内側の割合 */
  uKgSeeParams: { value: new Vector4(SEE.minAngle, SEE.margin, 0, SEE.inner) },
  /**
   * カメラが建物の箱（屋根の張り出しと上の空きまで）に入ったとき、その建物にプレイヤーを中心とした大きな穴を開ける。
   * 箱は world が buildWorld で書く（x0, z0, x1, z1）と（y0, y1, 箱の中か 0/1, 屋根の下か 0/1）。z・w は CPU が毎コマ決める。
   */
  // r01-integrate: 町屋の4列も足すので 6→10（遊ぶカメラが南の通りで町屋の屋根の中に入り、画面が屋根で塞がっていた）
  uKgInside: { value: Array.from({ length: INSIDE_MAX }, () => new Vector4(1e5, 1e5, 1e5, 1e5)) },
  uKgInsideY: { value: Array.from({ length: INSIDE_MAX }, () => new Vector4(0, 0, 0, 0)) },
  /** 箱に入った建物の穴：x 半径（m）, y 全部抜く内側の割合, z・w カメラの近くを抜く距離（m）。r03-fix-visual */
  uKgSeeIn: { value: new Vector4(SEE.insideRadius, SEE.insideInner, SEE.near0, SEE.near1) },
  /** 隠れている植え込み：プレイヤーのまわり（x, z, 半径, 抜く割合）。植え込みの材質（KG_SEE_BUSH）だけが使う。r01-integrate 追加 */
  uKgSeeBush: { value: new Vector4(0, 0, 0, 0) },
};

export interface InsideBox {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y0: number;
  y1: number;
  /** その点の屋根の面の高さ（m）。これより roofMargin 以上上のカメラは中にいない。無ければ y1 で決める（r03-fix-visual） */
  roofY?: (x: number, z: number) => number;
}

const boxes: InsideBox[] = [];

/** カメラが中に入ったら薄くする建物の箱を登録する（INSIDE_MAX まで）。 */
export function setInsideBoxes(list: InsideBox[]): void {
  boxes.length = 0;
  list.slice(0, INSIDE_MAX).forEach((b, i) => {
    boxes.push(b);
    SEE_UNIFORMS.uKgInside.value[i].set(b.x0, b.z0, b.x1, b.z1);
    SEE_UNIFORMS.uKgInsideY.value[i].set(b.y0, b.y1, 0, 0);
  });
}

/** カメラの位置 p が箱 b（屋根の張り出しと上の空きまで）に入っているか。 */
function inBox(b: InsideBox, p: Vector3): boolean {
  return p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && p.y > b.y0 && p.y < b.y1;
}

/** カメラの位置 p が建物の中（屋根の面より下）にいるか。 */
export function cameraInside(b: InsideBox, p: Vector3): boolean {
  if (!inBox(b, p)) return false;
  return !b.roofY || p.y < b.roofY(p.x, p.z) + SEE.roofMargin;
}

export const SEE_GLSL = /* glsl */ `
uniform vec4 uKgSeeT[3];
uniform vec4 uKgSeeParams;
uniform vec4 uKgInside[10];
uniform vec4 uKgInsideY[10];
uniform vec4 uKgSeeBush;
uniform vec4 uKgSeeIn;
/** 透かしの縁の暗さ（1 で暗くしない）。kgSeeThrough が書き、色の最後に掛ける */
float kgSeeShade = 1.0;
bool kgInBox(vec3 p, vec4 b, vec4 y, float m) {
  return p.x > b.x - m && p.x < b.z + m && p.z > b.y - m && p.z < b.w + m && p.y > y.x - m && p.y < y.y + m;
}
// 網点のしきい値（0..1）。interleaved gradient noise（Jimenez 2014 の式）。4×4 の格子より細かく、規則の網に見えない。
// 遊ぶ間は時刻でずらしてコマごとに変える（撮影は時刻が止まるので決まった模様になる）
float kgSeeNoise(vec2 fc) {
  float f = mod(floor(uKgTime * 60.0), 64.0);
  fc += 5.588238 * f;
  return fract(52.9829189 * fract(dot(fc, vec2(0.06711056, 0.00583715))));
}
// カメラから人物の胸 c へ向かう円錐（その距離で半径 R）の中で、人物より手前にある点ほど 1。inner まで 1、縁で 0
float kgSeeConeR(vec3 wp, vec3 c, float R, float inner) {
  vec3 toP = c - cameraPosition;
  float dp = length(toP);
  vec3 dir = toP / max(dp, 1e-3);
  vec3 toF = wp - cameraPosition;
  float t = dot(toF, dir);
  float far_ = dp - uKgSeeParams.y;
  if (t <= 0.0 || t > far_) return 0.0;
  float ang = length(toF - dir * t) / t;
  float angR = max(R / max(dp, 1e-3), uKgSeeParams.x);
  float k = 1.0 - smoothstep(angR * inner, angR, ang);
  return k * smoothstep(far_, far_ - 1.2, t);
}
float kgSeeCone(vec3 wp, vec4 tgt) { return kgSeeConeR(wp, tgt.xyz, tgt.w, uKgSeeParams.w); }
void kgSeeThrough(vec3 wp) {
  float n = kgSeeNoise(gl_FragCoord.xy);
  float k = 0.0;
  // カメラが箱に入った建物（CPU が z に 1 を書く）：プレイヤーを中心に大きな穴。屋根の下（w に 1）ならカメラの近くも抜く
  for (int i = 0; i < 10; i++) {
    if (uKgInsideY[i].z > 0.5 && kgInBox(wp, uKgInside[i], uKgInsideY[i], 0.3)) {
      if (uKgSeeParams.z > 0.0) k = max(k, kgSeeConeR(wp, uKgSeeT[0].xyz, uKgSeeIn.x, uKgSeeIn.y));
      if (uKgInsideY[i].w > 0.5) k = max(k, 1.0 - smoothstep(uKgSeeIn.z, uKgSeeIn.w, length(wp - cameraPosition)));
    }
  }
  if (uKgSeeParams.z > 0.0) {
    for (int i = 0; i < 3; i++) {
      if (uKgSeeT[i].w > 0.0) k = max(k, kgSeeCone(wp, uKgSeeT[i]));
    }
  }
  if (k <= 0.0) return;
  // 内側（k=1）は全部抜く。縁の帯は網点で、残った屋根の側を少し暗くして切り口に見せる
  if (k >= 0.999 || k > n) discard;
  kgSeeShade = 1.0 - ${SEE.edgeShade.toFixed(2)} * smoothstep(0.0, 0.8, k);
}
// 隠れている植え込み：中でしゃがんだプレイヤーが植え込みに埋もれないよう、まわりだけ網点で抜く
void kgSeeBush(vec3 wp) {
  if (uKgSeeBush.w <= 0.0) return;
  float d = length(wp.xz - uKgSeeBush.xy);
  float k = 1.0 - smoothstep(uKgSeeBush.z * 0.55, uKgSeeBush.z, d);
  if (k * uKgSeeBush.w > kgSeeNoise(gl_FragCoord.xy)) discard;
}
`;

/** 隠れている植え込みの抜き：プレイヤーの足元 (x, z) のまわり半径 r を、割合 k（0 で抜かない）で抜く。 */
export function setBushHole(x: number, z: number, r: number, k: number): void {
  SEE_UNIFORMS.uKgSeeBush.value.set(x, z, r, k);
}

const _cam = new Vector3();

export function createSeeThrough(): ArtSeeThrough {
  const t = SEE_UNIFORMS.uKgSeeT.value;
  const insideY = SEE_UNIFORMS.uKgInsideY.value;
  return {
    update(camera: PerspectiveCamera, player: Vector3, enabled: boolean, others?: readonly Vector3[]): void {
      t[0].set(player.x, player.y + SEE.chest, player.z, SEE.radius);
      for (let i = 0; i < SEE.maxOthers; i++) {
        const o = others?.[i];
        if (o) t[i + 1].set(o.x, o.y + SEE.otherChest, o.z, SEE.otherRadius);
        else t[i + 1].w = 0;
      }
      SEE_UNIFORMS.uKgSeeParams.value.z = enabled ? 1 : 0;
      // 建物の中にいるか（屋根の面と比べる）。カメラの位置はここで一度だけ決める（画素ごとに箱を調べない）
      camera.getWorldPosition(_cam);
      for (let i = 0; i < boxes.length; i++) {
        insideY[i].z = inBox(boxes[i], _cam) ? 1 : 0;
        insideY[i].w = insideY[i].z > 0 && cameraInside(boxes[i], _cam) ? 1 : 0;
      }
    },
  };
}
