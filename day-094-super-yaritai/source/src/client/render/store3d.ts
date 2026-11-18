/**
 * 動かない店（床・壁・棚の枠・冷凍ケース・レジ・コードで組む部品・天井の蛍光灯・札）を組み立てる。
 * 同じ形は InstancedMesh で1回にまとめて描く（docs/04「重さの予算」）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Fixture, StoreLayout } from '../../shared/layout/store';
import type { Assets, ModelGeometry } from './assets';
import { PALETTE } from './palette';
import { TANTRUM } from '../../shared/rules/tuning';
import { buildPart } from './parts';
import { buildDressing } from './dressing';
import { MovableSignsView, NoticeStampsView, buildSigns, partitionSigns } from './signs';
import { recolorGeometry, type CellShift } from './productLook';
import { applyXray } from './xray';

/** 床の市松（白とミント）。1枚の絵に2×2のマス（1マス1.15m） */
function floorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const h = 128;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
      g.fillRect(x * h, y * h, h, h);
    }
  }
  g.strokeStyle = PALETTE.floorGrout;
  g.lineWidth = 3;
  for (let i = 0; i <= 2; i++) {
    g.beginPath();
    g.moveTo(i * h, 0);
    g.lineTo(i * h, 256);
    g.moveTo(0, i * h);
    g.lineTo(256, i * h);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const TILE = 2.3;

/**
 * 棚や台は枠だけを描く（商品は物理で動く商品として別に置く）。
 * GLB の中の商品の部品（carton・box・bag・bottle・bread）は同じ名前がいくつもあり、three.js で読むと2つ目から 'carton_1' のように
 * 名前が変わるので、名前で外すやり方では1つ目しか外れていなかった（round2 までの、どの棚にも出ていた橙と白の箱。
 * 落としても減らないので、荒らした後も棚が満杯に見えた）。そこで枠の部品だけを名前で取り出す。
 * 枠のメッシュは、場面の根（モデルと同じ名前）に名前を取られて '_1' が付く（試験 dress-store.test.ts で GLB を読んで確かめる）。
 * 枠の外形は元のモデルと同じなので、置き方（底面の中心）は変わらない（2026-10-07 に GLB の外形で確認）
 */
export const FRAME_ONLY: Record<string, { frame: string; extra?: { node: string; offset: [number, number, number] } }> = {
  'mm/shelf-boxes': { frame: 'mm/shelf-boxes/shelf-boxes_1' },
  'mm/shelf-bags': { frame: 'mm/shelf-bags/shelf-bags_1' },
  // 端の棚の上の緑の札（Group）。単独で読むと自分の底面の中心が原点になるので、元の位置（モデルの単位）へ戻す
  'mm/shelf-end': { frame: 'mm/shelf-end/shelf-end_1', extra: { node: 'mm/shelf-end/Group', offset: [0, 0.8, -0.15] } },
  'mm/display-bread': { frame: 'mm/display-bread/display-bread_1' },
};

/**
 * 同じ形の置き物を、色の塗り替えで描き分ける（round4：青果のトマトのかご4つが同じに見えた）。置き物の並びの順に当てる。
 * null はそのまま。Mini Market の色の表で、果物の赤（帯2・色4）を橙（オレンジ）・緑（青りんご）へ
 */
export const FIXTURE_VARIANTS: Record<string, (CellShift[] | null)[]> = {
  'mm/display-fruit': [null, [{ from: [2, 4], to: [2, 3] }], [{ from: [2, 4], to: [2, 1] }], null],
};

/** 置き物を、塗り替えの種類ごとの組に分ける（種類ごとに InstancedMesh を1つ作る） */
export function splitVariants(key: string, list: Fixture[]): { list: Fixture[]; shifts: CellShift[] | null }[] {
  const looks = FIXTURE_VARIANTS[key];
  if (!looks) return [{ list, shifts: null }];
  const groups = new Map<number, Fixture[]>();
  list.forEach((f, i) => {
    const k = looks.findIndex((l) => l === looks[i % looks.length]);
    groups.set(k, [...(groups.get(k) ?? []), f]);
  });
  return [...groups].map(([k, fs]) => ({ list: fs, shifts: looks[k] ?? null }));
}

function fixtureGeometry(assets: Assets, key: string): ModelGeometry {
  const spec = FRAME_ONLY[key];
  if (!spec) return assets.geometry(key);
  const frame = assets.geometry(spec.frame);
  if (!spec.extra) return frame;
  const extra = assets.geometry(spec.extra.node);
  // 共有の形は書き換えず、写してからまとめる（材質は同じ1つ）
  const moved = extra.geometry.clone().translate(...spec.extra.offset);
  return { geometry: mergeGeometries([frame.geometry, moved], false)!, materials: frame.materials };
}

export interface StoreView {
  group: THREE.Group;
  /** 透かしの対象の材質（コードの部品・札） */
  materials: THREE.Material[];
  stamps: NoticeStampsView;
  movableSigns: MovableSignsView;
}

export function buildStoreView(assets: Assets, layout: StoreLayout): StoreView {
  const group = new THREE.Group();
  group.name = 'store';
  const materials: THREE.Material[] = [];
  const b = layout.bounds;
  const W = b.x1 - b.x0;
  const D = b.z1 - b.z0;

  // 外の地面（南の低い壁の向こうに見える）
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshLambertMaterial({ color: PALETTE.outside }));
  outside.rotation.x = -Math.PI / 2;
  outside.position.set(0, -0.02, 0);
  outside.receiveShadow = true;
  group.add(outside);

  // 床の市松
  const tex = floorTexture();
  tex.repeat.set(W / TILE, D / TILE);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  // Kenney のモデル：鍵ごとに1つの InstancedMesh
  const byKey = new Map<string, Fixture[]>();
  const codeParts = new Map<string, Fixture[]>();
  for (const f of layout.fixtures) {
    if (f.model.startsWith('pc/')) {
      const k = `${f.model}|${f.size.x.toFixed(2)}|${f.size.y.toFixed(2)}|${f.size.z.toFixed(2)}|${f.tint ?? ''}`;
      codeParts.set(k, [...(codeParts.get(k) ?? []), f]);
    } else byKey.set(f.model, [...(byKey.get(f.model) ?? []), f]);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (const [key, all] of byKey) {
    for (const { list, shifts } of splitVariants(key, all)) {
      const base = fixtureGeometry(assets, key);
      const geo = shifts ? { geometry: recolorGeometry(base.geometry, shifts), materials: base.materials } : base;
      const mesh = new THREE.InstancedMesh(geo.geometry, geo.materials.length === 1 ? geo.materials[0]! : geo.materials, list.length);
      const boost = new THREE.Color(...PALETTE.wallBoost);
      list.forEach((f, i) => {
        q.setFromAxisAngle(up, f.yaw);
        m.compose(pos.set(f.pos.x, f.pos.y, f.pos.z), q, scl.set(f.scale.x, f.scale.y, f.scale.z));
        mesh.setMatrixAt(i, m);
        if (f.kind === 'wall') mesh.setColorAt(i, boost);
      });
      mesh.castShadow = list[0]!.kind !== 'wall';
      mesh.receiveShadow = true;
      mesh.name = `fixture:${key}${shifts ? ':variant' : ''}`;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }

  // コードで組む部品（頂点の色で塗る材質を1つ共有）
  const partMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  applyXray(partMat);
  materials.push(partMat);
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  applyXray(lightMat);
  materials.push(lightMat);
  // 動かない部品は形を1つにまとめて、1回で描く（描画の回数の予算のため）。照明の帯は光らせる材質で別にまとめる
  const solid: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];
  for (const [, list] of codeParts) {
    const f0 = list[0]!;
    const base = buildPart(f0.model, f0.size, f0.tint);
    for (const f of list) {
      q.setFromAxisAngle(up, f.yaw);
      m.compose(pos.set(f.pos.x, f.pos.y, f.pos.z), q, scl.set(1, 1, 1));
      (f.kind === 'light' ? lights : solid).push(base.clone().applyMatrix4(m));
    }
    base.dispose();
  }
  if (solid.length) {
    const mesh = new THREE.Mesh(mergeGeometries(solid, false)!, partMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'parts';
    group.add(mesh);
  }
  if (lights.length) {
    const mesh = new THREE.Mesh(mergeGeometries(lights, false)!, lightMat);
    mesh.name = 'light-bands';
    group.add(mesh);
  }

  // 作り込み（通路の色・壁ぎわのケースの中身・店の外。round3 dress）。描画は2回
  const dressing = buildDressing(layout, partMat);
  materials.push(...dressing.materials);
  group.add(dressing.group);

  // 札（静的札・可動POPポール札・達成「済」スタンプ）
  const signs = buildSigns(layout.signs, layout);
  applyXray(signs.mesh.material as THREE.Material);
  materials.push(signs.mesh.material as THREE.Material);
  group.add(signs.mesh);
  const poleMat = new THREE.MeshLambertMaterial({ color: PALETTE.metalDark });
  applyXray(poleMat);
  materials.push(poleMat);
  if (signs.poles) {
    const poles = new THREE.Mesh(signs.poles, poleMat);
    poles.castShadow = true;
    poles.name = 'sign-poles';
    group.add(poles);
  }
  const movableSigns = new MovableSignsView(signs.movable, signs.mesh.material as THREE.Material, poleMat);
  group.add(movableSigns.group);
  const stamps = new NoticeStampsView(partitionSigns(layout.signs, layout).noticeSigns);
  materials.push(stamps.mesh.material as THREE.Material);
  group.add(stamps.mesh);
  return { group, materials, stamps, movableSigns };
}

/** 場所の目印になる平たい輪（床に描く。カート置き場やベルの前など）。描画は1回 */
export function buildFloorMarks(layout: StoreLayout): THREE.Group {
  const geos: THREE.BufferGeometry[] = [];
  const add = (x: number, z: number, r: number): void => {
    const g = new THREE.RingGeometry(r - 0.07, r, 40);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.012, z);
    geos.push(g);
  };
  const p = layout.places;
  add(p.bell.x, p.bell.z, 0.75);
  add(p.pyramid.x, p.pyramid.z, 0.8);
  add(p.carts.x, p.carts.z, 1.9);
  // 駄々の看板の真下（ほかの悪事と同じ黄色い輪。round4 の F3）
  add(p.tantrum.x, p.tantrum.z, TANTRUM.promptRange);
  const merged = geos.length === 1 ? geos[0]! : (geos.reduce((a, g) => (a ? mergeTwo(a, g) : g)) as THREE.BufferGeometry);
  const mat = new THREE.MeshBasicMaterial({ color: PALETTE.yellow, transparent: true, opacity: 0.75, depthWrite: false });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'floor-marks';
  mesh.renderOrder = 1;
  // スイカボウリングの立ち位置：レーン中央に足型（つま先がピンの方）と、その先に三角。白い床でも目立つ青
  const feet = footprints(p.lane.x, p.lane.z, p.lane.yaw).reduce((a, g) => mergeTwo(a, g));
  const lane = new THREE.Mesh(feet, new THREE.MeshBasicMaterial({ color: PALETTE.blue, transparent: true, opacity: 0.85, depthWrite: false }));
  lane.name = 'lane-feet';
  lane.renderOrder = 1;
  const group = new THREE.Group();
  group.name = 'floor-marks';
  group.add(mesh, lane);
  return group;
}

/** 足型2つ（左右）と、向きの三角。yaw はつま先の向き（前＝(sin, cos)） */
function footprints(x: number, z: number, yaw: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const foot = (side: number, back: number): void => {
    const sole = new THREE.CircleGeometry(0.17, 20);
    sole.scale(0.8, 1.15, 1);
    sole.translate(0, 0.12, 0);
    const heel = new THREE.CircleGeometry(0.11, 16);
    heel.translate(0, -0.2, 0);
    for (const g of [sole, heel]) {
      // 平面の上（+y）がつま先。床に寝かせて、つま先を -z（yaw=π の前）に向けてから yaw で回す
      g.translate(side * 0.22, back, 0);
      g.rotateX(-Math.PI / 2);
      g.rotateY(yaw - Math.PI);
      g.translate(x, 0.013, z);
      out.push(g);
    }
  };
  foot(-1, 0.08);
  foot(1, -0.08);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.22, 0, 0, 0.22, 0, 0, 0, 0.34, 0]), 3));
  tri.translate(0, 0.62, 0);
  tri.rotateX(-Math.PI / 2);
  tri.rotateY(yaw - Math.PI);
  tri.translate(x, 0.013, z);
  out.push(tri);
  return out;
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const pa = (a.index ? a.toNonIndexed() : a).getAttribute('position') as THREE.BufferAttribute;
  const pb = (b.index ? b.toNonIndexed() : b).getAttribute('position') as THREE.BufferAttribute;
  const arr = new Float32Array(pa.count * 3 + pb.count * 3);
  arr.set(pa.array as Float32Array, 0);
  arr.set(pb.array as Float32Array, pa.count * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return g;
}
