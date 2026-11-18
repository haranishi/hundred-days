/**
 * キャラの描画。GLB の32種類の動きを AnimName に割り当て、AnimationMixer で切り替える（docs/04）。
 * 足元にプレイヤーの色の輪を出す（色だけでなく、頭上の札で形と番号も出す＝HUD の担当）。
 */
import * as THREE from 'three';
import type { AnimName, AvatarView, NpcView } from '../../shared/view';
import { RENDER } from '../../shared/rules/tuning';
import type { Assets } from './assets';
import { PALETTE } from './palette';

interface ClipSpec {
  clip: string;
  loop: boolean;
  speed?: number;
}

/** AnimName → GLB の動きの名前 */
export const ANIM_CLIPS: Record<AnimName, ClipSpec> = {
  idle: { clip: 'idle', loop: true },
  walk: { clip: 'walk', loop: true, speed: 1.2 },
  run: { clip: 'sprint', loop: true },
  dash: { clip: 'sprint', loop: true, speed: 1.6 },
  jump: { clip: 'jump', loop: false },
  fall: { clip: 'fall', loop: true },
  'push-cart': { clip: 'holding-both', loop: true },
  'ride-cart': { clip: 'holding-both', loop: true },
  kick: { clip: 'attack-kick-right', loop: false, speed: 1.3 },
  sweep: { clip: 'attack-melee-right', loop: false, speed: 1.2 },
  hold: { clip: 'holding-both', loop: true },
  throw: { clip: 'attack-melee-left', loop: false },
  'pick-up': { clip: 'pick-up', loop: false },
  eat: { clip: 'interact-right', loop: true },
  bell: { clip: 'interact-right', loop: true, speed: 2.4 },
  pa: { clip: 'emote-yes', loop: true },
  chill: { clip: 'sit', loop: true },
  tantrum: { clip: 'die', loop: true, speed: 2 },
  slip: { clip: 'die', loop: false, speed: 1.6 },
  caught: { clip: 'emote-no', loop: true },
  stunned: { clip: 'die', loop: false },
  cheer: { clip: 'emote-yes', loop: true },
  sad: { clip: 'emote-no', loop: true },
};

class Character {
  readonly root: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentName: AnimName | null = null;
  readonly ring: THREE.Mesh | null;
  readonly blob: THREE.Mesh;

  /** slot が null なら足元の輪を出さない（店員・客） */
  constructor(assets: Assets, key: string, slot: number | null, blobMat: THREE.Material, carry?: THREE.Object3D) {
    const { root, clips } = assets.character(key);
    this.root = new THREE.Group();
    root.scale.setScalar(RENDER.modelScale);
    this.root.add(root);
    if (carry) this.root.add(carry);
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
    if (slot !== null) {
      const color = PALETTE.players[slot % PALETTE.players.length]!;
      const ringGeo = new THREE.RingGeometry(0.42, 0.56, 32);
      ringGeo.rotateX(-Math.PI / 2);
      this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
      this.ring.position.y = 0.015;
      this.ring.renderOrder = 2;
    } else this.ring = null;
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24).rotateX(-Math.PI / 2), blobMat);
    this.blob.position.y = 0.01;
    this.blob.renderOrder = 1;
  }

  place(x: number, y: number, z: number, yaw: number, blobs: boolean): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    this.ring?.position.set(x, 0.015, z);
    this.blob.position.set(x, 0.01, z);
    this.blob.visible = blobs;
  }

  play(name: AnimName): void {
    if (name === this.currentName) return;
    const spec = ANIM_CLIPS[name];
    const next = this.actions.get(spec.clip) ?? this.actions.get('idle');
    if (!next) return;
    next.reset();
    next.setLoop(spec.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !spec.loop;
    next.timeScale = spec.speed ?? 1;
    if (this.current && this.current !== next) {
      next.crossFadeFrom(this.current, 0.12, false);
    }
    next.play();
    this.current = next;
    this.currentName = name;
  }
}

export class AvatarsView {
  readonly group = new THREE.Group();
  private readonly chars = new Map<string, Character>();
  private readonly loading = new Set<string>();
  private readonly blobMat = new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.22, depthWrite: false });
  blobsVisible = false;

  constructor(private readonly assets: Assets) {
    this.group.name = 'avatars';
  }

  /** 読み込み済みならキャラを作る。まだなら読み込みを始めて、今回は描かない（app.ts が読み忘れても、あとから出る） */
  private ensure(id: string, key: string, slot: number | null, carry?: () => THREE.Object3D): Character | null {
    const hit = this.chars.get(id);
    if (hit) return hit;
    if (!this.assets.has(key)) {
      if (!this.loading.has(key)) {
        this.loading.add(key);
        this.assets.load([key]).catch((e: unknown) => console.warn('キャラを読めませんでした', key, e));
      }
      return null;
    }
    const c = new Character(this.assets, key, slot, this.blobMat, carry?.());
    this.chars.set(id, c);
    this.group.add(c.root, c.blob);
    if (c.ring) this.group.add(c.ring);
    return c;
  }

  update(avatars: readonly AvatarView[], dt: number): void {
    for (const a of avatars) {
      const c = this.ensure(`p${a.slot}`, a.character, a.slot);
      if (!c) continue;
      c.place(a.pos.x, a.pos.y, a.pos.z, a.yaw, this.blobsVisible);
      c.root.visible = a.connected;
      if (c.ring) c.ring.visible = a.connected;
      c.play(a.anim);
      c.mixer.update(dt);
    }
  }

  /** 店員・店長・客。客はカゴを持つ */
  updateNpcs(npcs: readonly NpcView[], dt: number): void {
    const seen = new Set<string>();
    for (const n of npcs) {
      const id = `n${n.id}`;
      seen.add(id);
      const c = this.ensure(id, n.character, null, n.role === 'shopper' ? () => this.basket() : undefined);
      if (!c) continue;
      c.root.visible = true;
      c.place(n.pos.x, n.pos.y, n.pos.z, n.yaw, this.blobsVisible);
      c.play(n.anim);
      c.mixer.update(dt);
    }
    for (const [id, c] of this.chars) if (id.startsWith('n') && !seen.has(id)) c.root.visible = false;
  }

  /** 客が持つカゴ（Mini Market のカゴを小さめに、手の前に） */
  private basket(): THREE.Object3D {
    if (!this.assets.has('mm/shopping-basket')) return new THREE.Group();
    const g = this.assets.geometry('mm/shopping-basket');
    const m = new THREE.Mesh(g.geometry, g.materials[0]!);
    m.scale.setScalar(RENDER.modelScale * 0.55);
    m.position.set(0.32, 0.55, 0.28);
    m.castShadow = true;
    return m;
  }

  dispose(): void {
    for (const c of this.chars.values()) c.mixer.stopAllAction();
    this.chars.clear();
    this.group.clear();
  }
}
