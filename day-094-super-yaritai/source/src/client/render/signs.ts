/**
 * 店の札（注意書き・通路の名前・特売のPOP・店の看板・値札）。日本語は canvas で描き、1枚の大きな絵（アトラス）にまとめる。
 * 静的札は1つの形にまとめて1回で描き、床置きPOPポール札（「特売」「本日のおすすめ」）だけ根元軸のグループに分離して転倒演出を行う。
 * 「おねがい」札の達成済み「済」スタンプは1本の InstancedMesh（1ドローコール）で描画する。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SignDef, StoreLayout } from '../../shared/layout/store';
import type { MisdeedId } from '../../shared/rules/misdeeds';
import type { StationsView } from '../../shared/view';
import { prefersReducedMotion } from './camera';
import { PALETTE } from './palette';
import { applyXray } from './xray';

const ATLAS = 2048;
const PX_PER_M = 230;
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Meiryo", system-ui, sans-serif';
const STAMP_SIZE_PX = 256;
const STAMP_POP_TIME = 0.25;

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type MovableSignTrigger = 'pyramid' | 'bowling';

export interface MovableSignSpec {
  sign: SignDef;
  trigger: MovableSignTrigger;
  tipRotation: { x: number; z: number };
}

export interface MovableSignParts {
  spec: MovableSignSpec;
  boardGeometry: THREE.BufferGeometry;
  poleGeometry: THREE.BufferGeometry;
  baseGeometry: THREE.BufferGeometry;
}

export interface PartitionedSigns {
  staticSigns: SignDef[];
  movableSigns: MovableSignSpec[];
  noticeSigns: (SignDef & { misdeed: MisdeedId })[];
}

export function isMovablePopSign(s: SignDef): boolean {
  return s.style === 'pop' && Boolean(s.pole);
}

export function movableSignTrigger(s: SignDef): MovableSignTrigger {
  return s.text.includes('特売') ? 'pyramid' : 'bowling';
}

/** 台・隣接POPと重ならない方向へ倒れる回転角（rad）を算出する（常にカメラ向き表面を維持） */
export function computeTipRotation(
  sign: SignDef,
  trigger: MovableSignTrigger,
  layout?: Pick<StoreLayout, 'fixtures' | 'places'>,
): { x: number; z: number } {
  const obs =
    trigger === 'pyramid'
      ? (layout?.fixtures.find((f) => f.kind === 'sale-table')?.pos ?? { x: sign.pos.x - 1.9, z: sign.pos.z - 0.2 })
      : (layout?.fixtures.find((f) => f.kind === 'wagon')?.pos ?? layout?.places.lane ?? { x: sign.pos.x + 1.3, z: sign.pos.z - 0.2 });
  const dx = sign.pos.x - obs.x;
  const dir = dx === 0 ? -1 : -Math.sign(dx);
  // わずかに手前側カメラへ向いた表面（FrontSide）を保ちつつ、隣接する「特売」と「本日のおすすめ」が X字に交差しない角度で倒す
  return trigger === 'pyramid'
    ? { x: -0.24, z: dir * 0.96 }
    : { x: -0.94, z: dir * 0.32 };
}

export function partitionSigns(
  signs: readonly SignDef[],
  layout?: Pick<StoreLayout, 'fixtures' | 'places'>,
): PartitionedSigns {
  const staticSigns: SignDef[] = [];
  const movableSigns: MovableSignSpec[] = [];
  const noticeSigns: (SignDef & { misdeed: MisdeedId })[] = [];
  for (const s of signs) {
    if (isMovablePopSign(s)) {
      const trigger = movableSignTrigger(s);
      movableSigns.push({ sign: s, trigger, tipRotation: computeTipRotation(s, trigger, layout) });
    } else {
      staticSigns.push(s);
    }
    if (s.style === 'notice' && s.misdeed) {
      noticeSigns.push(s as SignDef & { misdeed: MisdeedId });
    }
  }
  return { staticSigns, movableSigns, noticeSigns };
}

export function isMovableSignTriggered(trigger: MovableSignTrigger, stations: StationsView | null | undefined): boolean {
  if (!stations) return false;
  if (trigger === 'pyramid') return stations.pyramid.collapsed;
  return stations.bowling.pinsDown > 0 || stations.watermelons.left <= 0;
}

