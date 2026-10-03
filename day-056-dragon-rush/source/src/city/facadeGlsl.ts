// OWNER: city
// 外壁の画素の描き方（GLSL）。buildingMaterial.ts が <common> の後に差し込み、buildingSurface() を呼ぶ。
// 前提：vFac* の varying・hash12/vnoise/fbm2・fpulse/fband/fstep/srgbToLinear・壊れ方（damageGlsl.ts）が先に定義済み。
// 空の色（atmoSky）と太陽の向き（atmoSunDirection）は後ろの大気の塊で定義されるので、前方宣言して呼ぶ。
//
// r01-city の中身（採点 r00a の改善1位「窓と外壁をへこませる」と2位の店先）：
// ・窓は壁の厚みぶん奥にある開口として、画素ごとに視線を通す。側面・まぐさの下・窓台に当たればその面の向きで光を受け、
//   開口の縁が落とす日の影（上の縁の影）も付く。奥のガラスはフレネルで斜めほど空を映し、透けた先に部屋の箱を描く
// ・部屋は窓ごとに奥行き・壁と床の色・家具・照明・ブラインドの高さ・カーテンを変える。夕日が差す面では日だまりができる
// ・外壁には目地の色むら、窓台の端からの雨だれ、上端からの汚れ、根元の汚れの帯（大通りに面するほど濃い）を足す
// ・1階は柱間ごとに店の型（ガラスの店先と店内の明かり・入口・シャッター・壁）を決め、看板の帯には意味を持たない模様を描く
// ・遠くでは、視差と窓ごとの描き分けを平均の見た目へ寄せ、周期模様は1周期が画素に近づくほど平均へ寄せる（モアレ対策）
import { facadeDefines } from '../config/facade';

