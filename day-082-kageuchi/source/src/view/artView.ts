// OWNER: integrate
// 表示の口 GameView を art（世界・人物・後処理・透かし）で実装する。重ね（扇・印・物音の輪・小石）は main.ts が overlayRoot に足す。
// 毎コマの順：人物 → 手提灯の明かり（紙の位置へ）→ world.setMovingLights → world.update → world.updateForCamera
//   → 透かし → 後処理の段（発見・討ち取り・捕まった）→ post.render。renderer.render は直接呼ばない。
// 灯りの数は途中で変えない（手提灯は世界の9つの枠を使い回す。visible は切らない）。
// 世界と人物の口のうち契約の外のもの（setViewportHeight・setShotMode・setDrain・prime）は、ここだけが使う。
import * as THREE from 'three';
import { createCharacter } from '../art/characters';
import type { KgPost } from '../art/render/post';
import { setBushHole } from '../art/render/seeThrough';
import { buildWorld, createPost, createRenderer, createSeeThrough, warmUp, type KgWorld } from '../art/world';
import { ambientFactorAt } from '../art/world/worldMap';
import { FINALE } from '../config/rules';
import { VIEW } from '../config/view';
import type { ArtCharacter, ArtSeeThrough } from '../contract/art';
import type { CharacterKind, MovingLight, SimSnapshot } from '../contract/snapshot';
import type { StageDef } from '../stage/types';
import type { GameView } from './GameView';
import { Overlays } from './overlays';

interface CharEntry {
  c: ArtCharacter;
  kind: CharacterKind;
}

/** ?shade=0：人物の足元の暗さを切る（見比べ用）。 */
const SHADE_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('shade') === '0';

const smooth = (a: number, b: number, x: number): number => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/** 遠ざかる値をばねなしで寄せる（1 秒あたり rate の割合で近づく）。 */
const approach = (v: number, target: number, rate: number, dt: number): number => v + (target - v) * (1 - Math.exp(-rate * dt));