/** 0 -> 1.18 -> 1.0 のスタンプ弾みスケール（u in [0, 1]） */
export function stampScaleCurve(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < 0.6) {
    const k = u / 0.6;
    return 1.18 * (1 - (1 - k) * (1 - k));
  }
  const k = (u - 0.6) / 0.4;
  return 1.18 - 0.18 * (1 - (1 - k) * (1 - k));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 幅に収まるよう文字の大きさを決め、入らなければ2行に分ける */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxH: number, weight = 800): { lines: string[]; size: number } {
  const measure = (s: string, size: number): number => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    return ctx.measureText(s).width;
  };
  let size = maxH * 0.78;
  const w1 = measure(text, 100) / 100;
  size = Math.min(size, maxW / Math.max(w1, 0.01));
  if (size >= maxH * 0.42 || text.length < 8) return { lines: [text], size };
  const lines = splitJa(text);
  const w2 = Math.max(measure(lines[0]!, 100), measure(lines[1]!, 100)) / 100;
  return { lines, size: Math.min(maxH * 0.4, maxW / Math.max(w2, 0.01)) };
}

/** 2行に分ける。真ん中に近い、助詞や読点の直後で切る（「寝転｜ばない」のような切れ方を避ける） */
function splitJa(text: string): [string, string] {
  const mid = text.length / 2;
  let best = Math.ceil(mid);
  let bestScore = Infinity;
  for (let i = 2; i < text.length - 1; i++) {
    const prev = text[i - 1]!;
    const good = 'でをはにがのと、。・'.includes(prev);
    const score = Math.abs(i - mid) + (good ? 0 : 3);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return [text.slice(0, best), text.slice(best)];
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], size: number, cx: number, cy: number, color: string, weight = 800): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = size * 1.12;
  lines.forEach((l, i) => ctx.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * lh));
}

function drawSign(ctx: CanvasRenderingContext2D, s: SignDef, c: Cell): void {
  const { x, y, w, h } = c;
  const r = Math.min(w, h) * 0.12;
  ctx.save();
  switch (s.style) {
    case 'notice': {
      // 店の注意書き：白地に赤い枠と見出し帯
      roundRect(ctx, x + 2, y + 2, w - 4, h - 4, r);
      ctx.fillStyle = PALETTE.white;
      ctx.fill();
      ctx.lineWidth = Math.max(4, h * 0.06);
      ctx.strokeStyle = PALETTE.red;
      ctx.stroke();
      const band = h * 0.28;
      ctx.save();
      roundRect(ctx, x + 2, y + 2, w - 4, h - 4, r);
      ctx.clip();
      ctx.fillStyle = PALETTE.red;
      ctx.fillRect(x, y, w, band);
      ctx.restore();
      drawLines(ctx, ['おねがい'], band * 0.7, x + w / 2, y + band / 2 + 2, PALETTE.white, 900);
      const t = fitText(ctx, s.text, w * 0.9, (h - band) * 0.86);
      drawLines(ctx, t.lines, t.size, x + w / 2, y + band + (h - band) / 2, PALETTE.ink);
      break;
    }
    case 'aisle': {
      roundRect(ctx, x + 2, y + 2, w - 4, h - 4, r);
      ctx.fillStyle = PALETTE.blue;
      ctx.fill();
      ctx.lineWidth = Math.max(3, h * 0.05);
      ctx.strokeStyle = PALETTE.white;
      ctx.stroke();
      if (s.sub) {
        const t = fitText(ctx, s.text, w * 0.62, h * 0.8);
        drawLines(ctx, t.lines, t.size, x + w * 0.4, y + h / 2, PALETTE.white, 900);
        ctx.fillStyle = PALETTE.yellow;
        roundRect(ctx, x + w * 0.74, y + h * 0.22, w * 0.22, h * 0.56, h * 0.12);
        ctx.fill();
        drawLines(ctx, [s.sub], Math.min(h * 0.3, (w * 0.2) / Math.max(1, s.sub.length) * 1.6), x + w * 0.85, y + h / 2, PALETTE.ink, 900);
      } else {
        const t = fitText(ctx, s.text, w * 0.86, h * 0.8);
        drawLines(ctx, t.lines, t.size, x + w / 2, y + h / 2, PALETTE.white, 900);
      }
      break;
    }
    case 'pop': {
      // 特売のPOP：黄色の地に赤い太字
      roundRect(ctx, x + 2, y + 2, w - 4, h - 4, r * 1.6);
      ctx.fillStyle = PALETTE.yellow;
      ctx.fill();
      ctx.lineWidth = Math.max(4, h * 0.05);
      ctx.strokeStyle = PALETTE.red;
      ctx.stroke();
      const t = fitText(ctx, s.text, w * 0.86, h * 0.5);
      drawLines(ctx, t.lines, t.size, x + w / 2, y + h * 0.36, PALETTE.red, 900);
      if (s.sub) {
        const u = fitText(ctx, s.sub, w * 0.86, h * 0.26);
        drawLines(ctx, u.lines, u.size, x + w / 2, y + h * 0.76, PALETTE.ink, 800);
      }
      break;
    }
    case 'store': {
      roundRect(ctx, x + 2, y + 2, w - 4, h - 4, r);
      ctx.fillStyle = PALETTE.red;
      ctx.fill();
      const t = fitText(ctx, s.text, w * 0.62, h * 0.8);
      drawLines(ctx, t.lines, t.size, x + w * 0.36, y + h / 2, PALETTE.white, 900);
      if (s.sub) {
        const u = fitText(ctx, s.sub, w * 0.3, h * 0.4);
        drawLines(ctx, u.lines, u.size, x + w * 0.83, y + h / 2, PALETTE.yellow, 800);
      }
      break;
    }
    case 'price': {
      ctx.fillStyle = PALETTE.yellow;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = PALETTE.red;
      ctx.fillRect(x, y, w * 0.08, h);
      const t = fitText(ctx, s.text, w * 0.84, h * 0.86, 900);
      drawLines(ctx, t.lines, t.size, x + w * 0.54, y + h / 2, PALETTE.ink, 900);
      break;
    }
  }
  ctx.restore();
}

