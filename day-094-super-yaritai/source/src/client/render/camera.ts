/**
 * カメラ：北を向いた固定の向きで、斜め上から追いかける（ばね）。縦長の画面では遠めに引き、見る点を前（北）へずらす（docs/02 ④・docs/04）。
 * 固定ショット（S1〜S6）は tools/shots.mjs が __SY__.shot() で切り替える。
 */
import * as THREE from 'three';
import type { Vec3 } from '../../shared/view';
import { RENDER } from '../../shared/rules/tuning';

export type ShotName = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

/** 撮影・検証用の任意のカメラ姿勢（pos・look は世界座標 m、fov は度） */
export interface CameraPose {
  pos: [number, number, number];
  look: [number, number, number];
  fov?: number;
}

/** 固定ショットの構図（位置・見る点・画角） */
export const SHOTS: Record<ShotName, { pos: [number, number, number]; look: [number, number, number]; fov: number } | null> = {
  S1: { pos: [4.5, 13.5, 21.5], look: [1.5, 0, -2.5], fov: 48 },
  S2: { pos: [-6.5, 6.8, 6.4], look: [-6.5, 0.4, -3.6], fov: 50 },
  S3: { pos: [6.2, 4.6, 11.2], look: [3.5, 0.7, 3.6], fov: 42 },
  S4: { pos: [2.5, 11.5, 13.5], look: [0.5, 0, -2.0], fov: 50 },
  // S5（スマホ縦のゲーム画面）・S6（結果画面）は追いかけるカメラのまま撮る
  S5: null,
  S6: null,
};

const SHAKE_FREQ_HZ = 14;
const SHAKE_DURATION = 0.36;
const SHAKE_DECAY = 13;
const SHAKE_MAX_X = 0.14;
const SHAKE_MAX_Y = 0.11;
const SHAKE_MAX_FOV = 0.8;

