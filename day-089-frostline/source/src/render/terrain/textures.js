// 山の配列を GPU のテクスチャにする。形式とフィルタの決まりを1か所に集める。
import * as THREE from 'three/webgpu';
import { buildSlope, toHalfFloats, buildMicroTile } from './texture-data.js';

function data(array, w, h, format, type, { filter = 'nearest', repeat = false, mips = false, anisotropy = 1 } = {}) {
  const t = new THREE.DataTexture(array, w, h, format, type);
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  if (filter === 'nearest') {
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  } else {
    t.magFilter = THREE.LinearFilter;
    t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.generateMipmaps = mips;
    t.anisotropy = anisotropy;
  }
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/**
 * @param {{meta:object, buffers:{height:Float32Array,tileA:Float32Array,masksA:Uint8Array,masksB:Uint8Array,sunVis:Uint8Array}}} world
 * @param {{anisotropy:number}} tier
 */
export function createTerrainTextures(world, tier) {
  const m = world.meta;
  const b = world.buffers;
  const tileCell = m.tilePeriod / m.tileGrid;
  const aniso = tier.anisotropy;
  // 高さは頂点シェーダーが textureLoad で読み、自前で補間する。float32 の線形補間が無い端末でも同じ値になる
  const height = data(b.height, m.grid, m.grid, THREE.RedFormat, THREE.FloatType);
  const tile = data(b.tileA, m.tileGrid, m.tileGrid, THREE.RedFormat, THREE.FloatType);
  // 雪質の地図は、頂点（凹凸の強さ）では textureLoad、画素では線形補間で読む
  const masksA = data(b.masksA, m.maskGrid, m.maskGrid, THREE.RGBAFormat, THREE.UnsignedByteType, { filter: 'linear', mips: true, anisotropy: aniso });
  const masksB = data(b.masksB, m.maskGrid, m.maskGrid, THREE.RGBAFormat, THREE.UnsignedByteType, { filter: 'linear', mips: false });
  const slope = data(toHalfFloats(buildSlope(b.height, m.grid, m.cell, false)), m.grid, m.grid, THREE.RGFormat, THREE.HalfFloatType, { filter: 'linear', mips: true, anisotropy: aniso });
  const tileSlope = data(toHalfFloats(buildSlope(b.tileA, m.tileGrid, tileCell, true)), m.tileGrid, m.tileGrid, THREE.RGFormat, THREE.HalfFloatType, { filter: 'linear', mips: true, repeat: true, anisotropy: aniso });
  const sunVis = data(b.sunVis, m.grid, m.grid, THREE.RedFormat, THREE.UnsignedByteType, { filter: 'linear', mips: false });
  const micro = data(buildMicroTile(512), 512, 512, THREE.RGBAFormat, THREE.UnsignedByteType, { filter: 'linear', mips: true, repeat: true, anisotropy: aniso });
  // 湖の氷と水の絵（谷と湖のマップ）。無い山では、1 画素の「陸」を置く（材質の分岐を作らずに済む）
  const lake = b.lake && m.lake
    ? data(b.lake, m.lake.grid, m.lake.grid, THREE.RedFormat, THREE.UnsignedByteType, { filter: 'linear', mips: false })
    : data(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType, { filter: 'linear', mips: false });
  const all = { height, tile, masksA, masksB, slope, tileSlope, sunVis, micro, lake };
  return { ...all, dispose() { for (const t of Object.values(all)) t.dispose(); } };
}
