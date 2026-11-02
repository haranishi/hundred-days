// OWNER: world-art
// 発光面の消灯を一枚の小さな状態テクスチャで共有する。ライト数・材質・シェーダーの種類は変えない。
import { DataTexture, NearestFilter, RGBAFormat, UnsignedByteType } from 'three';
import type { StageDef } from '../../stage/types';

export class LampState {
  readonly texture: DataTexture;
  readonly inverseWidth: number;
  private readonly pixels: Uint8Array;
  private readonly ids: string[];

  constructor(stage: StageDef) {
    this.ids = stage.lights.map((light) => light.id);
    const width = Math.max(1, this.ids.length);
    this.inverseWidth = 1 / width;
    this.pixels = new Uint8Array(width * 4).fill(255);
    this.texture = new DataTexture(this.pixels, width, 1, RGBAFormat, UnsignedByteType);
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  setDisabled(ids: readonly string[]): void {
    let changed = false;
    for (let i = 0; i < this.ids.length; i++) {
      const value = ids.includes(this.ids[i]) ? 0 : 255;
      if (this.pixels[i * 4] === value) continue;
      this.pixels[i * 4] = value;
      changed = true;
    }
    if (changed) this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