export const FACADE_GLSL = /* glsl */ `
${facadeDefines()}
#define FAC_PI 3.14159265

vec3 atmoSky(vec3 dir);
vec3 atmoSunDirection();

struct Surf { vec3 albedo; float rough; float metal; vec3 emissive; float ao; vec3 nOffset; float direct; vec3 sunEmit; };

Surf surfNew(vec3 albedo, float rough, float metal) {
  Surf s;
  s.albedo = albedo;
  s.rough = rough;
  s.metal = metal;
  s.emissive = vec3(0.0);
  s.ao = 1.0;
  s.nOffset = vec3(0.0);
  s.direct = 1.0;
  s.sunEmit = vec3(0.0);
  return s;
}

Surf surfMix(Surf a, Surf b, float t) {
  Surf s;
  s.albedo = mix(a.albedo, b.albedo, t);
  s.rough = mix(a.rough, b.rough, t);
  s.metal = mix(a.metal, b.metal, t);
  s.emissive = mix(a.emissive, b.emissive, t);
  s.ao = mix(a.ao, b.ao, t);
  s.nOffset = mix(a.nOffset, b.nOffset, t);
  s.direct = mix(a.direct, b.direct, t);
  s.sunEmit = mix(a.sunEmit, b.sunEmit, t);
  return s;
}

// 周期模様の安全版：箱の幅を広げ、1周期が画素に近づくほど平均（w）へ寄せる（斜めの面のモアレを消す）
float spulse(float x, float w, float fw) { return mix(fpulseC(x, w, fw * 1.35), w, smoothstep(0.4, 1.0, fw)); }
float spulseL(float x, float w, float fw) { return mix(fpulse(x, w, fw * 1.35), w, smoothstep(0.4, 1.0, fw)); }

// ---- 外壁の局所の座標系（x：u が増える向き、y：上、z：外向き） ----
vec3 fT;
vec3 fN;
vec3 fV;
vec3 fL;
vec3 fSkyIn;

void facadeFrame() {
  fN = normalize(vFacNormal);
  fT = normalize(vec3(fN.z, 0.0, -fN.x) + vec3(1e-6, 0.0, 0.0));
  vec3 v = normalize(cameraPosition - vFacPos);
  fV = vec3(dot(v, fT), v.y, dot(v, fN));
  vec3 l = atmoSunDirection();
  fL = vec3(dot(l, fT), l.y, dot(l, fN));
  // 窓から部屋に入る空の光：窓の向いている方の地平線の少し上と、天頂の空
  fSkyIn = atmoSky(normalize(vec3(fN.x, 0.18, fN.z))) * 0.65 + atmoSky(vec3(0.0, 1.0, 0.0)) * 0.35;
}

vec3 facWorld(vec3 l) { return fT * l.x + vec3(0.0, l.y, 0.0) + fN * l.z; }

// 太陽が、面 z=zp にある矩形の開口（中心 c・半幅 hs）を通って点 h に届くか（0〜1。縁は太陽の大きさぶんぼかす）
float apertureVis(vec3 h, vec2 c, vec2 hs, float zp, float soft) {
  if (fL.z < 0.002) return 0.0;
  float s = max(zp - h.z, 0.0) / fL.z;
  vec2 e = h.xy + fL.xy * s - c;
  vec2 q = hs - abs(e);
  float pen = soft + s * 0.025;
  return smoothstep(-pen, pen, q.x) * smoothstep(-pen, pen, q.y);
}

// 開口（壁面 z=0、中心が原点、半幅 hs）から奥行き d の箱へ、壁面の点 p から視線 r（r.z<0）を通す。
// id：0 = 奥の面、1 = 側面、2 = 上面（まぐさの下）、3 = 下面（窓台）。n はその面の法線（局所）
vec3 recessTrace(vec2 p, vec3 r, vec2 hs, float d, out float id, out vec3 n) {
  float tb = d / max(-r.z, 1e-4);
  float tx = abs(r.x) > 1e-5 ? max((sign(r.x) * hs.x - p.x) / r.x, 0.0) : 1e6;
  float ty = abs(r.y) > 1e-5 ? max((sign(r.y) * hs.y - p.y) / r.y, 0.0) : 1e6;
  float t = min(tb, min(tx, ty));
  vec3 h = vec3(p + r.xy * t, r.z * t);
  if (t == tb) {
    id = 0.0;
    n = vec3(0.0, 0.0, 1.0);
  } else if (t == tx) {
    id = 1.0;
    n = vec3(-sign(r.x), 0.0, 0.0);
  } else if (r.y > 0.0) {
    id = 2.0;
    n = vec3(0.0, -1.0, 0.0);
  } else {
    id = 3.0;
    n = vec3(0.0, 1.0, 0.0);
  }
  return h;
}

// ---- 部屋（窓の奥） ----
struct Room {
  vec3 wallC;
  vec3 floorC;
  vec3 ceilC;
  vec3 lampC;
  vec3 curtainC;
  float depth;
  float lit;
  float blindY;
  float blindC;
  float curtain;
  float lace;
  float furnH;
  float shop;
};

// kind：0 = 事務所、1 = 住まい、2 = 店。key は窓の区画、seed は建物の種
Room makeRoom(vec2 key, float seed, float kind) {
  Room r;
  float h1 = hash12(key * 1.17 + seed * 17.3);
  float h2 = hash12(key.yx * 1.31 + seed * 5.3 + 2.7);
  float h3 = hash12(key * 0.77 + seed * 29.1 + 9.1);
  float h4 = hash12(key * 1.93 + seed * 3.7 + 4.4);
  float h5 = hash12(key * 2.41 + seed * 11.9 + 7.7);
  r.wallC = h1 < 0.38 ? vec3(0.76, 0.74, 0.69) : h1 < 0.62 ? vec3(0.7, 0.63, 0.52) : h1 < 0.84 ? vec3(0.6, 0.62, 0.61) : vec3(0.56, 0.63, 0.57);
  r.floorC = h2 < 0.34 ? vec3(0.25, 0.26, 0.28) : h2 < 0.66 ? vec3(0.4, 0.28, 0.18) : h2 < 0.86 ? vec3(0.34, 0.34, 0.32) : vec3(0.16, 0.19, 0.24);
  r.ceilC = vec3(0.8, 0.79, 0.76);
  r.curtainC = vec3(0.5);
  r.blindY = 1.2;
  r.blindC = 0.0;
  r.curtain = 0.0;
  r.lace = 0.0;
  // 店の中の型（r01-city）：1 = 物販の棚、2 = 喫茶・食堂、3 = 受付のある広間
  r.shop = kind < 1.5 ? 0.0 : h1 < 0.45 ? 1.0 : h1 < 0.76 ? 2.0 : 3.0;
  r.furnH = mix(0.72, 1.15, fract(h3 * 3.3));
  float litP = FAC_LIT_OFFICE;
  vec3 warm = vec3(1.0, 0.8, 0.58);
  vec3 cool = vec3(0.86, 0.93, 1.0);
  if (kind < 0.5) {
    r.depth = mix(4.5, 9.5, h3);
    // 事務所：ブラインドの下がり方が窓ごとにまちまち（上げた窓・半分・ほぼ閉じた窓）
    float b = fract(h4 * 7.31 + h1 * 3.1);
    r.blindY = b < 0.3 ? 1.2 : b < 0.62 ? mix(0.1, 0.95, fract(b * 13.1)) : mix(-1.05, 0.2, fract(b * 5.7));
    r.blindC = fract(h2 * 5.3);
    r.lampC = mix(cool, warm, step(0.72, h5));
  } else if (kind < 1.5) {
    r.depth = mix(3.0, 5.2, h3);
    litP = FAC_LIT_HOME;
    // 住まい：白いレースのカーテンと、左右に寄せた厚手のカーテン
    r.lace = step(0.3, h5) * mix(0.45, 0.78, fract(h5 * 9.1));
    r.curtain = step(0.35, fract(h1 * 4.7)) * mix(0.1, 0.34, fract(h3 * 6.1));
    float c = fract(h2 * 3.9);
    r.curtainC = c < 0.3 ? vec3(0.62, 0.55, 0.44) : c < 0.55 ? vec3(0.42, 0.46, 0.5) : c < 0.75 ? vec3(0.5, 0.42, 0.36) : vec3(0.66, 0.64, 0.58);
    r.lampC = warm * 0.9;
  } else {
    r.depth = mix(6.0, 11.0, h3);
    litP = FAC_LIT_SHOP;
    r.lampC = mix(warm, cool, step(0.6, h5) * step(r.shop, 1.5)) * (FAC_SHOP_LAMP / FAC_LAMP_SURFACE);
    r.wallC = mix(r.wallC, r.shop > 1.5 && r.shop < 2.5 ? vec3(0.62, 0.5, 0.38) : vec3(0.86, 0.85, 0.82), 0.4);
    if (r.shop > 1.5 && r.shop < 2.5) r.floorC = vec3(0.22, 0.15, 0.1);
  }
  r.lit = step(h4, litP);
  return r;
}

// 部屋の中：g はガラス面の点（局所、z=-d）、r は視線。開口 A（外面 z=0）と開口 B（ガラス面 z=-d）を通った光だけが入る。
// halfW は部屋の半幅、yF・yC は床と天井の高さ。amb は空の光と灯りによる放射輝度、sunF は日だまり（csmSunIn に掛ける）
void roomTrace(vec3 g, vec3 r, vec2 hsA, vec2 cB, vec2 hsB, float d, float halfW, float yF, float yC, Room rm, out vec3 amb, out vec3 sunF) {
  float tz = rm.depth / max(-r.z, 1e-3);
  float tx = abs(r.x) > 1e-5 ? max((sign(r.x) * halfW - g.x) / r.x, 0.0) : 1e6;
  float ty = r.y > 1e-5 ? (yC - g.y) / r.y : r.y < -1e-5 ? (yF - g.y) / r.y : 1e6;
  ty = max(ty, 0.0);
  float t = min(tz, min(tx, ty));
  vec3 h = g + r * t;
  // r01-city：以前は壁に当たっても、店でなければ次の分岐で天井か床の色に上書きしていた（法線も未定義のまま読んでいた）。
  // 奥の壁・家具・横の壁が見えず、部屋が天井か床の一色になっていたので、当たった面ごとに1回だけ決めるように直した
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 alb = rm.floorC;
  bool wallHit = false;
  if (t == tz) {
    n = vec3(0.0, 0.0, 1.0);
    alb = rm.wallC;
    wallHit = true;
    // 奥の壁の手前の家具（机・棚・仕切り）：床から furnH までの帯を、ところどころ切って置く
    float cut = step(0.35, hash12(vec2(floor((h.x + halfW) / 1.1), rm.depth * 7.0)));
    float furn = step(h.y, yF + rm.furnH) * cut;
    alb = mix(alb, rm.floorC * 0.55 + 0.05, furn);
  } else if (t == tx) {
    n = vec3(-sign(r.x), 0.0, 0.0);
    alb = rm.wallC * 0.93;
    wallHit = true;
  } else if (r.y > 0.0) {
    n = vec3(0.0, -1.0, 0.0);
    alb = rm.ceilC;
  }
  if (rm.shop > 0.5 && wallHit) {
    float along = n.z > 0.5 ? h.x : -h.z;
    if (rm.shop < 1.5) {
      // 物販：奥と横の壁に商品の棚。r01-city：色の四角が壁一面に並んで見えたので、色を落ち着かせ、棚板と隙間を入れた
      float level = (h.y - yF) / 0.36;
      float onShelf = step(0.24, fract(level)) * step(level, 5.2) * step(0.4, level);
      vec2 slot = vec2(floor(along / 0.2), floor(level));
      float hv = hash12(slot + rm.depth * 3.1);
      vec3 goods = hv < 0.18 ? vec3(0.5, 0.27, 0.2) : hv < 0.34 ? vec3(0.27, 0.34, 0.45) : hv < 0.5 ? vec3(0.64, 0.58, 0.44) : hv < 0.64 ? vec3(0.33, 0.42, 0.31) : hv < 0.86 ? vec3(0.76, 0.74, 0.7) : vec3(0.3, 0.27, 0.25);
      float gap = step(0.14, hash12(slot + 7.7)) * (0.75 + 0.25 * hash12(slot * 1.3 + 2.0));
      float board = (1.0 - step(0.1, fract(level))) * step(0.3, level) * step(level, 5.3);
      alb = mix(alb * 0.55, goods * 0.8, onShelf * gap);
      alb = mix(alb, vec3(0.6, 0.58, 0.55), board);
    } else if (rm.shop < 2.5) {
      // 喫茶・食堂：腰の高さまで板張り、奥にカウンター、壁に額
      alb = mix(alb, vec3(0.28, 0.18, 0.11), step(h.y, yF + 1.0));
      alb = mix(alb, vec3(0.5, 0.36, 0.22), step(yF + 0.95, h.y) * step(h.y, yF + 1.06) * step(0.5, n.z));
      vec2 fr = vec2(fract(along / 2.3), (h.y - yF - 1.45) / 0.55);
      alb = mix(alb, vec3(0.36, 0.31, 0.27), step(0.3, fr.x) * step(fr.x, 0.7) * step(0.0, fr.y) * step(fr.y, 1.0) * 0.8);
    } else {
      // 受付のある広間：石張りの壁（目地）、腰の高さの受付台、奥の壁の案内板、隅の植木。
      // r01-city：石の壁だけでは、ガラス越しに明るい無地の板に見えた（遠目に灰色の板が並んだ）ので、物を足した
      vec3 stone = vec3(0.62, 0.6, 0.56) * (0.9 + 0.1 * step(0.5, fract(floor(along / 1.2) * 0.37 + floor((h.y - yF) / 0.9) * 0.61)));
      float joint = step(fract(along / 1.2), 0.03) + step(fract((h.y - yF) / 0.9), 0.03);
      alb = mix(stone, stone * 0.7, clamp(joint, 0.0, 1.0));
      alb = mix(alb, vec3(0.3, 0.27, 0.24), step(h.y, yF + 0.1));
      alb = mix(alb, vec3(0.34, 0.3, 0.26), step(h.y, yF + 1.05) * step(0.5, n.z) * step(abs(h.x), 1.6));
      alb = mix(alb, vec3(0.16, 0.18, 0.2), step(yF + 1.5, h.y) * step(h.y, yF + 2.1) * step(0.5, n.z) * step(abs(h.x - 1.9), 0.55));
      float plant = step(0.5, n.z) * step(h.y, yF + 1.3) * step(halfW - 0.9, abs(h.x));
      alb = mix(alb, vec3(0.1, 0.17, 0.08), plant);
    }
  }
  float depthIn = max(-h.z - d, 0.0);
  float fall = 0.28 + 0.72 * exp(-depthIn * FAC_INTERIOR_FALLOFF);
  float facing = 0.6 + 0.4 * n.z;
  amb = alb * fSkyIn * FAC_INTERIOR_AMBIENT * fall * facing;
  if (rm.lit > 0.5) {
    amb += alb * rm.lampC * FAC_LAMP_SURFACE * (0.55 + 0.45 * fall);
    if (n.y < -0.5) {
      // 天井の照明：奥行きの向きに細長い灯りが並ぶ
      float along = fract(depthIn / 2.4 + 0.3);
      float across = fract(h.x / 1.8 + 0.5);
      float panel = step(0.42, along) * step(along, 0.58) * step(0.2, across) * step(across, 0.8);
      amb += rm.lampC * FAC_LAMP_PANEL * panel;
    }
  }
  float vis = min(apertureVis(h, vec2(0.0), hsA, 0.0, 0.03), apertureVis(h, cB, hsB, -d, 0.03));
  sunF = alb * max(dot(n, fL), 0.0) * vis / FAC_PI;
}

// ガラス面の見た目。g はガラス面の点（開口の中心を原点、m）。mode：0 = 腰窓（サッシ）、1 = 反射膜付きのカーテンウォール、
// 2 = 店のガラス、3 = 掃き出し窓（バルコニー）。r は視線、hs は外面の開口の半幅（日の入り口）、d は奥行き
Surf glassSurf(vec2 g, vec2 fwg, vec3 r, vec2 hsA, vec2 cB, vec2 hsB, float d, vec2 room, float yCenter, Room rm, vec3 trim, vec3 tintC, float mode, float sash) {
  vec2 lg = g - cB;
  vec2 edge = hsB - abs(lg);
  float frame = 0.0;
  if (mode < 0.5 || mode > 2.5) {
    // サッシ：外枠・引き違いの召し合わせ（中央の縦枠）・欄間の横枠
    frame = 1.0 - fstep(edge.x - 0.055, fwg.x) * fstep(edge.y - 0.055, fwg.y);
    if (hsB.x > 0.62) frame = max(frame, 1.0 - fstep(abs(lg.x) - 0.035, fwg.x));
    if (sash > 0.5) frame = max(frame, fband(lg.y, hsB.y * 0.42 - 0.03, hsB.y * 0.42 + 0.03, fwg.y));
  } else if (mode > 1.5) {
    // 店のガラス：太い縦の方立て
    frame = 1.0 - fstep(edge.x - 0.07, fwg.x) * fstep(edge.y - 0.07, fwg.y);
    frame = max(frame, 1.0 - fstep(abs(fract(lg.x / 1.6 + 0.5) - 0.5) * 1.6 - 0.04, fwg.x));
  }
  vec3 amb;
  vec3 sunF;
  roomTrace(vec3(g, -d), r, hsA, cB, hsB, d, room.x * 0.5 - 0.06, yCenter - room.y * 0.5 + 0.12, yCenter + room.y * 0.5 - 0.45, rm, amb, sunF);
  float visG = min(apertureVis(vec3(g, -d), vec2(0.0), hsA, 0.0, 0.02), 1.0);
  // ブラインド（上から blindY の高さまで）
  if (rm.blindY < 1.1) {
    float blind = fstep(lg.y - rm.blindY * hsB.y, fwg.y);
    float slat = spulseL(lg.y / 0.045, 0.8, fwg.y / 0.045);
    vec3 bc = mix(vec3(0.74, 0.72, 0.67), vec3(0.55, 0.57, 0.58), rm.blindC) * (0.72 + 0.28 * slat);
    vec3 bAmb = bc * fSkyIn * FAC_INTERIOR_AMBIENT * 1.7 + rm.lit * bc * rm.lampC * 0.5;
    vec3 bSun = bc * max(fL.z, 0.0) * visG * 0.55 / FAC_PI;
    amb = mix(amb, bAmb, blind);
    sunF = mix(sunF, bSun, blind);
  }
  // 厚手のカーテン（左右に寄せる）とレース（白く透ける）
  if (rm.curtain > 0.0) {
    float side = fstep(abs(lg.x) - hsB.x * (1.0 - rm.curtain), fwg.x);
    float fold = 0.8 + 0.2 * sin(lg.x * 31.0);
    vec3 cAmb = rm.curtainC * fold * (fSkyIn * FAC_INTERIOR_AMBIENT * 1.5 + rm.lit * rm.lampC * 0.45);
    amb = mix(amb, cAmb, side);
    sunF = mix(sunF, rm.curtainC * max(fL.z, 0.0) * visG * 0.4 / FAC_PI, side);
  }
  if (rm.lace > 0.0) {
    vec3 lace = vec3(0.86, 0.85, 0.82);
    vec3 lAmb = lace * (fSkyIn * FAC_INTERIOR_AMBIENT * 1.9 + rm.lit * rm.lampC * 0.6);
    amb = mix(amb, lAmb, rm.lace);
    sunF = mix(sunF, lace * max(fL.z, 0.0) * visG * 0.5 / FAC_PI, rm.lace);
  }
  float cosV = clamp(fV.z, 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - cosV, 5.0);
  float T = (1.0 - F) * (mode > 0.5 && mode < 1.5 ? FAC_COATED_TRANSMIT : FAC_GLASS_TRANSMIT);
  Surf s;
  if (mode > 0.5 && mode < 1.5) {
    // 反射膜付き：色の付いた強い映り込み（金属度で反射率を上げる）。部屋は薄く透ける
    s = surfNew(tintC, 0.05, 0.9);
  } else {
    s = surfNew(vec3(0.012), 0.05, 0.0);
  }
  vec3 tint = mix(vec3(1.0), clamp(tintC * 2.4, 0.0, 1.2), 0.3);
  s.emissive = amb * T * tint;
  s.sunEmit = sunF * T * tint;
  s.direct = visG;
  s.ao = mix(0.7, 0.92, visG);
  Surf fr = surfNew(trim, 0.42, 0.55);
  fr.direct = visG;
  fr.ao = s.ao;
  return surfMix(s, fr, frame);
}

// 開口の側面・まぐさの下・窓台（局所の点 h、面の法線 n、id）
Surf revealSurf(vec3 h, vec3 n, float id, vec2 hs, float d, vec3 wall) {
  vec3 c = wall * 0.9;
  if (id > 2.5) c = mix(wall, vec3(0.8, 0.79, 0.76), 0.5);
  Surf s = surfNew(c, 0.85, 0.0);
  s.nOffset = facWorld(n) - fN;
  s.direct = apertureVis(h + n * 0.02, vec2(0.0), hs, 0.0, 0.015);
  s.ao = mix(0.92, 0.5, clamp(-h.z / max(d, 1e-3), 0.0, 1.0));
  return s;
}

// 窓1枚（開口の中）。lp は開口の中心からの位置（m）、cell は区画の大きさ（m）
Surf windowSurf(vec2 lp, vec2 hs, float d, vec2 cell, float yCenter, Room rm, vec3 wall, vec3 trim, vec3 tintC, float mode, float sash) {
  vec3 r = -fV;
  r.z = min(r.z, -0.03);
  vec2 p = clamp(lp, -hs + 0.002, hs - 0.002);
  float id;
  vec3 n;
  vec3 h = recessTrace(p, r, hs, d, id, n);
  if (id < 0.5) {
    vec2 fwg = max(fwidth(h.xy), vec2(1e-4));
    return glassSurf(h.xy, fwg, r, hs, vec2(0.0), hs, d, cell, yCenter, rm, trim, tintC, mode, sash);
  }
  return revealSurf(h, n, id, hs, d, wall);
}

// 遠くの窓の平均の見た目（窓が画面で小さいとき）。rnd・rnd2 は窓ごとの乱数で、detail が 0 に近いほど平均へ寄せる
Surf windowAvg(vec3 trim, vec3 tintC, float rnd, float rnd2, float detail, float kind, float mode) {
  float cosV = clamp(fV.z, 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - cosV, 5.0);
  float coated = step(0.5, mode) * step(mode, 1.5);
  float T = (1.0 - F) * mix(FAC_GLASS_TRANSMIT, FAC_COATED_TRANSMIT, coated);
  float litP = kind > 1.5 ? FAC_LIT_SHOP : kind > 0.5 ? FAC_LIT_HOME : FAC_LIT_OFFICE;
  float lit = mix(litP, step(rnd2, litP), detail);
  float bright = mix(0.5, rnd, detail);
  vec3 room = fSkyIn * FAC_INTERIOR_AMBIENT * mix(0.35, 0.95, bright) * vec3(0.6, 0.58, 0.54);
  room += lit * vec3(1.0, 0.9, 0.78) * (kind > 1.5 ? FAC_SHOP_LAMP : FAC_LAMP_SURFACE) * 0.45;
  Surf s = surfNew(mix(vec3(0.014), trim, 0.16), 0.16, 0.1);
  if (coated > 0.5) s = surfNew(tintC, 0.1, 0.85);
  vec3 tint = mix(vec3(1.0), clamp(tintC * 2.4, 0.0, 1.2), 0.3);
  s.emissive = room * T * tint * 0.85;
  s.sunEmit = vec3(0.55, 0.52, 0.48) * max(fL.z, 0.0) * 0.28 / FAC_PI * T * tint;
  s.ao = 0.82;
  s.direct = 0.85;
  return s;
}

// ---- 外壁の素材（目地の色むら・大きな汚れ・上端と根元の汚れ） ----
vec3 wallMaterial(vec3 wall, vec2 uv, float style, float seed, vec2 fwUv, float wallTop, float traffic) {
  float n = fbm2(vFacPos.xz * 0.21 + vFacPos.y * 0.13 + seed * 31.0, 3);
  vec3 c = wall * (0.9 + 0.2 * n);
  // 目地：石は大判、それ以外は細かいタイル。目地の近くでは1枚ずつ色を少し変える
  vec2 joint = style == FS_STONE ? vec2(1.5, 0.75) : vec2(0.9, 0.3);
  vec2 jc = uv / joint;
  vec2 jw = fwUv / joint;
  float mortar = 1.0 - spulse(jc.x, 1.0 - 0.012 / joint.x, jw.x) * spulse(jc.y, 1.0 - 0.012 / joint.y, jw.y);
  c *= 1.0 - 0.2 * mortar;
  float tileDetail = 1.0 - smoothstep(0.12, 0.45, max(jw.x, jw.y));
  c *= 1.0 + (hash12(floor(jc) + seed * 91.0) - 0.5) * 0.14 * tileDetail;
  // 大きな汚れのむら（雨の筋の向きに縦長）
  float dirt = fbm2(uv * vec2(0.09, 0.028) + seed * 7.0, 3);
  c *= 0.86 + 0.18 * dirt;
  // 上端（笠木）から垂れる汚れの筋
  float sx = uv.x * 2.7;
  float sfade = 1.0 - smoothstep(0.3, 0.8, fwUv.x * 2.7);
  float streak = mix(0.5, vnoise(vec2(sx, uv.y * 0.09 + seed * 13.0)) * vnoise(vec2(sx * 1.9 + 3.0, seed)), sfade);
  float top = smoothstep(wallTop - 7.5, wallTop - 0.4, uv.y);
  c *= 1.0 - FAC_TOP_STREAK * top * streak * 1.6;
  // 根元の汚れの帯：通りの車と人の跳ね返り。大通りに面するほど濃く、高く上がる
  float bandH = 1.3 + 1.6 * traffic;
  float grime = (1.0 - smoothstep(0.0, bandH, uv.y)) * (0.55 + 0.45 * fbm2(vFacPos.xz * 0.7 + seed, 2));
  float splash = 1.0 - smoothstep(0.0, 0.45, uv.y);
  c *= 1.0 - FAC_BASE_GRIME * (0.55 + 0.6 * traffic) * grime - 0.12 * splash;
  return c;
}

// 窓台の端から垂れる雨だれ（窓の下の壁）。f は区画の中の位置（0〜1）、cellW・cellH は区画の大きさ（m）
float rainStreaks(vec2 f, vec2 cid, float ww, float wh, float cellH, float seed, float detail) {
  float sillY = 0.5 - 0.5 * wh;
  float below = sillY - f.y;
  if (below <= 0.0) {
    // 窓の上の壁：前の階の雨だれの続き（上の窓からは遠いので薄く）
    below = sillY + 1.0 - f.y;
  }
  float len = mix(0.35, 0.85, hash12(cid * 1.7 + seed * 3.0)) * (1.0 - wh);
  float fade = clamp(1.0 - below / max(len, 1e-3), 0.0, 1.0);
  float x = abs(f.x - 0.5);
  float end = 0.5 * ww * 0.92;
  float col = exp(-pow((x - end) / 0.035, 2.0)) + 0.55 * exp(-pow((x - end * 0.35) / 0.05, 2.0)) * step(0.5, hash12(cid + seed * 7.0));
  float noise = 0.6 + 0.4 * vnoise(vec2(f.x * 40.0, f.y * 3.0 + seed * 5.0));
  float streak = col * fade * fade * noise;
  // 遠くでは、窓の下が少し暗いだけの平均にする
  return mix(0.12 * (1.0 - wh), streak, detail);
}

// ---- 看板の模様：意味を持たない字の形（3×3 の格子の横画・縦画を乱数で選ぶ） ----
float glyph(vec2 q, float gh, vec2 fwq) {
  float m = 0.0;
  float w = 0.1;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float hb = hash12(vec2(gh * 13.1, fk + 1.3));
    float y = 0.18 + 0.32 * fk;
    float x0 = 0.12 + 0.28 * step(0.66, hb);
    float x1 = 0.88 - 0.28 * step(0.8, fract(hb * 7.0));
    m = max(m, step(0.3, hb) * fband(q.y, y - w * 0.5, y + w * 0.5, fwq.y) * fband(q.x, x0, x1, fwq.x));
    float hv = hash12(vec2(gh * 7.7, fk + 5.1));
    float x = 0.22 + 0.28 * fk;
    float y0 = 0.1 + 0.34 * step(0.7, hv);
    float y1 = 0.92 - 0.34 * step(0.75, fract(hv * 5.0));
    m = max(m, step(0.42, hv) * fband(q.x, x - w * 0.5, x + w * 0.5, fwq.x) * fband(q.y, y0, y1, fwq.y));
  }
  return m;
}

// 看板の地の色（落ち着いた色を中心に、少しの差し色）。r01-city：明るい地（生成り・白・薄い灰）を 4割→5割に増やした
vec3 signBg(float h) {
  return h < 0.2 ? vec3(0.86, 0.83, 0.74) : h < 0.36 ? vec3(0.9, 0.9, 0.88) : h < 0.46 ? vec3(0.7, 0.71, 0.7)
    : h < 0.56 ? vec3(0.1, 0.14, 0.26) : h < 0.65 ? vec3(0.1, 0.22, 0.16) : h < 0.73 ? vec3(0.3, 0.18, 0.1)
    : h < 0.81 ? vec3(0.06, 0.06, 0.07) : h < 0.87 ? vec3(0.45, 0.13, 0.1) : h < 0.93 ? vec3(0.62, 0.48, 0.16) : vec3(0.3, 0.36, 0.42);
}

// 字を左端 x0 から並べる。p は看板の中の位置（m、y は字の行の下端から）、size は字の大きさ、count は字の数
float textRow(vec2 p, float x0, float size, float count, float gseed, vec2 fwp, float detail) {
  float k = floor((p.x - x0) / size);
  vec2 q = vec2((p.x - x0) / size - k, p.y / size);
  float inside = step(0.0, k) * step(k, count - 1.0) * step(0.0, q.y) * step(q.y, 1.0);
  float m = glyph(q, gseed * 17.0 + k, fwp / size) * inside;
  return mix(inside * 0.34, m, detail);
}

/**
 * 1軒の看板（r01-city。メインループの所見「看板の記号が大きく、同じ調子で並ぶ」）。
 * 型は5つ：看板なし・帯いっぱいの看板（左寄せの店名と小さな添え書き）・帯の中の箱看板・壁に直に付けた切り文字・丸い印と店名。
 * 店名の字は帯の高さの 3.4〜5 割（旧：柱間ごとに 0.5〜0.66m の字を2〜6字）。
 * p は店の左端・帯の下端からの位置（m）、shopW は店の幅、bandH は帯の高さ。a は看板が壁を覆う割合
 */
Surf shopSign(vec2 p, float shopW, float bandH, float sid, float seed, vec2 fwUv, vec3 wall, vec3 trim, out float a) {
  float hs = hash12(vec2(sid * 3.1 + 0.7, seed * 57.0));
  float h2 = hash12(vec2(sid * 1.9 + 4.3, seed * 23.0));
  float h3 = hash12(vec2(sid * 0.7 + 8.9, seed * 61.0));
  float h4 = hash12(vec2(sid * 2.3 + 1.1, seed * 7.0));
  vec3 bg = signBg(h2);
  float light = dot(bg, vec3(0.33));
  vec3 ink = light > 0.45 ? (h3 < 0.72 ? vec3(0.09, 0.09, 0.11) : vec3(0.42, 0.13, 0.1)) : (h3 < 0.78 ? vec3(0.92, 0.9, 0.84) : vec3(0.9, 0.76, 0.38));
  float px = max(fwUv.x, fwUv.y);
  float style = hs < 0.14 ? 0.0 : hs < 0.42 ? 1.0 : hs < 0.62 ? 2.0 : hs < 0.8 ? 3.0 : 4.0;
  a = 0.0;
  Surf s = surfNew(bg, 0.45, 0.0);
  if (style < 0.5) return s;
  float x0 = 0.2;
  float x1 = shopW - 0.2;
  float y0 = 0.0;
  float y1 = bandH;
  if (style > 1.5 && style < 2.5) {
    float w = min(shopW - 0.6, max(1.6, shopW * mix(0.45, 0.8, h4)));
    x0 = 0.5 * (shopW - w);
    x1 = x0 + w;
    y0 = 0.1;
    y1 = bandH - 0.08;
  }
  float panel = fband(p.x, x0, x1, fwUv.x) * fband(p.y, y0, y1, fwUv.y);
  float panelH = y1 - y0;
  float size = panelH * mix(0.34, 0.5, h3);
  float maxCount = max(floor((x1 - x0 - 0.5) / size), 1.0);
  float count = clamp(floor(mix(2.0, 5.99, fract(h4 * 5.7))), 1.0, maxCount);
  float det = 1.0 - smoothstep(0.08, 0.25, px / size);
  bool left = style > 0.5 && style < 1.5 && h4 < 0.55;
  float tx = style > 3.5 ? x0 + 0.3 + panelH * 0.8 : left ? x0 + 0.3 : 0.5 * (x0 + x1 - count * size);
  float ty = y0 + 0.5 * (panelH - size);
  float m = textRow(vec2(p.x, p.y - ty), tx, size, count, sid + seed, fwUv, det);
  if (left) {
    // 添え書き：店名の右に、小さな字の行（営業時間や品目のつもり。意味は持たない）
    float ss = size * 0.36;
    float sx0 = tx + count * size + 0.45;
    float subCount = min(floor(mix(3.0, 9.0, fract(h2 * 7.1))), floor((x1 - 0.25 - sx0) / ss));
    float sdet = 1.0 - smoothstep(0.08, 0.25, px / ss);
    if (subCount >= 2.0) m = max(m, textRow(vec2(p.x, p.y - (y0 + 0.16)), sx0, ss, subCount, sid * 7.0 + seed + 3.0, fwUv, sdet));
  }
  if (style > 3.5) {
    // 丸い印（意味を持たない二重丸）
    vec2 c = vec2(x0 + 0.3 + panelH * 0.36, y0 + 0.5 * panelH);
    float r = length(p - c);
    float disk = 1.0 - fstep(r - panelH * 0.34, px);
    float ring = fband(r, panelH * 0.18, panelH * 0.25, px);
    m = max(m, clamp(disk - ring, 0.0, 1.0));
  }
  if (style > 2.5 && style < 3.5) {
    // 切り文字：地は壁のまま、字だけ（壁の明るさに逆らう色）
    float wl = dot(wall, vec3(0.33));
    vec3 inkW = h3 > 0.8 ? vec3(0.62, 0.5, 0.26) : wl > 0.3 ? vec3(0.1, 0.1, 0.12) : vec3(0.88, 0.86, 0.8);
    s = surfNew(inkW, 0.4, 0.3);
    s.emissive = inkW * FAC_SIGN_GLOW * 1.4;
    a = m;
    return s;
  }
  vec3 alb = mix(bg, ink, m);
  // 箱看板の縁（細い金属の枠）
  float edge = panel * (1.0 - fband(p.x, x0 + 0.04, x1 - 0.04, fwUv.x) * fband(p.y, y0 + 0.04, y1 - 0.04, fwUv.y));
  alb = mix(alb, trim * 0.6, edge);
  s = surfNew(alb, 0.45, 0.0);
  s.emissive = alb * FAC_SIGN_GLOW * (0.5 + light) * (1.0 - edge);
  a = panel;
  return s;
}

// 店の区切りのビット（buildingGeometry.ts の shopStartBits）：k 番目の店の柱間から新しい店が始まるか。23 番目より先は1柱間ずつ
float shopBit(float bits, float k) { return k >= 23.0 ? 1.0 : mod(floor(bits / exp2(k)), 2.0); }

// ---- 1階の店先 ----
// r01-city：柱間を1〜3つまとめた1軒ごとに、看板（1枚）・店の型（ガラス・入口・シャッター・壁）・店内を決める
Surf shopSurf(vec2 uv, vec2 fwUv, float bayW, float groundH, float seed, vec3 wall, vec3 trim, float detail, float pd, out float winMask) {
  float bay = floor(uv.x / bayW);
  float fx = fract(uv.x / bayW);
  float lx = (fx - 0.5) * bayW;
  // この柱間を含む店：始まりの柱間 s0 と柱間の数 nb（1軒は最大3柱間）
  float bits = floor(vShop + 0.5);
  float s0 = bay;
  if (shopBit(bits, s0) < 0.5) s0 -= 1.0;
  if (s0 > 0.0 && shopBit(bits, s0) < 0.5) s0 -= 1.0;
  s0 = max(s0, 0.0);
  float nb = shopBit(bits, s0 + 1.0) > 0.5 ? 1.0 : shopBit(bits, s0 + 2.0) > 0.5 ? 2.0 : 3.0;
  float inShop = bay - s0;
  float h = hash12(vec2(s0, seed * 77.0));
  float h2 = hash12(vec2(s0 * 1.7 + 3.1, seed * 13.0));
  float h3 = hash12(vec2(s0 * 0.61 + 9.3, seed * 41.0));
  float doorBay = floor(hash12(vec2(s0 * 0.73 + 5.3, seed * 19.0)) * nb);
  winMask = 0.0;
  float y = uv.y;
  float fasciaTop = groundH - 0.2;
  float fasciaBot = groundH - 1.05;
  // 柱（柱間の境目）と、看板の上の帯
  float pillar = 1.0 - spulse(fx, 1.0 - 0.34 / bayW, fwUv.x / bayW);
  Surf base = surfNew(mix(wall * 0.85, trim, 0.35), 0.75, 0.05);
  Surf s = base;
  if (y > fasciaBot && y < fasciaTop + 0.2) {
    // 看板：1軒に1枚。地の色と意味を持たない字。内照で少し光る
    float a;
    Surf sg = shopSign(vec2(uv.x - s0 * bayW, y - fasciaBot), nb * bayW, fasciaTop - fasciaBot, s0, seed, fwUv, wall, trim, a);
    s = surfMix(base, sg, a * fband(y, fasciaBot, fasciaTop, fwUv.y));
  } else if (y <= fasciaBot) {
    // 店の型：0 = ガラスの店先、1 = 入口、2 = シャッター、3 = 壁と小さな扉。複数の柱間の店は、1つの柱間を入口にする
    float type = h3 < 0.6 ? 0.0 : h3 < 0.76 ? 1.0 : h3 < 0.88 ? 2.0 : 3.0;
    if (type < 1.5 && nb > 1.5) type = inShop == doorBay ? 1.0 : 0.0;
    float glassTop = fasciaBot - 0.15;
    if (type < 1.5) {
      // ガラスの店先（type 0：腰の板の上にガラス）と入口（type 1：床までのガラスに両開きの扉）。どちらもガラス越しに店内（1軒で同じ店内）。
      // r01-city：入口は以前、ガラスの平均の色で塗った平らな板だった（遠目に灰色の板が並んだ）ので、店先と同じく奥の店内まで描く
      float entrance = step(0.5, type);
      float kick = mix(0.38, 0.04, entrance);
      vec2 hs = vec2(0.5 * bayW - 0.2, 0.5 * (glassTop - kick));
      vec2 lp = vec2(lx, y - 0.5 * (glassTop + kick));
      float cover = fband(y, kick, glassTop, fwUv.y) * (1.0 - pillar);
      Room rm = makeRoom(vec2(s0, 3.0), seed, 2.0);
      Surf g = windowAvg(trim, vec3(0.3, 0.35, 0.36), h, h2, detail, 2.0, 2.0);
      if (pd > 0.001) {
        vec3 r = -fV;
        r.z = min(r.z, -0.03);
        float id;
        vec3 n;
        vec3 hh = recessTrace(clamp(lp, -hs + 0.002, hs - 0.002), r, hs, 0.22, id, n);
        Surf near = revealSurf(hh, n, id, hs, 0.22, trim);
        if (id < 0.5) {
          near = glassSurf(hh.xy, max(fwidth(hh.xy), vec2(1e-4)), r, hs, vec2(0.0), hs, 0.22, vec2(bayW, groundH - 0.6), 0.5 * (groundH - 0.6) - 0.5 * (glassTop + kick), rm, trim, vec3(0.3, 0.35, 0.36), 2.0, 0.0);
        }
        g = surfMix(g, near, pd);
      }
      if (entrance > 0.5) {
        // 扉の枠：両端と召し合わせの縦枠、欄間の横枠、押し棒
        float fr = fband(abs(lx), 0.9, 1.0, fwUv.x) * step(y, 2.3) + fband(abs(lx), 0.0, 0.035, fwUv.x) * step(y, 2.25);
        fr += fband(y, 2.22, 2.3, fwUv.y) * step(abs(lx), 1.0) + fband(y, 0.98, 1.04, fwUv.y) * fband(abs(lx), 0.12, 0.7, fwUv.x);
        g = surfMix(g, surfNew(trim * 0.8, 0.4, 0.6), clamp(fr, 0.0, 1.0));
      }
      s = surfMix(base, g, cover);
      winMask = cover;
    } else if (type < 2.5) {
      // 閉まったシャッター（横の筋）
      float sh = fband(y, 0.0, glassTop + 0.1, fwUv.y) * (1.0 - pillar);
      float slats = spulseL(y / 0.1, 0.82, fwUv.y / 0.1);
      Surf sht = surfNew(vec3(0.46, 0.47, 0.46) * (0.84 + 0.16 * slats), 0.55, 0.45);
      s = surfMix(base, sht, sh);
    } else {
      // 壁と小さな扉
      float door = fband(lx, -0.45, 0.45, fwUv.x) * fband(y, 0.0, 2.1, fwUv.y);
      s = surfMix(surfNew(wall * 0.9, 0.85, 0.0), surfNew(trim * 0.7, 0.5, 0.4), door);
    }
  }
  return s;
}

// ---- 外壁の本体 ----
Surf wallSurface() {
  vec2 uv = vFacUv;
  vec2 fwUv = max(fwidth(uv), vec2(1e-4));
  float style = vFac2.x;
  vec3 base = srgbToLinear(vFacColor);
  float floorH = vFac.x;
  float bayW = vFac.y;
  float winW = vFac.z;
  float winH = vFac.w;
  float seed = vFac2.y;
  float groundH = vFac2.z;
  float roofV = vFac2.w;
  float wallTop = vFac3.x;
  float faceSeed = vFac3.y;
  float depthR = vFac3.z * (0.85 + 0.3 * fract(seed * 13.7));
  float traffic = vFac3.w;
  vec3 trim = srgbToLinear(vTrim);
  vec3 glass = srgbToLinear(vGlass);

  vec2 cell = vec2(uv.x / bayW, (uv.y - groundH) / floorH);
  vec2 fwc = max(fwUv / vec2(bayW, floorH), vec2(1e-4));
  float px = max(fwc.x, fwc.y);
  // detail：窓ごとの描き分け（窓が約4画素より大きい所）。pd：視差と部屋（窓が約16画素より大きい所）
  float detail = 1.0 - smoothstep(0.25, 0.8, px);
  // r01-city：film-pan で、窓が 7〜10 画素の遠いビルの窓の中（部屋の縁・開口の側面の細い帯）が1コマごとに明滅した
  // （コマの3割以上で明るさの向きが反転する画素：左の塔 3→1064、ガラスの塔 160→5327）。視差を描く大きさを
  // 窓が約16画素→約33画素より大きい所に上げ（0.06〜0.2 → 0.03〜0.09）、それより小さい窓は平均の見た目にする
  float pd = 1.0 - smoothstep(0.03, 0.09, px);
  vec2 cid = floor(cell);
  vec2 f = fract(cell);
  float rnd = hash12(cid + vec2(seed * 173.0, faceSeed * 41.0));
  float rnd2 = hash12(cid.yx * 1.37 + vec2(seed * 59.0 + 3.1, faceSeed * 11.0));
  // 窓を描く高さの範囲：通常階の始まりから、屋上の少し下まで
  float floors = fband(uv.y, groundH, roofV - 0.5, fwUv.y);

  vec3 wall = wallMaterial(base, uv, style, seed, fwUv, wallTop, traffic);
  Surf s = surfNew(wall, 0.85, 0.0);
  float winMask = 0.0;
  float kind = (style == FS_SIDING || style == FS_BALCONY) ? 1.0 : 0.0;
  // r03-fx：窓の形（幅・高さの割合、区画の中の窓の中心の高さ）。壊れ方の側が、燃えた窓の上に煤の筋を描くのに使う
  vec3 winGeom = vec3(winW, winH, 0.5);

  if (style == FS_CURTAIN) {
    // カーテンウォール：全面ガラス、方立て（縦の枠）、階の帯（腰壁）。ガラスは反射膜付きで、奥に事務所が薄く透ける
    float pane = spulse(cell.x, 1.0 - 0.06 / bayW, fwc.x);
    float vision = spulse(cell.y - 0.5 * (1.0 - winH), winH, fwc.y);
    float slab = spulse(cell.y, 1.0 - 0.1 / floorH, fwc.y);
    float glassA = pane * vision * slab * floors;
    float spandrel = pane * (1.0 - vision) * slab * floors;
    float frameA = floors * (1.0 - pane * slab);
    vec3 tint = mix(base * 1.4, vec3(0.62, 0.66, 0.7), 0.5);
    Surf g = windowAvg(trim, tint, rnd, rnd2, detail, 0.0, 1.0);
    if (pd > 0.001) {
      vec2 hs = vec2(0.5 * (bayW - 0.06), 0.5 * winH * floorH);
      // ガラスは各階の上の方（1-winH〜1）、腰壁は下の方にある
      vec2 lp = vec2((f.x - 0.5) * bayW, (f.y - 1.0 + 0.5 * winH) * floorH);
      Room rm = makeRoom(cid, seed, 0.0);
      rm.blindY = mix(rm.blindY, 1.2, 0.6);
      Surf near = windowSurf(lp, hs, max(depthR, 0.06), vec2(bayW, floorH), (0.5 * winH - 0.5) * floorH, rm, trim * 0.7, trim, tint, 1.0, 0.0);
      g = surfMix(g, near, pd);
    }
    // 板ガラスの歪み：板ごとに少しふくらんだ面にして、映り込みを板の中で滑らかに曲げる。
    // r01-city：採点「ガラスの塔の映り込みが染みのようなまだら」。板ごとの傾きの乱数（横 0.035・縦 0.02）で、
    // 映り込みの地平線が板ごとに上下して市松のまだらになっていた。ふくらみ 0.005 と、ごく小さな傾き（横 0.006・縦 0.004）に替えた
    // （ふくらみ 0.014 では、映り込みの建物の縁が板ごとに暗い縦縞になり、横へ流すとちらついた＝film-pan で測った）
    vec2 pq = vec2(f.x - 0.5, (f.y - 1.0 + 0.5 * winH) / max(winH, 0.05)) * 2.0;
    float bow = 0.005 * detail;
    float tilt = (hash12(cid * 1.7 + seed * 91.0) - 0.5) * detail;
    g.nOffset += fT * (pq.x * bow + tilt * 0.006) + vec3(0.0, pq.y * bow * 0.6 + (rnd - 0.5) * 0.004 * detail, 0.0);
    Surf sp = surfNew(tint * 0.7, 0.22, 0.8);
    Surf fr = surfNew(trim, 0.35, 0.8);
    s = surfMix(s, g, glassA);
    s = surfMix(s, sp, spandrel);
    s = surfMix(s, fr, frameA);
    winMask = glassA + spandrel * 0.3;
    winGeom = vec3(1.0 - 0.06 / bayW, winH, 1.0 - 0.5 * winH);
  } else if (style == FS_BALCONY) {
    // 集合住宅：床の縁・手すりの板・奥まった掃き出し窓（バルコニーの奥行き）・隣との仕切り・室外機
    float ly = uv.y - groundH;
    float fy = ly / floorH;
    float fw = fwc.y;
    float slabEdge = spulseL(fy, 0.22 / floorH, fw);
    float rail = spulseL(fy - 0.22 / floorH, 0.95 / floorH, fw);
    float divider = 1.0 - spulse(cell.x, 1.0 - 0.2 / bayW, fwc.x);
    float recess = max(1.0 - slabEdge - rail - divider, 0.0);
    vec3 railCol = mix(base, vec3(0.86, 0.87, 0.88), 0.45) * (0.92 + 0.12 * rnd * detail);
    Surf edge = surfNew(base * 1.05, 0.8, 0.0);
    Surf railS = surfNew(railCol, 0.6, 0.1);
    // 奥：遠くでは平均（暗い奥と窓の平均）、近くでは視差で奥の壁・窓・天井・仕切り・床を描く
    Surf deep = windowAvg(trim, glass, rnd, rnd2, detail, 1.0, 3.0);
    deep = surfMix(surfNew(base * 0.55, 0.85, 0.0), deep, winW);
    deep.ao = 0.62;
    if (pd > 0.001) {
      vec2 hs = vec2(0.5 * (bayW - 0.2), 0.5 * (floorH - 0.22));
      vec2 lp = vec2((f.x - 0.5) * bayW, (fract(fy) - 0.5) * floorH - 0.11);
      vec3 r = -fV;
      r.z = min(r.z, -0.03);
      float id;
      vec3 n;
      float dB = max(depthR, 0.8);
      vec3 h = recessTrace(clamp(lp, -hs + 0.002, hs - 0.002), r, hs, dB, id, n);
      Surf near;
      if (id < 0.5) {
        // 奥の壁：掃き出し窓（床から 2.0m）と室外機
        float floorY = -hs.y;
        vec2 cB = vec2(-0.1 * (fract(seed * 7.0) - 0.5), floorY + 1.0);
        vec2 hsB = vec2(0.5 * winW * bayW, 1.0);
        float inDoor = fband(h.x, cB.x - hsB.x, cB.x + hsB.x, 0.01) * fband(h.y, floorY, floorY + 2.0, 0.01);
        Room rm = makeRoom(cid, seed, 1.0);
        vec2 fwg = max(fwidth(h.xy), vec2(1e-4));
        Surf door = glassSurf(h.xy, fwg, r, hs, cB, hsB, dB, vec2(bayW, floorH), floorY + 0.5 * floorH - 0.12, rm, trim, glass, 3.0, 0.0);
        Surf wallB = surfNew(base * 0.95, 0.85, 0.0);
        wallB.direct = apertureVis(h + n * 0.02, vec2(0.0), hs, 0.0, 0.02);
        wallB.ao = 0.6;
        near = surfMix(wallB, door, inDoor);
        // 室外機（床の上、片側）
        float side = step(0.5, hash12(cid + seed * 3.3)) * 2.0 - 1.0;
        float acx = h.x * side - (hs.x - 0.55);
        float ac = step(abs(acx), 0.4) * step(h.y, floorY + 0.62) * step(0.35, rnd2);
        float fan = step(length(vec2(acx + 0.08, h.y - floorY - 0.31)), 0.2);
        Surf acS = surfNew(vec3(0.8, 0.8, 0.78) * (1.0 - 0.45 * fan), 0.6, 0.1);
        acS.direct = wallB.direct;
        acS.ao = 0.7;
        near = surfMix(near, acS, ac);
      } else if (id > 1.5 && id < 2.5) {
        // 上の階の床の裏（バルコニーの天井）
        near = surfNew(base * 1.02, 0.85, 0.0);
        near.nOffset = facWorld(n) - fN;
        near.direct = 0.0;
        near.ao = 0.55;
      } else {
        near = revealSurf(h, n, id, hs, dB, base * (id > 2.5 ? 0.6 : 1.0));
      }
      deep = surfMix(deep, near, pd);
    }
    s = surfMix(surfNew(base * 0.95, 0.85, 0.0), edge, slabEdge);
    s = surfMix(s, railS, rail);
    s = surfMix(s, deep, recess);
    // 手すりの上端（笠木）の明るい線
    float cap = spulseL(fy - 1.13 / floorH, 0.05 / floorH, fw);
    s.albedo = mix(s.albedo, vec3(0.8, 0.8, 0.78), cap * 0.6);
    s = surfMix(surfNew(wall, 0.85, 0.0), s, floors);
    winMask = recess * floors * winW;
    winGeom = vec3(winW, 0.68, 0.62);
  } else if (style == FS_CORRUGATED) {
    // 波板の倉庫：縦の波、上部の明かり取り、下の大きなシャッター
    float corr = uv.x / 0.19;
    float corrFade = 1.0 - smoothstep(0.3, 0.9, fwUv.x / 0.19);
    float wave = sin(corr * 6.2831853);
    s.nOffset = fT * wave * 0.28 * corrFade;
    s.albedo = base * (0.92 + 0.08 * wave * corrFade) * (0.9 + 0.2 * fbm2(uv * vec2(0.08, 0.35), 3));
    s.albedo *= 1.0 - FAC_TOP_STREAK * smoothstep(wallTop - 3.0, wallTop, uv.y) * 0.8;
    s.albedo *= 1.0 - FAC_BASE_GRIME * (1.0 - smoothstep(0.0, 1.6, uv.y)) * (0.6 + 0.4 * fbm2(vFacPos.xz * 0.5, 2));
    s.rough = 0.55;
    s.metal = 0.35;
    float high = fband(uv.y, roofV - 2.4, roofV - 1.2, fwUv.y) * spulse(cell.x, winW, fwc.x);
    Surf hw = windowAvg(trim, glass, rnd, rnd2, detail, 0.0, 0.0);
    s = surfMix(s, hw, high);
    winMask = high;
    winGeom = vec3(-1.0);
    float shutterW = spulse(cell.x, 0.62, fwc.x);
    float shutterH = fband(uv.y, 0.0, groundH, fwUv.y);
    float slats = spulseL(uv.y / 0.12, 0.8, fwUv.y / 0.12);
    Surf sht = surfNew(vec3(0.42, 0.43, 0.42) * (0.85 + 0.15 * slats), 0.5, 0.5);
    s = surfMix(s, sht, shutterW * shutterH);
    float band = fband(uv.y, groundH + 0.4, groundH + 1.0, fwUv.y);
    s.albedo = mix(s.albedo, trim, band);
  } else {
    // 窓の穴（punched / ribbon / siding / stone）：壁の厚みぶん奥にある開口
    float ww = winW;
    float wh = winH;
    float present = 1.0;
    if (style == FS_SIDING) {
      // 住宅：柱間の一部には窓がない。遠くでは平均の割合にする
      present = mix(0.7, step(0.3, hash12(cid + seed * 13.0)), detail);
      float lap = 1.0 - spulseL(uv.y / 0.21, 0.88, fwUv.y / 0.21);
      s.albedo *= 1.0 - 0.16 * lap;
      // 軒の下の暗がり
      s.ao *= mix(0.55, 1.0, smoothstep(0.0, 0.9, roofV - uv.y));
    }
    float mx = spulse(cell.x, ww, fwc.x);
    float my = spulse(cell.y, wh, fwc.y);
    float win = mx * my * floors * present;
    // 窓の下の雨だれと、窓台（外に少し出た明るい石）と、その下に落ちる細い影
    float streak = rainStreaks(f, cid, ww, wh, floorH, seed, detail) * floors;
    s.albedo *= 1.0 - FAC_RAIN_STREAK * streak;
    float sillY = 0.5 - 0.5 * wh;
    float sillA = spulse(cell.x, ww + 0.14 / bayW, fwc.x) * fband(f.y, sillY - 0.07 / floorH, sillY, fwc.y) * floors * present;
    float sillShadow = spulse(cell.x, ww + 0.14 / bayW, fwc.x) * fband(f.y, sillY - 0.16 / floorH, sillY - 0.07 / floorH, fwc.y) * floors * present;
    s.albedo = mix(s.albedo, mix(wall, vec3(0.84, 0.83, 0.8), 0.55), sillA);
    s.albedo *= 1.0 - 0.35 * sillShadow * clamp(fL.y * 4.0, 0.0, 1.0);
    // 階の帯（床の位置の細い線）
    float slabLine = spulseL(cell.y + 0.5 * 0.06 / floorH, 0.06 / floorH, fwc.y) * floors;
    s.albedo *= 1.0 - 0.1 * slabLine;
    // 窓：遠くは平均の見た目、近くは視差で開口の奥と部屋
    float mode = 0.0;
    Surf w = windowAvg(trim, glass, rnd, rnd2, detail, kind, mode);
    if (pd > 0.001 && win > 0.0) {
      vec2 hs = vec2(0.5 * ww * bayW, 0.5 * wh * floorH);
      vec2 lp = vec2((f.x - 0.5) * bayW, (f.y - 0.5) * floorH);
      Room rm = makeRoom(cid, seed + faceSeed * 3.1, kind);
      float sash = step(0.62, fract(seed * 5.3));
      Surf near = windowSurf(lp, hs, max(depthR, 0.04), vec2(bayW, floorH), 0.0, rm, wall, trim, glass, mode, sash);
      w = surfMix(w, near, pd);
    }
    s = surfMix(s, w, win);
    winMask = win;
  }

  // ---- 1階の店先（groundH が大きい建物だけ） ----
  if (groundH > 2.5 && style != FS_CORRUGATED && style != FS_BALCONY) {
    float shop = 1.0 - fstep(uv.y - groundH, fwUv.y);
    float shopWin;
    Surf sh = shopSurf(uv, fwUv, bayW * max(1.0, floor(3.6 / bayW + 0.5)), groundH, seed, wall, trim, detail, pd, shopWin);
    s = surfMix(s, sh, shop);
    winMask = mix(winMask, shopWin, shop);
  }

  // 笠木（壁の上端の帯）
  float coping = fband(uv.y, wallTop - 0.22, wallTop + 1.0, fwUv.y);
  s.albedo = mix(s.albedo, trim * 0.9, coping);
  s.rough = mix(s.rough, 0.7, coping);
  s.metal = mix(s.metal, 0.2, coping);

  gDmgWall = 1.0;
  gDmgWin = winMask;
  gDmgCell = cid;
  gDmgUv = uv;
  gDmgFw = fwUv;
  gDmgDetail = detail;
  gDmgSeed = seed;
  gDmgWinGeom = vec4(winGeom, groundH);
  gDmgCellM = vec2(bayW, floorH);
  return s;
}

// ---- 屋根・屋上・小物・ひさし・袖看板 ----
Surf flatSurface(float style, vec3 base) {
  vec2 p = vFacUv;
  vec2 fwp = max(fwidth(p), vec2(1e-4));
  if (style == SS_ROOFFLAT) {
    float n = fbm2(p * 0.16, 4);
    float seams = 1.0 - spulse(p.x / 1.9, 1.0 - 0.03 / 1.9, fwp.x / 1.9) * spulse(p.y / 1.9, 1.0 - 0.03 / 1.9, fwp.y / 1.9);
    float stain = smoothstep(0.62, 0.8, fbm2(p * 0.05 + 7.0, 3));
    Surf s = surfNew(base * (0.82 + 0.3 * n) * (1.0 - 0.12 * seams) * (1.0 - 0.25 * stain), 0.9, 0.0);
    // 緊急離着陸場の印（高い塔の屋上）：vFac.x = 1 のとき、中心 vFac.zw に円と「H」
    if (vFac.x > 0.5) {
      vec2 q = p - vFac.zw;
      float rr = length(q);
      float ring = fband(rr, 6.2, 6.7, fwp.x);
      vec2 a = abs(q);
      float hbar = fband(a.x, 1.35, 1.95, fwp.x) * step(a.y, 2.6) + fband(a.y, -0.3, 0.3, fwp.y) * step(a.x, 1.6);
      float mark = clamp(ring + hbar, 0.0, 1.0);
      float pad = 1.0 - fstep(rr - 7.6, fwp.x);
      s.albedo = mix(s.albedo, vec3(0.2, 0.36, 0.26) * (0.9 + 0.2 * n), pad * 0.85);
      s.albedo = mix(s.albedo, vec3(0.86, 0.85, 0.8), mark * pad);
    }
    return s;
  }
  if (style == SS_BROKEN) {
    // r03-fx：割れた床（崩れる建物の割れ目）。荒いコンクリートのむら・深いひび・折れて出た鉄筋の筋・端ほど暗い
    float n = fbm2(p * 0.55, 3);
    float cracks = smoothstep(0.6, 0.68, vnoise(p * 0.8 + 3.1)) * (1.0 - smoothstep(0.68, 0.78, vnoise(p * 0.8 + 3.1)));
    float rebar = max(spulseL(p.x / 0.6, 0.06, fwp.x / 0.6), spulseL(p.y / 0.6, 0.06, fwp.y / 0.6)) * step(0.55, vnoise(p * 0.35 + 9.0));
    vec3 c = base * (0.55 + 0.7 * n) * (1.0 - 0.6 * cracks);
    c = mix(c, vec3(0.16, 0.09, 0.05), rebar * 0.8);
    return surfNew(c, 0.97, 0.25 * rebar);
  }
  if (style == SS_ROOFTILE) {
    // 瓦：斜面に沿って段、棟に沿って波
    float rowCoord = p.y / 0.28;
    float rowW = fwp.y / 0.28;
    float ramp = mix(0.5, fract(rowCoord), 1.0 - smoothstep(0.4, 1.0, rowW));
    float waveW = fwp.x / 0.3;
    float waveFade = 1.0 - smoothstep(0.3, 0.9, waveW);
    float wave = sin(p.x / 0.3 * 6.2831853);
    float n = fbm2(p * 0.4, 3);
    Surf s = surfNew(base * (0.78 + 0.35 * ramp) * (0.92 + 0.16 * n) * (1.0 - 0.12 * wave * waveFade), 0.42 + 0.2 * n, 0.0);
    vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), vFacNormal) + vec3(1e-4, 0.0, 0.0));
    s.nOffset = t * wave * 0.22 * waveFade;
    return s;
  }
  if (style == SS_ROOFMETAL) {
    // 金属の折板：立はぜの線
    float seam = spulseL(p.x / 0.45, 0.08, fwp.x / 0.45);
    float n = fbm2(p * 0.3, 3);
    return surfNew(base * (0.9 + 0.12 * n) * (1.0 + 0.25 * seam), 0.38 + 0.2 * n, 0.55);
  }
  if (style == SS_AWNING) {
    // ひさしの布：斜面に沿った縞（色の組は頂点の色と縁の色）、端の垂れ
    float stripe = spulse(p.x / 0.62, 0.5, fwp.x / 0.62) * vFac.y;
    vec3 c = mix(base, mix(base, vec3(0.86, 0.84, 0.78), 0.75), stripe);
    float n = fbm2(p * vec2(0.8, 2.0), 2);
    Surf s = surfNew(c * (0.9 + 0.12 * n), 0.8, 0.0);
    return s;
  }
  if (style == SS_SIGN) {
    // 袖看板・屋上の看板：地の色と、意味を持たない字（縦に並ぶ）。内照で少し光る
    float h = vFac.z;
    vec3 bg = signBg(h);
    float light = dot(bg, vec3(0.33));
    vec3 ink = light > 0.45 ? vec3(0.08, 0.08, 0.1) : vec3(0.92, 0.9, 0.84);
    float w = vFac.x;
    float hgt = vFac.y;
    float size = min(w * 0.72, 0.9);
    float count = max(1.0, floor((hgt - 0.3) / size));
    float detail = 1.0 - smoothstep(0.08, 0.3, max(fwp.x, fwp.y) / size);
    // 縦書き：字を上から下へ
    float k = floor((hgt - 0.15 - p.y) / size);
    vec2 q = vec2((p.x - 0.5 * (w - size)) / size, fract((hgt - 0.15 - p.y) / size));
    q.y = 1.0 - q.y;
    float inside = step(0.0, k) * step(k, count - 1.0) * step(0.0, q.x) * step(q.x, 1.0);
    float m = mix(inside * 0.34, glyph(q, h * 31.0 + k, fwp / size) * inside, detail);
    vec3 alb = mix(bg, ink, m);
    // 縁取りの枠
    float border = 1.0 - fband(p.x, 0.06, w - 0.06, fwp.x) * fband(p.y, 0.06, hgt - 0.06, fwp.y);
    alb = mix(alb, vec3(0.2, 0.2, 0.21), border);
    Surf s = surfNew(alb, 0.45, 0.0);
    s.emissive = alb * FAC_SIGN_GLOW * (0.6 + light) * (1.0 - border);
    return s;
  }
  return surfNew(base, vFac.x, vFac.y);
}

Surf buildingSurfaceBase() {
  facadeFrame();
  float style = vFac2.x;
  vec3 base = srgbToLinear(vFacColor);
  if (style >= SS_ROOFFLAT) {
    if (style == SS_PLAIN) return surfNew(base, vFac.x, vFac.y);
    return flatSurface(style, base);
  }
  return wallSurface();
}

// 最後に壊れ方を重ねる（dmgApplySurface は必ず最後。r00b の申し送り）
Surf buildingSurface() {
  dmgOccluderDiscard();
  Surf s = buildingSurfaceBase();
  dmgApplySurface(s.albedo, s.rough, s.metal, s.emissive);
  // 割れた窓・剥がれ・すすの所では、部屋の日だまりと開口の影を消す（dmgApplySurface が gDmgKeep に残す）
  s.sunEmit *= gDmgKeep;
  s.direct = mix(1.0, s.direct, gDmgKeep);
  return s;
}
`;
