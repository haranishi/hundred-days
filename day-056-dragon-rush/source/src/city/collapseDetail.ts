// OWNER: city
// 割れて崩れる建物の詳しい形（r03-fx）。指摘「中層ビルは1つの箱のまま傾いて沈む」。
// まとめたメッシュの外壁は1面1枚の四角なので、途中の高さで割れない。傾きに入った建物だけ、割れる高さより下を階ごとの帯に分け、
// 割れ目に割れた床の蓋を足した形を作り直し、この入れ物（1つのメッシュ・同じ外壁の材質）の空いた枠に書く。
// まとめたメッシュの側はシェーダーが1点に畳んで消す（damageGlsl.ts の dmgMove）。材質を共有するので、遊びの途中にシェーダーは作らない。
// 枠が足りない・形が枠に収まらない建物は、今までどおりまとめたメッシュのまま建物ごと傾く（見た目が少し劣るだけで壊れない）。
import { BufferAttribute, BufferGeometry, Mesh, type MeshDepthMaterial, type MeshStandardMaterial } from 'three';
import type { CityData } from '../world/types';
import { BUILDING_ATTRIBUTES, newBuildingWriter, writeBuilding } from './buildingGeometry';
import { collapseShape, slabBounds } from './collapsePose';
import type { DamageVisualSource, DetailProvider } from './damageTexture';

const ATTRS: { name: string; size: number; u8: boolean }[] = [
  { name: 'position', size: 3, u8: false },
  { name: 'normal', size: 3, u8: false },
  ...BUILDING_ATTRIBUTES.map((a) => ({ name: a.name, size: a.size, u8: a.type === 'u8' })),
];

export class CollapseDetail implements DetailProvider {
  readonly mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  private readonly geometry = new BufferGeometry();
  private readonly index: BufferAttribute;
  private readonly slotOf = new Map<number, number>();
  private readonly owner: Int32Array;
  private used = 0;

  constructor(
    private readonly city: CityData,
    material: MeshStandardMaterial,
    depthMaterial: MeshDepthMaterial,
    private readonly slots = 48,
    private readonly vertsPerSlot = 2400,
    private readonly indicesPerSlot = 3600,
  ) {
    const verts = slots * vertsPerSlot;
    for (const a of ATTRS) {
      const array = a.u8 ? new Uint8Array(verts * a.size) : new Float32Array(verts * a.size);
      const attr = new BufferAttribute(array, a.size, a.u8);
      this.geometry.setAttribute(a.name, attr);
    }
    this.index = new BufferAttribute(new Uint32Array(slots * indicesPerSlot), 1);
    this.geometry.setIndex(this.index);
    this.geometry.setDrawRange(0, 0);
    this.owner = new Int32Array(slots).fill(-1);
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.name = 'buildings-collapse';
    this.mesh.customDepthMaterial = depthMaterial;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** 詳しい形で描いている建物の数（調べもの用） */
  get count(): number {
    return this.slotOf.size;
  }

  has(id: number): boolean {
    return this.slotOf.has(id);
  }

  /**
   * 傾きか崩落に入った建物（崩落の終わりの前）に枠を当て、戻った建物（やり直し）と瓦礫になった建物の枠を空ける。
   * 崩れている建物を、傾いているだけの建物より先に入れる。
   */
  update(d: DamageVisualSource): void {
    for (const [id, slot] of this.slotOf) {
      const active = (d.tilt[id] > 0 || d.collapse[id] > 0) && d.collapse[id] < 1 && d.splitY[id] > 0;
      if (!active) this.release(id, slot);
    }
    if (this.slotOf.size >= this.slots) return;
    for (const pass of [0, 1]) {
      for (let id = 0; id < d.tilt.length && this.slotOf.size < this.slots; id++) {
        if (this.slotOf.has(id) || d.splitY[id] <= 0 || d.collapse[id] >= 1) continue;
        const want = pass === 0 ? d.collapse[id] > 0 : d.tilt[id] > 0;
        if (want) this.acquire(id, d.splitY[id]);
      }
    }
  }

  private acquire(id: number, split: number): void {
    const b = this.city.buildings[id];
    const lot = this.city.lots[b.lotId];
    const w = newBuildingWriter();
    // r04-fx2：上の塊は板の境目で切る（板の境目は倒れる向きによらない）
    const bounds = slabBounds(collapseShape(b, split, 0, 0, null));
    writeBuilding(w, b, this.city.curbHeight, lot.frontClass === 'avenue' ? 1 : lot.frontClass === 'street' ? 0.5 : 0.15, lot.front, { split, bounds });
    if (w.vertexCount > this.vertsPerSlot || w.indexCount > this.indicesPerSlot) return;
    let slot = -1;
    for (let k = 0; k < this.slots; k++) {
      if (this.owner[k] < 0) {
        slot = k;
        break;
      }
    }
    if (slot < 0) return;
    const g = w.toGeometry();
    const v0 = slot * this.vertsPerSlot;
    for (const a of ATTRS) {
      const dst = this.geometry.getAttribute(a.name) as BufferAttribute;
      const src = g.getAttribute(a.name) as BufferAttribute;
      (dst.array as Float32Array | Uint8Array).set(src.array as Float32Array | Uint8Array, v0 * a.size);
      dst.addUpdateRange(v0 * a.size, src.count * a.size);
      dst.needsUpdate = true;
    }
    const i0 = slot * this.indicesPerSlot;
    const idx = this.index.array as Uint32Array;
    const srcIdx = g.getIndex()!.array;
    for (let k = 0; k < srcIdx.length; k++) idx[i0 + k] = v0 + srcIdx[k];
    idx.fill(v0, i0 + srcIdx.length, i0 + this.indicesPerSlot);
    this.index.addUpdateRange(i0, this.indicesPerSlot);
    this.index.needsUpdate = true;
    g.dispose();
    this.owner[slot] = id;
    this.slotOf.set(id, slot);
    this.used = Math.max(this.used, slot + 1);
    this.geometry.setDrawRange(0, this.used * this.indicesPerSlot);
    this.mesh.visible = true;
  }

  private release(id: number, slot: number): void {
    const i0 = slot * this.indicesPerSlot;
    (this.index.array as Uint32Array).fill(slot * this.vertsPerSlot, i0, i0 + this.indicesPerSlot);
    this.index.addUpdateRange(i0, this.indicesPerSlot);
    this.index.needsUpdate = true;
    this.owner[slot] = -1;
    this.slotOf.delete(id);
    while (this.used > 0 && this.owner[this.used - 1] < 0) this.used--;
    this.geometry.setDrawRange(0, this.used * this.indicesPerSlot);
    this.mesh.visible = this.used > 0;
  }
}