function signQuadGeometry(s: SignDef, cell: Cell, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(s.w, s.h);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    // canvas は上が y=0、テクスチャは下が v=0（flipY）
    uv.setXY(i, (cell.x + u * cell.w) / ATLAS, 1 - (cell.y + (1 - v) * cell.h) / ATLAS);
  }
  g.rotateY(s.yaw ?? 0);
  g.translate(x, y, z);
  return g;
}

function poleGeometries(s: SignDef, x: number, z: number): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const p = new THREE.CylinderGeometry(0.035, 0.035, s.pos.y - s.h / 2, 6);
  p.translate(x, (s.pos.y - s.h / 2) / 2, z - 0.03);
  const base = new THREE.CylinderGeometry(0.22, 0.25, 0.05, 12);
  base.translate(x, 0.025, z - 0.03);
  return [p.toNonIndexed(), base.toNonIndexed()];
}

/** 札をすべて描いた形（静的札＋可動POP札の分離パーツ）と、その材質 */
export function buildSigns(
  signs: readonly SignDef[],
  layout?: Pick<StoreLayout, 'fixtures' | 'places'>,
): {
  mesh: THREE.Mesh;
  poles: THREE.BufferGeometry | null;
  texture: THREE.CanvasTexture;
  movable: MovableSignParts[];
} {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const ctx = canvas.getContext('2d')!;
  // 同じ内容の札は同じ場所を使う（値札は種類が少ない）
  const cells = new Map<string, Cell>();
  let cx = 0;
  let cy = 0;
  let rowH = 0;
  const keyOf = (s: SignDef): string => `${s.style}|${s.text}|${s.sub ?? ''}|${s.w}|${s.h}`;
  const order = [...signs].sort((a, b) => b.h - a.h);
  for (const s of order) {
    const k = keyOf(s);
    if (cells.has(k)) continue;
    const scale = s.style === 'price' ? 4 : 1;
    const w = Math.min(ATLAS, Math.round(s.w * PX_PER_M * scale));
    const h = Math.round(s.h * PX_PER_M * scale);
    if (cx + w > ATLAS) {
      cx = 0;
      cy += rowH + 4;
      rowH = 0;
    }
    if (cy + h > ATLAS) break; // 入りきらない札は描かない（予算の見張りは試験で）
    const cell = { x: cx, y: cy, w, h };
    drawSign(ctx, s, cell);
    cells.set(k, cell);
    cx += w + 4;
    rowH = Math.max(rowH, h);
  }
  const quads: THREE.BufferGeometry[] = [];
  const poles: THREE.BufferGeometry[] = [];
  const movable: MovableSignParts[] = [];
  for (const s of signs) {
    const cell = cells.get(keyOf(s));
    if (!cell) continue;
    if (isMovablePopSign(s)) {
      const trigger = movableSignTrigger(s);
      const spec: MovableSignSpec = { sign: s, trigger, tipRotation: computeTipRotation(s, trigger, layout) };
      const pivotY = 0.08;
      const boardGeometry = signQuadGeometry(s, cell, 0, s.pos.y - pivotY, 0).toNonIndexed();
      const [stick, base] = poleGeometries(s, 0, 0);
      stick.translate(0, -pivotY * 0.5, 0);
      base.translate(s.pos.x, 0, s.pos.z);
      movable.push({ spec, boardGeometry, poleGeometry: stick, baseGeometry: base });
      continue;
    }
    quads.push(signQuadGeometry(s, cell, s.pos.x, s.pos.y, s.pos.z));
    if (s.pole) poles.push(...poleGeometries(s, s.pos.x, s.pos.z));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, transparent: false, side: THREE.FrontSide });
  const merged = quads.length ? mergeGeometries(quads.map((q) => q.toNonIndexed()), false)! : new THREE.BufferGeometry();
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = 'signs';
  return { mesh, poles: poles.length ? mergeGeometries(poles, false) : null, texture, movable };
}

