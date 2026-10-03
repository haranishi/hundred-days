// OWNER: city
// 地面の材質。路面の標示（中央線・車線・横断歩道・停止線）、歩道の敷石と点字ブロック、
// 広場・庭・岸壁・駐車場・護岸の濡れ帯を、道に沿った座標とワールド座標から描く。
//
// r01-city（採点 r00a の改善4位「路面と根元に汚れと暗がりを入れる」）：
// ・アスファルトに骨材の粒、車線の中央の油の染み（停止線の手前ほど濃い）、タイヤの通り道の黒ずみと艶
// ・補修の継ぎはぎと継ぎ目、マンホール、縁石沿いのコンクリートの側溝と雨水桝、すり減ってかすれた標示
// ・歩道は敷石の色むら・人通りの多い帯の黒ずみ・ガムの跡、縁石の側と建物の側の根元の暗がり、点字ブロックの突起
// ・区画は建物の外形からの距離で、壁の根元を暗くする。街路樹の根元には植え枡（土と鉄の格子）
// 汚れの濃さは位置から決める：道の格付け（大通りほど濃い）、停止線からの距離、歩道の人通り（格付け×都心への近さ）。
import { MeshStandardMaterial } from 'three';
import { AMBIENT } from '../config/render';
import type { MaterialKit } from '../render/materials';
import { replaceOrThrow } from '../render/materials';
import { FILTER_GLSL } from '../render/shaders/filterGlsl';
import { NOISE_GLSL } from '../render/shaders/noiseGlsl';
import { styleDefines } from './styles';

const VERTEX_PARS = /* glsl */ `
attribute vec2 aUv;
attribute vec3 aColor;
attribute vec4 aGround;
attribute vec4 aGround2;
varying vec2 vGUv;
varying vec3 vGColor;
varying vec4 vG;
varying vec4 vG2;
varying vec3 vGPos;
`;

const VERTEX_MAIN = /* glsl */ `
vGUv = aUv;
vGColor = aColor;
vG = aGround;
vG2 = aGround2;
vGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAGMENT_PARS = /* glsl */ `
${styleDefines()}
varying vec2 vGUv;
varying vec3 vGColor;
varying vec4 vG;
varying vec4 vG2;
varying vec3 vGPos;
${NOISE_GLSL}
${FILTER_GLSL}

struct GSurf { vec3 albedo; float rough; float ao; };

// 周期模様の安全版（1周期が画素に近づくほど平均へ寄せる）
float gpulse(float x, float w, float fw) { return mix(fpulseC(x, w, fw * 1.35), w, smoothstep(0.4, 1.0, fw)); }

// アスファルト：大きなむら・骨材の粒（近くだけ）・色の薄い古い面
vec3 asphalt(vec3 base, vec2 p, vec2 fwp, float seed, out float rough) {
  float n1 = fbm2(p * 0.045 + seed * 13.0, 3);
  float n2 = fbm2(p * 0.7, 3);
  // r01-city：粒の細かさは画素の縦横の幾何平均で決める（目の高さの構図では、視線の方向の画素の長さだけで
  // 8m 先から粒が消えていた）。粒は乱数の点なので、少し残しても縞にはならない
  float px = sqrt(fwp.x * fwp.y);
  float fine = 1.0 - smoothstep(0.012, 0.06, px);
  float coarse = 1.0 - smoothstep(0.03, 0.12, px);
  // 骨材の粒：しきい値を掛けた値ノイズを2つ重ね、並びが格子に見えないようにする。大きめの白い石（砕石）は少し遠くまで残す
  float stone = smoothstep(0.74, 0.82, vnoise(p * 21.0 + seed * 7.0)) + 0.7 * smoothstep(0.76, 0.84, vnoise(p * 37.0 + 5.3));
  float chip = smoothstep(0.8, 0.9, vnoise(p * 8.5 + seed * 3.0 + 11.0));
  float grain = mix(0.5, vnoise(p * 27.0), fine);
  vec3 c = base * (0.74 + 0.48 * n1) * (0.88 + 0.24 * n2);
  c *= 0.9 + 0.2 * grain;
  c = mix(c, c * 1.5 + 0.02, clamp(stone, 0.0, 1.0) * 0.55 * fine);
  c = mix(c, c * 1.35 + 0.015, chip * 0.5 * coarse);
  c *= 1.0 + 0.05 * (1.0 - fine) + 0.03 * (1.0 - coarse);
  float patchy = smoothstep(0.58, 0.72, fbm2(p * 0.02 + 5.0, 3));
  c = mix(c, base * 0.74, patchy * 0.55);
  rough = 0.86 + 0.08 * n2;
  return c;
}

