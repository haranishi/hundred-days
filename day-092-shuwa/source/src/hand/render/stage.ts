/**
 * 1つの表示の場面: カメラ・光・手（利き手と、あれば反対の手）・空中に書いた跡・上半身。
 * 光はカメラに付ける（どの向きから見ても手の前面が明るく、指の前後が陰影で読めるように）。
 *
 * 自分から見る時は、手の形が体の部品に隠れないようにする（hand-r2）:
 *  - 手だけの表示: 袖と前腕を先に描き、奥行きを消してから手を描く（render）。自分の目の側から見ると、前腕は手首からこちらへ伸びるので、
 *    そ のように指先が向こうを向く形では前腕が手の手前に重なる。手は袖の後ろには隠れず、袖は手の後ろへ回って見える
 *  - 上半身つき: 胴を薄く透かす（BodyRig.setSelfView）。胸に触れる手（わかる・大丈夫）や胸の前の手（お疲れさま）が、肩と胸の上に隠れないように
 */
import {
  CatmullRomCurve3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  TubeGeometry,
  Vector3,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import type { Handedness, Perspective } from '../types';
import type { FaceState } from '../core/face';
import { baseAngles, bodySelfAngles, cameraPosition, type Bounds } from '../core/framing';
import type { CompiledSign, Frame } from '../core/timeline';
import { BodyRig } from './body-rig';
import { HandRig } from './hand-rig';
import { PALETTE, edgeFadeUniforms, fadeAtEdges, outlineUniforms } from './materials';

export const FOV = 28;

class Trail {
  readonly mesh: Mesh;
  // 小さな画像では、画像の縁に当たる跡をぼかして消す（小さな画像の枠は跡を全部は入れないため。core/framing.ts の thumbnailBounds）
  private readonly mat = fadeAtEdges(new MeshBasicMaterial({ color: PALETTE.trail, transparent: true, opacity: 0.45, depthWrite: false }));
  private segs = 0;
  private radial = 8;
  private key = '';
  constructor() {
    this.mesh = new Mesh(undefined, this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
  }
  set(path: Array<[number, number, number]> | undefined, progress: number, opacity: number) {
    if (!path || path.length < 2 || opacity <= 0.001 || progress <= 0.001) {
      this.mesh.visible = false;
      return;
    }
    const key = `${path.length}:${path[0]!.join(',')}:${path[path.length - 1]!.join(',')}`;
    if (key !== this.key) {
      this.key = key;
      this.mesh.geometry.dispose();
      this.segs = Math.min(240, path.length * 3);
      const curve = new CatmullRomCurve3(path.map((p) => new Vector3(p[0], p[1], p[2])));
      this.mesh.geometry = new TubeGeometry(curve, this.segs, 0.04, this.radial, false);
    }
    const n = Math.max(1, Math.round(this.segs * Math.min(1, progress)));
    this.mesh.geometry.setDrawRange(0, n * this.radial * 6);
    this.mat.opacity = opacity;
    this.mesh.visible = true;
  }
}

export class Stage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
  /** 左利きの時に X で反転する場全体 */
  private readonly root = new Group();
  private readonly dominantRig = new HandRig({ mirrored: false, cuff: true });
  private nonDominantRig: HandRig | null = null;
  private body: BodyRig | null = null;
  private readonly trail = new Trail();
  private dominant: Handedness = 'right';
  /** 袖と前腕を先に描いてから手を描くか（手だけの表示を自分から見る時） */
  private cutaway = false;
  /**
   * 袖・腕・胴・空中の跡を、画像の縁からこの割合（描く大きさの短い辺に対する）の幅でぼかして消す。0＝消さない（大きな表示）。
   * 小さな画像だけが使う（render/runtime.ts の THUMB_EDGE_FADE。白い札の中で、縁で切れた袖が直線の切れ目に見えないように。hand-r3）
   */
  edgeFade = 0;

  constructor() {
    this.scene.add(this.root, this.camera);
    this.root.add(this.dominantRig.group, this.dominantRig.cuff, this.trail.mesh);
    const hemi = new HemisphereLight('#FFFFFF', '#E9CDBB', 1.55);
    const key = new DirectionalLight('#FFFFFF', 2.3);
    key.position.set(-1.6, 2.2, 1.2);
    key.target.position.set(0, 0, -4);
    const fill = new DirectionalLight('#FFF1E6', 0.55);
    fill.position.set(2, -1, 1);
    fill.target.position.set(0, 0, -4);
    this.camera.add(hemi, key, key.target, fill, fill.target);
  }

  setDominant(d: Handedness) {
    this.dominant = d;
    this.root.scale.set(d === 'left' ? -1 : 1, 1, 1);
  }

  /** 両手・上半身の有無を形に合わせる */
  configure(opts: { twoHands: boolean; body: boolean }) {
    if (opts.twoHands && !this.nonDominantRig) {
      this.nonDominantRig = new HandRig({ mirrored: true, cuff: true });
      this.root.add(this.nonDominantRig.group, this.nonDominantRig.cuff);
    }
    if (this.nonDominantRig) {
      this.nonDominantRig.group.visible = opts.twoHands;
      this.nonDominantRig.cuff.visible = opts.twoHands && !opts.body;
    }
    if (opts.body && !this.body) {
      this.body = new BodyRig();
      this.root.add(this.body.group);
    }
    if (this.body) this.body.group.visible = opts.body;
    this.dominantRig.setCuffVisible(!opts.body);
  }

  /** 反対の手が、形を作る前に休めているか（小さな画像だけが使う。休めている手は袖と同じく画像の縁でぼかす） */
  setNonDominantResting(resting: boolean) {
    this.nonDominantRig?.setEdgeFade(resting);
  }

  setFrame(f: Frame, trail: { progress: number; opacity: number }, face?: FaceState) {
    this.dominantRig.update(f.dominant);
    if (this.nonDominantRig && f.nonDominant) this.nonDominantRig.update(f.nonDominant);
    this.trail.set(f.trace?.path, trail.progress, trail.opacity);
    if (this.body?.group.visible) this.body.update(f, face ?? { shape: 'neutral', nod: 0 });
  }

  /**
   * カメラを置く。b は形と動きが入る球（core/framing.ts の signBounds）。dragYaw/dragPitch はドラッグで足した角度（度）。
   * 向き: 相手から＝正面の少し右上。自分から＝手だけの時は手の後ろ上（sign を渡すと形に合わせる。selfAngles）、
   * 上半身つきの時は利き手の肩の後ろ上（bodySelfAngles。頭と胴は薄く透かす）
   */
  aim(b: Bounds, perspective: Perspective, dragYaw: number, dragPitch: number, aspect: number, sign?: CompiledSign) {
    const bodyMode = !!this.body?.group.visible;
    this.camera.aspect = aspect;
    this.camera.up.set(0, 1, 0);
    const base = bodyMode && perspective === 'self' ? bodySelfAngles(this.dominant) : baseAngles(perspective, this.dominant, sign);
    const pos = cameraPosition(b, base.yaw + dragYaw, base.pitch + dragPitch, FOV);
    this.camera.fov = FOV;
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.lookAt(b.center[0], b.center[1], b.center[2]);
    this.camera.near = 0.1;
    this.camera.far = 200;
    this.camera.updateProjectionMatrix();
    // 自分から見る時は、頭と胴を薄く透かす（その向こうの手を隠さない）
    this.body?.setSelfView(perspective === 'self');
    this.cutaway = perspective === 'self' && !bodyMode;
  }

  /** 描く（共有の描画器から呼ぶ）。手だけの表示を自分から見る時は、袖と前腕 → 奥行きを消す → 手 の順に2回に分けて描く */
  render(r: WebGLRenderer) {
    if (!this.cutaway) {
      r.render(this.scene, this.camera);
      return;
    }
    const hands: Object3D[] = [this.dominantRig.group, this.trail.mesh];
    const cuffs: Object3D[] = [this.dominantRig.cuff];
    if (this.nonDominantRig) {
      hands.push(this.nonDominantRig.group);
      cuffs.push(this.nonDominantRig.cuff);
    }
    const handShown = hands.map((o) => o.visible);
    const cuffShown = cuffs.map((o) => o.visible);
    for (const o of hands) o.visible = false;
    r.render(this.scene, this.camera);
    r.clearDepth();
    hands.forEach((o, i) => (o.visible = handShown[i]!));
    for (const o of cuffs) o.visible = false;
    r.render(this.scene, this.camera);
    cuffs.forEach((o, i) => (o.visible = cuffShown[i]!));
  }

  /** 輪郭線の太さを、描く大きさに合わせる */
  setOutlineFor(heightPx: number) {
    outlineUniforms.uPixelScale.value = (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / Math.max(1, heightPx);
    outlineUniforms.uWidthPx.value = heightPx < 160 ? 1.3 : heightPx < 360 ? 1.8 : 2.4;
  }

  /** 縁でぼかす幅を、描く大きさに合わせる（材質は全部の表示で共有なので、描くたびに設定する。edgeFade が 0 なら消さない） */
  setEdgeFadeFor(widthPx: number, heightPx: number) {
    edgeFadeUniforms.uEdgeFade.value.set(widthPx, heightPx, this.edgeFade * Math.min(widthPx, heightPx));
  }
}
