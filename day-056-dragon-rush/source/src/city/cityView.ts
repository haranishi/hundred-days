// OWNER: city
// 街の純データから描画用のメッシュ一式を組み立てる。建物は区画のタイルごとにまとめて1回で描く。
// 壊れ方は建物ごとの表（damageTexture.ts）を外壁と影のシェーダーが引いて描く。まとめたメッシュは作り直さない。
import { Group, Mesh, type BufferGeometry, type MeshDepthMaterial, type MeshStandardMaterial } from 'three';
import type { QualityPreset } from '../config/quality';
import type { MaterialKit } from '../render/materials';
import { hexToRgb } from '../world/color';
import type { SceneryData } from '../world/scenery';
import type { CityData, FacadeSpec } from '../world/types';
import { newBuildingWriter, writeBuilding, writeFiller, type BuildingRange } from './buildingGeometry';
import { CollapseDetail } from './collapseDetail';
import { createBuildingDepthMaterial, createBuildingMaterial } from './buildingMaterial';
import { DamageTexture } from './damageTexture';
import { buildGround } from './groundGeometry';
import { createGroundMaterial } from './groundMaterial';
import type { MeshWriter } from './meshWriter';
import { PropsView } from './propsView';
import { buildTerrain } from './terrain';
import { generateProps } from '../world/props';

/** 1棟の頂点がどのメッシュのどの範囲にあるか（破壊の周で使う）。 */
export interface BuildingSlot {
  mesh: Mesh;
  range: BuildingRange;
}

const CHUNK = 300;
const FILLER_CHUNK = 1600;
/** 傾いたビルがまとめたメッシュの外へはみ出す分（高さ140mのビルが崩落の終わりに倒れる幅の目安） */
const TILT_BOUNDS_MARGIN = 70;

const FILLER_FACADE: FacadeSpec = {
  floorHeight: 3.3,
  bayWidth: 3.4,
  windowWidth: 0.56,
  windowHeight: 0.52,
  groundFloor: 3.6,
  trimColor: hexToRgb(0x8a8a86),
  glassColor: hexToRgb(0x2f3a40),
};

export class CityView {
  readonly root = new Group();
  readonly buildingMeshes: Mesh[] = [];
  readonly slots = new Map<number, BuildingSlot>();
  readonly buildingMaterial: MeshStandardMaterial;
  readonly buildingDepthMaterial: MeshDepthMaterial;
  readonly damage: DamageTexture;
  readonly groundMaterial: MeshStandardMaterial;
  readonly props: PropsView;
  /** r03-fx：割れて崩れる建物の詳しい形（傾きに入った建物だけ） */
  readonly collapse: CollapseDetail;

  constructor(city: CityData, scenery: SceneryData, kit: MaterialKit, quality: QualityPreset) {
    this.root.name = 'city';
    this.damage = new DamageTexture(city);
    this.buildingMaterial = createBuildingMaterial(kit, this.damage.uniforms);
    this.buildingDepthMaterial = createBuildingDepthMaterial(this.damage.uniforms);
    this.groundMaterial = createGroundMaterial(kit);
    const baseY = city.curbHeight;
    this.collapse = new CollapseDetail(city, this.buildingMaterial, this.buildingDepthMaterial);
    this.damage.attachDetail(this.collapse);
    this.root.add(this.collapse.mesh);

    // 建物：外形の中心でタイルに振り分ける
    const writers = new Map<string, { writer: MeshWriter; ids: number[]; ranges: BuildingRange[] }>();
    for (const b of city.buildings) {
      const cx = (b.footprint.x0 + b.footprint.x1) / 2;
      const cz = (b.footprint.z0 + b.footprint.z1) / 2;
      const key = `${Math.floor(cx / CHUNK)},${Math.floor(cz / CHUNK)}`;
      let entry = writers.get(key);
      if (!entry) {
        entry = { writer: newBuildingWriter(), ids: [], ranges: [] };
        writers.set(key, entry);
      }
      entry.ids.push(b.id);
      const front = city.lots[b.lotId].frontClass;
      entry.ranges.push(writeBuilding(entry.writer, b, baseY, front === 'avenue' ? 1 : front === 'street' ? 0.5 : 0.15, city.lots[b.lotId].front));
    }
    for (const [key, entry] of writers) {
      const geometry = entry.writer.toGeometry();
      if (geometry.boundingSphere) geometry.boundingSphere.radius += TILT_BOUNDS_MARGIN;
      const mesh = this.addBuildingMesh(geometry, `buildings ${key}`);
      entry.ids.forEach((id, i) => this.slots.set(id, { mesh, range: entry.ranges[i] }));
    }

    // 街の外の代役
    const fillers = new Map<string, MeshWriter>();
    for (const box of scenery.filler) {
      if (box.dist > quality.fillerRadius) continue;
      const key = `${Math.floor(box.x / FILLER_CHUNK)},${Math.floor(box.z / FILLER_CHUNK)}`;
      let w = fillers.get(key);
      if (!w) {
        w = newBuildingWriter();
        fillers.set(key, w);
      }
      writeFiller(w, box, city.groundLevel, FILLER_FACADE);
    }
    for (const [key, w] of fillers) this.addBuildingMesh(w.toGeometry(), `filler ${key}`);

    // 道の小物の配置は、植え枡（地面）と小物の描画の両方が使う
    const props = generateProps(city);
    const treePits = props.trees.filter((t) => t.pit).map((t) => ({ x: t.x, z: t.z, size: 1.2 }));
    const ground = new Mesh(buildGround(city, { outskirts: 14000, treePits }), this.groundMaterial);
    ground.name = 'ground';
    ground.receiveShadow = true;
    ground.castShadow = false;
    this.root.add(ground);

    for (const t of buildTerrain(scenery, city.coast.waterLevel, kit)) this.root.add(t);

    // 道の小物（街路樹・街灯・信号）
    this.props = new PropsView(city, props, kit, quality);
    // 壊れ方の表を描画へ渡すたびに、壊れかけた建物のまわりの人を逃がす（r01-city）
    this.damage.listeners.push((d, f) => this.props.life.updateDanger(d, f));
    this.root.add(this.props.group);
  }

  private addBuildingMesh(geometry: BufferGeometry, name: string): Mesh {
    const mesh = new Mesh(geometry, this.buildingMaterial);
    mesh.name = name;
    mesh.customDepthMaterial = this.buildingDepthMaterial;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.buildingMeshes.push(mesh);
    return mesh;
  }
}