/** OS・ブラウザで視覚効果の軽減が有効か（Node 試験では window 未定義なら false） */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export class FollowCamera {
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.3, 160);
  private readonly focus = new THREE.Vector3(0, 0, 8);
  private readonly rightVec = new THREE.Vector3();
  private readonly upVec = new THREE.Vector3();
  private aspect = 1;
  private shot: ShotName | null = null;
  private pose: CameraPose | null = null;
  private snapNext = true;
  private shakeAmp = 0;
  private shakeElapsed = 0;
  private shakePhase = 0;
  private fovKick = 0;

  resize(w: number, h: number): void {
    this.aspect = w / Math.max(1, h);
    this.camera.aspect = this.aspect;
    this.applyLens();
  }

  private baseFov(): number {
    if (this.pose?.fov !== undefined) return this.pose.fov;
    const s = this.shot ? SHOTS[this.shot] : null;
    // 縦長ほど画角を広げ、遠くへ引く（横の見える幅を確保する）
    return s ? s.fov : this.aspect >= 1 ? RENDER.cameraFov.landscape : RENDER.cameraFov.portrait;
  }

  private applyLens(): void {
    const kick = this.pose || this.shot || prefersReducedMotion() ? 0 : this.fovKick;
    this.camera.fov = this.baseFov() + kick;
    this.camera.updateProjectionMatrix();
  }

  /** 縦長ほど遠くへ（スマホ縦で通路の両側の棚が入るように） */
  private distance(): number {
    if (this.aspect >= 1.2) return RENDER.cameraDistance.wide;
    if (this.aspect >= 0.8) return RENDER.cameraDistance.square;
    return RENDER.cameraDistance.tall;
  }

  setShot(name: ShotName | null): void {
    this.shot = name && SHOTS[name] ? name : null;
    if (this.shot || name === null) this.pose = null;
    if (this.shot) {
      this.shakeAmp = 0;
      this.shakeElapsed = 0;
      this.fovKick = 0;
    }
    this.applyLens();
    this.snapNext = true;
  }

  setPose(pose: CameraPose | null): void {
    this.pose = pose ? { pos: [...pose.pos], look: [...pose.look], ...(pose.fov !== undefined ? { fov: pose.fov } : {}) } : null;
    if (this.pose) {
      this.shot = null;
      this.shakeAmp = 0;
      this.shakeElapsed = 0;
      this.fovKick = 0;
    }
    this.applyLens();
    this.snapNext = true;
  }

  get currentShot(): ShotName | null {
    return this.shot;
  }

  get currentPose(): CameraPose | null {
    return this.pose;
  }

  /** 次の update で、ばねを使わずに一気に合わせる */
  snap(): void {
    this.snapNext = true;
  }

  /** 衝撃振動を予約する（次の update() のあとにビュー平面オフセットと微小 FOV を足す） */
  shake(strength = 1): void {
    if (this.pose !== null || this.shot !== null || prefersReducedMotion()) return;
    const s = Math.max(0, Math.min(1, strength));
    if (s <= 0) return;
    if (this.shakeAmp <= 0.02) this.shakePhase = 0;
    this.shakeAmp = Math.max(this.shakeAmp, s);
    this.shakeElapsed = 0;
  }

  clearShake(): void {
    this.shakeAmp = 0;
    this.shakeElapsed = 0;
    this.shakePhase = 0;
    if (this.fovKick !== 0) {
      this.fovKick = 0;
      this.applyLens();
    }
  }

  update(dt: number, target: Vec3): void {
    if (this.pose) {
      this.shakeAmp = 0;
      this.shakeElapsed = 0;
      if (this.fovKick !== 0 || this.camera.fov !== this.baseFov()) {
        this.fovKick = 0;
        this.applyLens();
      }
      this.camera.position.set(...this.pose.pos);
      this.camera.lookAt(...this.pose.look);
      return;
    }
    const s = this.shot ? SHOTS[this.shot] : null;
    if (s) {
      this.shakeAmp = 0;
      this.shakeElapsed = 0;
      if (this.fovKick !== 0) {
        this.fovKick = 0;
        this.applyLens();
      }
      this.camera.position.set(...s.pos);
      this.camera.lookAt(new THREE.Vector3(...s.look));
      return;
    }
    // 縦長の画面だけ、見る点を北へずらす（自分を画面の下寄りに置く。向きは北のまま）
    const lead = this.aspect < 0.8 ? RENDER.cameraLeadPortrait : 0;
    const want = new THREE.Vector3(target.x, 0.8, target.z - 0.8 - lead);
    if (this.snapNext) {
      this.focus.copy(want);
      this.snapNext = false;
    } else this.focus.lerp(want, 1 - Math.exp(-dt * RENDER.cameraFollow));
    const d = this.distance();
    const pitch = ((this.aspect >= 1 ? RENDER.cameraPitch.landscape : RENDER.cameraPitch.portrait) * Math.PI) / 180;
    this.camera.position.set(this.focus.x, this.focus.y + Math.sin(pitch) * d, this.focus.z + Math.cos(pitch) * d);
    this.camera.lookAt(this.focus);
    this.applyPostUpdateShake(dt);
  }

  /** FollowCamera.update 後にのみビュー平面へ加算し、向き（北固定）を崩さない */
  private applyPostUpdateShake(dt: number): void {
    if (prefersReducedMotion() || this.shakeAmp <= 0) {
      this.shakeAmp = 0;
      this.shakeElapsed = 0;
      if (this.fovKick !== 0) {
        this.fovKick = 0;
        this.applyLens();
      }
      return;
    }
    const safeDt = Math.max(0, dt);
    this.shakeElapsed += safeDt;
    this.shakePhase += safeDt * SHAKE_FREQ_HZ * Math.PI * 2;
    this.shakeAmp *= Math.exp(-SHAKE_DECAY * safeDt);
    if (this.shakeElapsed >= SHAKE_DURATION || this.shakeAmp < 0.004) {
      this.shakeAmp = 0;
      this.shakeElapsed = 0;
      if (this.fovKick !== 0) {
        this.fovKick = 0;
        this.applyLens();
      }
      return;
    }
    this.rightVec.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.upVec.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const ox = this.shakeAmp * SHAKE_MAX_X * Math.cos(this.shakePhase);
    const oy = this.shakeAmp * SHAKE_MAX_Y * Math.sin(this.shakePhase * 1.13 + 0.5);
    this.camera.position.addScaledVector(this.rightVec, ox).addScaledVector(this.upVec, oy);
    this.fovKick = this.shakeAmp * SHAKE_MAX_FOV;
    this.applyLens();
  }
}