/** 転倒する床置きPOPポール札（根元原点のスプリング回転グループ） */
export class MovableSignsView {
  readonly group = new THREE.Group();
  private readonly items: {
    pivot: THREE.Group;
    trigger: MovableSignTrigger;
    tipRotation: { x: number; z: number };
    p: number;
    v: number;
  }[] = [];

  constructor(parts: readonly MovableSignParts[], boardMaterial: THREE.Material, poleMaterial: THREE.Material) {
    this.group.name = 'movable-pop-signs';
    const bases: THREE.BufferGeometry[] = [];
    for (const part of parts) {
      const s = part.spec.sign;
      const pivot = new THREE.Group();
      pivot.name = `movable-sign:${s.text}`;
      pivot.position.set(s.pos.x, 0.08, s.pos.z);

      const board = new THREE.Mesh(part.boardGeometry, boardMaterial);
      board.castShadow = false;
      board.name = 'movable-sign-board';

      const pole = new THREE.Mesh(part.poleGeometry, poleMaterial);
      pole.castShadow = false;
      pole.name = 'movable-sign-pole';

      pivot.add(board, pole);
      this.group.add(pivot);
      bases.push(part.baseGeometry);
      this.items.push({ pivot, trigger: part.spec.trigger, tipRotation: part.spec.tipRotation, p: 0, v: 0 });
    }
    if (bases.length > 0) {
      const baseMesh = new THREE.Mesh(mergeGeometries(bases, false)!, poleMaterial);
      baseMesh.castShadow = false;
      baseMesh.receiveShadow = true;
      baseMesh.name = 'movable-sign-bases';
      this.group.add(baseMesh);
    }
  }

  update(stations: StationsView | null | undefined, dt: number): void {
    const reduced = prefersReducedMotion();
    const stepDt = Math.min(0.05, Math.max(0, dt));
    const steps = stepDt > 0.01 ? 2 : 1;
    const h = stepDt / steps;
    for (const item of this.items) {
      const target = isMovableSignTriggered(item.trigger, stations) ? 1 : 0;
      if (reduced) {
        item.p = target;
        item.v = 0;
      } else if (target === 1) {
        if (item.p < 1 || Math.abs(item.v) > 0.01) {
          for (let i = 0; i < steps; i++) {
            const accel = (1.18 - item.p) * 140 - item.v * 4.5;
            item.v += accel * h;
            item.p += item.v * h;
            if (item.p >= 1) {
              item.p = 1;
              item.v = item.v > 0.35 ? -item.v * 0.42 : 0;
            }
          }
        }
      } else if (item.p > 0 || Math.abs(item.v) > 0.01) {
        for (let i = 0; i < steps; i++) {
          const accel = -item.p * 160 - item.v * 16;
          item.v += accel * h;
          item.p += item.v * h;
        }
        if (Math.abs(item.p) < 0.002 && Math.abs(item.v) < 0.02) {
          item.p = 0;
          item.v = 0;
        }
      }
      item.pivot.rotation.set(item.tipRotation.x * item.p, 0, item.tipRotation.z * item.p);
    }
  }

  reset(): void {
    for (const item of this.items) {
      item.p = 0;
      item.v = 0;
      item.pivot.rotation.set(0, 0, 0);
    }
  }
}

let cachedStampTex: THREE.CanvasTexture | null = null;

