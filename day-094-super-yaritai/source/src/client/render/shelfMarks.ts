/**
 * 空き棚「品切れ」値札バッジ：棚の各面を長手3区画に分け、70%以上の商品が移動・非表示になった区画の値札レール上に
 * 「品切れ」ミニ札を1本の InstancedMesh（1ドローコール）でポップ表示する。
 */
import * as THREE from 'three';
import { SHELF, faceOfProp, type ShelfFace, type StoreLayout } from '../../shared/layout/store';
import { FALL } from '../../shared/rules/tuning';
import type { Vec3, WorldStatic, WorldView } from '../../shared/view';
import { prefersReducedMotion } from './camera';
import { PALETTE } from './palette';
import { stampScaleCurve } from './signs';
import { applyXray } from './xray';

export const SHELF_ZONES_PER_FACE = 3;
export const SHELF_EMPTY_RATIO = 0.7;
const BADGE_POP_TIME = 0.22;
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Meiryo", system-ui, sans-serif';

export interface ShelfZoneDef {
  id: number;
  face: ShelfFace;
  zoneIndex: number;
  alongCenter: number;
  pos: Vec3;
  yaw: number;
  propIds: number[];
  propHomes: Vec3[];
}

export interface ShelfZoneStatus {
  id: number;
  faceId: number;
  zoneIndex: number;
  total: number;
  swept: number;
  ratio: number;
  empty: boolean;
}

function faceTangent(face: ShelfFace): [number, number] {
  return Math.abs(face.nx) >= Math.abs(face.nz) ? [0, 1] : [1, 0];
}

/** 各 ShelfFace を長手方向に分割し、初期商品を各区画へ割り当てる（純粋関数） */
export function buildShelfZones(
  faces: readonly ShelfFace[],
  world: WorldStatic,
  zonesPerFace = SHELF_ZONES_PER_FACE,
): ShelfZoneDef[] {
  const byFace = new Map<number, typeof world.props>();
  for (const p of world.props) {
    if (p.kind !== 'product') continue;
    const f = faceOfProp(p);
    if (!f) continue;
    const list = byFace.get(f.id);
    if (list) list.push(p);
    else byFace.set(f.id, [p]);
  }

  const zones: ShelfZoneDef[] = [];
  for (const face of faces) {
    const [tx, tz] = faceTangent(face);
    const yaw = Math.atan2(face.nx, face.nz);
    const startIdx = zones.length;
    for (let zi = 0; zi < zonesPerFace; zi++) {
      const alongCenter = -face.halfLen + ((zi + 0.5) / zonesPerFace) * (face.halfLen * 2);
      zones.push({
        id: zones.length,
        face,
        zoneIndex: zi,
        alongCenter,
        pos: {
          x: face.x + tx * alongCenter + face.nx * 0.026,
          y: SHELF.levels[1] - 0.04,
          z: face.z + tz * alongCenter + face.nz * 0.026,
        },
        yaw,
        propIds: [],
        propHomes: [],
      });
    }
    const faceProps = byFace.get(face.id);
    if (!faceProps) continue;
    for (const p of faceProps) {
      const along = (p.home.pos.x - face.x) * tx + (p.home.pos.z - face.z) * tz;
      const u = face.halfLen > 0 ? (along + face.halfLen) / (face.halfLen * 2) : 0.5;
      const zi = Math.max(0, Math.min(zonesPerFace - 1, Math.floor(u * zonesPerFace)));
      const zone = zones[startIdx + zi]!;
      zone.propIds.push(p.id);
      zone.propHomes.push(p.home.pos);
    }
  }
  return zones;
}

