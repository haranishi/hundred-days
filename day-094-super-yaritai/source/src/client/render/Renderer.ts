/**
 * 3Dの描画のまとめ役。WorldView だけを読み、店・商品・カート・キャラ・カメラ・光・透かしを毎フレーム更新する。
 * 画質は低・中・高を自動で選び、毎秒の描画数が落ち続けたら1段ずつ下げる（docs/04「重さの予算」）。
 */
import * as THREE from 'three';
import type { StoreLayout } from '../../shared/layout/store';
import { RENDER } from '../../shared/rules/tuning';
import type { Vec3, WorldStatic, WorldView } from '../../shared/view';
import { AimView } from './aim3d';
import type { Assets } from './assets';
import { AvatarsView } from './avatars3d';
import { FollowCamera, prefersReducedMotion, type CameraPose, type ShotName } from './camera';
import { Fx3dView } from './fx3d';
import { PALETTE } from './palette';
import { PropsView, titleStock } from './props3d';
import { ShelfMarksView } from './shelfMarks';
import type { MovableSignsView, NoticeStampsView } from './signs';
import { StationsView } from './stations3d';
import { buildFloorMarks, buildStoreView } from './store3d';
import { xrayUniforms } from './xray';

export type Quality = 'low' | 'mid' | 'high';

export interface RenderStats {
  fps: number;
  calls: number;
  triangles: number;
  quality: Quality;
}

const SHADOW_SIZE: Record<Quality, number> = { low: 0, mid: 1024, high: 2048 };

