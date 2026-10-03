// OWNER: city
// 距離で形を切り替えるインスタンス描画（r01-city）。街路樹・車・人を、カメラからの距離の帯ごとに、
// 型（kind）ごとの InstancedMesh に詰め直して描く。詰め直すのはカメラが一定距離動いたときと、見せる物が変わったときだけ。
// 区画のタイルに分けて描くやり方（r00a）に比べて、型を増やしても描画命令が「帯の数×型の数」で止まり、
// 帯の境目がカメラを中心にした円になるので、遠くの木が途中で切れて見えることもない。
import { Color, InstancedMesh, Matrix4, Quaternion, Sphere, Vector3, type BufferGeometry, type Frustum, type FrustumArray, type Material } from 'three';
import { shadowScope } from '../render/lighting';

/** 影の届く余裕（m）：低い夕日では 10m の木の影が 45m ほど伸びる */
const SHADOW_REACH_MARGIN = 60;

export interface PoolItem {
  x: number;
  y: number;
  z: number;
  /** 型の番号（levels の geometries の添字） */
  kind: number;
  /** 向き（+z を 0、上から見て反時計回り、ラジアン） */
  yaw: number;
  /** 大きさ（x・y・z の倍率） */
  sx: number;
  sy: number;
  sz: number;
  /** 傾き（ラジアン）と、傾く向き（ラジアン） */
  lean?: number;
  leanYaw?: number;
  /** インスタンスの色（材質の側で使い方を決める） */
  color?: Color;
}

export interface PoolLevel {
  /** この帯の外側の距離（m）。内側は1つ前の帯の外側 */
  maxDist: number;
  /** 型ごとの形。null の型はこの帯で描かない */
  geometries: (BufferGeometry | null)[];
  material: Material | Material[];
  customDepthMaterial?: Material;
  castShadow: boolean;
  receiveShadow?: boolean;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _qLean = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _axis = new Vector3();
const UP = new Vector3(0, 1, 0);

export class LodPool {
  readonly meshes: InstancedMesh[] = [];
  private readonly matrices: Float32Array;
  private readonly slots: { level: number; kind: number; mesh: InstancedMesh }[] = [];
  /** 形ごとに1つの InstancedMesh と、その帯。table[帯×型の数＋型] がその番号（無ければ -1） */
  private readonly unique: { mesh: InstancedMesh; level: number }[] = [];
  private table = new Int16Array(0);
  private kindCount = 0;
  private counts = new Int32Array(0);
  /** 帯ごとの、カメラから届く最も遠い距離（高さも含む。影の余裕を足す） */
  private readonly reach: number[];
  private readonly lastCam = new Vector3(1e9, 0, 1e9);
  private dirty = true;

