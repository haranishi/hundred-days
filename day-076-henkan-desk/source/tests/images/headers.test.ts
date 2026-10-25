import { describe, expect, it } from 'vitest';
import { ImageValidationError, inspectImage, inspectImageBytes } from '../../src/features/images/headers';
import { ascii, exif, jpeg, join, png, pngChunk, webp, webpChunk } from './header-fixtures';

function rejects(bytes: Uint8Array, code = 'INVALID_FILE'): void {
  try { inspectImageBytes(bytes); throw new Error('Unexpected success'); }
  catch (error) { expect(error).toBeInstanceOf(ImageValidationError); expect((error as ImageValidationError).code).toBe(code); }
}

describe('safe image headers', () => {
  it('identifies actual bytes regardless of extension and MIME', async () => {
    const file = new File([png()], 'disguised.svg', { type: 'image/svg+xml' });
    expect(await inspectImage(file)).toMatchObject({ format: 'png', width: 100, height: 50 });
    expect(inspectImageBytes(jpeg())).toMatchObject({ format: 'jpeg', width: 100, height: 50 });
    expect(inspectImageBytes(webp())).toMatchObject({ format: 'webp', width: 100, height: 50 });
  });
  for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`reads EXIF orientation ${orientation} in both TIFF byte orders and all formats`, () => {
      for (const little of [true, false]) {
        for (const bytes of [jpeg(100, 50, orientation, little), png(100, 50, [pngChunk('eXIf', exif(orientation, little))]), webp(100, 50, [webpChunk('EXIF', exif(orientation, little))], 8)]) {
          expect(inspectImageBytes(bytes)).toMatchObject({ orientation, displayWidth: orientation >= 5 ? 50 : 100, displayHeight: orientation >= 5 ? 100 : 50 });
        }
      }
    });
  }
  it('rejects animated formats rather than flattening them', () => {
    rejects(png(20, 20, [pngChunk('acTL', new Uint8Array(8))]), 'UNSUPPORTED');
    rejects(png(20, 20, [pngChunk('fcTL', new Uint8Array(26))]));
    rejects(webp(20, 20, [], 2), 'UNSUPPORTED');
    rejects(webp(20, 20, [webpChunk('ANMF', new Uint8Array(16))]), 'UNSUPPORTED');
    rejects(ascii('GIF89a'), 'UNSUPPORTED');
  });
  it('checks edges and total pixels before decode', () => {
    for (const bytes of [png(8193, 1), jpeg(8193, 1), webp(8193, 1), png(4001, 4000)]) rejects(bytes, 'LIMIT_EXCEEDED');
    expect(inspectImageBytes(png(4000, 4000)).width).toBe(4000);
    rejects(png(0, 100));
  });
  it('rejects oversized input without reading its contents', async () => {
    const fake = { size: 10 * 1024 * 1024 + 1, arrayBuffer: () => { throw new Error('must not read'); } } as unknown as File;
    await expect(inspectImage(fake)).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });
  it('can validate output above the input byte limit without weakening dimensions', () => {
    const output = png(100, 50, [pngChunk('tEXt', new Uint8Array(10 * 1024 * 1024))]);
    rejects(output, 'LIMIT_EXCEEDED');
    expect(inspectImageBytes(output, false)).toMatchObject({ width: 100, height: 50 });
    expect(() => inspectImageBytes(png(8193, 1), false)).toThrow(ImageValidationError);
  });
  it('rejects broken TIFF and contradictory orientation', () => {
    rejects(jpeg(100, 50, 9));
    rejects(png(100, 50, [pngChunk('eXIf', new Uint8Array(4))]));
    const bad = exif(6); new DataView(bad.buffer).setUint32(4, 0xfffffff0, true);
    rejects(webp(100, 50, [webpChunk('EXIF', bad)], 8));
  });
  it('rejects PNG truncation, duplicate IHDR and missing IEND', () => {
    const bytes = png();
    rejects(bytes.subarray(0, bytes.length - 1));
    rejects(join(bytes, new Uint8Array([0])));
    rejects(png(100, 50, [pngChunk('IHDR', new Uint8Array(13))]));
    const bad = png(); new DataView(bad.buffer).setUint32(33, 0xffffffff);
    rejects(bad);
  });
  it('rejects RIFF mismatches, invalid padding and conflicting dimensions', () => {
    const bytes = webp(); bytes[4] = (bytes[4] ?? 0) + 1; rejects(bytes);
    const padding = webp(); padding[padding.length - 1] = 1; rejects(padding);
    const mismatch = webp(100, 50, [], 0); mismatch[24] = 100; rejects(mismatch);
    const truncated = webp().subarray(0, 15); rejects(truncated);
  });
  it('rejects JPEG invalid segment bounds, missing EOI and MPF', () => {
    const bad = jpeg(); bad[4] = 0xff; bad[5] = 0xff; rejects(bad);
    rejects(jpeg().subarray(0, jpeg().length - 2));
    const mpf = join(new Uint8Array([255, 216, 255, 226, 0, 6]), ascii('MPF\0'), jpeg().subarray(2));
    rejects(mpf, 'UNSUPPORTED');
  });
  it('fails malformed or unknown input without leaking native bounds errors', () => {
    for (const bytes of [new Uint8Array(), new Uint8Array([255, 216]), png().subarray(0, 10), ascii('not an image')]) {
      expect(() => inspectImageBytes(bytes)).toThrow(ImageValidationError);
    }
  });
});