export function isMobileLike(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
  } catch {
    return false;
  }
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam = new FollowCamera();
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private props: PropsView | null = null;
  /** 試合がない間（タイトルの裏）に見せる、品出し済みの商品（dress。試合の間は隠す） */
  private stock: PropsView | null = null;
  private avatars: AvatarsView | null = null;
  private stations: StationsView | null = null;
  private aim: AimView | null = null;
  private stamps: NoticeStampsView | null = null;
  private movableSigns: MovableSignsView | null = null;
  private shelfMarks: ShelfMarksView | null = null;
  private fx: Fx3dView | null = null;
  private layout: StoreLayout | null = null;
  private partMat: THREE.MeshLambertMaterial | null = null;
  private quality: Quality;
  private readonly mobile: boolean;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 60;
  private lowFor = 0;
  private lastCalls = 0;
  private lastTris = 0;
  private focus: Vec3 = { x: 0, y: 0, z: 6 };
  private orbitT = 0;
  private idleAcc = 0;
  autoQuality = true;

  constructor(private readonly container: HTMLElement) {
    this.mobile = isMobileLike();
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.mobile, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? RENDER.pixelRatioMobile : RENDER.pixelRatioDesktop));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.id = 'sy-canvas';
    this.renderer.domElement.setAttribute('aria-label', '店の3D画面');
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(PALETTE.cream);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 45, 95);
    this.hemi = new THREE.HemisphereLight(PALETTE.sky, PALETTE.ground, 2.3);
    this.scene.add(this.hemi);
    // 北西の上からの白い光（影あり、影の範囲はプレイヤーの周り）
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 1.9);
    this.sun.shadow.camera.left = -16;
    this.sun.shadow.camera.right = 16;
    this.sun.shadow.camera.top = 16;
    this.sun.shadow.camera.bottom = -16;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    // 影のずれの補正は画質（影の細かさ）で変える（applyQuality）
    this.scene.add(this.sun, this.sun.target);
    this.quality = this.mobile ? 'mid' : 'high';
    this.applyQuality();
    this.resize();
  }

  /** 動かない店を組み立てる（最初に1回） */
  buildStore(assets: Assets, layout: StoreLayout): void {
    this.layout = layout;
    const store = buildStoreView(assets, layout);
    this.partMat = store.materials[0] as THREE.MeshLambertMaterial;
    this.stamps = store.stamps;
    this.movableSigns = store.movableSigns;
    this.scene.add(store.group, buildFloorMarks(layout));
    this.stock = titleStock(assets, this.partMat);
    this.scene.add(this.stock.group);
  }

  /** 試合の動く物を作る（試合ごと） */
  startMatch(assets: Assets, world: WorldStatic): void {
    this.endMatch();
    if (this.stock) this.stock.group.visible = false;
    this.props = new PropsView(assets, world, this.partMat ?? new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.avatars = new AvatarsView(assets);
    this.avatars.blobsVisible = this.quality === 'low';
    this.scene.add(this.props.group, this.avatars.group);
    if (this.layout && this.partMat) {
      this.stations = new StationsView(this.layout, this.partMat);
      this.scene.add(this.stations.group);
    }
    if (this.layout) {
      this.aim = new AimView(this.layout, world);
      this.scene.add(this.aim.mesh);
      this.shelfMarks = new ShelfMarksView(this.layout, world);
      this.scene.add(this.shelfMarks.mesh);
    }
    this.fx = new Fx3dView();
    this.scene.add(this.fx.mesh);
    this.cam.snap();
  }

  endMatch(): void {
    if (this.stock) this.stock.group.visible = true;
    if (this.props) {
      this.scene.remove(this.props.group);
      this.props.dispose();
      this.props = null;
    }
    if (this.avatars) {
      this.scene.remove(this.avatars.group);
      this.avatars.dispose();
      this.avatars = null;
    }
    if (this.stations) {
      this.scene.remove(this.stations.group);
      this.stations.dispose();
      this.stations = null;
    }
    if (this.aim) {
      this.scene.remove(this.aim.mesh);
      this.aim.dispose();
      this.aim = null;
    }
    if (this.shelfMarks) {
      this.scene.remove(this.shelfMarks.mesh);
      this.shelfMarks.dispose();
      this.shelfMarks = null;
    }
    if (this.fx) {
      this.scene.remove(this.fx.mesh);
      this.fx.dispose();
      this.fx = null;
    }
    this.stamps?.reset();
    this.movableSigns?.reset();
    this.cam.clearShake();
  }

  /** 確かめ用：スイカの狙いの線（出ていなければ null） */
  aimState(): { len: number; pins: number; hit: boolean } | null {
    return this.aim?.last ?? null;
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.cam.resize(w, h);
  }

  setShot(name: ShotName | null): void {
    this.cam.setShot(name);
  }

  setCameraPose(pose: CameraPose | null): void {
    this.cam.setPose(pose);
  }

  /**
   * 試合がないとき（タイトルの後ろ）：店の上をゆっくり回る。電池のため毎秒30回に間引く。
   * 間引いた描画は、画質の自動調整の「毎秒の描画数」に数えない（数えると遅いと誤解して画質を下げてしまう）
   */
  idle(dt: number): void {
    this.orbitT += dt;
    this.idleAcc += dt;
    if (this.idleAcc < 1 / RENDER.idleFps) return;
    dt = this.idleAcc;
    this.idleAcc = 0;
    const x = Math.sin(this.orbitT * 0.08) * 8;
    this.focus = { x, y: 0, z: 2 + Math.cos(this.orbitT * 0.06) * 3 };
    this.cam.update(dt, this.focus);
    this.draw(dt, null, false);
  }

  frame(view: WorldView, dt: number, mySlot: number): void {
    this.props?.update(view);
    this.avatars?.update(view.avatars, dt);
    this.avatars?.updateNpcs(view.npcs, dt);
    this.stations?.update(view, dt);
    this.aim?.update(view, mySlot, dt);
    const me = view.avatars.find((a) => a.slot === mySlot) ?? view.avatars[0];
    this.stamps?.update(me?.achieved ?? [], dt);
    this.movableSigns?.update(view.stations, dt);
    this.shelfMarks?.update(view, dt);
    this.fx?.update(view, dt);
    if (me) this.focus = me.pos;
    this.triggerEventShake(view, mySlot, me?.pos);
    // 衝撃振動・FOV キックは FollowCamera.update 内の lookAt 後に加算される
    this.cam.update(dt, this.focus);
    this.draw(dt, this.cam.currentShot ? null : me?.pos ?? null);
  }

  private triggerEventShake(view: WorldView, mySlot: number, myPos?: Vec3): void {
    if (this.cam.currentShot !== null || this.cam.currentPose !== null || prefersReducedMotion()) return;
    const isNear = (pos: Vec3, maxD = 8): boolean => !myPos || Math.hypot(pos.x - myPos.x, pos.z - myPos.z) <= maxD;
    const avatarNear = (slot: number, maxD = 8): boolean => {
      if (slot === mySlot) return true;
      const av = view.avatars.find((a) => a.slot === slot);
      return Boolean(av && isNear(av.pos, maxD));
    };
    let strength = 0;
    for (const e of view.events) {
      if (e.t === 'complete' && avatarNear(e.slot)) {
        strength = Math.max(strength, e.slot === mySlot ? 1.0 : 0.55);
      } else if (e.t === 'caught' && avatarNear(e.slot)) {
        strength = Math.max(strength, e.slot === mySlot ? 0.85 : 0.35);
      } else if (e.t === 'achieve' && avatarNear(e.slot)) {
        strength = Math.max(strength, e.slot === mySlot ? 0.75 : 0.35);
      } else if (e.t === 'slip' && (e.slot === mySlot || e.by === mySlot || isNear(e.pos, 7))) {
        strength = Math.max(strength, e.slot === mySlot ? 0.75 : 0.45);
      } else if (e.t === 'score' && e.points >= 150 && (e.slot === mySlot || isNear(e.pos, 8))) {
        strength = Math.max(strength, Math.min(0.95, 0.4 + e.points / 1000));
      }
    }
    if (strength > 0) this.cam.shake(strength);
  }

  private draw(dt: number, xrayAt: Vec3 | null, measure = true): void {
    // 影を落とす範囲をプレイヤーの周りに寄せる
    const f = this.focus;
    this.sun.position.set(f.x - 9, 16, f.z - 7);
    this.sun.target.position.set(f.x, 0, f.z);
    this.updateXray(xrayAt);
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.cam.camera);
    this.lastCalls = this.renderer.info.render.calls;
    this.lastTris = this.renderer.info.render.triangles;
    if (measure) this.measure(dt);
    else {
      this.fpsFrames = 0;
      this.fpsTime = 0;
      this.lowFor = 0;
    }
  }

  private updateXray(at: Vec3 | null): void {
    if (!at) {
      xrayUniforms.uXrayRadius.value = 0;
      return;
    }
    const cam = this.cam.camera;
    const v = new THREE.Vector3(at.x, at.y + 0.9, at.z);
    const depth = v.clone().applyMatrix4(cam.matrixWorldInverse).z;
    v.project(cam);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    xrayUniforms.uXrayCenter.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y);
    xrayUniforms.uXrayRadius.value = Math.min(size.x, size.y) * (this.mobile ? RENDER.xrayRadius.mobile : RENDER.xrayRadius.desktop);
    // キャラより少し手前の物だけを抜く（足元の床や、すぐ横の棚は残す）
    xrayUniforms.uXrayDepth.value = -depth - RENDER.xrayMargin;
  }

  private measure(dt: number): void {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime < 1) return;
    this.fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    if (!this.autoQuality) return;
    const floor = this.mobile ? RENDER.fpsFloorMobile : RENDER.fpsFloorDesktop;
    this.lowFor = this.fps < floor ? this.lowFor + 1 : 0;
    if (this.lowFor >= RENDER.fpsWindow && this.quality !== 'low') {
      this.lowFor = 0;
      this.setQuality(this.quality === 'high' ? 'mid' : 'low');
    }
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.applyQuality();
    // 影の有無を切り替えたら、材質を作り直してもらう
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) m.needsUpdate = true;
    });
  }

  private applyQuality(): void {
    const size = SHADOW_SIZE[this.quality];
    // 影の1画素が大きいほど、床や棚に横縞（影のにじみ）が出やすいので、補正を大きくする
    const texel = 32 / Math.max(1, size);
    this.sun.shadow.bias = -0.00025 - texel * 0.004;
    this.sun.shadow.normalBias = 0.02 + texel * 1.2;
    this.renderer.shadowMap.enabled = size > 0;
    this.sun.castShadow = size > 0;
    if (size > 0) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    if (this.avatars) this.avatars.blobsVisible = this.quality === 'low';
  }

  /** 画面上の位置（CSS の画素）。カメラの後ろなら visible=false */
  project(p: Vec3): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.cam.camera);
    const el = this.renderer.domElement;
    return { x: (v.x * 0.5 + 0.5) * el.clientWidth, y: (-v.y * 0.5 + 0.5) * el.clientHeight, visible: v.z < 1 && v.z > -1 };
  }

  stats(): RenderStats {
    return { fps: Math.round(this.fps * 10) / 10, calls: this.lastCalls, triangles: this.lastTris, quality: this.quality };
  }
}
