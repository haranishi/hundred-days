// OWNER: city
// 建物ごとの壊れ方を GPU へ渡す表（浮動小数の RGBA テクスチャ）。1棟7画素：
//   T0 = (ひび, 剥がれ, 窓の割れ, 焦げ)   T1 = (燃え, 傾き[rad], 崩落の進み, 当たった高さ)
//   T2 = (支点 x, 支点 z, 倒れる向き x, 向き z)   T3 = (高さ, 根元の高さ, 燃えている下端, 上端)
//   T4 = (カメラと竜の間にあって透かす度合い, 中心から支点までの距離, 上の塊の階高[m], 詳しい形で描いているか)
//   r03-fx：T5 = (割れ目の軸 x, 軸 z, 割れる高さ, 板の数 + 8 × 上の塊の階数)   T6 = (上の塊の傾き[rad], 潰れの先端, 潰れた階の上端, 沈み)
//   T4.z・T5・T6 は collapsePose.ts が決める（割れて崩れる形。効果の側も同じ関数で粒子の出どころを動かす）。
//   r04-fx2：T4.z を「上の塊の縦の縮み」から「上の塊の階高」に、T5.w を空きから「板の数と階数」にした（上の塊を階ごとの板で潰すため）
// 外壁のシェーダー（damageGlsl.ts）が頂点の建物番号（aBid）でこの表を引き、傾け・沈め・模様を描く。
import { DataTexture, FloatType, Matrix4, NearestFilter, RGBAFormat, Vector4, type PerspectiveCamera } from 'three';
import { CAMERA_OCCLUSION } from '../config/camera';
import type { CityData } from '../world/types';
import { CollapseShapes, collapseHinge, collapsePose, poseZero } from './collapsePose';

export const DAMAGE_TEXELS_PER_BUILDING = 7;

/** 割れて崩れる建物を、詳しい形（階ごとの帯と割れ目の蓋）で描く側（collapseDetail.ts）。 */
export interface DetailProvider {
  /** 壊れ方に合わせて、詳しい形を作る・捨てる */
  update(d: DamageVisualSource): void;
  has(id: number): boolean;
}
const WIDTH = 256;

/** 描画が読む壊れ方の値（gameplay の DamageState がこの形を満たす）。 */
export interface DamageVisualSource {
  crack: ArrayLike<number>;
  peel: ArrayLike<number>;
  glass: ArrayLike<number>;
  char: ArrayLike<number>;
  tilt: ArrayLike<number>;
  collapse: ArrayLike<number>;
  impactY: ArrayLike<number>;
  pivotX: ArrayLike<number>;
  pivotZ: ArrayLike<number>;
  dirX: ArrayLike<number>;
  dirZ: ArrayLike<number>;
  reach: ArrayLike<number>;
  /** r03-fx：割れる高さ（m、傾きに入った建物だけ。0 なら未定） */
  splitY: ArrayLike<number>;
}

/** 描画が読む燃え方の値（gameplay の FireState がこの形を満たす）。 */
export interface FireVisualSource {
  burn: ArrayLike<number>;
  fireLow: ArrayLike<number>;
  fireHigh: ArrayLike<number>;
}

export interface DamageUniforms {
  uDmgTex: { value: DataTexture };
  uDmgTexWidth: { value: number };
  /** 炎のゆらめき用の時刻（秒） */
  uDmgTime: { value: number };
  /**
   * r05-camera：網点の範囲（画面の上）。遊ぶカメラの投影×視点の行列（鏡像を描くときも、遊ぶカメラの画面で範囲を決める）、
   * 体の外接矩形（NDC の中心 xy・半分の大きさ zw）、(縦横比, 照準の円の半径, 縁の幅, 範囲を使うか)
   */
  uOccViewProj: { value: Matrix4 };
  uOccBox: { value: Vector4 };
  uOccAim: { value: Vector4 };
}

/**
 * r05-camera：網点で透かすのに要る値（表と範囲）を、外壁の外の材質（fx/rubble.ts の瓦礫の山）にも渡す口。
 * 遊びの場面の壊れ方の表（DamageTexture）が作られたときに、その uniforms に差し替わる（瓦礫の山は建物番号で同じ表の透かす度合いを引く）。
 * 表が無い所（瓦礫だけのテスト）では、透かさない値のまま。
 */
