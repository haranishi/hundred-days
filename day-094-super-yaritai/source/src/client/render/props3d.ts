/**
 * 動く物（商品・カート）の描画。同じ形の商品は InstancedMesh 1つにまとめ、毎フレーム WorldView の位置と回転を写す。
 * コードで組む商品（トイレットペーパー）は頂点の色の材質を使う。
 */
import * as THREE from 'three';
import type { CartView, WorldStatic, WorldView } from '../../shared/view';
import { RENDER } from '../../shared/rules/tuning';
import type { Assets } from './assets';
import { buildPart } from './parts';
import { CODE_PROP_SIZE } from '../../shared/layout/catalog';
import { buildWorldStatic } from '../../shared/layout/store';
import { lookOf, recolorGeometry, tintOf, type Look } from './productLook';
import { SpillsView } from './spills';
import { buildPack } from './packs';

interface Batch {
  mesh: THREE.InstancedMesh;
  ids: number[];
  scales: number[];
}

const m4 = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();
const ZERO = new THREE.Vector3(0, 0, 0);

export class PropsView {
  readonly group = new THREE.Group();
  private readonly batches: Batch[] = [];
  private readonly carts: THREE.InstancedMesh;
  /** こぼれた飲み物の水たまり（round3 D4） */
  private readonly spills: SpillsView;
  private readonly partMat: THREE.MeshLambertMaterial;
  /** この試合のために作った形（コードで組む商品）。試合が終わったら捨てる */
  private readonly ownGeometries: THREE.BufferGeometry[] = [];

  constructor(assets: Assets, world: WorldStatic, partMat: THREE.MeshLambertMaterial) {
    this.group.name = 'props';
    this.partMat = partMat;
    // 同じ形・同じ塗り替えの商品を1つにまとめる（round3 D1：通路ごとの色は productLook.ts）
    const byLook = new Map<string, { model: string; look: Look; ids: number[] }>();
    for (const p of world.props) {
      const look = lookOf(p);
      const key = `${p.model}|${look.name}`;
      const b = byLook.get(key) ?? { model: p.model, look, ids: [] };
      b.ids.push(p.id);
      byLook.set(key, b);
    }
    for (const { model, look, ids } of byLook.values()) {
      let geometry: THREE.BufferGeometry;
      let material: THREE.Material | THREE.Material[];
      if (model.startsWith('pc/')) {
        const s = CODE_PROP_SIZE[model] ?? [0.4, 0.4, 0.4];
        geometry = buildPack(model) ?? buildPart(model, { x: s[0], y: s[1], z: s[2] });
        this.ownGeometries.push(geometry);
        material = this.partMat;
      } else {
        const g = assets.geometry(model);
        geometry = g.geometry;
        if (look.shifts.length > 0) {
          geometry = recolorGeometry(geometry, look.shifts);
          this.ownGeometries.push(geometry);
        }
        material = g.materials.length === 1 ? g.materials[0]! : g.materials;
      }
      const mesh = new THREE.InstancedMesh(geometry, material, ids.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (look.tints.length > 0) {
        const c = new THREE.Color();
        ids.forEach((id, i) => mesh.setColorAt(i, c.set(tintOf(world.props[id]!, world.seed))));
      }
      // 小さな棚の商品は影を落とさない（描画の回数の予算のため。影の描画も1回ずつ数える）
      const d0 = world.props[ids[0]!]!;
      mesh.castShadow = d0.kind !== 'product' || Math.max(d0.size.x, d0.size.y, d0.size.z) >= RENDER.productShadowMin;
      mesh.receiveShadow = true;
      // 店じゅうに散らばるので、まとめての視野の判定は役に立たない
      mesh.frustumCulled = false;
      mesh.name = `props:${model}`;
      this.batches.push({ mesh, ids, scales: ids.map((id) => world.props[id]!.scale) });
      this.group.add(mesh);
    }
    const cartGeo = assets.geometry('mm/shopping-cart');
    this.carts = new THREE.InstancedMesh(cartGeo.geometry, cartGeo.materials[0]!, world.carts.length);
    this.carts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.carts.castShadow = true;
    this.carts.receiveShadow = true;
    this.carts.frustumCulled = false;
    this.carts.name = 'carts';
    this.group.add(this.carts);
    this.spills = new SpillsView(world);
    this.group.add(this.spills.mesh);
  }

  /** 全部の商品とカートを家（置いた位置）に置く。タイトルの裏の「品出し済みの店」に使う */
  showHome(world: WorldStatic): void {
    const tr = new Float32Array(world.props.length * 7);
    for (const p of world.props) {
      quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.home.yaw);
      tr.set([p.home.pos.x, p.home.pos.y, p.home.pos.z, quat.x, quat.y, quat.z, quat.w], p.id * 7);
    }
    const carts: CartView[] = world.carts.map((c) => ({ id: c.id, pos: c.home.pos, yaw: c.home.yaw, riderSlot: null, speed: 0 }));
    this.update({ phase: 'countdown', timeLeft: 0, duration: 0, propTransforms: tr, propHidden: new Uint8Array(world.props.length), carts } as unknown as WorldView);
  }

  update(view: WorldView): void {
    const tr = view.propTransforms;
    const hidden = view.propHidden;
    for (const b of this.batches) {
      b.ids.forEach((id, i) => {
        const o = id * 7;
        if (hidden[id]) m4.compose(pos.set(0, -50, 0), quat.identity(), ZERO);
        else {
          const s = b.scales[i]!;
          m4.compose(pos.set(tr[o]!, tr[o + 1]!, tr[o + 2]!), quat.set(tr[o + 3]!, tr[o + 4]!, tr[o + 5]!, tr[o + 6]!), scl.set(s, s, s));
        }
        b.mesh.setMatrixAt(i, m4);
      });
      b.mesh.instanceMatrix.needsUpdate = true;
    }
    this.updateCarts(view.carts);
    this.spills.update(view);
  }

  private updateCarts(carts: readonly CartView[]): void {
    const s = RENDER.modelScale;
    carts.forEach((c, i) => {
      quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, c.yaw);
      m4.compose(pos.set(c.pos.x, c.pos.y, c.pos.z), quat, scl.set(s, s, s));
      this.carts.setMatrixAt(i, m4);
    });
    this.carts.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const b of this.batches) b.mesh.dispose();
    for (const g of this.ownGeometries) g.dispose();
    this.carts.dispose();
    this.spills.dispose();
  }
}

/**
 * タイトルなど試合がない間に見せる、品出し済みの店の商品（round3 dress）。
 * 棚の枠の中の飾りの商品を描かなくしたので（store3d.ts の FRAME_ONLY）、試合がない間はこれがないと棚が空に見える。
 * seed は固定（毎回同じ品ぞろえ）。試合の間は Renderer が隠す
 */
export const TITLE_STOCK_SEED = 20261006;
export function titleStock(assets: Assets, partMat: THREE.MeshLambertMaterial): PropsView {
  const world = buildWorldStatic(TITLE_STOCK_SEED);
  const v = new PropsView(assets, world, partMat);
  v.showHome(world);
  v.group.name = 'title-stock';
  return v;
}
