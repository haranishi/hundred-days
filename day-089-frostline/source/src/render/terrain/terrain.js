// 地形の描画。1種類の格子を、選んだ区画の数だけインスタンスで描く。
// 境目の頂点の寄せ方は cdlod.js の morphXZ と同じ式（試験は JS 側で行う。ここを変えたら必ず両方を直す）。
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, floor, clamp, exp2, sqrt, dot, mix, smoothstep, normalize, saturate, cross, sign, abs, dFdx, dFdy,
  texture, positionGeometry, positionPrevious, positionWorld, cameraPosition, uniform, transformNormalToView, instancedDynamicBufferAttribute, length, varying,
  fwidth, mx_fractal_noise_float, mx_noise_float, mx_worley_noise_vec2,
} from 'three/tsl';
import { buildMinMaxPyramid, createCdlod } from './cdlod.js';
import { terrainLeaf, terrainBaseRange } from '../tiers.js';

const MAX_NODES = 1024;
const MORPH_START = 0.7;

/**
 * 高さの場 h（m）を、法線の傾きとして足す（面の形は変えない）。画面の中の差分から傾きを取るので、雑音を 1 回読むだけで済む。
 * @param {object} n 世界座標の法線  @param {object} p 世界座標の位置  @param {object} h 高さ（m）
 */
function bumpWorld(n, p, h) {
  const dpdx = dFdx(p), dpdy = dFdy(p);
  const dhdx = dFdx(h), dhdy = dFdy(h);
  const r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  const det = dot(dpdx, r1);
  const grad = sign(det).mul(dhdx.mul(r1).add(dhdy.mul(r2)));
  return normalize(abs(det).mul(n).sub(grad));
}

function makeGridGeometry(quads) {
  const n = quads + 1;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const o = (j * n + i) * 3;
    pos[o] = i / quads;
    pos[o + 1] = 0;
    pos[o + 2] = j / quads;
  }
  const idx = new Uint16Array(quads * quads * 6);
  let k = 0;
  for (let j = 0; j < quads; j++) for (let i = 0; i < quads; i++) {
    const a = j * n + i;
    const b = a + 1;
    const c = a + n;
    const d = c + 1;
    // 上向き（+Y）が表になる向き
    idx[k++] = a; idx[k++] = c; idx[k++] = b;
    idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.instanceCount = 0;
  return g;
}

/**
 * @param {{world:object, tier:object, textures:object, heightAt:Function, sunVisAt:Function}} deps
 */