// 標示の塗料：すり減り（全体のむら・欠け・タイヤが踏む所ほど薄い）
vec3 paint(vec3 under, vec3 color, float mask, vec2 p, float wornBy) {
  float wear = 0.62 + 0.38 * fbm2(p * 1.3, 2);
  float chip = smoothstep(0.55, 0.78, vnoise(p * 3.1));
  wear *= 1.0 - 0.55 * chip;
  wear *= 1.0 - 0.5 * wornBy;
  return mix(under, color, clamp(mask * wear, 0.0, 1.0));
}

// 局所の座標 (along, across) の中の、角の丸くない矩形の補修跡（1区間に最大3枚）
float patchMask(vec2 la, float len, float halfW, float seed, vec2 fw, out float seam) {
  float m = 0.0;
  seam = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float h0 = hash12(vec2(seed * 97.1, fk + 0.5));
    if (h0 < 0.45) continue;
    float ca = mix(8.0, max(len - 8.0, 8.5), hash12(vec2(seed * 31.7, fk + 2.1)));
    float cc = (hash12(vec2(seed * 11.3, fk + 4.7)) - 0.5) * 2.0 * halfW * 0.75;
    float sa = mix(0.8, 4.5, hash12(vec2(seed * 7.9, fk + 6.3)));
    float sc = mix(0.6, 2.2, hash12(vec2(seed * 3.7, fk + 8.9)));
    float inside = fband(la.x, ca - sa, ca + sa, fw.x) * fband(la.y, cc - sc, cc + sc, fw.y);
    float inner = fband(la.x, ca - sa + 0.06, ca + sa - 0.06, fw.x) * fband(la.y, cc - sc + 0.06, cc + sc - 0.06, fw.y);
    m = max(m, inside);
    seam = max(seam, inside - inner);
  }
  return m;
}

// 幅 wWorld（m）の線を、線からの距離 d（m）と画素の大きさ px（m）で描く。画素より細い線は覆う割合で薄める（遠くでちらつかない）
float aaLine(float d, float wWorld, float px) {
  px = max(px, 1e-4);
  float wPx = wWorld / px;
  float halfPx = 0.5 * max(wPx, 1.0);
  return clamp(wPx, 0.0, 1.0) * (1.0 - smoothstep(halfPx - 0.5, halfPx + 0.5, abs(d) / px));
}

// 値 v の等値線 v=c を、幅 wWorld（m）の線として描く（ひび割れの網目）。v が画素の中で大きく変わる遠くでは消す
float isoLine(float v, float c, float wWorld, float px) {
  float fv = max(fwidth(v), 1e-5);
  float dPx = abs(v - c) / fv;
  float wPx = wWorld / max(px, 1e-4);
  float halfPx = 0.5 * max(wPx, 1.0);
  return clamp(wPx, 0.0, 1.0) * (1.0 - smoothstep(halfPx - 0.5, halfPx + 0.5, dPx)) * (1.0 - smoothstep(0.08, 0.25, fv));
}

// マンホール（直径 0.6m）：道に沿って一定の間隔、どの車線に置くかは乱数
float manhole(vec2 la, float laneW, float lanes, float halfW, float seed, vec2 fw, out float ring) {
  float spacing = 38.0;
  float k = floor(la.x / spacing);
  float h = hash12(vec2(k, seed * 53.0));
  ring = 0.0;
  if (h < 0.35) return 0.0;
  float lane = floor(hash12(vec2(k + 1.7, seed * 19.0)) * lanes);
  vec2 c = vec2((k + 0.25 + 0.5 * h) * spacing, -halfW + (lane + 0.5) * laneW + (h - 0.5) * 0.8);
  float r = length(la - c);
  float fwr = max(fw.x, fw.y);
  float disk = 1.0 - fstep(r - 0.32, fwr);
  ring = fband(r, 0.27, 0.32, fwr);
  return disk;
}

