// OWNER: world-art
// 仕掛けは StageDef を正本として先に生成する。回収・開放では共有材質を保ち、表示状態だけを変える。
import { Group, Matrix4, Mesh, SphereGeometry, type MeshStandardMaterial } from 'three';
import type { InteractionSnap } from '../../contract/snapshot';
import type { InteractionDef, StageDef } from '../../stage/types';
import { kgMaterial } from '../render/materials';
import { MeshBuilder, seedOf } from './geometry';
import { LOOK } from './look';
import { PART, type WorldMaterials } from './materialsLib';

interface ItemVisual {
  def: InteractionDef;
  root: Group;
  contents?: Group;
  lid?: Group;
}

function mesh(builder: MeshBuilder, material: MeshStandardMaterial, parent: Group): void {
  if (builder.vertexCount === 0) return;
  const object = new Mesh(builder.build(), material);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
}

function fiberMaterial(): MeshStandardMaterial {
  return kgMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0 }, {
    key: 'interaction-fiber', attr: true,
    color: /* glsl */ `
float kgFiberHeight = 0.0;
{
  vec2 uv = vKgUv;
  float fine = 1.0 - smoothstep(0.025, 0.09, length(fwidth(uv)));
  float weave = kgLine(uv.x * 65.0, 0.45, fwidth(uv.x * 65.0)) * kgLine(uv.y * 65.0, 0.45, fwidth(uv.y * 65.0));
  vec3 base = vKg.x < 0.5 ? vec3(0.57, 0.49, 0.32) : vec3(0.4, 0.32, 0.2);
  float stain = kgNoise(uv * 7.0 + vKg.y);
  diffuseColor.rgb = base * (0.78 + 0.25 * stain) * (1.0 - weave * fine * 0.16);
  if (vKg.x < 0.5) {
    float strokes = kgLine(uv.x * 12.0, 0.25, fwidth(uv.x * 12.0)) * step(0.4, kgNoise(uv * vec2(24.0, 17.0) + vKg.y));
    diffuseColor.rgb *= 1.0 - strokes * fine * 0.8;
  }
  kgFiberHeight = weave * fine * 0.001;
}`, normal: 'normal = kgBump(-vViewPosition, normal, dFdx(kgFiberHeight), dFdy(kgFiberHeight));',
  });
}

function barrier(def: InteractionDef, root: Group, mats: WorldMaterials): void {
  const wall = def.wall;
  if (!wall) return;
  const dx = wall.b.x - wall.a.x;
  const dz = wall.b.z - wall.a.z;
  const length = Math.hypot(dx, dz);
  if (length <= 0) return;
  const panel = new Group();
  panel.rotation.y = -Math.atan2(dz, dx);
  panel.position.set((wall.a.x + wall.b.x) / 2 - def.pos.x, 0, (wall.a.z + wall.b.z) / 2 - def.pos.z);
  root.add(panel);
  const wood = new MeshBuilder();
  const iron = new MeshBuilder();
  const seed = seedOf(def.id) % 1000;
  wood.kg = [PART.wood.board, seed, 0, 0.65];
  const inset = Math.min(0.04, wall.thickness * 0.15);
  wood.box([0, wall.height / 2, 0], [length, wall.height, Math.max(0.01, wall.thickness - inset * 2)]);
  wood.kg = [PART.wood.timber, seed + 1, 1, 0.25];
  for (const y of [wall.height * 0.2, wall.height * 0.8]) {
    for (const side of [-1, 1]) {
      wood.box([0, y, side * (wall.thickness / 2 - inset)], [length, Math.min(0.12, wall.height * 0.1), inset * 2]);
      iron.kg = [PART.iron.iron, seed, 0, 0];
      for (let x = -length / 2 + 0.13; x < length / 2; x += 0.48) iron.box([x, y, side * (wall.thickness / 2 - 0.005)], [0.025, 0.025, 0.01]);
    }
  }
  mesh(wood, mats.wood, panel);
  mesh(iron, mats.iron, panel);
}