export const sharedOcclusion: { uniforms: DamageUniforms } = {
  uniforms: {
    uDmgTex: { value: new DataTexture(new Float32Array(4 * DAMAGE_TEXELS_PER_BUILDING), DAMAGE_TEXELS_PER_BUILDING, 1, RGBAFormat, FloatType) },
    uDmgTexWidth: { value: DAMAGE_TEXELS_PER_BUILDING },
    uDmgTime: { value: 0 },
    uOccViewProj: { value: new Matrix4() },
    uOccBox: { value: new Vector4() },
    uOccAim: { value: new Vector4(16 / 9, 0, 1, 0) },
  },
};

/** 網点の範囲（画面の上の体の外接矩形。camera/occlusionRegion.ts の ScreenBox と同じ形）。 */
export interface OcclusionBox {
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  valid: boolean;
}

export class DamageTexture {
  readonly texture: DataTexture;
  readonly uniforms: DamageUniforms;
  /** sync のたびに同じ値を受け取る描画の側（r01-city：通りの人の避難） */
  readonly listeners: ((d: DamageVisualSource, f: FireVisualSource) => void)[] = [];
  private readonly data: Float32Array;
  private readonly count: number;
  private readonly occlusion: Float32Array;
  private readonly pose = poseZero();
  /** r04-fx2：崩れる建物の寸法（上の塊の板・倒れる先の隣） */
  readonly shapes: CollapseShapes;
  private detail: DetailProvider | null = null;
  /** r06-camera2：怪獣の形を書く所（data の添字） */
  private readonly silhouetteOffset: number;

  constructor(private readonly city: CityData) {
    this.shapes = new CollapseShapes(city.buildings);
    this.count = city.buildings.length;
    const texels = this.count * DAMAGE_TEXELS_PER_BUILDING;
    // r06-camera2：最後の1行は網点の怪獣の形（outline。camera/occlusionRegion.ts が作る）。シェーダーは textureSize で最後の行を読む
    const rows = Math.max(1, Math.ceil(texels / WIDTH)) + 1;
    this.silhouetteOffset = (rows - 1) * WIDTH * 4;
    this.data = new Float32Array(WIDTH * rows * 4);
    this.texture = new DataTexture(this.data, WIDTH, rows, RGBAFormat, FloatType);
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.uniforms = {
      uDmgTex: { value: this.texture },
      uDmgTexWidth: { value: WIDTH },
      uDmgTime: { value: 0 },
      uOccViewProj: { value: new Matrix4() },
      uOccBox: { value: new Vector4() },
      uOccAim: { value: new Vector4(16 / 9, CAMERA_OCCLUSION.aimRadius, CAMERA_OCCLUSION.soft, 0) },
    };
    sharedOcclusion.uniforms = this.uniforms;
    this.occlusion = new Float32Array(this.count);
    this.clear();
  }

  /** 無傷の状態（支点は外形の中心、高さと根元だけ入れる）。 */
  clear(): void {
    this.data.fill(0);
    this.city.buildings.forEach((b, i) => {
      const o = i * DAMAGE_TEXELS_PER_BUILDING * 4;
      this.data[o + 8] = (b.footprint.x0 + b.footprint.x1) / 2;
      this.data[o + 9] = (b.footprint.z0 + b.footprint.z1) / 2;
      this.data[o + 10] = 1;
      this.data[o + 12] = b.height;
      this.data[o + 13] = b.masses[0].y0;
      this.data[o + 18] = 1;
    });
    this.texture.needsUpdate = true;
  }

  /** r03-fx：割れて崩れる建物を詳しい形で描く側をつなぐ（CityView が作る）。 */
  attachDetail(detail: DetailProvider): void {
    this.detail = detail;
  }

  sync(d: DamageVisualSource, f: FireVisualSource, time: number): void {
    const a = this.data;
    this.detail?.update(d);
    for (let i = 0; i < this.count; i++) {
      const o = i * DAMAGE_TEXELS_PER_BUILDING * 4;
      a[o] = d.crack[i];
      a[o + 1] = d.peel[i];
      a[o + 2] = d.glass[i];
      a[o + 3] = d.char[i];
      a[o + 4] = f.burn[i];
      a[o + 5] = d.tilt[i];
      a[o + 6] = d.collapse[i];
      a[o + 7] = d.impactY[i];
      a[o + 8] = d.pivotX[i];
      a[o + 9] = d.pivotZ[i];
      a[o + 10] = d.dirX[i];
      a[o + 11] = d.dirZ[i];
      a[o + 14] = f.fireLow[i];
      a[o + 15] = f.fireHigh[i];
      a[o + 16] = this.occlusion[i];
      a[o + 17] = d.reach[i];
      this.writePose(i, o, d);
    }
    this.uniforms.uDmgTime.value = time;
    this.texture.needsUpdate = true;
    for (const l of this.listeners) l(d, f);
  }

