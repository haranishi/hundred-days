// OWNER: contract（メインループが決める）
// 描画の部品（src/art）が満たす口。ゲームの側は、この形だけを通して art を使う。
// 世界（world）とキャラクター（characters）は別の担当が並行して作るので、互いの中身を import しない。
import type * as THREE from 'three';
import type { StageDef } from '../stage/types';
import type { CharacterKind, CharacterSnap, InteractionSnap, MovingLight } from './snapshot';

/** 空・霧・光・影・建物・植物・水・外の飾り（明智勢の篝火と旗）まで、ステージの見た目一式。 */
export interface ArtWorld {
  root: THREE.Object3D;
  /** r07: 仕掛けの開放と消灯を判定と同じ状態に合わせる。 */
  setInteractions?(items: readonly InteractionSnap[], disabledLights: readonly string[]): void;
  /** 炎・旗・霧・水面など、時間で動く飾りを進める。t はゲーム内時刻（撮影では固定の刻み）。 */
  update(dt: number, t: number): void;
  /** 手提灯の明かり。毎コマ、番兵の数までの位置と強さを渡す（空なら全部消す）。 */
  setMovingLights(lights: readonly MovingLight[]): void;
  /** 討ち取った後の炎上 0→1。0 で炎なし。書院から本堂へ燃え広がる。 */
  setFire(progress: number): void;
  /** 影を落とす光の範囲をカメラの近くへ寄せるなど、カメラに合わせて毎コマ直すもの。 */
  updateForCamera(camera: THREE.PerspectiveCamera): void;
  dispose(): void;
}

/** 1人分の人物。root を場面に足し、毎コマ update で位置・向き・姿勢を合わせる。 */
export interface ArtCharacter {
  root: THREE.Object3D;
  update(dt: number, snap: CharacterSnap): void;
  /**
   * 足元の暗さ（r01-integrate 追加）。ambient＝環境光の倍率、key＝空からの主光の倍率（どちらも 0..1、1 で下げない）。
   * 竹林・軒下・蔵の陰で、人物が周りの地面より明るく浮かないようにする。灯り（点光源）は下げない。
   */
  setShade(ambient: number, key: number): void;
  /** 手提灯の紙の中心（世界の座標）を out に書く。提灯を持っていなければ false（r01-integrate 追加：灯りを紙の揺れに合わせる）。 */
  lanternPaper(out: THREE.Vector3): boolean;
  dispose(): void;
}

/** 後処理（AO・光のにじみ・トーンマップ・色・周辺減光）。描画はこれの render だけで行う。 */
export interface ArtPost {
  render(dt: number): void;
  setSize(width: number, height: number): void;
  /** 0→1：発見中の赤み。 */
  setAlert(k: number): void;
  /** 0→1：討ち取りの演出（色を抜き、暖色と周辺減光を強める）。 */
  setFinale(k: number): void;
  dispose(): void;
}

/** カメラとプレイヤーの間にある屋根・壁・木を、プレイヤーの周りだけ網点で透かす。 */
export interface ArtSeeThrough {
  /**
   * 毎コマ、描画の前に呼ぶ。player は足元の位置。enabled=false で透かしを切る（撮影の一部）。
   * others（r02-design 追加・省略可）：ほかに見せたい人物の足元（当て身や討ち取りの相手など。最大2つ）。
   */
  update(camera: THREE.PerspectiveCamera, player: THREE.Vector3, enabled: boolean, others?: readonly THREE.Vector3[]): void;
}

export interface ArtApi {
  createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer;
  buildWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer, stage: StageDef): ArtWorld;
  createCharacter(kind: CharacterKind): ArtCharacter;
  createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): ArtPost;
  createSeeThrough(): ArtSeeThrough;
  /** シェーダーを先に作っておく（遊びの途中で1秒止まるのを防ぐ）。 */
  warmUp(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Promise<void>;
}
