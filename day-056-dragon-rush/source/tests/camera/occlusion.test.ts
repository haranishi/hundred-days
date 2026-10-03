// OWNER: tests
// r05-camera：網点の範囲（画面の上で体の外接矩形と照準の円だけを透かす。縁はなだらか）。体験の採点の TOP5「網点を体のすぐ周りに絞る」。
import { Bone, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { OcclusionRegion, SIL_BOX_TEXEL, SIL_MAX_SEGS, SIL_TEXELS, capsuleDistance, occlusionMask, type ScreenBox } from '../../src/camera/occlusionRegion';
import { DAMAGE_FRAGMENT_PARS, DAMAGE_VERTEX_POSITION } from '../../src/city/damageGlsl';
import { DamageTexture } from '../../src/city/damageTexture';
import { CITY_CONFIG } from '../../src/config/city';
import { CAMERA_OCCLUSION as O } from '../../src/config/camera';
import { generateCity } from '../../src/world/city';

const aspect = 16 / 9;

describe('網点の範囲の式', () => {
  const box: ScreenBox = { cx: -0.2, cy: -0.4, hx: 0.15, hy: 0.2, valid: true };
  it('体の外接矩形の中と照準の円の中は 1、離れると 0、間はなだらか', () => {
    expect(occlusionMask(-0.2, -0.4, box, aspect)).toBe(1);
    expect(occlusionMask(-0.3, -0.25, box, aspect)).toBe(1);
    expect(occlusionMask(0, 0, box, aspect)).toBe(1);
    expect(occlusionMask(0.05, 0.1, box, aspect)).toBe(1);
    expect(occlusionMask(0.8, 0.7, box, aspect)).toBe(0);
    expect(occlusionMask(-0.9, 0.8, box, aspect)).toBe(0);
    // 照準の円の縁から外へ：単調に下がる
    let prev = 1;
    for (let r = O.aimRadius; r < O.aimRadius + O.soft + 0.02; r += 0.01) {
      const m = occlusionMask(0, r, { ...box, cy: -0.9 }, aspect);
      expect(m).toBeLessThanOrEqual(prev + 1e-12);
      prev = m;
    }
    expect(prev).toBe(0);
    const half = occlusionMask(0, O.aimRadius + O.soft / 2, { ...box, cy: -0.9 }, aspect);
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
  });

  it('範囲を使わないとき（valid が false）は、今までどおり建物ごと 1', () => {
    expect(occlusionMask(0.9, 0.9, { ...box, valid: false }, aspect)).toBe(1);
  });

  it('範囲の面積は、上限いっぱいでも画面の3割未満（照準の円と縁の少しでも間引く所を足しても）', () => {
    const big: ScreenBox = { cx: 0, cy: -0.3, hx: O.maxHalfX, hy: O.maxHalfY, valid: true };
    let on = 0;
    let n = 0;
    for (let x = -1; x <= 1; x += 0.01) {
      for (let y = -1; y <= 1; y += 0.01) {
        n++;
        if (occlusionMask(x, y, big, aspect) > 0) on++;
      }
    }
    expect(on / n).toBeLessThan(0.3);
  });

  it('外壁のシェーダーは同じ形の範囲で間引き、範囲には遊ぶカメラの画面の座標を使う（奥行きでは切らない）', () => {
    expect(DAMAGE_FRAGMENT_PARS).toContain('float dmgOccluderMask()');
    expect(DAMAGE_FRAGMENT_PARS).toContain('uOccBox');
    expect(DAMAGE_FRAGMENT_PARS).toContain('occ * 0.82 * m');
    expect(DAMAGE_VERTEX_POSITION).toContain('uOccViewProj');
  });
});

describe('網点の範囲の求め方（骨を画面に写す）', () => {
  it('骨の外接矩形を体の厚みだけ広げ、上限で抑える。前に骨が無ければ使わない', () => {
    const cam = new PerspectiveCamera(58, aspect, 0.5, 32000);
    cam.position.set(0, 30, 100);
    cam.lookAt(0, 10, 0);
    cam.updateMatrixWorld(true);
    const region = new OcclusionRegion() as unknown as { points: Vector3[]; project(c: PerspectiveCamera): void; box: ScreenBox };
    region.points = [new Vector3(-20, 5, 0), new Vector3(20, 5, 0), new Vector3(0, 20, 0), new Vector3(0, 0, -25)];
    region.project(cam);
    const b = region.box;
    expect(b.valid).toBe(true);
    for (const p of region.points) {
      const v = p.clone().project(cam);
      expect(Math.abs(v.x - b.cx)).toBeLessThanOrEqual(b.hx);
      expect(Math.abs(v.y - b.cy)).toBeLessThanOrEqual(b.hy);
    }
    // 近すぎて画面を覆う体は、上限で抑える
    region.points = [new Vector3(-80, -40, 60), new Vector3(80, 60, 60)];
    region.project(cam);
    expect(region.box.hx).toBeLessThanOrEqual(O.maxHalfX);
    expect(region.box.hy).toBeLessThanOrEqual(O.maxHalfY);
    // カメラの後ろにしか骨が無い
    region.points = [new Vector3(0, 30, 200)];
    region.project(cam);
    expect(region.box.valid).toBe(false);
  });

  it('壊れ方の表は、遊ぶカメラの行列と範囲を外壁のシェーダーへ渡す（追っていないときは範囲を使わない）', () => {
    const city = generateCity(CITY_CONFIG);
    const dmg = new DamageTexture(city);
    const cam = new PerspectiveCamera(58, aspect, 0.5, 32000);
    cam.position.set(10, 50, 120);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    dmg.setOcclusionRegion(cam, { cx: 0.1, cy: -0.2, hx: 0.3, hy: 0.25, valid: true });
    const u = dmg.uniforms;
    expect(u.uOccAim.value.w).toBe(1);
    expect(u.uOccAim.value.x).toBeCloseTo(aspect, 9);
    expect([u.uOccBox.value.x, u.uOccBox.value.y, u.uOccBox.value.z, u.uOccBox.value.w]).toEqual([0.1, -0.2, 0.3, 0.25]);
    const p = new Vector3(3, 4, 5);
    const a = p.clone().applyMatrix4(u.uOccViewProj.value);
    const b = p.clone().project(cam);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
    dmg.setOcclusionRegion(cam, null);
    expect(u.uOccAim.value.w).toBe(0);
  });
});

describe('r06-camera2：透かし方（壁全体へ広げる・怪獣の形）', () => {
  const box: ScreenBox = { cx: -0.3, cy: -0.5, hx: 0.12, hy: 0.15, valid: true };
  it('広げる度合い spread で、窓の外も spreadFloor × spread まで透かす（窓の中は今までどおり 1）', () => {
    expect(occlusionMask(0.9, 0.8, box, aspect)).toBe(0);
    const far = occlusionMask(0.9, 0.8, box, aspect, O.aimRadius, O.soft, 1);
    expect(far).toBeGreaterThanOrEqual(O.spreadFloor - 1e-9);
    expect(far).toBeLessThan(1);
    expect(occlusionMask(0.9, 0.8, box, aspect, O.aimRadius, O.soft, 0.5)).toBeCloseTo(far * 0.5, 9);
    expect(occlusionMask(-0.3, -0.5, box, aspect, O.aimRadius, O.soft, 1)).toBe(1);
    // 窓に近いほど濃い
    expect(occlusionMask(-0.05, -0.5, box, aspect, O.aimRadius, O.soft, 1)).toBeGreaterThan(far);
  });

  it('怪獣の形：太さのある線の距離（縁で 0、中で負）', () => {
    expect(capsuleDistance(0, 0, -1, 0, 1, 0, 0.2, 0.2)).toBeCloseTo(-0.2, 9);
    expect(capsuleDistance(0, 0.2, -1, 0, 1, 0, 0.2, 0.2)).toBeCloseTo(0, 9);
    expect(capsuleDistance(2, 0, -1, 0, 1, 0, 0.2, 0.4)).toBeCloseTo(1 - 0.4, 9);
    expect(capsuleDistance(0, 0.5, -1, 0, 1, 0, 0.2, 0.4)).toBeCloseTo(0.5 - 0.3, 9);
  });

  it('骨の親子をつないだ線と翼の膜の三角形を、画面の座標で壊れ方の表の最後の行の並びに書く（outline のときだけ）', () => {
    const cam = new PerspectiveCamera(58, aspect, 0.5, 32000);
    cam.position.set(0, 20, 80);
    cam.lookAt(0, 10, 0);
    cam.updateMatrixWorld(true);
    const root = new Bone();
    root.name = 'body';
    const neck = new Bone();
    neck.name = 'neck_01';
    neck.position.set(0, 4, 10);
    const head = new Bone();
    head.name = 'head';
    head.position.set(0, 2, 6);
    root.add(neck);
    neck.add(head);
    const arm = new Bone();
    arm.name = 'wing_arm_L';
    arm.position.set(4, 3, 0);
    const hand = new Bone();
    hand.name = 'wing_hand_L';
    hand.position.set(12, 2, 0);
    const f3 = new Bone();
    f3.name = 'wing_f3b_L';
    f3.position.set(8, 0, -6);
    const f4 = new Bone();
    f4.name = 'wing_f4b_L';
    f4.position.set(4, -2, -8);
    root.add(arm);
    arm.add(hand);
    hand.add(f3);
    hand.add(f4);
    root.updateMatrixWorld(true);
    const region = new OcclusionRegion();
    region.gather(root, 0, 9);
    cam.userData.occlusionStyle = 'outline';
    region.project(cam);
    const s = region.silhouette;
    const segs = s[0];
    const tris = s[1];
    // 親のある骨（首・頭・翼の腕・手・指2本）が線、翼の膜は (腕, 手, f4b の先)・(腕, 手, f3b の先)・(手, f3b の先, f4b の先) の3つ
    expect(segs).toBe(6);
    expect(tris).toBe(3);
    // 頭の骨の画面の点は、形の中（どれかの線の距離が負）
    const p = new Vector3(0, 6, 16).project(cam);
    let best = Infinity;
    for (let i = 0; i < segs; i++) {
      const o = (1 + i * 2) * 4;
      best = Math.min(best, capsuleDistance(p.x * aspect, p.y, s[o], s[o + 1], s[o + 2], s[o + 3], s[o + 4], s[o + 5]));
    }
    expect(best).toBeLessThan(0);
    // 形の外接矩形（シェーダーが遠い画素の計算を省く）：どの線も太さごと、どの三角形も頂点ごと矩形の中に入る
    const ob = SIL_BOX_TEXEL * 4;
    const [bx0, by0, bx1, by1] = [s[ob], s[ob + 1], s[ob + 2], s[ob + 3]];
    expect(bx1).toBeGreaterThan(bx0);
    expect(by1).toBeGreaterThan(by0);
    for (let i = 0; i < segs; i++) {
      const o = (1 + i * 2) * 4;
      for (const [x, y, r] of [[s[o], s[o + 1], s[o + 4]], [s[o + 2], s[o + 3], s[o + 5]]]) {
        expect(x - r).toBeGreaterThanOrEqual(bx0 - 1e-6);
        expect(x + r).toBeLessThanOrEqual(bx1 + 1e-6);
        expect(y - r).toBeGreaterThanOrEqual(by0 - 1e-6);
        expect(y + r).toBeLessThanOrEqual(by1 + 1e-6);
      }
    }
    for (let i = 0; i < tris; i++) {
      const o = (1 + SIL_MAX_SEGS * 2 + i * 2) * 4;
      for (const [x, y] of [[s[o], s[o + 1]], [s[o + 2], s[o + 3]], [s[o + 4], s[o + 5]]]) {
        expect(x).toBeGreaterThanOrEqual(bx0 - 1e-6);
        expect(x).toBeLessThanOrEqual(bx1 + 1e-6);
        expect(y).toBeGreaterThanOrEqual(by0 - 1e-6);
        expect(y).toBeLessThanOrEqual(by1 + 1e-6);
      }
    }
    // window に戻すと形は書かない
    cam.userData.occlusionStyle = 'window';
    region.project(cam);
    expect(region.silhouette[0]).toBe(0);
  });

  it('壊れ方の表は透かし方を uOccAim.w に（窓 1〜2・形 3〜4）、怪獣の形を最後の行に書く', () => {
    const city = generateCity(CITY_CONFIG);
    const dmg = new DamageTexture(city);
    const cam = new PerspectiveCamera(58, aspect, 0.5, 32000);
    cam.updateMatrixWorld(true);
    const sil = new Float32Array(SIL_TEXELS * 4);
    sil[0] = 3;
    sil[1] = 1;
    const box = { cx: 0, cy: 0, hx: 0.2, hy: 0.2, valid: true };
    dmg.setOcclusionRegion(cam, box, { style: 'window', spread: 0.7, silhouette: sil });
    expect(dmg.uniforms.uOccAim.value.w).toBe(1);
    dmg.setOcclusionRegion(cam, box, { style: 'spread', spread: 0.7, silhouette: sil });
    expect(dmg.uniforms.uOccAim.value.w).toBeCloseTo(1.7, 9);
    dmg.setOcclusionRegion(cam, box, { style: 'outlineSpread', spread: 0.25, silhouette: sil });
    expect(dmg.uniforms.uOccAim.value.w).toBeCloseTo(3.25, 9);
    const tex = dmg.texture.image as { width: number; height: number; data: Float32Array };
    const off = (tex.height - 1) * tex.width * 4;
    expect(tex.data[off]).toBe(3);
    expect(tex.data[off + 1]).toBe(1);
    expect(SIL_TEXELS).toBeLessThanOrEqual(tex.width);
    expect(DAMAGE_FRAGMENT_PARS).toContain('occSilhouette');
    expect(DAMAGE_FRAGMENT_PARS).toContain('textureSize(uDmgTex, 0)');
    // 形の外接矩形から遠い画素は、線と三角形の距離を計算しない（外接矩形の4つ組の位置をシェーダーも同じに読む）
    expect(DAMAGE_FRAGMENT_PARS).toContain(`ivec2(${SIL_BOX_TEXEL}, textureSize(uDmgTex, 0).y - 1)`);
    expect(DAMAGE_FRAGMENT_PARS).toMatch(/if \(dBB <= [0-9.]+\) dSil = occSilhouette/);
  });
});