export function createTerrain({ world, tier, textures, heightAt }) {
  const m = world.meta;
  const half = m.size / 2;
  const quads = tier.gridQuads;
  const TERRAIN_LEAF = terrainLeaf(m.size), TERRAIN_BASE_RANGE = terrainBaseRange(TERRAIN_LEAF);
  const levels = Math.round(Math.log2(m.size / TERRAIN_LEAF)) + 1;
  if (!Number.isInteger(Math.log2(m.size / TERRAIN_LEAF)) || !Number.isInteger(TERRAIN_LEAF / m.cell)) throw new Error(`地形の区画を、山の大きさ（${m.size} m・格子 ${m.cell} m）に合わせられません`);
  const lod = createCdlod({ size: m.size, leaf: TERRAIN_LEAF, levels, baseRange: TERRAIN_BASE_RANGE, morphStart: MORPH_START, maxNodes: MAX_NODES });
  const pyramid = buildMinMaxPyramid(world.buffers.height, { grid: m.grid, cell: m.cell, size: m.size, leaf: TERRAIN_LEAF });

  const geometry = makeGridGeometry(quads);
  const nodeData = new Float32Array(MAX_NODES * 4);
  const nodeLevel = new Uint8Array(MAX_NODES);
  const instData = new Float32Array(MAX_NODES * 4);
  const instAttr = new THREE.InstancedBufferAttribute(instData, 4);
  instAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('nodeInfo', instAttr);

  const uCam = uniform(new THREE.Vector3()); // x, z, 対地高度
  const uMicro = uniform(tier.microNormal ? 1 : 0);
  const uDebugLod = uniform(0);

  // ---- 頂点：区画の格子 → 親の格子へ寄せる（2段）→ 高さ ----
  const info = instancedDynamicBufferAttribute(instAttr, 'vec4');
  const morphAxis = (p, d, k) => {
    const idx = floor(p.add(half).div(d).add(0.5));
    const odd = idx.sub(floor(idx.div(2)).mul(2));
    return p.sub(odd.mul(d).mul(k));
  };
  const morphK = (p, range) => {
    const dxz = p.sub(uCam.xy);
    const dist = sqrt(dot(dxz, dxz).add(uCam.z.mul(uCam.z)));
    return saturate(dist.div(range).sub(MORPH_START).div(1 - MORPH_START));
  };
  const terrainXZ = Fn(() => {
    const size = info.z;
    const spacing = size.div(quads);
    const range = float(TERRAIN_BASE_RANGE).mul(exp2(info.w));
    const p0 = info.xy.add(positionGeometry.xz.mul(size));
    const k1 = morphK(p0, range);
    const p1 = vec2(morphAxis(p0.x, spacing, k1), morphAxis(p0.y, spacing, k1)).toVar();
    const k2 = morphK(p1, range.mul(2));
    const s2 = spacing.mul(2);
    return vec2(morphAxis(p1.x, s2, k2), morphAxis(p1.y, s2, k2));
  });

  const material = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
  material.positionNode = Fn((builder) => {
    const xz = terrainXZ().toVar();
    const placed = vec3(xz.x, heightAt(xz), xz.y).toVar();
    // 速度の絵（残像を消す処理・動きのぼかしが使う）のための決まり：three.js は「前のコマの位置」を、計算で動かす前の元の格子の位置とみなす。
    // 地形は小さな格子を計算で山の位置へ動かすので、何もしないと、地形の速度が「山の位置 − 原点近くの格子」という巨大な誤った値になる
    // （カメラが止まっていても 0 にならない）。山は動かないので、前のコマの位置は、いま計算した位置と同じだと教える。
    // three.js 自身も、位置を計算で決める材質（Line2NodeMaterial）で同じことをしている
    if (builder.needsPreviousData()) positionPrevious.assign(placed);
    return placed;
  })();

  // ---- 画素：法線・色・粗さ ----
  const wxz = positionWorld.xz;
  const uvM = wxz.add(half).div(m.size);
  const viewDist = length(positionWorld.sub(cameraPosition));
  const mA = texture(textures.masksA, uvM); // r=雪の深さ, g=新雪, b=氷, a=岩の露出
  const mB = texture(textures.masksB, uvM); // g=凹凸の強さ
  const slopeM = texture(textures.slope, uvM).xy;
  const slopeT = texture(textures.tileSlope, wxz.add(half).div(m.tilePeriod)).xy.mul(mB.g.mul(0.75));
  // 細かな凹凸：風紋（約 4 m）と粒（約 0.6 m）。遠くでは平均へ落として、ちらつきを消す
  const mic1 = texture(textures.micro, wxz.div(4.3));
  const mic2 = texture(textures.micro, wxz.div(0.61).add(vec2(0.37, 0.11)));
  const fade1 = float(1).sub(smoothstep(60, 260, viewDist));
  const fade2 = float(1).sub(smoothstep(8, 45, viewDist));
  // 強さは見た目の調整値。低い太陽では、わずかな傾きの差が明暗になる
  const microSlope = mic1.xy.mul(2).sub(1).mul(0.30).mul(fade1).add(mic2.xy.mul(2).sub(1).mul(0.20).mul(fade2)).mul(uMicro);

  // 岩：露出の値に雑音を足して、境目を不規則にする
  const rockNoise = texture(textures.micro, wxz.div(17.0)).z.sub(0.5);
  // 境目の雑音は小さく（大きいと、岩と雪の境が、細かな斑点に割れた）
  const rock = smoothstep(0.42, 0.62, mA.a.add(rockNoise.mul(0.12)));
  const slope = slopeM.add(slopeT).add(microSlope.mul(float(1).sub(rock.mul(0.85))));
  const nSnow = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
  // ---- 岩の模様は、立体の雑音で作る ----
  // これまでは、平面（XZ）へ貼った細かな絵を使っていた。急な壁では縦に引き伸ばされ、同じ破線が並ぶ壁紙に見えた（2026-11-11 の見比べ）。
  // 立体の雑音は、壁の向きに関係なく同じ細かさになる。縦に長い割れ目は、高さの方向だけ雑音を引き伸ばして作る。
  const P = positionWorld;
  const rockDetail = tier.microNormal ? 1 : 0; // 低い画質の段では、細かな割れ目と粒を省く（雑音の計算が重い）
  // 細かな模様は、1 画素が模様の波より大きくなったら消す（ちらつくため）。決まった距離で消すと、谷の向こうの岩壁（数百 m 先）が、
  // 模様の無い、ぼやけた灰色の面になった（2026-11-11 の見比べ）。画素の大きさで決めれば、画面が細かいほど、遠くまで模様が残る
  const foot = length(fwidth(P));
  const keep = (wave) => float(1).sub(smoothstep(wave * 0.3, wave * 0.95, foot));
  const fadeFacet = keep(11), fadeCleft = keep(4.4), fadeGrain = keep(0.9), fadeFracture = keep(26);
  const rockBig = mx_fractal_noise_float(P.div(58.0), 3, 2.0, 0.5); // 大きなむら（−1〜1）
  const facet = rockDetail ? float(1).sub(mx_noise_float(P.div(vec3(11.0, 17.0, 11.0)).add(vec3(3.1, 0.7, 5.3))).abs().mul(2)) : float(0); // 尾根型：角のある面
  const cleft = rockDetail ? mx_fractal_noise_float(vec3(P.x.div(4.4), P.y.div(44.0), P.z.div(4.4)), 3, 2.1, 0.55) : float(0); // 縦に長い割れ目
  const grain = rockDetail ? mx_noise_float(P.div(0.9)) : float(0); // 粒（近くだけ）
  // 中くらいの距離で見える、縦の大きな割れ目と柱（26 m おき・縦に 2.5 倍長い尾根型）
  const fracture = rockDetail ? float(1).sub(mx_noise_float(vec3(P.x.div(26.0), P.y.div(65.0), P.z.div(26.0)).add(vec3(1.7, 4.1, 8.3))).abs().mul(2)) : float(0);
  // 地層：15° 傾いた層ごとに、明るさが変わる（大きなむらで層をゆがめる）
  const band = P.y.mul(0.966).add(P.x.mul(0.155)).add(P.z.mul(0.207));
  const strata = mx_noise_float(vec3(band.div(7.5), rockBig.mul(0.5), float(0.37)));
  // 凹凸（m）：大きなうねり＋角のある面＋割れ目＋粒。遠くでは、細かいものから消す（ちらつくため）
  // 2026-11-11：大きな割れ目と角のある面を、深くした（2.4 → 4.2 m・1.1 → 1.9 m）。浅いと、日の当たる岩壁が、明暗の無い一枚板に見えた
  // （上空と、谷の向こうからの見比べ。参考画像の岩壁は、柱と溝の明暗がはっきりしている）
  const rockHeight = rockBig.mul(2.2).add(fracture.mul(4.2).mul(fadeFracture)).add(facet.mul(1.9).mul(fadeFacet)).add(cleft.mul(0.42).mul(fadeCleft)).add(grain.mul(0.03).mul(fadeGrain));
  const nRock = bumpWorld(nSnow, P, rockHeight.mul(rock));
  // 岩棚にのる雪：凹凸を足した面が上を向いた所（棚）に、雪が残る。高さの帯で塗ると、壁の端から端まで水平の線になった。
  // 判定には、大きな凹凸（うねりと、角のある面）だけを使う：細かな割れ目まで使うと、茶色の面に白い斑点を撒いた見え方になった（見た目の採点 1 周目）
  // 2026-11-11：急な壁（傾き 40° 以上）では、大きな割れ目の段も棚として数え、しきい値を下げる（棚の雪が増える）。
  // 急な壁の岩は、棚の雪がほとんど無く、茶色い一枚板に見えた。ゆるい所の岩は、これまでどおり（雪に見える岩を増やさない）
  // （急な壁の棚の雪を増やす変更は、やめた：岩肌に、細かな横線のくり返しが出た。見た目の採点 3 周目。
  //   岩壁の雪は、山のデータの側で、溝に沿う雪の筋として入れてある）
  const nShelf = bumpWorld(nSnow, P, rockBig.mul(2.2).add(facet.mul(1.4)).mul(rock));
  const shelfNoise = mx_noise_float(P.div(vec3(31.0, 14.0, 31.0)).add(vec3(7.7, 1.3, 2.9)));
  const shelf = smoothstep(0.8, 0.9, nShelf.y.add(shelfNoise.mul(0.08))).mul(rockDetail ? 1 : 0);
  const rockShown = rock.mul(float(1).sub(shelf.mul(0.9)));
  const nWorld0 = normalize(mix(nSnow, nRock, rockShown));

  const packed = saturate(float(1).sub(mA.g).sub(mA.b));
  const snowColor = vec3(0.86, 0.885, 0.93).mul(packed)
    .add(vec3(0.935, 0.95, 0.975).mul(mA.g))
    .add(vec3(0.70, 0.80, 0.90).mul(mA.b));
  const snowRough = packed.mul(0.80).add(mA.g.mul(0.95)).add(mA.b.mul(0.34));
  // 雪面のむら：風で締まった所はわずかに暗く青い。風紋の谷も少し暗くする（平らな白い板に見せない）
  const patchy = texture(textures.micro, wxz.div(71.0)).z.mul(0.6).add(texture(textures.micro, wxz.div(23.0).add(vec2(0.21, 0.63))).z.mul(0.4));
  const trough = mix(float(1.0), mic1.z.mul(0.5).add(0.5), fade1.mul(0.35).mul(uMicro));
  // 近くの細かなむら（2〜3 m）：風で締まった所と、やわらかい所。速く滑ると足元を流れて、速さの手がかりになる。
  // 凹凸の陰影は、太陽を向いた斜面ではほとんど出ないので、色のむらで補う。遠くでは消す（ちらつくため）
  const speck = texture(textures.micro, wxz.div(2.7).add(vec2(0.13, 0.57))).z.sub(0.5).mul(float(1).sub(smoothstep(6, 70, viewDist))).mul(uMicro);
  // 風が刻んだ筋（風の向き＝北西から南東へ、長さ 9 m・幅 1.4 m ほどの細長い模様）。
  // 時速 88 km でも画面が止まって見えた（採点 2 周目・一様な雪の平面）。近くの雪面に、流れて見える模様が要る。遠くでは消す（しきい値は縞になる）
  const windU = dot(wxz, vec2(0.7071, 0.7071)), windV = dot(wxz, vec2(-0.7071, 0.7071));
  const streak = smoothstep(0.56, 0.8, texture(textures.micro, vec2(windU.div(9.0), windV.div(1.4))).z)
    .mul(float(1).sub(smoothstep(12, 150, viewDist))).mul(uMicro);
  const snowTint = mix(vec3(0.90, 0.935, 1.0), vec3(1.0, 1.0, 1.0), patchy).mul(trough).mul(speck.mul(0.16).add(1))
    .mul(mix(vec3(1, 1, 1), vec3(0.8, 0.85, 0.93), streak));
  // 岩の色：日の当たる暖かい灰茶と、冷たい灰のむら。地層で明るさが変わり、割れ目とくぼみは暗い（参考画像の岩）
  const tone = smoothstep(-0.45, 0.5, rockBig);
  // 地層の明暗は弱く（強いと、遠くの岩壁が、木目のような水平の縞に見えた）
  // 色は灰褐色（参考画像の岩。茶色に寄せすぎると、土の斜面に見えた）
  // 2026-11-11：明るい側を、日の当たる岩の暖かい黄土へ（0.37, 0.33, 0.29 → 0.47, 0.39, 0.3）、暗い側を少し暗く。明暗の幅が狭いと、平らな茶色に見えた
  // （0.47, 0.39, 0.3 まで明るくしたら、近くの岩が、平たいベージュの板に見えた：見た目の採点 3 周目。少し暗く、灰へ戻す）
  const rockBase = mix(vec3(0.165, 0.16, 0.17), vec3(0.4, 0.345, 0.285), tone).mul(mix(float(0.9), float(1.08), smoothstep(-0.5, 0.5, strata)));
  // 割れ目とくぼみ：値の低い所を暗くする。遠くでは平均の明るさへ寄せる（細かな明暗が、ちらつきになるため）
  const crevice = mix(float(0.8), smoothstep(-0.5, 0.1, cleft).mul(0.8).add(0.2), fadeCleft)
    .mul(mix(float(0.9), smoothstep(-1.0, 0.2, facet).mul(0.4).add(0.6), fadeFacet))
    .mul(mix(float(0.85), smoothstep(-0.9, 0.1, fracture).mul(0.6).add(0.4), fadeFracture));
  const rockColor = rockBase.mul(crevice).mul(grain.mul(0.14).mul(fadeGrain).add(1));
  // 確認用：区画の段ごとに色を付ける（?lod=1）。境目の線が区画の境か、材質の継ぎ目かを切り分ける
  const vLevel = varying(info.w);
  const lodTint = vec3(vLevel.mul(0.9).sin().mul(0.5).add(0.5), vLevel.mul(1.7).add(1).sin().mul(0.5).add(0.5), vLevel.mul(2.9).add(2).sin().mul(0.5).add(0.5));
  // ---- 谷と湖のマップで足した面：氷河の青い氷・遠くの森・湖（氷と水） ----
  // 氷河：氷の割合が高い所を、青白い氷として描く。高さに沿った薄い層の縞と、割れ目の暗い筋を足す
  const iceCrack = smoothstep(0.035, 0.0, texture(textures.micro, wxz.div(57.0).add(vec2(0.31, 0.77))).z.sub(0.5).abs());
  // 氷河は、面ぜんたいを青白くする（雪の乗った氷＝値 0.4 前後）。段の正面と割れ目（値 0.9 以上）は、濃い青の氷
  // （色が出るのを段の正面だけにしたら、雪の上の水色の帯にしか見えなかった：見た目の採点 1 周目）
  const bareIce = smoothstep(0.6, 0.9, mA.b);
  const glacier = smoothstep(0.24, 0.38, mA.b).mul(mix(float(0.8), float(1), bareIce)).mul(float(1).sub(rockShown));
  const firn = mix(vec3(0.58, 0.79, 0.93), vec3(0.8, 0.91, 0.97), mx_noise_float(vec3(wxz.x.div(23.0), float(4.4), wxz.y.div(23.0))).mul(0.5).add(0.5));
  // 青い氷（段の正面と割れ目）：氷のかたまり（セラック）に割る。細胞の模様（いちばん近い点と、2 番目に近い点までの距離の差）で、
  // かたまりの境目を濃い青の割れ目に、かたまりの中ほどを白っぽい青にする。
  // 2026-11-11：なめらかな雑音の明暗（9 m のまだら）と、細い曲線の割れ目では、段の正面が、青い絵の具を流したプラスチックに見えた
  // （9 視点の見比べ「氷河の下から」）。参考画像の氷河は、割れた氷のかたまりが積み重なっている
  // かたまりの形をゆがめる（ゆがめないと、大きさのそろった敷石に見えた）。割れ目の太さも、場所で変える
  const warp = vec3(mx_noise_float(P.div(13.0).add(vec3(2.2, 0.4, 9.1))), mx_noise_float(P.div(17.0).add(vec3(5.6, 3.3, 1.2))), mx_noise_float(P.div(13.0).add(vec3(8.8, 7.1, 3.4)))).mul(3.4);
  const Pw = P.add(warp);
  // 2026-11-11（見た目の採点 3 周目の後）：かたまりを、縦に長い柱にした（横 6.5 m・縦 38 m）。縦横が同じ大きさだと、六角形の網目のくり返し
  // （亀甲のタイル）に見えた。参考画像の氷河は、縦に割れた氷の柱が並ぶ。割れ目は、急な面（段の正面）だけに出す
  const serac = rockDetail ? mx_worley_noise_vec2(vec3(Pw.x.div(6.5), Pw.y.div(38.0), Pw.z.div(6.5)).add(vec3(1.3, 6.1, 4.7)), 1.0) : vec2(0.2, 0.5);
  const seam = serac.y.sub(serac.x); // 境目で 0（距離は 2 乗の値）
  const fadeSerac = keep(7.5);
  const gape = mx_noise_float(P.div(21.0).add(vec3(4.4, 2.2, 6.6))).mul(0.5).add(0.5); // 割れ目の開き（0〜1）
  // 細かなひび（3 m）：かたまりの面を、さらに小さく割る。弱く入れる
  const chip = rockDetail ? mx_worley_noise_vec2(vec3(Pw.x.div(2.6), Pw.y.div(9.0), Pw.z.div(2.6)).add(vec3(7.9, 2.4, 0.6)), 1.0) : vec2(0.2, 0.5);
  const chipLine = float(1).sub(smoothstep(0.0, 0.05, chip.y.sub(chip.x))).mul(keep(2.6)).mul(0.3);
  const iceSteep = smoothstep(0.18, 0.5, float(1).sub(nSnow.y)); // 段の正面と割れ目の壁で 1、平らな氷の上で 0
  const crevasse = saturate(float(1).sub(smoothstep(0.0, mix(float(0.02), float(0.13), gape), seam)).mul(fadeSerac).add(chipLine)).mul(iceSteep);
  const blockTone = mix(float(0.55), smoothstep(0.02, 0.4, seam), fadeSerac);
  const iceBlock = mx_noise_float(vec3(wxz.x.div(23.0), positionWorld.y.div(31.0), wxz.y.div(23.0))).mul(0.5).add(0.5); // 大きなむら
  const blueIce = mix(vec3(0.2, 0.5, 0.74), vec3(0.72, 0.9, 0.97), blockTone.mul(0.75).add(iceBlock.mul(0.25)))
    .mul(mix(float(1), float(0.42), crevasse)).mul(mix(float(1), float(0.85), iceCrack));
  // 氷河の上の面（雪の乗った氷）にも、大きな割れ目の筋（流れを横切る向きに長い、26 m おき）を薄く入れる
  const slit = rockDetail ? mx_worley_noise_vec2(vec2(dot(wxz, vec2(0.83, 0.56)).div(11.0), dot(wxz, vec2(-0.56, 0.83)).div(38.0)), 1.0) : vec2(0.2, 0.5);
  const slitLine = float(1).sub(smoothstep(0.0, 0.035, slit.y.sub(slit.x))).mul(keep(11));
  const glacierColor = mix(mix(firn, vec3(0.3, 0.6, 0.82), slitLine.mul(0.6)), blueIce, bareIce);
  // 遠くの森：木を 1 本ずつ描く距離（tier.treeRadius）の外では、木の密度の地図から、暗い緑のまだらを雪面に塗る
  // 模様は計算の雑音で作る（細かな雑音の絵を引き伸ばすと、真上や遠くから見たとき、絵の中の格子が点々の壁紙に見えた）
  const forestClump = mx_fractal_noise_float(vec3(wxz.x.div(46.0), float(2.1), wxz.y.div(46.0)), 3, 2.2, 0.55).mul(0.5).add(0.5); // 木立のかたまり
  const crown = mx_noise_float(vec3(wxz.x.div(5.5), float(0.7), wxz.y.div(5.5))).mul(0.5).add(0.5); // 木 1 本ぶんの明暗
  const crownFade = float(1).sub(smoothstep(900, 4200, viewDist)); // 遠くでは、1 本ぶんの明暗を消す（ちらつくため）
  // 2026-11-11：木そのものは、遠くでも 1 本ずつ描くようにした（far-forest.js）。ここは「森の地面」だけを塗る：
  // 木の影の地図は近くにしか無いので、遠くでは、木の密度に合わせて雪面を影の色（青みの暗い雪と、落ちた枝葉の緑）へ寄せる
  // 輪郭は、細かな雑音で入り組ませて、はっきり切る（ゆるく混ぜると、上空から、灰緑の面に白いぼかしが乗った見え方になった：見た目の採点 1 周目）
  const forestEdge = mx_noise_float(vec3(wxz.x.div(11.0), float(6.6), wxz.y.div(11.0)));
  const forestFar = smoothstep(0.2, 0.3, mB.r.add(forestClump.sub(0.5).mul(0.22)).add(forestEdge.mul(0.07)))
    .mul(smoothstep(240, 600, viewDist)).mul(float(1).sub(rockShown))
    // 濃さは、木の密度に合わせる：濃い森の芯は暗く、まばらな所は、木のあいだの雪が見える
    // （遠く＝上空や谷の向こうからは、木が 1 画素より小さくなり、木そのものの色が出ない。森の面を、木の色でしっかり覆う。
    //   薄く混ぜるだけだと、森が、灰色がかった緑のもやに見えた：2026-11-11 の見比べ）
    .mul(mix(mix(float(0.5), float(0.92), smoothstep(0.3, 0.75, mB.r)), mix(float(0.82), float(0.98), smoothstep(0.25, 0.6, mB.r)), smoothstep(900, 2600, viewDist)));
  // 近くでは、木のあいだの雪が見える（影の青）。遠くでは、木が地面を隠すので、暗い緑へ寄せる
  const forestNear = mix(vec3(0.13, 0.19, 0.27), vec3(0.34, 0.42, 0.52), smoothstep(0.35, 0.8, mix(float(0.5), crown, crownFade).mul(0.6).add(forestClump.mul(0.4))));
  // 遠くでは、木の粒が見えるように、暗い緑に、雪の乗った明るい粒を混ぜる（粒の大きさは 12 m ほど＝木の 1〜2 本ぶん）
  const canopy = mx_noise_float(vec3(wxz.x.div(12.0), float(8.8), wxz.y.div(12.0))).mul(0.5).add(0.5);
  // 明るい粒は、弱く・狭く（広く明るくすると、上空から、森が灰緑の面に見えた：2026-11-11 の見比べ）
  const forestDeep = mix(vec3(0.024, 0.05, 0.038), vec3(0.17, 0.22, 0.22), smoothstep(0.7, 0.95, canopy).mul(float(1).sub(smoothstep(5000, 12000, viewDist))));
  const forestColor = mix(forestNear, forestDeep, smoothstep(700, 2400, viewDist));
  // 湖：絵の値は 0＝陸、1〜199＝氷、200〜255＝水（山のデータの決まり）。境目は画素ごとのしきい値で切る
  // 氷のかたまりの凹凸：かたまりの中ほどが盛り上がり、境目が溝になる（段の正面と割れ目だけ）
  const nIce = bumpWorld(nWorld0, P, smoothstep(0.0, 0.35, seam).mul(1.5).mul(fadeSerac).mul(bareIce).mul(glacier));
  const nWorld = rockDetail ? nIce : nWorld0;
  const lk = m.lake || { x0: 0, z0: 0, size: 1 };
  const lakeUV = wxz.sub(vec2(lk.x0, lk.z0)).div(lk.size);
  const inLake = lakeUV.x.greaterThan(0).and(lakeUV.x.lessThan(1)).and(lakeUV.y.greaterThan(0)).and(lakeUV.y.lessThan(1)).select(float(1), float(0));
  const lakeValue = texture(textures.lake, lakeUV).r.mul(inLake).mul(m.lake ? 1 : 0);
  const lakeWater = smoothstep(0.75, 0.79, lakeValue);
  const lakeIce = smoothstep(0.002, 0.03, lakeValue).mul(float(1).sub(lakeWater));
  // 氷：白い雪の乗った所と、透けた青い氷のまだら。割れ目は、なめらかな雑音の等高線（閉じた曲線になる）で描く
  const floe = mx_fractal_noise_float(vec3(wxz.x.div(120.0), float(5.3), wxz.y.div(120.0)), 3, 2.0, 0.5).mul(0.5).add(0.5);
  // 割れ目：雑音の値がちょうど 0 になる所（閉じた曲線になる）。線の幅は、画素の大きさに合わせて保つ（遠くで消えず、近くで太らない）
  // 氷：絵の値が小さい所は、雪の乗った厚い氷（白）。水に近い薄い氷（値が大きい）は、透けた青緑。
  // 割れ目の線は描かない（灰色の曲線が、滑った跡に見えた：見た目の採点 1 周目）。雪の吹きだまりの、ゆるい明暗だけ足す
  const thin = smoothstep(0.42, 0.72, lakeValue);
  // 2026-11-11：水と薄い氷の色を、深い青緑へ（参考画像の湖）。明るい水色（0.07, 0.46, 0.5）では、日なたで白っぽい水色の面になり、
  // 「水色と白の 2 色」に見えた（見た目の採点 2 周目）。薄い氷は、水より少し明るい青緑で、白い氷とのあいだをつなぐ
  const lakeIceColor = mix(mix(vec3(0.86, 0.9, 0.95), vec3(0.95, 0.97, 0.99), smoothstep(0.3, 0.6, floe)), vec3(0.16, 0.44, 0.5), thin.mul(0.9));
  // 水：岸や氷の近くは青緑、沖は深く暗い（絵の値が大きいほど沖）
  const lakeWaterColor = mix(vec3(0.018, 0.2, 0.235), vec3(0.004, 0.075, 0.105), smoothstep(0.8, 1.0, lakeValue));
  const lakeAny = saturate(lakeIce.add(lakeWater));

  let albedo = mix(snowColor.mul(snowTint), rockColor, rockShown);
  albedo = mix(albedo, glacierColor, glacier);
  albedo = mix(albedo, forestColor, forestFar);
  albedo = mix(mix(albedo, lakeIceColor, lakeIce), lakeWaterColor, lakeWater);
  material.colorNode = mix(albedo, lodTint, uDebugLod.mul(0.6));
  let rough = mix(snowRough, float(0.92), rockShown);
  // 氷のつや：かたまりの中ほどは、ややざらついた白い氷（0.42）。割れ目の中の青い氷は、つやがある（0.2）。一様に 0.22 だと、プラスチックの照りに見えた
  rough = mix(rough, mix(float(0.42), float(0.2), crevasse), glacier.mul(0.8));
  rough = mix(rough, float(0.95), forestFar);
  // 水の面は、鏡にしない（粗さ 0.05 → 0.4）。岸から低い角度で見ると、鏡の水は、地平線の明るい空だけを映して、白っぽい水色の面になった。
  // 映り込み（山や森）は描けないので、さざ波で散った面として、水そのものの青緑を見せる
  rough = mix(mix(rough, mix(float(0.18), float(0.6), smoothstep(0.4, 0.62, floe)), lakeIce), float(0.4), lakeWater);
  material.roughnessNode = rough;
  // 湖の面は平ら（雪の細かな凹凸を乗せない）。水には、ごく小さなさざ波だけ
  const ripple = texture(textures.micro, wxz.div(1.9)).xy.mul(2).sub(1).mul(0.035).mul(lakeWater);
  const nLake = normalize(vec3(ripple.x, 1, ripple.y));
  material.normalNode = transformNormalToView(normalize(mix(nWorld, nLake, lakeAny)));

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // 視錐台の判定は区画ごとに自前で行う
  mesh.castShadow = tier.shadow.terrainCasts;
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const planes = new Float32Array(24);
  const camPos = { x: 0, y: 0, z: 0 };
  const stats = { nodes: 0, hAGL: 0 };
  const selection = { data: nodeData, level: nodeLevel };
  // 影を落とす段では、視界のすぐ外の起伏も影を落とせるよう、選ぶ範囲を少し広げる
  const cullMargin = tier.shadow.terrainCasts ? 40 : 4;

  /** カメラに合わせて区画を選び直す。毎コマ、描画の前に呼ぶ */
  function update(camera, renderer) {
    camera.updateMatrixWorld();
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView, renderer.coordinateSystem, camera.reversedDepth === true);
    for (let i = 0; i < 6; i++) {
      const pl = frustum.planes[i];
      planes[i * 4] = pl.normal.x;
      planes[i * 4 + 1] = pl.normal.y;
      planes[i * 4 + 2] = pl.normal.z;
      planes[i * 4 + 3] = pl.constant + cullMargin;
    }
    camPos.x = camera.position.x;
    camPos.y = camera.position.y;
    camPos.z = camera.position.z;
    const hAGL = Math.max(0, camera.position.y - world.heightAt(camPos.x, camPos.z));
    const n = lod.select(camPos, hAGL, planes, pyramid, selection);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      instData[o] = nodeData[o];
      instData[o + 1] = nodeData[o + 1];
      instData[o + 2] = nodeData[o + 2];
      instData[o + 3] = nodeLevel[i];
    }
    instAttr.needsUpdate = true;
    geometry.instanceCount = n;
    uCam.value.set(camPos.x, camPos.z, hAGL);
    stats.nodes = n;
    stats.hAGL = hAGL;
  }

  return {
    mesh, material, lod, stats, update,
    setMicro(on) { uMicro.value = on ? 1 : 0; },
    setDebugLod(on) { uDebugLod.value = on ? 1 : 0; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