function supply(def: InteractionDef, root: Group, mats: WorldMaterials, fiber: MeshStandardMaterial): Pick<ItemVisual, 'contents' | 'lid'> {
  const C = LOOK.interactions;
  const w = C.crateWidth;
  const d = C.crateDepth;
  const h = C.crateHeight;
  const wood = new MeshBuilder();
  const iron = new MeshBuilder();
  const seed = seedOf(def.id) % 1000;
  // r07-world-周3: 小物が建築の黒い木部へ埋もれる。箱だけを明るい乾いた木へ寄せる（発光・光源は足さない）。
  wood.kg = [PART.wood.board, seed, 1, 0.85];
  wood.box([0, 0.05, 0], [w, 0.1, d]);
  for (const side of [-1, 1]) {
    wood.kg = [PART.wood.board, seed, 1, 0.85];
    wood.box([0, h / 2, side * (d / 2 - 0.025)], [w, h, 0.05]);
    wood.box([side * (w / 2 - 0.025), h / 2, 0], [0.05, h, d - 0.1]);
    wood.kg = [PART.wood.timber, seed + 1, 0, 0.85];
    for (const x of [-w * 0.35, w * 0.35]) wood.box([x, h / 2, side * d / 2], [0.065, h, 0.025]);
    iron.kg = [PART.iron.iron, seed, 0, 0];
    for (const x of [-w * 0.35, w * 0.35]) for (const y of [0.12, h - 0.1]) iron.box([x, y, side * (d / 2 + 0.014)], [0.022, 0.022, 0.01]);
  }
  mesh(wood, mats.woodLow, root);
  mesh(iron, mats.iron, root);
  const lid = new Group();
  lid.name = 'lid';
  lid.position.set(0, h, -d / 2);
  root.add(lid);
  const top = new MeshBuilder();
  top.kg = [PART.wood.floor, seed + 2, 1, 0.85];
  top.box([0, 0.018, d / 2], [w + 0.025, 0.036, d + 0.02]);
  mesh(top, mats.woodLow, lid);

  const contents = new Group();
  contents.name = 'contents';
  root.add(contents);
  const bag = new MeshBuilder();
  bag.kg = [1, seed, 0, 0];
  const sphere = new SphereGeometry(1, 12, 8);
  bag.geometry(sphere, new Matrix4().makeScale(0.27, 0.28, 0.23).setPosition(w / 2 + 0.21, 0.26, 0.07));
  sphere.dispose();
  bag.cylinder(w / 2 + 0.21, 0.49, 0.07, 0.045, 0.065, 0.1, 8);
  bag.box([w / 2 + 0.21, 0.505, 0.07], [0.11, 0.028, 0.09]);
  mesh(bag, fiber, contents);
  return { contents, lid };
}

function intel(def: InteractionDef, root: Group, mats: WorldMaterials, fiber: MeshStandardMaterial): Group {
  const h = LOOK.interactions.intelHeight;
  const wood = new MeshBuilder();
  const seed = seedOf(def.id) % 1000;
  wood.kg = [PART.wood.timber, seed, 0, 0.4];
  wood.box([0, h / 2, 0], [0.075, h, 0.075]);
  wood.box([0, 0.025, 0], [0.4, 0.05, 0.32]);
  wood.box([0, h - 0.1, -0.04], [0.64, 0.38, 0.035]);
  mesh(wood, mats.woodLow, root);
  const contents = new Group();
  contents.name = 'contents';
  root.add(contents);
  const paper = new MeshBuilder();
  paper.kg = [0, seed, 0, 0];
  paper.box([0, h - 0.1, -0.01], [0.5, 0.3, 0.022]);
  for (const y of [h - 0.27, h + 0.07]) {
    const roll = new Matrix4().makeRotationZ(Math.PI / 2).setPosition(0.29, y, -0.015);
    paper.setMatrix(roll);
    paper.cylinder(0, 0, 0, 0.032, 0.032, 0.58, 10);
    paper.setMatrix(null);
  }
  mesh(paper, fiber, contents);
  return contents;
}

export function buildInteractions(stage: StageDef, mats: WorldMaterials): { root: Group; set(items: readonly InteractionSnap[]): void } {
  const root = new Group();
  root.name = 'interactions';
  const visuals: ItemVisual[] = [];
  const fiber = fiberMaterial();
  for (const def of stage.interactions ?? []) {
    if (def.kind === 'lamp' || (def.kind === 'barrier' && !def.wall)) continue;
    const item = new Group();
    item.name = `interaction-${def.id}`;
    item.position.set(def.pos.x, 0, def.pos.z);
    root.add(item);
    const visual: ItemVisual = { def, root: item };
    if (def.kind === 'barrier') barrier(def, item, mats);
    else if (def.kind === 'supply') Object.assign(visual, supply(def, item, mats, fiber));
    else if (def.kind === 'intel') visual.contents = intel(def, item, mats, fiber);
    visuals.push(visual);
  }
  if (!visuals.some((item) => item.contents)) fiber.dispose();
  return {
    root,
    set(items): void {
      for (const visual of visuals) {
        const snap = items.find((item) => item.id === visual.def.id);
        const used = snap?.used ?? false;
        visual.root.visible = visual.def.kind !== 'barrier' || !used;
        if (visual.contents) visual.contents.visible = !used;
        if (visual.lid) visual.lid.rotation.x = used ? -1.2 : 0;
      }
    },
  };
}