  constructor(
    readonly items: readonly PoolItem[],
    private readonly levels: readonly PoolLevel[],
    private readonly rebuildDistance = 8,
    name = 'pool',
  ) {
    this.matrices = new Float32Array(items.length * 16);
    this.reach = levels.map((lv) => lv.maxDist + SHADOW_REACH_MARGIN);
    items.forEach((it, i) => {
      _q.setFromAxisAngle(UP, it.yaw);
      if (it.lean) {
        const a = it.leanYaw ?? 0;
        _axis.set(Math.cos(a), 0, -Math.sin(a));
        _qLean.setFromAxisAngle(_axis, it.lean);
        _q.premultiply(_qLean);
      }
      _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.sx, it.sy, it.sz));
      _m.toArray(this.matrices, i * 16);
    });
    const perKind = new Map<number, number>();
    for (const it of items) perKind.set(it.kind, (perKind.get(it.kind) ?? 0) + 1);
    levels.forEach((lv, l) => {
      // r01-city：同じ帯で同じ形を使う型は1つの InstancedMesh にまとめる（遠景の人の8つの型が2つの形を共有するなど。描画命令を減らす）
      const byGeometry = new Map<BufferGeometry, { kinds: number[]; capacity: number }>();
      lv.geometries.forEach((g, k) => {
        const capacity = perKind.get(k) ?? 0;
        if (!g || capacity === 0) return;
        const entry = byGeometry.get(g) ?? { kinds: [], capacity: 0 };
        entry.kinds.push(k);
        entry.capacity += capacity;
        byGeometry.set(g, entry);
      });
      for (const [g, { kinds, capacity }] of byGeometry) {
        const mesh = new InstancedMesh(g, lv.material, capacity);
        mesh.name = `${name} L${l} k${kinds.join('+')}`;
        mesh.count = 0;
        mesh.castShadow = lv.castShadow;
        mesh.receiveShadow = lv.receiveShadow ?? true;
        if (lv.customDepthMaterial) mesh.customDepthMaterial = lv.customDepthMaterial;
        if (items.some((it) => kinds.includes(it.kind) && it.color)) {
          const white = new Color(1, 1, 1);
          for (let i = 0; i < capacity; i++) mesh.setColorAt(i, white);
        }
        mesh.boundingSphere = new Sphere(new Vector3(), 1);
        if (lv.castShadow) {
          // r01-city：影の段のうち、受け持つ奥行きの手前の端がこの帯の届く距離より遠い段には描かない（render/lighting.ts の shadowScope）
          mesh.intersectsFrustum = (frustum: Frustum | FrustumArray): boolean => {
            const c = shadowScope.current;
            if (c !== null && (shadowScope.nearDepth.get(c) ?? 0) > this.reach[l]) return false;
            return frustum.intersectsObject(mesh);
          };
        }
        this.meshes.push(mesh);
        this.unique.push({ mesh, level: l });
        for (const k of kinds) this.slots.push({ level: l, kind: k, mesh });
      }
    });
    // r01-city：詰め直しは速く飛ぶカメラでは毎コマ近く起きるので、型と帯から形を引く表を数の配列で持つ（文字列の鍵をやめた）
    this.kindCount = items.reduce((m, it) => Math.max(m, it.kind), 0) + 1;
    this.table = new Int16Array(levels.length * this.kindCount).fill(-1);
    for (const sl of this.slots) {
      if (sl.kind < this.kindCount) this.table[sl.level * this.kindCount + sl.kind] = this.unique.findIndex((u) => u.mesh === sl.mesh);
    }
    this.counts = new Int32Array(this.unique.length);
  }

  /** 見せる物が変わったとき（避難など）に呼ぶ。次の update で詰め直す。 */
  invalidate(): void {
    this.dirty = true;
  }

  /** 毎コマ、描画の前に呼ぶ。hidden(i) が true の物は描かない。 */
  update(camera: Vector3, hidden?: (index: number) => boolean): void {
    for (let l = 0; l < this.levels.length; l++) this.reach[l] = Math.hypot(this.levels[l].maxDist + SHADOW_REACH_MARGIN, camera.y);
    const dx = camera.x - this.lastCam.x;
    const dz = camera.z - this.lastCam.z;
    if (!this.dirty && dx * dx + dz * dz < this.rebuildDistance * this.rebuildDistance) return;
    this.dirty = false;
    this.lastCam.copy(camera);
    const counts = this.counts;
    counts.fill(0);
    const cx = camera.x;
    const cz = camera.z;
    const limits = this.levels.map((l) => l.maxDist * l.maxDist);
    const K = this.kindCount;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const ex = it.x - cx;
      const ez = it.z - cz;
      const d2 = ex * ex + ez * ez;
      let level = -1;
      for (let l = 0; l < limits.length; l++) {
        if (d2 < limits[l]) {
          level = l;
          break;
        }
      }
      if (level < 0 || (hidden && hidden(i))) continue;
      const u = this.table[level * K + it.kind];
      if (u < 0) continue;
      const mesh = this.unique[u].mesh;
      const n = counts[u];
      (mesh.instanceMatrix.array as Float32Array).set(this.matrices.subarray(i * 16, i * 16 + 16), n * 16);
      if (mesh.instanceColor && it.color) mesh.setColorAt(n, it.color);
      counts[u] = n + 1;
    }
    for (let u = 0; u < this.unique.length; u++) {
      const s = this.unique[u];
      const n = counts[u];
      s.mesh.count = n;
      s.mesh.visible = n > 0;
      if (n > 0) {
        s.mesh.instanceMatrix.clearUpdateRanges();
        s.mesh.instanceMatrix.addUpdateRange(0, n * 16);
        s.mesh.instanceMatrix.needsUpdate = true;
        if (s.mesh.instanceColor) {
          s.mesh.instanceColor.clearUpdateRanges();
          s.mesh.instanceColor.addUpdateRange(0, n * 3);
          s.mesh.instanceColor.needsUpdate = true;
        }
      }
      // 影の段ごとに外せるよう、境界球はカメラを中心にした帯の外側の円にする
      const r = this.levels[s.level].maxDist + 40;
      s.mesh.boundingSphere!.center.set(cx, 0, cz);
      s.mesh.boundingSphere!.radius = r;
    }
  }
}