  /** 割れて崩れる形（T4.zw・T5・T6）。傾きも崩落も無い建物は、1 と 0 のまま。 */
  private writePose(i: number, o: number, d: DamageVisualSource): void {
    const a = this.data;
    const tilt = d.tilt[i];
    const col = d.collapse[i];
    const split = d.splitY[i];
    if ((tilt <= 0 && col <= 0) || split <= 0) {
      if (a[o + 18] !== 1 || a[o + 19] !== 0 || a[o + 22] !== 0) {
        a[o + 18] = 1;
        a[o + 19] = 0;
        a.fill(0, o + 20, o + 28);
      }
      return;
    }
    const b = this.city.buildings[i];
    const shape = this.shapes.get(b, split, d.dirX[i], d.dirZ[i]);
    const p = collapsePose(tilt, col, shape, this.pose);
    // r04-fx2（引き継ぎ）：軸は見た目の倒れる向き（前が塞がっていれば替えた向き）の側
    const h = collapseHinge(b, shape.dirX, shape.dirZ, split);
    const detailed = this.detail?.has(i) ?? false;
    a[o + 18] = shape.floorH;
    a[o + 19] = detailed ? 1 : 0;
    // 詳しい形で描く建物だけ、T2.zw を見た目の向きにする（まとめたメッシュで傾ける建物は、遊びの支点と向きのまま）
    if (detailed) {
      a[o + 10] = shape.dirX;
      a[o + 11] = shape.dirZ;
    }
    a[o + 20] = h.x;
    a[o + 21] = h.z;
    a[o + 22] = split;
    a[o + 23] = shape.slabs + 8 * shape.floors;
    a[o + 24] = p.angle;
    a[o + 25] = p.front;
    a[o + 26] = p.stackTop;
    a[o + 27] = p.sink;
  }

  /**
   * カメラと竜の間にある建物を透かす（描画だけの工夫。遊びの当たりには関係しない）。
   * 急に消えると目立つので、入るときは速く、戻るときはゆっくり度合いを変える。
   */
  setOccluders(ids: ReadonlySet<number>, dt: number): void {
    for (let i = 0; i < this.count; i++) {
      const target = ids.has(i) ? 1 : 0;
      const cur = this.occlusion[i];
      if (cur === target) continue;
      this.occlusion[i] = target > cur ? Math.min(1, cur + dt * 7) : Math.max(0, cur - dt * 2.5);
    }
  }

  /**
   * r05-camera：網点で透かす範囲を、遊ぶカメラの画面の上で決める（体の外接矩形と照準の円。縁はなだらか）。
   * 体験の採点の TOP5：間の建物を1棟まるごと透かすと、焔角の地上で画面の最大85%が網目越しになった。box が null か使えなければ、
   * 範囲を使わず r04 までと同じく建物ごと透かす。
   * r06-camera2：透かし方 style（window・spread・outline・outlineSpread）と、網点を面全体へ広げる度合い spread（0〜1、spread と
   * outlineSpread のときだけ）、outline の2つでは怪獣の形 silhouette（camera/occlusionRegion.ts の並び）を受け取り、uOccAim.w と表の最後の行に書く。
   */
  setOcclusionRegion(camera: PerspectiveCamera, box: OcclusionBox | null, opts?: { style: 'window' | 'spread' | 'outline' | 'outlineSpread'; spread: number; silhouette: Float32Array }): void {
    const u = this.uniforms;
    u.uOccViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const on = box !== null && box.valid;
    if (on) u.uOccBox.value.set(box.cx, box.cy, box.hx, box.hy);
    let mode = on ? 1 : 0;
    if (on && opts) {
      const spread = Math.min(1, Math.max(0, opts.spread));
      if (opts.style === 'outline' || opts.style === 'outlineSpread') {
        this.data.set(opts.silhouette, this.silhouetteOffset);
        mode = opts.style === 'outlineSpread' ? 3 + spread : 3;
      } else if (opts.style === 'spread') mode = 1 + spread;
    }
    u.uOccAim.value.set(camera.aspect, CAMERA_OCCLUSION.aimRadius, CAMERA_OCCLUSION.soft, mode);
  }
}