GSurf groundSurface() {
  GSurf g;
  g.ao = 1.0;
  float style = vG.x;
  vec3 base = srgbToLinear(vGColor);
  vec2 p = vGPos.xz;
  vec2 fwp = max(fwidth(p), vec2(1e-4));
  g.rough = 0.9;

  if (style == GS_ASPHALT || style == GS_INTERSECTION || style == GS_PARKING || style == GS_OUTSKIRTS) {
    float rough;
    vec3 c = asphalt(base, p, fwp, vG.w, rough);
    if (style == GS_ASPHALT) {
      float along = vGUv.x;
      float across = vGUv.y;
      vec2 fw = max(fwidth(vGUv), vec2(1e-4));
      float len = vG2.x;
      float halfW = vG2.y;
      float lanes = max(vG2.z, 1.0);
      float cls = vG2.w;
      float traffic = cls < 0.5 ? 1.0 : cls < 1.5 ? 0.55 : 0.2;
      vec3 white = vec3(0.78, 0.78, 0.76);
      vec3 yellow = vec3(0.78, 0.55, 0.12);
      float laneW = 2.0 * halfW / lanes;
      float lanePos = (across + halfW) / laneW;
      float inLane = fract(lanePos);
      float laneDet = 1.0 - smoothstep(0.08, 0.3, fw.y / laneW);
      // r01-city：採点 r00a の改善4位「路面の汚れ」。1回目の版は差が 10〜16% で、日陰の street ではほぼ一色に見えた
      // （メインループの所見）。濃さを上げ、形を「どこを車が通るか・どこを掘り返したか」の位置から決める
      float laneId = floor(lanePos);
      float segSeed = vG.w * 17.0;
      float nearStop = max(1.0 - smoothstep(6.0, 30.0, along), 1.0 - smoothstep(6.0, 30.0, len - along));
      // タイヤの通り道：車線の中心から左右 0.8m の2本の帯。ゴムで黒ずみ、磨かれて艶が出る（遠くでは平均へ）
      float wheel = mix(0.35, exp(-pow((abs(inLane - 0.5) - 0.22) / 0.09, 2.0)), laneDet);
      float wheelVar = 0.7 + 0.3 * vnoise(vec2(along * 0.12, laneId * 3.3 + segSeed));
      c *= 1.0 - 0.24 * traffic * wheel * wheelVar;
      rough -= 0.1 * traffic * wheel;
      // 車線の中央の油の染み：点々と落ちた跡が、停止線の手前（信号待ちの列）ほど濃い
      float oilBand = mix(0.2, exp(-pow((inLane - 0.5) / 0.09, 2.0)), laneDet);
      float drips = mix(0.5, smoothstep(0.42, 0.78, vnoise(vec2(along * 0.85, laneId * 5.1 + segSeed))), laneDet);
      float stainN = 0.55 + 0.45 * fbm2(p * 0.9 + vG.w * 3.0, 3);
      float oilA = traffic * (0.1 + 0.36 * nearStop) * oilBand * (0.35 + 0.65 * drips) * stainN;
      c *= 1.0 - oilA;
      rough -= 0.12 * oilA;
      // 車線の境と縁石の際：車が踏まないので、砂ぼこりで少し白っぽい
      float laneEdge = mix(0.3, exp(-pow(min(inLane, 1.0 - inLane) / 0.07, 2.0)), laneDet);
      c *= 1.0 + 0.07 * laneEdge * (0.5 + 0.5 * fbm2(p * 0.3 + 2.0, 2));
      // 車線ごとの打ち替え（部分補修）：車線の幅いっぱいに、道に沿って 10〜28m の新しい黒い舗装
      float chunkL = 32.0;
      float ck = floor(along / chunkL);
      float hr = hash12(vec2(laneId * 7.1 + segSeed, ck + 0.5));
      float a0 = ck * chunkL + 2.0 + 6.0 * fract(hr * 13.7);
      float a1 = a0 + 10.0 + 18.0 * fract(hr * 5.3);
      float repave = step(hr, 0.1 + 0.14 * traffic) * fband(along, a0, a1, fw.x) * fband(lanePos, laneId + 0.015, laneId + 0.985, fw.y / laneW);
      // 掘り返しの跡：道を横切る幅 0.7〜1.4m の継ぎはぎ（片側の車線だけのこともある）。区間に 0〜2 本
      float trench = 0.0;
      float trenchSeam = 0.0;
      for (int k = 0; k < 2; k++) {
        float hk = hash12(vec2(segSeed * 3.1 + 0.3, float(k) + 0.7));
        if (hk < 0.3) continue;
        float at = mix(9.0, max(len - 9.0, 9.5), fract(hk * 7.3));
        float wd = mix(0.7, 1.4, fract(hk * 3.9));
        float side = fract(hk * 11.3);
        float x0 = side < 0.72 ? -halfW : 0.0;
        float x1 = side < 0.45 ? halfW : side < 0.72 ? 0.0 : halfW;
        float inT = fband(along, at - wd * 0.5, at + wd * 0.5, fw.x) * fband(across, x0, x1, fw.y);
        float innerT = fband(along, at - wd * 0.5 + 0.06, at + wd * 0.5 - 0.06, fw.x) * fband(across, x0 + 0.06, x1 - 0.06, fw.y);
        trench = max(trench, inT);
        trenchSeam = max(trenchSeam, inT - innerT);
      }
      // 小さな補修の継ぎはぎ（少し新しい黒い面）と継ぎ目の目地
      float seam;
      float patchA = patchMask(vec2(along, across), len, halfW, segSeed + 1.0, fw, seam);
      float fresh = max(max(repave, trench), patchA);
      // 新しい舗装は古い面より黒いが、0.58 倍では目の前の掘り返しの跡が黒い帯に見えたので 0.66 倍にした
      vec3 newAsphalt = base * 0.66 * (0.93 + 0.14 * fbm2(p * 0.5, 2));
      c = mix(c, newAsphalt, fresh * 0.88);
      rough = mix(rough, 0.8, fresh);
      c *= 1.0 - 0.45 * max(seam, trenchSeam);
      // 目地材で塞いだひび（黒い筋）：車線の継ぎ目に沿う縦のひびと、ところどころ車線を横切るひび、古い面の網目
      float pxA = max(fw.x, fw.y);
      float jId = floor(lanePos + 0.5);
      float wig = (vnoise(vec2(along * 0.19, jId * 2.3 + segSeed)) - 0.5) * 0.45 + (vnoise(vec2(along * 1.4, jId + 5.0)) - 0.5) * 0.07;
      float jd = (fract(lanePos + 0.5) - 0.5) * laneW - wig;
      float jPresent = smoothstep(0.42, 0.58, vnoise(vec2(along * 0.03, jId * 3.1 + segSeed))) * step(0.5, jId) * step(jId, lanes - 0.5);
      float crack = aaLine(jd, 0.035, fw.y) * jPresent;
      float cT = floor(along / 17.0);
      float hT = hash12(vec2(cT + 0.5, laneId * 1.7 + segSeed));
      float tPos = (cT + 0.2 + 0.6 * hT) * 17.0 + (vnoise(vec2(across * 0.8, cT)) - 0.5) * 0.5;
      crack = max(crack, aaLine(along - tPos, 0.03, fw.x) * step(0.58, hT) * fband(inLane, 0.1, 0.9, fw.y / laneW));
      float mapV = fbm2(p * 0.23 + segSeed, 2);
      float oldArea = smoothstep(0.52, 0.68, fbm2(p * 0.035 + 3.0 + segSeed, 2));
      crack = max(crack, isoLine(mapV, 0.5, 0.025, pxA) * oldArea);
      crack *= 1.0 - fresh;
      c = mix(c, vec3(0.018, 0.018, 0.02), crack * 0.8);
      // 艶を上げると、日陰で空を映して白い線に見えたので、粗さは周りのまま少しだけ下げる
      rough = mix(rough, 0.72, crack);
      float tires = wheel;
      // マンホール
      float ringM;
      float mh = manhole(vec2(along, across), laneW, lanes, halfW, vG.w * 13.0 + cls, fw, ringM);
      if (mh > 0.0) {
        float grid = gpulse(dot(p, vec2(0.707, 0.707)) / 0.09, 0.5, length(fwp) / 0.09) * gpulse(dot(p, vec2(-0.707, 0.707)) / 0.09, 0.5, length(fwp) / 0.09);
        vec3 iron = vec3(0.13, 0.13, 0.135) * (0.8 + 0.4 * grid);
        c = mix(c, iron, mh);
        c = mix(c, vec3(0.2, 0.19, 0.18), ringM);
        rough = mix(rough, 0.55, mh);
      }
      // 縁石沿いのコンクリートの側溝（L字溝）と、そこに溜まる汚れ、ところどころの雨水桝
      float curbDist = halfW - abs(across);
      float gutter = cls < 1.5 ? 1.0 - fstep(curbDist - 0.42, fw.y) : 0.0;
      vec3 concrete = vec3(0.5, 0.49, 0.46) * (0.85 + 0.25 * fbm2(p * 0.6, 2));
      concrete *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.2, curbDist)) * (0.6 + 0.4 * fbm2(p * 1.7, 2));
      float grate = cls < 1.5 ? fband(fract(along / 17.0 + vG.w) * 17.0, 1.0, 1.9, fw.x) * fband(curbDist, 0.04, 0.38, fw.y) : 0.0;
      concrete = mix(concrete, vec3(0.1) * (0.8 + 0.4 * gpulse(along / 0.05, 0.5, fw.x / 0.05)), grate);
      c = mix(c, concrete, gutter);
      rough = mix(rough, 0.8, gutter);
      float xing = (1.0 - fband(along, 0.0, 7.5, fw.x)) * (1.0 - fband(along, len - 7.5, len, fw.x));
      float edge = fband(abs(across), halfW - 0.55, halfW - 0.42, fw.y);
      float mark = 0.0;
      if (cls < 0.5) {
        // 大通り：中央に黄の二重線、車線の境は白の破線
        float center = fband(abs(across), 0.1, 0.25, fw.y);
        c = paint(c, yellow, center * xing, p, 0.0);
        float laneLine = 1.0 - gpulse(lanePos, 1.0 - 0.15 / laneW, fw.y / laneW);
        float dash = fpulse(along / 12.0, 0.45, fw.x / 12.0);
        float notCenter = step(0.6, abs(across));
        mark = max(mark, laneLine * dash * notCenter * xing);
      } else if (cls < 1.5) {
        // 二車線の道：白の破線の中央線
        float center = fband(across, -0.075, 0.075, fw.y);
        float dash = fpulse(along / 9.0, 0.55, fw.x / 9.0);
        mark = max(mark, center * dash * xing);
      }
      if (cls < 1.5) mark = max(mark, edge * xing);
      c = paint(c, white, mark, p, 0.0);
      // 横断歩道（縞は道の向きに平行）と停止線。タイヤが踏む所ほどかすれる
      float stripes = gpulse(across / 0.9, 0.5, fw.y / 0.9) * (1.0 - step(halfW - 0.4, abs(across)));
      if (abs(vG.y) > 0.5) {
        float zone = fband(along, 0.8, 4.8, fw.x);
        float stopLine = fband(along, 6.3, 6.75, fw.x) * step(0.0, across * vG.y) * (1.0 - step(halfW - 0.3, abs(across)));
        c = paint(c, white, max(zone * stripes, stopLine), p, tires * traffic);
      }
      if (abs(vG.z) > 0.5) {
        float zone = fband(along, len - 4.8, len - 0.8, fw.x);
        float stopLine = fband(along, len - 6.75, len - 6.3, fw.x) * step(0.0, across * vG.z) * (1.0 - step(halfW - 0.3, abs(across)));
        c = paint(c, white, max(zone * stripes, stopLine), p, tires * traffic);
      }
    } else if (style == GS_INTERSECTION) {
      // 交差点の中：曲がる車のタイヤの跡と、中央の黒ずみ
      float swirl = fbm2(p * 0.35 + vG.w * 9.0, 3);
      c *= 1.0 - 0.2 * smoothstep(0.45, 0.75, swirl);
      // r01-city：古い面の網目のひび（目地材の黒い筋）
      float mapV = fbm2(p * 0.23 + vG.w * 17.0, 2);
      float crackI = isoLine(mapV, 0.5, 0.025, max(fwp.x, fwp.y)) * smoothstep(0.5, 0.66, fbm2(p * 0.035 + 7.0 + vG.w, 2));
      c = mix(c, vec3(0.018, 0.018, 0.02), crackI * 0.8);
      float ringM;
      vec2 cc = floor(p / 12.0) * 12.0 + 6.0;
      float mh = (1.0 - fstep(length(p - cc) - 0.32, max(fwp.x, fwp.y))) * step(0.7, hash12(floor(p / 12.0) + vG.w));
      c = mix(c, vec3(0.13, 0.13, 0.135), mh);
    } else if (style == GS_PARKING) {
      float stall = gpulse(p.x / 2.5, 0.05, fwp.x / 2.5) * fband(fract(p.y / 12.0), 0.1, 0.45, fwp.y / 12.0);
      c = paint(c, vec3(0.7), stall, p, 0.0);
      // 駐車した車の下の油の染み
      float spot = exp(-pow((fract(p.x / 2.5) - 0.5) / 0.18, 2.0)) * fband(fract(p.y / 12.0), 0.15, 0.4, fwp.y / 12.0);
      c *= 1.0 - 0.18 * spot * (1.0 - smoothstep(0.04, 0.2, fwp.x));
    } else if (style == GS_OUTSKIRTS) {
      // 街の外：代役の建物の升目に合わせた道の格子と、升目の中の舗装
      vec2 q = p / 64.0;
      vec2 fq = fwp / 64.0;
      float blockMask = gpulse(q.x + 0.5, 0.84, fq.x) * gpulse(q.y + 0.5, 0.84, fq.y);
      // 升目の中は、舗装・庭・木のまだら（空から見て舗装の四角が並ばないように、r01-city）
      float n = fbm2(p * 0.05, 3);
      float green = smoothstep(0.42, 0.62, fbm2(p * 0.09 + 11.0, 3));
      vec3 lot = mix(vec3(0.33, 0.32, 0.3), vec3(0.11, 0.15, 0.08), green) * (0.8 + 0.35 * n);
      c = mix(c, lot, blockMask);
    }
    g.albedo = c;
    g.rough = style == GS_OUTSKIRTS ? 0.95 : clamp(rough, 0.55, 0.98);
    return g;
  }

  if (style == GS_SIDEWALK) {
    // 敷石 0.3m 角、縁石の帯、点字ブロック（黄）。人通りの多い帯ほど黒ずみ、両端の根元は暗い
    float width = max(vG.y, 0.5);
    float traffic = vG.z;
    vec2 t = vGUv / 0.3;
    vec2 ft = max(fwidth(vGUv), vec2(1e-4)) / 0.3;
    float tile = gpulse(t.x, 0.93, ft.x) * gpulse(t.y, 0.93, ft.y);
    float detail = 1.0 - smoothstep(0.3, 0.9, max(ft.x, ft.y));
    float h = mix(0.5, hash12(floor(t)), detail);
    // 2色の敷石を混ぜる（ところどころ濃い色の石）
    float dark = step(0.82, h) * detail;
    vec3 c = base * (0.86 + 0.24 * h) * (0.8 + 0.2 * tile) * (1.0 - 0.25 * dark);
    c *= 0.9 + 0.2 * fbm2(p * 0.15, 3);
    // 人の通り道：歩道の中ほどの帯が黒ずむ（大通りの都心ほど濃い）
    float mid = 1.0 - abs(vGUv.y / width - 0.55) * 2.0;
    float worn = smoothstep(0.0, 0.8, mid) * traffic * (0.6 + 0.4 * fbm2(p * 0.4, 2));
    c *= 1.0 - 0.2 * worn;
    // ガムの跡（近くだけ、黒い点）
    vec2 gq = floor(p * 2.3);
    float gum = step(0.985 - 0.01 * traffic, hash12(gq + 11.0)) * (1.0 - smoothstep(0.08, 0.3, length(fract(p * 2.3) - 0.5))) * detail;
    c *= 1.0 - 0.45 * gum;
    // 縁石の側（車道の跳ね返り）と、建物の側（壁の根元）の暗がり
    float curbSide = 1.0 - smoothstep(0.0, 0.5, vGUv.y);
    float wallSide = 1.0 - smoothstep(0.0, 0.7, width - vGUv.y);
    c *= 1.0 - 0.2 * curbSide * (0.5 + 0.5 * traffic);
    c *= 1.0 - 0.28 * wallSide;
    g.ao = 1.0 - 0.35 * wallSide;
    float curbStone = 1.0 - fstep(vGUv.y - 0.22, ft.y * 0.3);
    c = mix(c, vec3(0.62, 0.61, 0.58) * (0.8 + 0.2 * fbm2(p * 1.1, 2)), curbStone);
    // 点字ブロック：黄色の帯と突起の点
    float tactile = fband(vGUv.y, 0.75, 1.05, ft.y * 0.3);
    vec2 dq = fract(vGUv / 0.05) - 0.5;
    float dots = (1.0 - smoothstep(0.18, 0.3, length(dq))) * (1.0 - smoothstep(0.004, 0.012, max(fwidth(vGUv).x, fwidth(vGUv).y)));
    c = mix(c, vec3(0.72, 0.52, 0.08) * (0.9 + 0.2 * dots) * (1.0 - 0.15 * worn), tactile);
    g.albedo = c;
    g.rough = 0.82;
    return g;
  }

  if (style == GS_TREEPIT) {
    // 植え枡：土（落ち葉）と、それを囲む鉄の格子（放射状のすき間）
    float hsz = vG.y * 0.5;
    vec2 q = vGUv;
    vec2 fq = max(fwidth(q), vec2(1e-4));
    float frame = 1.0 - fband(abs(q.x), -1.0, hsz - 0.08, fq.x) * fband(abs(q.y), -1.0, hsz - 0.08, fq.y);
    float r = length(q);
    float grateZone = fband(r, 0.35, hsz * 1.2, fq.x) * (1.0 - frame);
    float ang = atan(q.y, q.x);
    float slots = gpulse(ang * 5.0, 0.55, length(fq) / max(r, 0.1) * 5.0);
    vec3 soil = vec3(0.16, 0.12, 0.08) * (0.7 + 0.6 * fbm2(p * 4.0, 3));
    vec3 leaves = vec3(0.3, 0.26, 0.12) * (0.8 + 0.4 * vnoise(p * 9.0));
    soil = mix(soil, leaves, smoothstep(0.55, 0.7, fbm2(p * 2.5 + 3.0, 2)) * 0.6);
    vec3 iron = vec3(0.12, 0.11, 0.1);
    vec3 c = mix(soil, mix(iron, soil * 0.6, slots), grateZone);
    c = mix(c, vec3(0.5, 0.49, 0.46), frame);
    g.albedo = c;
    g.rough = mix(0.95, 0.6, grateZone * (1.0 - slots));
    g.ao = mix(0.75, 1.0, frame);
    return g;
  }

  if (style == GS_PLAZA || style == GS_WHARF) {
    float size = style == GS_WHARF ? 6.0 : 0.9;
    vec2 t = p / size;
    vec2 ft = fwp / size;
    float joint = 1.0 - gpulse(t.x, 1.0 - 0.015 / size * 2.0, ft.x) * gpulse(t.y, 1.0 - 0.015 / size * 2.0, ft.y);
    float detail = 1.0 - smoothstep(0.3, 0.9, max(ft.x, ft.y));
    float h = mix(0.5, hash12(floor(t)), detail);
    vec3 c = base * (0.88 + 0.2 * h) * (1.0 - 0.3 * joint);
    c *= 0.85 + 0.3 * fbm2(p * 0.06, 3);
    if (style == GS_WHARF) {
      float rust = smoothstep(0.65, 0.8, fbm2(p * 0.08 + 3.0, 3));
      c = mix(c, vec3(0.3, 0.22, 0.16), rust * 0.35);
      // 岸壁の車の轍と、荷役で付いた黒ずみ
      c *= 1.0 - 0.14 * smoothstep(0.5, 0.75, fbm2(p * vec2(0.02, 0.2) + 7.0, 3));
    }
    // 建物の外形のまわり（壁の根元）を暗くする
    if (vG2.z > vG2.x) {
      vec2 dd = max(vec2(vG2.x - p.x, vG2.y - p.y), vec2(p.x - vG2.z, p.y - vG2.w));
      float dist = length(max(dd, vec2(0.0)));
      float wallDark = 1.0 - smoothstep(0.0, 0.9, dist);
      c *= 1.0 - 0.3 * wallDark;
      g.ao = 1.0 - 0.35 * wallDark;
    }
    g.albedo = c;
    g.rough = 0.86;
    return g;
  }

  if (style == GS_PARK) {
    // 中庭の小さな公園：芝（刈り跡の縞とむら）、縁と十字の砂利の園路
    vec2 c0 = vG2.xy;
    vec2 c1 = vG2.zw;
    vec2 mid = 0.5 * (c0 + c1);
    float edge = min(min(p.x - c0.x, c1.x - p.x), min(p.y - c0.y, c1.y - p.y));
    float px = max(fwp.x, fwp.y);
    float ring = fband(edge, 1.0, 3.2, px);
    float cross = max(1.0 - fstep(abs(p.x - mid.x) - 1.2, px), 1.0 - fstep(abs(p.y - mid.y) - 1.2, px)) * step(1.0, edge);
    float path = max(ring, cross);
    float n = fbm2(p * 0.3, 3);
    float mow = gpulse(dot(p - c0, vec2(0.0, 1.0)) / 3.0, 0.5, fwp.y / 3.0);
    vec3 grass = vec3(0.16, 0.24, 0.09) * (0.78 + 0.4 * n) * (0.94 + 0.08 * mow);
    grass = mix(grass, vec3(0.3, 0.29, 0.16), smoothstep(0.62, 0.8, fbm2(p * 0.12 + 4.0, 3)) * 0.5);
    vec3 gravel = vec3(0.52, 0.49, 0.43) * (0.85 + 0.25 * vnoise(p * 3.0));
    vec3 c = mix(grass, gravel, path);
    // 縁石の内側の植え込み（濃い緑）
    float hedge = 1.0 - fstep(edge - 0.9, px);
    c = mix(c, vec3(0.07, 0.12, 0.05) * (0.8 + 0.4 * n), hedge);
    g.albedo = c;
    g.rough = mix(0.95, 0.9, path);
    g.ao = mix(1.0, 0.8, hedge);
    return g;
  }

  if (style == GS_GARDEN) {
    float grass = smoothstep(0.35, 0.65, fbm2(p * 0.25, 4));
    vec3 soil = vec3(0.3, 0.26, 0.21);
    vec3 green = vec3(0.19, 0.25, 0.12) * (0.8 + 0.4 * fbm2(p * 1.3, 3));
    vec3 gravel = vec3(0.45, 0.43, 0.4);
    vec3 c = mix(mix(gravel, soil, 0.4), green, grass);
    if (vG2.z > vG2.x) {
      vec2 dd = max(vec2(vG2.x - p.x, vG2.y - p.y), vec2(p.x - vG2.z, p.y - vG2.w));
      float wallDark = 1.0 - smoothstep(0.0, 0.8, length(max(dd, vec2(0.0))));
      c *= 1.0 - 0.3 * wallDark;
      g.ao = 1.0 - 0.3 * wallDark;
    }
    g.albedo = c;
    g.rough = 0.95;
    return g;
  }

  if (style == GS_SEAWALL) {
    float wl = vG.y;
    float y = vGPos.y;
    float wet = 1.0 - smoothstep(wl + 0.2, wl + 1.2, y);
    float algae = fband(y, wl - 0.6, wl + 0.35, fwidth(y));
    vec3 c = base * (0.85 + 0.3 * fbm2(vec2(p.x + p.y, y) * 0.5, 3));
    c *= 1.0 - 0.55 * wet;
    c = mix(c, vec3(0.08, 0.1, 0.06), algae * 0.6);
    g.albedo = c;
    g.rough = mix(0.9, 0.35, wet);
    return g;
  }

  // 縁石の立ち上がり：下ほど車道の汚れ
  float low = 1.0 - smoothstep(0.0, 0.15, vGPos.y);
  g.albedo = base * (0.9 + 0.2 * fbm2(p * 0.8, 2)) * (1.0 - 0.3 * low);
  g.rough = 0.8;
  return g;
}
`;

export function createGroundMaterial(kit: MaterialKit): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: AMBIENT.envIntensity });
  material.name = 'Ground';
  return kit.patch(material, {
    key: 'ground',
    vertex: (src) => {
      let s = replaceOrThrow(src, '#include <common>', `#include <common>\n${VERTEX_PARS}`);
      s = replaceOrThrow(s, '#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_MAIN}`);
      return s;
    },
    fragment: (src) => {
      let s = replaceOrThrow(src, '#include <common>', `#include <common>\n${FRAGMENT_PARS}`);
      s = replaceOrThrow(s, '#include <color_fragment>', '#include <color_fragment>\nGSurf gsurf = groundSurface();\ndiffuseColor.rgb = gsurf.albedo;');
      s = replaceOrThrow(s, '#include <roughnessmap_fragment>', 'float roughnessFactor = gsurf.rough;');
      s = replaceOrThrow(
        s,
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= gsurf.ao;\nreflectedLight.indirectSpecular *= mix(1.0, gsurf.ao, 0.5);',
      );
      return s;
    },
  });
}
