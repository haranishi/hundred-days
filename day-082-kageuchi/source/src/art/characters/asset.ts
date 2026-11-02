// OWNER: chars-art
// 種類ごとの形と骨の休みの位置。形は種類ごとに1回だけ作り、同じ種類の人物どうしで共有する
// （SkinnedMesh は形を共有して、骨だけを人物ごとに持てる）。
import { Box3, type BufferGeometry, Sphere, Vector3 } from 'three';
import type { CharacterKind } from '../../contract/snapshot';
import { ATTACH, DIMS } from './config';
import { MeshBuilder } from './mesh/builder';
import { buildKind, headTop } from './mesh/kinds';
import { boneSegments } from './mesh/parts';
import { restOffsets, restWorld, type Dims } from './rig';

export interface KindAsset {
  kind: CharacterKind;
  geometry: BufferGeometry;
  dims: Dims;
  /** 骨ごとの休みの位置（親からの相対）。 */
  offsets: Vector3[];
  /** 骨ごとの休みの位置（base から見た）。 */
  rest: Vector3[];
  triangles: number;
  height: number;
}

const cache = new Map<CharacterKind, KindAsset>();

/** 人物が動いても外へはみ出さない、大きめの包み（骨で動く形は自動の包みが休みの姿勢のままになるため）。 */
export const CHAR_BOUNDS = new Sphere(new Vector3(0, 1, 0), 3.4);

export function kindAsset(kind: CharacterKind): KindAsset {
  const hit = cache.get(kind);
  if (hit) return hit;
  const dims = DIMS[kind];
  const offsets = restOffsets(dims, ATTACH[kind]);
  const rest = restWorld(offsets);
  const b = new MeshBuilder(boneSegments(rest));
  const ctx = { b, W: rest, d: dims };
  buildKind(ctx, kind);
  const geometry = b.build();
  geometry.boundingSphere = CHAR_BOUNDS.clone();
  geometry.boundingBox = new Box3(new Vector3(-3.4, -0.5, -3.4), new Vector3(3.4, 3.6, 3.4));
  const asset: KindAsset = { kind, geometry, dims, offsets, rest, triangles: b.triangleCount, height: headTop(ctx) };
  cache.set(kind, asset);
  return asset;
}