/** 各棚区画の移動・非表示割合（>= FALL.moveDistance）を算出し、70%以上で empty を立てる（純粋関数） */
export function computeShelfZoneStatuses(
  zones: readonly ShelfZoneDef[],
  propTransforms: ArrayLike<number>,
  propHidden: ArrayLike<number>,
  threshold = SHELF_EMPTY_RATIO,
): ShelfZoneStatus[] {
  const minDistSq = FALL.moveDistance * FALL.moveDistance;
  return zones.map((z) => {
    const total = z.propIds.length;
    if (total === 0) {
      return { id: z.id, faceId: z.face.id, zoneIndex: z.zoneIndex, total: 0, swept: 0, ratio: 0, empty: false };
    }
    let swept = 0;
    for (let i = 0; i < total; i++) {
      const id = z.propIds[i]!;
      if (propHidden[id]) {
        swept++;
        continue;
      }
      const o = id * 7;
      const h = z.propHomes[i]!;
      const dx = (propTransforms[o] ?? h.x) - h.x;
      const dy = (propTransforms[o + 1] ?? h.y) - h.y;
      const dz = (propTransforms[o + 2] ?? h.z) - h.z;
      if (dx * dx + dy * dy + dz * dz >= minDistSq) swept++;
    }
    const ratio = swept / total;
    return { id: z.id, faceId: z.face.id, zoneIndex: z.zoneIndex, total, swept, ratio, empty: ratio >= threshold };
  });
}

function drawBadgeTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    fallback.needsUpdate = true;
    return fallback;
  }
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  const pad = 6;
  const r = 18;
  const drawPill = (): void => {
    ctx.beginPath();
    ctx.moveTo(pad + r, pad);
    ctx.arcTo(w - pad, pad, w - pad, h - pad, r);
    ctx.arcTo(w - pad, h - pad, pad, h - pad, r);
    ctx.arcTo(pad, h - pad, pad, pad, r);
    ctx.arcTo(pad, pad, w - pad, pad, r);
    ctx.closePath();
  };

  ctx.save();
  drawPill();
  ctx.fillStyle = PALETTE.cream;
  ctx.fill();
  ctx.clip();
  // 左上の黄帯で通常値札と区別しつつクリーム地を保つ
  ctx.fillStyle = PALETTE.yellow;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.42, 0);
  ctx.lineTo(w * 0.24, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  drawPill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = PALETTE.red;
  ctx.stroke();

  ctx.font = `900 58px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = PALETTE.cream;
  ctx.strokeText('品切れ', w / 2 + 8, h / 2 + 2);
  ctx.fillStyle = PALETTE.redDark;
  ctx.fillText('品切れ', w / 2 + 8, h / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const m4 = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

export class ShelfMarksView {
  readonly mesh: THREE.InstancedMesh;
  readonly zones: readonly ShelfZoneDef[];
  private readonly texture: THREE.Texture;
  private readonly ages: Float32Array;

  constructor(layout: StoreLayout, world: WorldStatic) {
    this.zones = buildShelfZones(layout.faces, world);
    this.ages = new Float32Array(this.zones.length).fill(-1);
    this.texture = drawBadgeTexture();

    const geo = new THREE.PlaneGeometry(0.44, 0.22);
    geo.rotateZ(-0.14);
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.3,
      side: THREE.FrontSide,
    });
    applyXray(mat);

    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.zones.length));
    this.mesh.name = 'shelf-marks';
    this.mesh.count = this.zones.length;
    this.mesh.renderOrder = 3;
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;

    for (let i = 0; i < this.zones.length; i++) {
      m4.compose(pos.set(0, -50, 0), quat.identity(), scl.set(0, 0, 0));
      this.mesh.setMatrixAt(i, m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(view: WorldView, dt = 1 / 60): void {
    const statuses = computeShelfZoneStatuses(this.zones, view.propTransforms, view.propHidden);
    const reduced = prefersReducedMotion();
    const safeDt = Math.max(0, dt);

    for (let i = 0; i < statuses.length; i++) {
      const s = statuses[i]!;
      const z = this.zones[i]!;
      if (s.empty) {
        let age = this.ages[i]!;
        if (reduced) age = BADGE_POP_TIME;
        else if (age < 0) age = Math.min(BADGE_POP_TIME, safeDt);
        else age = Math.min(BADGE_POP_TIME, age + safeDt);
        this.ages[i] = age;
        const scale = stampScaleCurve(age / BADGE_POP_TIME);
        quat.setFromAxisAngle(up, z.yaw);
        m4.compose(pos.set(z.pos.x, z.pos.y, z.pos.z), quat, scl.set(scale, scale, 1));
      } else {
        this.ages[i] = -1;
        m4.compose(pos.set(0, -50, 0), quat.identity(), scl.set(0, 0, 0));
      }
      this.mesh.setMatrixAt(i, m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
    this.mesh.dispose();
  }
}
