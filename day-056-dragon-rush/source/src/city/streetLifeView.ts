// OWNER: city
// 通りの暮らしの描画（r01-city）：車・人・道の小物を、距離の帯で形を切り替えて描く（lodPool.ts）。
// 配置は world/streetLife.ts（純データ）。避難の規則もそこにあり、ここは毎コマの状態に当てはめるだけ：
// ・壊れかけた建物（ひび・剥がれ・傾き・崩落・割れた窓・燃えている）のまわりの人を見えなくする
// ・竜のまわりの人を見えなくする（竜の位置は、シーンの中の名前が dragon の物から読む。無ければ使わない）
// 一度逃げた人は、やり直し（壊れた建物が0に戻る）まで戻らない。
import { Color, Group, MeshStandardMaterial, SRGBColorSpace, type Object3D, type Vector3 } from 'three';
import type { QualityPreset } from '../config/quality';
import { AMBIENT } from '../config/render';
import { EVACUATION } from '../config/streetLife';
import type { MaterialKit } from '../render/materials';
import { replaceOrThrow } from '../render/materials';
import { CityIndex } from '../world/query';
import { FURNITURE_KINDS, buildingDanger, generateStreetLife, inDanger, pointDanger, type StreetLife } from '../world/streetLife';
import type { CityData } from '../world/types';
import type { DamageVisualSource, FireVisualSource } from './damageTexture';
import { hash01 } from '../core/rng';
import { PERSON_VARIANTS, boatShapes, carFarShapes, carMidShapes, carShapes, furnitureShapes, personFarShapes, personShapes } from './lifeGeometry';
import { LodPool, type PoolLevel, type PoolItem } from './lodPool';

/** 影を落とさない小さな道の小物 */
const SHADOWLESS_FURNITURE: ReadonlySet<string> = new Set(['hydrant', 'bin', 'bollard', 'rail']);
/** 岸壁の柵を描く距離（m） */
const RAIL_MAX_DIST = 100;

/** 人の型の割合（personGeometry.ts の型：ズボン・スカート・長い上着・背負いかばん）。配置の純データは変えず、番号から決める */
const PERSON_MIX = [0.4, 0.25, 0.2, 0.15];

function personVariant(index: number): number {
  const h = hash01(index, 211);
  let acc = 0;
  for (let v = 0; v < PERSON_VARIANTS; v++) {
    acc += PERSON_MIX[v];
    if (h < acc) return v;
  }
  return 0;
}

function createLifeMaterial(kit: MaterialKit): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: AMBIENT.envIntensity });
  m.name = 'StreetLife';
  return kit.patch(m, {
    key: 'life',
    vertex: (src) => {
      let s = replaceOrThrow(src, '#include <common>', '#include <common>\nattribute float aPaint;\nattribute vec2 aSurf;\nattribute float aEmit;\nvarying vec2 vSurf;\nvarying float vEmitL;');
      // インスタンスの色は車体と上着にだけ塗る。ズボンの色は上着の色から決める（紺・黒・ベージュ・灰）
      s = replaceOrThrow(
        s,
        '#include <color_vertex>',
        `#include <color_vertex>
vSurf = aSurf;
vEmitL = aEmit;
#ifdef USE_INSTANCING_COLOR
{
  vec3 top = instanceColor.rgb;
  float h = fract(dot(top, vec3(37.1, 11.7, 5.3)));
  vec3 bottom = h < 0.45 ? vec3(0.02, 0.022, 0.03) : h < 0.7 ? vec3(0.03, 0.04, 0.08) : h < 0.85 ? vec3(0.28, 0.22, 0.15) : vec3(0.16, 0.16, 0.17);
  vColor.rgb = aPaint > 1.5 ? color.rgb * bottom : aPaint > 0.5 ? color.rgb * top : color.rgb;
}
#endif`,
      );
      return s;
    },
    fragment: (src) => {
      let s = replaceOrThrow(src, '#include <common>', '#include <common>\nvarying vec2 vSurf;\nvarying float vEmitL;');
      s = replaceOrThrow(s, '#include <roughnessmap_fragment>', 'float roughnessFactor = vSurf.x;');
      s = replaceOrThrow(s, '#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.y;');
      s = replaceOrThrow(s, '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vEmitL;');
      return s;
    },
  });
}

const srgb = (c: readonly [number, number, number]): Color => new Color().setRGB(c[0], c[1], c[2], SRGBColorSpace);

/** 格子の升目ごとの番号の一覧（人を範囲で引くため）。 */
class Grid {
  private readonly cells = new Map<string, number[]>();
  constructor(
    private readonly size: number,
    points: readonly { x: number; z: number }[],
  ) {
    points.forEach((p, i) => {
      const k = `${Math.floor(p.x / size)},${Math.floor(p.z / size)}`;
      const list = this.cells.get(k);
      if (list) list.push(i);
      else this.cells.set(k, [i]);
    });
  }