export class ArtView implements GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly overlayRoot = new THREE.Group();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly world: KgWorld;
  private readonly post: KgPost;
  private readonly see: ArtSeeThrough;
  private readonly chars = new Map<string, CharEntry>();
  private readonly ready: Promise<void>;
  private isReady = false;
  private shot = false;
  private lastSnapT = -1;
  /** 飾り（炎・揺らぎ・霧）の時計：sim の時刻＋sim が止まっていた間の実時間。撮影では sim の時刻そのもの。 */
  private freeT = 0;
  private alertK = 0;
  private drainK = 0;
  private lastStats = { calls: 0, triangles: 0 };
  private readonly foot = new THREE.Vector3();
  /** 透かしに渡す、ほかに見せたい人物の足元（当て身・討ち取りの相手、討ち取りで駆け寄る蘭丸。最大2つ）。r02-fix-play 追加 */
  private readonly otherPool = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly others: THREE.Vector3[] = [];
  private readonly paper = new THREE.Vector3();
  /** 手提灯の明かり（紙の位置へ寄せた写し）。配列の長さは毎コマ、いまの手提灯の数に合わせる。 */
  private readonly lightPool: MovingLight[] = [];
  private readonly lights: MovingLight[] = [];
  private readonly hides: StageDef['hides'];
  /** 先作りに使った一時の重ねと人物（シェーダーを捨てさせないために持っておく。場面には入れない）。 */
  private warmKeep: { ov: Overlays; chars: ArtCharacter[] } | null = null;
  private bushK = 0;

  constructor(canvas: HTMLCanvasElement, stage: StageDef, camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.hides = stage.hides;
    // 先作りの1コマ（隠れている物まで描く）を見せないよう、準備ができるまで画面を出さない
    canvas.style.opacity = '0';
    this.renderer = createRenderer(canvas);
    this.world = buildWorld(this.scene, this.renderer, stage);
    this.overlayRoot.name = 'overlays';
    this.scene.add(this.overlayRoot);
    this.post = createPost(this.renderer, this.scene, camera);
    this.see = createSeeThrough();
    this.ready = this.warm().then(() => {
      this.isReady = true;
      // 遊ぶときは夜の寺がふっと浮かぶように。撮影では待たずにすぐ出す
      canvas.style.transition = this.shot ? '' : 'opacity 0.9s ease';
      canvas.style.opacity = '1';
    });
  }

  /**
   * シェーダーを先に作る。ふだん隠れている物（光の弧・重ねの印・炎上）と、まだ出ていない種類の人物も、いったん描く数に入れる
   * （討ち取りの一閃や、最初の「！」で 1 秒止まらないように）。灯りの visible は触らない（触ると灯りの数が変わったとみなされる）。
   */
  private async warm(): Promise<void> {
    const temp = new THREE.Group();
    temp.name = 'warm';
    this.scene.add(temp);
    const kinds: CharacterKind[] = ['player', 'ashigaru', 'samurai', 'ranmaru', 'nobunaga'];
    const chars = kinds.map((k) => createCharacter(k));
    for (const [i, c] of chars.entries()) {
      temp.add(c.root);
      c.update(1 / 60, {
        id: `warm-${i}`,
        kind: kinds[i],
        x: i,
        z: 0,
        yaw: 0,
        pose: { speed: 0, stance: 'stand', awareness: 'calm', headYaw: 0, action: null, lantern: kinds[i] === 'ashigaru', weapon: 'katana' },
      });
    }
    const ov = new Overlays(temp);
    const poly = new Float32Array(2 * 41);
    for (let i = 1; i < 41; i++) {
      poly[i * 2] = Math.cos(i * 0.05) * 4;
      poly[i * 2 + 1] = Math.sin(i * 0.05) * 4;
    }
    const bands = new Float32Array([5, 0, 5, 0.3, 6, 0.3, 6, 0]);
    const marks = (['?', '!', 'zzz', '!?'] as const).map((kind, i) => ({ id: `m${i}`, kind, fill: 0.5, x: i, y: 2, z: 0 }));
    ov.update(
      1 / 60,
      {
        t: 0,
        phase: 'normal',
        phaseLeft: 0,
        characters: [],
        lights: [],
        stones: [{ x: 0, y: 1, z: 0 }],
        noises: [{ x: 0, z: 0, radius: 3, age: 0.2 }],
        cones: [{ id: 'c', poly, bands, awareness: 'calm', fill: 0 }],
        marks,
        aim: { x: 3, z: 3, valid: true },
        finale: null,
      },
      this.camera,
    );
    // 隠れている物をいったん出す（灯りは除く）
    const shown: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible && !(o as THREE.Light).isLight) {
        o.visible = true;
        shown.push(o);
      }
    });
    try {
      await warmUp(this.renderer, this.scene, this.camera);
    } finally {
      for (const o of shown) o.visible = false;
      // 一時の重ねと人物は dispose しない：材質を捨てると、three はそのシェーダーも（使う者がいなければ）捨て、
      // 本物の重ねや一閃が初めて出た所で作り直して止まる（r01-integrate で当て身・発見・討ち取りの時に実測で 1 つずつ増えた）
      temp.removeFromParent();
      this.warmKeep = { ov, chars };
    }
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  setShotMode(on: boolean): number {
    this.shot = on;
    this.post.setShotMode(on);
    return on ? VIEW.shotSettleFrames : 0;
  }

  update(dt: number, snap: SimSnapshot, camera: THREE.PerspectiveCamera, simDt: number): void {
    // 新しい sim（やり直し・タイトルから遊ぶ）は時刻が戻る：人物を作り直し、前の試みの姿勢や倒れを引きずらない
    if (snap.t + 1e-6 < this.lastSnapT) this.clearCharacters();
    this.lastSnapT = snap.t;

    // 人物
    let player: SimSnapshot['characters'][number] | null = null;
    const seen = new Set<string>();
    for (const cs of snap.characters) {
      let e = this.chars.get(cs.id);
      if (e && e.kind !== cs.kind) {
        e.c.dispose();
        this.chars.delete(cs.id);
        e = undefined;
      }
      if (!e) {
        const c = createCharacter(cs.kind);
        this.scene.add(c.root);
        e = { c, kind: cs.kind };
        this.chars.set(cs.id, e);
      }
      e.c.root.visible = true;
      e.c.update(simDt, cs);
      // 足元の暗さ（世界の材質と同じ地図）。下限を残して輪郭は読ませる
      const f = SHADE_OFF ? 1 : Math.max(VIEW.shade.floor, ambientFactorAt(cs.x, cs.z));
      e.c.setShade(f, 1 - (1 - f) * VIEW.shade.keyMix);
      seen.add(cs.id);
      if (cs.kind === 'player') player = cs;
    }
    for (const [id, e] of this.chars) if (!seen.has(id)) e.c.root.visible = false;

    // 手提灯の明かり：明るさの計算は sim の点（RULES の前 0.35・右 0.2・高さ 0.9）、描く灯りは紙の揺れに合わせる
    this.lights.length = 0;
    for (const l of snap.lights) {
      let m = this.lightPool[this.lights.length];
      if (!m) {
        m = { id: '', x: 0, y: 0, z: 0, radius: 0, intensity: 0 };
        this.lightPool.push(m);
      }
      m.id = l.id;
      m.x = l.x;
      m.y = l.y;
      m.z = l.z;
      m.radius = l.radius;
      m.intensity = l.intensity;
      const e = this.chars.get(l.id);
      if (e && e.c.root.visible && e.c.lanternPaper(this.paper)) {
        m.x = this.paper.x;
        m.y = this.paper.y;
        m.z = this.paper.z;
      }
      this.lights.push(m);
    }
    this.world.setMovingLights(this.lights);
    this.world.setInteractions?.(snap.interactions ?? [], snap.disabledLights ?? []);

    // 飾りの時計
    if (!this.shot && simDt <= 0) this.freeT += dt;
    const t = this.shot ? snap.t : snap.t + this.freeT;
    this.world.update(dt, t);
    this.world.updateForCamera(camera);

    // 透かし：プレイヤーの足元。演出でカメラが全景へ引き始めたら切る
    const fin = snap.finale;
    const seeOn = player !== null && (fin === null || fin < FINALE.cameraFrom);
    if (player) this.foot.set(player.x, 0, player.z);
    // 当て身・討ち取りの最中は、相手の足元も抜く（r02-fix-play：体験の採点 2 位「鐘楼の当て身が屋根と松に隠れて見えない」の画面側）。
    // 写しの動作には相手の id が無いので、受ける側の動作（takedownVictim・assassinateVictim）を探す。討ち取りの間は駆け寄る蘭丸も
    this.others.length = 0;
    if (seeOn) {
      // 相手を先に入れ、空きがあれば蘭丸
      for (const pass of [0, 1]) {
        for (const cs of snap.characters) {
          if (this.others.length >= this.otherPool.length) break;
          const k = cs.pose.action?.kind;
          const pick = pass === 0 ? k === 'takedownVictim' || k === 'assassinateVictim' : fin !== null && cs.kind === 'ranmaru' && cs.pose.stance !== 'down';
          if (pick) this.others.push(this.otherPool[this.others.length].set(cs.x, 0, cs.z));
        }
      }
    }
    this.see.update(camera, this.foot, seeOn, this.others);
    // 植え込みに隠れている間は、その植え込みをプレイヤーのまわりだけ網点で抜く（自分の姿を見失わないように）
    const inBush = player !== null && seeOn && this.hides.some((h) => Math.hypot(player!.x - h.center.x, player!.z - h.center.z) <= h.radius);
    const bushTarget = inBush ? (player!.pose.stance === 'crouch' ? VIEW.bush.crouch : VIEW.bush.stand) : 0;
    this.bushK = this.shot ? bushTarget : approach(this.bushK, bushTarget, VIEW.bush.rate, dt);
    setBushHole(this.foot.x, this.foot.z, VIEW.bush.radius, this.bushK);

    // 発見の赤み（寺の構えの段で上げ下げ。演出の間は消す）
    const alertTarget = fin !== null ? 0 : VIEW.alert[snap.phase];
    this.alertK = this.shot ? alertTarget : approach(this.alertK, alertTarget, alertTarget > this.alertK ? VIEW.alert.rise : VIEW.alert.fall, dt);
    this.post.setAlert(this.alertK);

    // 討ち取り：炎上は進み 0.2 から、色抜きは 0.15〜0.35 で上げる
    if (fin !== null) {
      this.world.setFire((fin - FINALE.fireFrom) / (1 - FINALE.fireFrom));
      this.post.setFinale(smooth(VIEW.finale.from, VIEW.finale.to, fin));
    } else {
      this.world.setFire(0);
      this.post.setFinale(0);
    }

    // 捕まった：突かれて倒れる間に色を抜く（やり直すとすぐ戻す）
    const caught = player !== null && (player.pose.action?.kind === 'struck' || player.pose.stance === 'down');
    this.drainK = !caught ? 0 : this.shot ? 1 : approach(this.drainK, 1, VIEW.drain.rise, dt);
    this.post.setDrain(this.drainK);
  }

  private clearCharacters(): void {
    for (const e of this.chars.values()) e.c.dispose();
    this.chars.clear();
  }

  render(dt: number): void {
    if (!this.isReady) return;
    this.post.render(dt);
    const info = this.renderer.info.render;
    this.lastStats = { calls: info.calls, triangles: info.triangles };
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.post.setSize(width, height);
    this.world.setViewportHeight(height * this.renderer.getPixelRatio());
  }

  stats(): { calls: number; triangles: number; programs: number } {
    return { ...this.lastStats, programs: this.renderer.info.programs?.length ?? 0 };
  }

  dispose(): void {
    this.clearCharacters();
    this.warmKeep?.ov.dispose();
    this.warmKeep?.chars.forEach((c) => c.dispose());
    this.world.dispose();
    this.post.dispose();
    this.renderer.dispose();
  }
}
