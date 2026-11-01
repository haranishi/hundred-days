// OWNER: core
// 肩越しの追従カメラ。既定は見下ろし 48°・距離 11m。マウスで左右と上下（25〜70°）、ホイールで 6〜16m。
// 注視点と距離は臨界減衰のばねに通す。入力の向き（yaw・pitch）はばねに通さない（マウスの遅れを足さない）。
// 屋根などに遮られても寄せない（透かしは描画の側がやる）。
// 狙い（Q）の間は、カメラの位置はそのままに、注視点を地面の狙いの点へ移す。画面の中央の線が、そのまま狙いと地面の交点になる。
// ほかに、タイトルのゆっくり回る構図（orbit）、撮影の固定構図（fixed）、演出の構図（cinematic：討ち取りの寄り→全景へ引く）を持つ。
// r03-fix-play: 全景へ引くときは、先に真上へ上がってから横へ動く（rise）。庭の低い所や屋根の中を通らない。
import * as THREE from 'three';
import { CAMERA } from '../config/camera';
import { VIEW } from '../config/view';
import { STONE } from '../config/rules';
import { type ShotDef, shotCameraPosition } from '../contract/shots';
import { damped, smoothDamp, snap, type Damped } from './springs';

const D2R = Math.PI / 180;
export type CameraMode = 'follow' | 'orbit' | 'fixed' | 'cinematic';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'orbit';
  /** 入力の向き：カメラが向く方角（地図の Yaw、ラジアン。0＝東・π/2＝南）。 */
  yaw = 270 * D2R;
  /** 見下ろしの角（ラジアン）。 */
  pitch = CAMERA.pitch * D2R;
  /** 距離の目標（ホイールで変える）。 */
  distGoal: number = CAMERA.distance;
  /** 狙いの点までの距離（m）。狙っている間はマウスの上下で前後する。 */
  aimDist: number = CAMERA.aimStart;
  private readonly dist: Damped = damped(CAMERA.distance);
  private readonly tx: Damped = damped(0);
  private readonly ty: Damped = damped(0);
  private readonly tz: Damped = damped(0);
  private readonly aimK: Damped = damped(0);
  private shot: ShotDef | null = null;
  private orbitT = 0;
  /** 演出の構図へ寄るばね（秒）。r02-fix-play：討ち取りの寄りは速く、全景へ引くのはゆっくり */
  private cineSmooth: number = CAMERA.finaleSmooth;
  /** 演出で、横へ動く前に上がる高さ（m）と、高さのばね（秒）。null なら三つの成分を同じばねで寄せる。r03-fix-play */
  private rise: { height: number; smooth: number } | null = null;
  // 演出で全景へ引くときの、位置と注視点のばね
  private readonly cp = [damped(0), damped(0), damped(0)];
  private readonly cl = [damped(0), damped(0), damped(0)];
  private readonly tmp = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 0.1, 600);
  }

  /** マウスの移動量（px）。狙っている間の上下は、狙いの距離を変える。 */
  look(dx: number, dy: number, aiming: boolean): void {
    if (this.mode !== 'follow') return;
    this.yaw += dx * CAMERA.lookSensitivity;
    if (aiming) {
      this.aimDist = Math.min(STONE.maxRange, Math.max(STONE.minRange, this.aimDist - dy * CAMERA.aimPerPixel));
    } else {
      this.pitch = Math.min(CAMERA.pitchMax * D2R, Math.max(CAMERA.pitchMin * D2R, this.pitch + dy * CAMERA.lookSensitivity));
    }
  }

  zoom(wheelDeltaY: number): void {
    this.distGoal = Math.min(CAMERA.distanceMax, Math.max(CAMERA.distanceMin, this.distGoal + wheelDeltaY * CAMERA.wheelStep));
  }

  /** 遊び始め：プレイヤーの後ろ（向きの反対側）から、既定の角度と距離で見る。ばねも置き直す。 */
  resetFollow(px: number, pz: number, facingYaw: number): void {
    this.mode = 'follow';
    this.yaw = facingYaw;
    this.pitch = CAMERA.pitch * D2R;
    this.distGoal = CAMERA.distance;
    this.aimDist = CAMERA.aimStart;
    snap(this.dist, CAMERA.distance);
    snap(this.tx, px);
    snap(this.ty, CAMERA.targetHeight);
    snap(this.tz, pz);
    snap(this.aimK, 0);
    this.camera.fov = CAMERA.fov;
    this.camera.updateProjectionMatrix();
    this.applyFollow(px, pz);
  }

  /** 撮影の固定構図。 */
  setFixed(shot: ShotDef): void {
    this.mode = 'fixed';
    this.shot = shot;
    this.camera.fov = shot.fov;
    this.camera.updateProjectionMatrix();
    const [x, y, z] = shotCameraPosition(shot);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(shot.target[0], shot.target[1], shot.target[2]);
  }

  /** タイトル：構図の注視点のまわりを、ゆっくり回る。 */
  setOrbit(shot: ShotDef, t0 = 0): void {
    this.mode = 'orbit';
    this.shot = shot;
    this.orbitT = t0;
    this.camera.fov = shot.fov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 演出：いまの位置から、構図へばねで寄せていく。smooth はばねの秒（既定は全景へ引く速さ）。
   * rise を渡すと、まず高さだけを上げ、rise.height を越えてから横へ動く（建物や地面より下を通らない）。
   * 注視点は、前が構図（固定か演出）ならその注視点から、そうでなければ向きの先 10m から寄せる。
   */
  setCinematic(shot: ShotDef, smooth: number = CAMERA.finaleSmooth, rise: { height: number; smooth: number } | null = null): void {
    const prev = this.mode === 'cinematic' || this.mode === 'fixed' ? this.shot : null;
    this.mode = 'cinematic';
    this.shot = shot;
    this.cineSmooth = smooth;
    this.rise = rise;
    const p = this.camera.position;
    let look: { x: number; y: number; z: number };
    if (prev) look = { x: prev.target[0], y: prev.target[1], z: prev.target[2] };
    else {
      this.camera.getWorldDirection(this.tmp);
      look = this.tmp.multiplyScalar(10).add(p);
    }
    [p.x, p.y, p.z].forEach((v, i) => snap(this.cp[i], v));
    [look.x, look.y, look.z].forEach((v, i) => snap(this.cl[i], v));
  }

  /** 討ち取りの寄りから全景へ引く：先に真上へ上がってから横へ動く（VIEW.finaleCam）。r03-fix-play */
  pullBack(shot: ShotDef): void {
    this.setCinematic(shot, CAMERA.finaleSmooth, { height: VIEW.finaleCam.riseHeight, smooth: VIEW.finaleCam.riseSmooth });
  }

  update(dt: number, player: { x: number; z: number } | null, aiming: boolean): void {
    switch (this.mode) {
      case 'follow': {
        if (!player) return;
        smoothDamp(this.tx, player.x, CAMERA.targetSmooth, dt);
        smoothDamp(this.ty, CAMERA.targetHeight, CAMERA.targetSmooth, dt);
        smoothDamp(this.tz, player.z, CAMERA.targetSmooth, dt);
        smoothDamp(this.dist, this.distGoal, CAMERA.distanceSmooth, dt);
        smoothDamp(this.aimK, aiming ? 1 : 0, CAMERA.aimSmooth, dt);
        this.applyFollow(player.x, player.z);
        return;
      }
      case 'orbit': {
        const s = this.shot;
        if (!s) return;
        this.orbitT += dt;
        const o: ShotDef = { ...s, yawDeg: s.yawDeg + this.orbitT * CAMERA.titleOrbitSpeed };
        const [x, y, z] = shotCameraPosition(o);
        this.camera.position.set(x, y, z);
        this.camera.lookAt(s.target[0], s.target[1], s.target[2]);
        return;
      }
      case 'fixed':
        return;
      case 'cinematic': {
        const s = this.shot;
        if (!s) return;
        const pos = shotCameraPosition(s);
        const r = this.rise;
        if (r) {
          // 先に真上へ上がる：高さが r.height（行き先がそれより低ければ行き先の少し下）を越えるまで、横は止めておく。
          // ばねは行き過ぎないので、高さは下がらない
          smoothDamp(this.cp[1], pos[1], r.smooth, dt);
          if (this.cp[1].value >= Math.min(r.height, pos[1] - 0.5) - 1e-6) {
            smoothDamp(this.cp[0], pos[0], this.cineSmooth, dt);
            smoothDamp(this.cp[2], pos[2], this.cineSmooth, dt);
          }
        } else {
          for (let i = 0; i < 3; i++) smoothDamp(this.cp[i], pos[i], this.cineSmooth, dt);
        }
        for (let i = 0; i < 3; i++) smoothDamp(this.cl[i], s.target[i], this.cineSmooth, dt);
        this.camera.position.set(this.cp[0].value, this.cp[1].value, this.cp[2].value);
        this.camera.lookAt(this.cl[0].value, this.cl[1].value, this.cl[2].value);
        return;
      }
    }
  }

  private applyFollow(px: number, pz: number): void {
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cpch = Math.cos(this.pitch);
    const d = this.dist.value;
    const tx = this.tx.value;
    const ty = this.ty.value;
    const tz = this.tz.value;
    this.camera.position.set(tx - cy * cpch * d, ty + Math.sin(this.pitch) * d, tz - sy * cpch * d);
    // 狙いの間は、注視点を地面の狙いの点へ寄せる（カメラの位置は動かさない）
    const k = this.aimK.value;
    const ax = px + cy * this.aimDist;
    const az = pz + sy * this.aimDist;
    this.camera.lookAt(tx + (ax - tx) * k, ty + (0 - ty) * k, tz + (az - tz) * k);
  }

  /** 画面中央の線と地面（高さ 0）の交点。地面を向いていなければ null。 */
  groundAim(): { x: number; z: number } | null {
    const dir = this.camera.getWorldDirection(this.tmp);
    if (dir.y > -1e-3) return null;
    const p = this.camera.position;
    const t = -p.y / dir.y;
    return { x: p.x + dir.x * t, z: p.z + dir.z * t };
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** __state に出す値（度）。 */
  info(): { yaw: number; pitch: number; distance: number; lookSens: number } {
    return { yaw: (this.yaw * 180) / Math.PI, pitch: (this.pitch * 180) / Math.PI, distance: this.dist.value, lookSens: CAMERA.lookSensitivity };
  }
}
