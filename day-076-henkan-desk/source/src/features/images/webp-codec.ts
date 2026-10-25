import encode, { init } from '@jsquash/webp/encode';
import encoderWasmUrl from '@jsquash/webp/codec/enc/webp_enc.wasm?url';
import encoderSimdWasmUrl from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url';
import { ConversionFailure } from '../../shared/errors';

let initialized: Promise<unknown> | undefined;
export async function encodeWebp(data: ImageData, quality: number): Promise<Blob> {
  try {
    initialized ??= init({ locateFile: (path: string) => path.includes('simd') ? encoderSimdWasmUrl : encoderWasmUrl });
    await initialized;
    const bytes = await encode(data, { quality: Math.round(quality * 100), alpha_quality: 100 });
    return new Blob([bytes], { type: 'image/webp' });
  } catch {
    initialized = undefined;
    throw new ConversionFailure('UNSUPPORTED', 'WebPの書き出し機能を読み込めませんでした。接続を確認するかJPG・PNGを選んでください。', true);
  }
}