  *near(x0: number, z0: number, x1: number, z1: number): Iterable<number> {
    for (let i = Math.floor(x0 / this.size); i <= Math.floor(x1 / this.size); i++) {
      for (let j = Math.floor(z0 / this.size); j <= Math.floor(z1 / this.size); j++) yield* this.cells.get(`${i},${j}`) ?? [];
    }
  }
}

export class StreetLifeView {
  readonly group = new Group();
  readonly life: StreetLife;
  private readonly cars: LodPool;
  private readonly people: LodPool;
  private readonly furniture: LodPool;
  private readonly furnitureSmall: LodPool;
  private readonly boats: LodPool;
  private readonly peopleGrid: Grid;
  private readonly carItems: PoolItem[];
  private readonly hidden: Uint8Array;
  private readonly breaking: Uint8Array;
  private breakingCount = 0;
  private dragon: Object3D | null = null;
  private lastDragonX = 1e9;
  private lastDragonZ = 1e9;

  constructor(
    private readonly city: CityData,
    kit: MaterialKit,
    quality: QualityPreset,
  ) {
    this.group.name = 'streetLife';
    const index = new CityIndex(city);
    this.life = generateStreetLife(city, index);
    const material = createLifeMaterial(kit);
    const curb = city.curbHeight;
    const carItems: PoolItem[] = this.life.cars.map((c) => ({
      x: c.x,
      y: index.surfaceAt(c.x, c.z) === 'lot' ? curb : city.groundLevel,
      z: c.z,
      kind: c.shape,
      yaw: c.yaw,
      sx: c.wid,
      sy: c.hgt,
      sz: c.len,
      color: srgb(c.color),
    }));
    this.carItems = carItems;
    // r01-city：車は3段（細かい形・粗い断面の同じ輪郭・箱）。近い2段は影を落とす
    const carLevels: PoolLevel[] = [];
    if (quality.life.detail > 0) carLevels.push({ maxDist: quality.life.detail, geometries: carShapes(), material, castShadow: true });
    carLevels.push({ maxDist: quality.life.near, geometries: carMidShapes(), material, castShadow: true });
    carLevels.push({ maxDist: quality.life.far, geometries: carFarShapes(), material, castShadow: false });
    this.cars = new LodPool(carItems, carLevels, 10, 'cars');
    const personItems: PoolItem[] = this.life.people.map((p, i) => ({
      x: p.x,
      y: curb,
      z: p.z,
      kind: p.pose * PERSON_VARIANTS + personVariant(i),
      yaw: p.yaw,
      sx: p.height,
      sy: p.height,
      sz: p.height,
      color: srgb(p.top),
    }));
    this.people = new LodPool(
      personItems,
      [
        { maxDist: Math.min(quality.life.person, quality.life.people), geometries: personShapes(), material, castShadow: true },
        { maxDist: quality.life.people, geometries: personFarShapes(), material, castShadow: false },
      ],
      6,
      'people',
    );
    const furnitureItems: PoolItem[] = this.life.furniture.map((f) => {
      const box = f.kind === 'container';
      return {
        x: f.x,
        y: curb + (f.y ?? 0),
        z: f.z,
        kind: FURNITURE_KINDS.indexOf(f.kind),
        yaw: f.yaw,
        sx: box ? 2.44 : 1,
        sy: box ? 2.59 : 1,
        sz: box ? (f.len ?? 6.06) : 1,
        color: f.color ? srgb(f.color) : undefined,
      };
    });
    // コンテナは大きく、空からも見えるので遠くまで描く。
    // r01-city：小さな物（消火栓・ごみ箱・係船柱・柵）は影を落とさない別の組にした（影の4段ぶんの描画命令を省く。影は画面で1画素に満たない）
    const near = furnitureShapes();
    const shadowless = (it: PoolItem): boolean => SHADOWLESS_FURNITURE.has(FURNITURE_KINDS[it.kind]);
    this.furniture = new LodPool(
      furnitureItems.filter((it) => !shadowless(it)),
      [
        { maxDist: quality.life.people, geometries: near, material, castShadow: true },
        { maxDist: quality.life.far, geometries: near.map((g, k) => (FURNITURE_KINDS[k] === 'container' ? g : null)), material, castShadow: false },
      ],
      10,
      'furniture',
    );
    // 岸壁の柵（柱 8cm・横木 7cm）は 100m より先で画素より細くなり、カメラが動くと1コマごとに明滅した（film-pan）ので、近くだけ描く
    const railKind = FURNITURE_KINDS.indexOf('rail');
    this.furnitureSmall = new LodPool(
      furnitureItems.filter(shadowless),
      [
        { maxDist: Math.min(RAIL_MAX_DIST, quality.life.people), geometries: near, material, castShadow: false },
        { maxDist: quality.life.people, geometries: near.map((g, k) => (k === railKind ? null : g)), material, castShadow: false },
      ],
      10,
      'furniture small',
    );
    const boatKinds = ['small', 'launch', 'ship'];
    const boatItems: PoolItem[] = this.life.boats.map((b) => ({ x: b.x, y: city.coast.waterLevel, z: b.z, kind: boatKinds.indexOf(b.kind), yaw: b.yaw, sx: b.len, sy: b.len, sz: b.len, color: srgb(b.color) }));
    // 船の影は水面が受けないので落とさない（r01-city：影の4段ぶんの描画命令を省く）
    this.boats = new LodPool(boatItems, [{ maxDist: 3200, geometries: boatShapes(), material, castShadow: false }], 20, 'boats');
    for (const pool of [this.cars, this.people, this.furniture, this.furnitureSmall, this.boats]) for (const m of pool.meshes) this.group.add(m);
    this.peopleGrid = new Grid(40, this.life.people);
    this.hidden = new Uint8Array(this.life.people.length);
    this.breaking = new Uint8Array(city.buildings.length);
  }