function stampTexture(): THREE.Texture {
  if (cachedStampTex) return cachedStampTex;
  if (typeof document === 'undefined') {
    const data = new Uint8Array([255, 255, 255, 255]);
    const fallback = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    fallback.needsUpdate = true;
    return fallback;
  }
  const canvas = document.createElement('canvas');
  canvas.width = STAMP_SIZE_PX;
  canvas.height = STAMP_SIZE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.clearRect !== 'function') {
    const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    fallback.needsUpdate = true;
    return fallback;
  }
  ctx.clearRect(0, 0, STAMP_SIZE_PX, STAMP_SIZE_PX);
  ctx.save();
  ctx.translate(STAMP_SIZE_PX / 2, STAMP_SIZE_PX / 2);
  ctx.rotate((-12 * Math.PI) / 180);

  // クリーム色の縁取りで赤い札の見出し帯とも重なり負けしない「済」ハンコ
  ctx.beginPath();
  ctx.arc(0, 0, 92, 0, Math.PI * 2);
  ctx.lineWidth = 26;
  ctx.strokeStyle = PALETTE.cream;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 92, 0, Math.PI * 2);
  ctx.lineWidth = 14;
  ctx.strokeStyle = PALETTE.redDark;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 74, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = PALETTE.redDark;
  ctx.stroke();

  ctx.font = `900 124px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 16;
  ctx.strokeStyle = PALETTE.cream;
  ctx.strokeText('済', 0, 6);
  ctx.fillStyle = PALETTE.redDark;
  ctx.fillText('済', 0, 6);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cachedStampTex = tex;
  return tex;
}

const stampM4 = new THREE.Matrix4();
const stampPos = new THREE.Vector3();
const stampQuat = new THREE.Quaternion();
const stampScl = new THREE.Vector3();
const stampUp = new THREE.Vector3(0, 1, 0);

/** 「おねがい」札の上に出る赤い「済」スタンプ（1本の InstancedMesh） */
export class NoticeStampsView {
  readonly mesh: THREE.InstancedMesh;
  private readonly entries: {
    misdeed: MisdeedId;
    x: number;
    y: number;
    z: number;
    yaw: number;
    size: number;
    age: number;
  }[] = [];

  constructor(noticeSigns: readonly (SignDef & { misdeed: MisdeedId })[]) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: stampTexture(),
      transparent: true,
      depthWrite: false,
      alphaTest: 0.3,
      side: THREE.FrontSide,
    });
    applyXray(mat);
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, noticeSigns.length));
    this.mesh.name = 'notice-stamps';
    this.mesh.count = noticeSigns.length;
    this.mesh.renderOrder = 3;
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;

    for (const s of noticeSigns) {
      const size = Math.min(0.46, Math.max(0.3, s.h * 0.72));
      const yaw = s.yaw ?? 0;
      const localRight = s.w * 0.5 - size * 0.42;
      const localUp = s.h * 0.22;
      const localNormal = 0.03;
      this.entries.push({
        misdeed: s.misdeed,
        x: s.pos.x + localRight * Math.cos(yaw) + localNormal * Math.sin(yaw),
        y: s.pos.y + localUp,
        z: s.pos.z - localRight * Math.sin(yaw) + localNormal * Math.cos(yaw),
        yaw,
        size,
        age: -1,
      });
    }
    this.reset();
  }

  update(achieved: readonly MisdeedId[], dt: number): void {
    const set = new Set<MisdeedId>(achieved);
    const reduced = prefersReducedMotion();
    const safeDt = Math.max(0, dt);
    this.entries.forEach((e, i) => {
      if (set.has(e.misdeed)) {
        if (reduced) e.age = STAMP_POP_TIME;
        else if (e.age < 0) e.age = Math.min(STAMP_POP_TIME, safeDt);
        else e.age = Math.min(STAMP_POP_TIME, e.age + safeDt);
        const s = e.size * stampScaleCurve(e.age / STAMP_POP_TIME);
        stampQuat.setFromAxisAngle(stampUp, e.yaw);
        stampM4.compose(stampPos.set(e.x, e.y, e.z), stampQuat, stampScl.set(s, s, 1));
      } else {
        e.age = -1;
        stampM4.compose(stampPos.set(0, -50, 0), stampQuat.identity(), stampScl.set(0, 0, 0));
      }
      this.mesh.setMatrixAt(i, stampM4);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    this.entries.forEach((e, i) => {
      e.age = -1;
      stampM4.compose(stampPos.set(0, -50, 0), stampQuat.identity(), stampScl.set(0, 0, 0));
      this.mesh.setMatrixAt(i, stampM4);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