  /** 壊れ方の表を描画へ渡すたびに呼ぶ（damageTexture.ts の sync から）。壊れかけた建物のまわりの人を逃がす。 */
  updateDanger(d: DamageVisualSource, f: FireVisualSource): void {
    let count = 0;
    let changed = false;
    const n = this.breaking.length;
    for (let i = 0; i < n; i++) {
      const now = d.crack[i] > 0 || d.peel[i] > 0 || d.glass[i] > 0 || d.tilt[i] > 0 || d.collapse[i] > 0 || d.char[i] > 0 || f.burn[i] > 0;
      if (!now) continue;
      count++;
      if (this.breaking[i]) continue;
      this.breaking[i] = 1;
      const zone = buildingDanger(this.city.buildings[i]);
      for (const k of this.peopleGrid.near(zone.x0 - zone.r, zone.z0 - zone.r, zone.x1 + zone.r, zone.z1 + zone.r)) {
        const p = this.life.people[k];
        if (!this.hidden[k] && inDanger(p.x, p.z, zone)) {
          this.hidden[k] = 1;
          changed = true;
        }
      }
    }
    if (count === 0 && this.breakingCount > 0) {
      // やり直し：壊れた建物が0に戻ったら、逃げた人も戻す
      this.breaking.fill(0);
      this.hidden.fill(0);
      this.lastDragonX = 1e9;
      changed = true;
    }
    this.breakingCount = count;
    if (changed) this.people.invalidate();
  }

  /** 竜のまわりの人を逃がす。竜が見えていなければ何もしない。 */
  private updateDragon(): void {
    if (!this.dragon) {
      let root: Object3D = this.group;
      while (root.parent) root = root.parent;
      this.dragon = root.getObjectByName('dragon') ?? null;
      if (!this.dragon) return;
    }
    if (!this.dragon.visible) return;
    const x = this.dragon.position.x;
    const z = this.dragon.position.z;
    if (Math.hypot(x - this.lastDragonX, z - this.lastDragonZ) < 3) return;
    this.lastDragonX = x;
    this.lastDragonZ = z;
    const zone = pointDanger(x, z, EVACUATION.dragonRadius);
    let changed = false;
    for (const k of this.peopleGrid.near(x - zone.r, z - zone.r, x + zone.r, z + zone.r)) {
      const p = this.life.people[k];
      if (!this.hidden[k] && inDanger(p.x, p.z, zone)) {
        this.hidden[k] = 1;
        changed = true;
      }
    }
    if (changed) this.people.invalidate();
  }

  /** 毎コマ、描画の前に呼ぶ。 */
  update(camera: Vector3): void {
    this.updateDragon();
    const clear = EVACUATION.carCameraClear * EVACUATION.carCameraClear;
    this.cars.update(camera, (i) => {
      const c = this.carItems[i];
      const dx = c.x - camera.x;
      const dy = c.y + 0.8 - camera.y;
      const dz = c.z - camera.z;
      return dx * dx + dy * dy + dz * dz < clear;
    });
    this.people.update(camera, (i) => this.hidden[i] === 1);
    this.furniture.update(camera);
    this.furnitureSmall.update(camera);
    this.boats.update(camera);
  }

  /** 見えている人の数（検証用）。 */
  visiblePeople(): number {
    let n = 0;
    for (let i = 0; i < this.hidden.length; i++) if (!this.hidden[i]) n++;
    return n;
  }
}
