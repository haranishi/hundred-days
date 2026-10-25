import { ConversionFailure } from '../../shared/errors';
import { LIMITS } from '../../shared/limits';

export type ImageHeaderFormat = 'jpeg' | 'png' | 'webp';
export type HeaderInfo = {
  format: ImageHeaderFormat;
  width: number;
  height: number;
  orientation: number;
  displayWidth: number;
  displayHeight: number;
};

export class ImageValidationError extends ConversionFailure {
  constructor(code: 'UNSUPPORTED' | 'INVALID_FILE' | 'LIMIT_EXCEEDED', message: string) {
    super(code, message);
    this.name = 'ImageValidationError';
  }
}

const MAX_FILE = LIMITS.imageFileBytes;
const MAX_EDGE = LIMITS.imageEdge;
const MAX_PIXELS = LIMITS.imagePixels;
function invalid(message = '画像の構造を読み取れません。別の画像を選んでください。'): never {
  throw new ImageValidationError('INVALID_FILE', message);
};
function unsupported(message = 'この画像形式には対応していません。JPG・PNG・静止WebPを選んでください。'): never {
  throw new ImageValidationError('UNSUPPORTED', message);
};

class Bytes {
  readonly view: DataView;
  constructor(readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  ensure(offset: number, length: number): void {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > this.data.length - length) invalid();
  }
  u8(offset: number): number { this.ensure(offset, 1); return this.view.getUint8(offset); }
  u16(offset: number, little = false): number { this.ensure(offset, 2); return this.view.getUint16(offset, little); }
  u32(offset: number, little = false): number { this.ensure(offset, 4); return this.view.getUint32(offset, little); }
  u24(offset: number): number { this.ensure(offset, 3); return this.u8(offset) + this.u8(offset + 1) * 256 + this.u8(offset + 2) * 65536; }
  text(offset: number, length: number): string {
    this.ensure(offset, length);
    return String.fromCharCode(...this.data.subarray(offset, offset + length));
  }
  slice(offset: number, length: number): Uint8Array { this.ensure(offset, length); return this.data.subarray(offset, offset + length); }
}

function orientationFromExif(payload: Uint8Array): number | undefined {
  const prefix = new Bytes(payload);
  const offset = payload.length >= 6 && prefix.text(0, 6) === 'Exif\0\0' ? 6 : 0;
  const tiff = new Bytes(prefix.slice(offset, payload.length - offset));
  tiff.ensure(0, 8);
  const order = tiff.text(0, 2);
  if (order !== 'II' && order !== 'MM') invalid('画像の向き情報が壊れています。');
  const little = order === 'II';
  if (tiff.u16(2, little) !== 42) invalid('画像の向き情報が壊れています。');
  const ifd = tiff.u32(4, little);
  if (ifd < 8) invalid('画像の向き情報が壊れています。');
  const count = tiff.u16(ifd, little);
  tiff.ensure(ifd + 2, count * 12 + 4);
  let result: number | undefined;
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12;
    if (tiff.u16(entry, little) !== 0x0112) continue;
    if (tiff.u16(entry + 2, little) !== 3 || tiff.u32(entry + 4, little) !== 1) invalid('画像の向き情報が壊れています。');
    const value = tiff.u16(entry + 8, little);
    if (value < 1 || value > 8 || (result !== undefined && result !== value)) invalid('画像の向き情報が壊れています。');
    result = value;
  }
  return result;
}

function mergeOrientation(current: number | undefined, next: number | undefined): number | undefined {
  if (current !== undefined && next !== undefined && current !== next) invalid('画像の向き情報が一致しません。');
  return next ?? current;
}

function dimensions(format: ImageHeaderFormat, width: number, height: number, orientation = 1): HeaderInfo {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) invalid('画像の幅と高さを確認できません。');
  if (width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
    throw new ImageValidationError('LIMIT_EXCEEDED', '画像は一辺8192px・1600万画素以内にしてください。');
  }
  const swap = orientation >= 5 && orientation <= 8;
  return { format, width, height, orientation, displayWidth: swap ? height : width, displayHeight: swap ? width : height };
}

function inspectJpeg(bytes: Bytes): HeaderInfo {
  let offset = 2;
  let size: { width: number; height: number } | undefined;
  let orientation: number | undefined;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset < bytes.data.length) {
    if (bytes.u8(offset++) !== 0xff) invalid();
    while (bytes.u8(offset) === 0xff) offset++;
    const marker = bytes.u8(offset++);
    if (marker === 0x01) continue;
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) invalid();
    const length = bytes.u16(offset);
    if (length < 2) invalid();
    bytes.ensure(offset, length);
    const data = offset + 2;
    const payloadLength = length - 2;
    if (sof.has(marker)) {
      if (size || payloadLength < 6) invalid();
      const components = bytes.u8(data + 5);
      if (components < 1 || payloadLength !== 6 + components * 3) invalid();
      size = { height: bytes.u16(data + 1), width: bytes.u16(data + 3) };
      dimensions('jpeg', size.width, size.height);
    }
    if (marker === 0xe1 && payloadLength >= 6 && bytes.text(data, 6) === 'Exif\0\0') {
      orientation = mergeOrientation(orientation, orientationFromExif(bytes.slice(data, payloadLength)));
    }
    if (marker === 0xe2 && payloadLength >= 4 && bytes.text(data, 4) === 'MPF\0') unsupported('複数画像を含むJPEGには対応していません。通常のJPEGに保存し直してください。');
    if (marker === 0xda) {
      if (!size || payloadLength < 4) invalid();
      const components = bytes.u8(data);
      if (components < 1 || payloadLength !== 1 + components * 2 + 3) invalid();
      if (offset + length >= bytes.data.length - 1 || bytes.u16(bytes.data.length - 2) !== 0xffd9) invalid();
      return dimensions('jpeg', size.width, size.height, orientation);
    }
    offset += length;
  }
  return invalid();
}

function inspectPng(bytes: Bytes): HeaderInfo {
  let offset = 8;
  let size: { width: number; height: number } | undefined;
  let orientation: number | undefined;
  let idat = false;
  let endedIdat = false;
  let seenExif = false;
  while (offset < bytes.data.length) {
    bytes.ensure(offset, 12);
    const length = bytes.u32(offset);
    const type = bytes.text(offset + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) invalid();
    const data = offset + 8;
    bytes.ensure(data, length + 4);
    if (!size && type !== 'IHDR') invalid();
    if (type === 'IHDR') {
      if (size || length !== 13 || offset !== 8) invalid();
      size = { width: bytes.u32(data), height: bytes.u32(data + 4) };
      dimensions('png', size.width, size.height);
      const depth = bytes.u8(data + 8);
      const color = bytes.u8(data + 9);
      const allowed: Record<number, readonly number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!allowed[color]?.includes(depth) || bytes.u8(data + 10) !== 0 || bytes.u8(data + 11) !== 0 || bytes.u8(data + 12) > 1) invalid();
    } else if (type === 'acTL') {
      unsupported('アニメーションPNGには対応していません。静止画像を選んでください。');
    } else if (type === 'fcTL' || type === 'fdAT') {
      invalid('アニメーションPNGの構造が壊れています。');
    } else if (type === 'eXIf') {
      if (seenExif) invalid();
      seenExif = true;
      orientation = orientationFromExif(bytes.slice(data, length));
    } else if (type === 'IDAT') {
      if (endedIdat) invalid();
      idat = true;
    } else if (type === 'IEND') {
      if (!size || !idat || length !== 0 || data + length + 4 !== bytes.data.length) invalid();
      return dimensions('png', size.width, size.height, orientation);
    } else {
      if (type[0] === type[0]?.toUpperCase() && type !== 'PLTE') invalid('このPNGの構造には対応していません。');
    }
    if (idat && type !== 'IDAT') endedIdat = true;
    offset = data + length + 4;
  }
  return invalid();
}

function inspectWebp(bytes: Bytes): HeaderInfo {
  bytes.ensure(0, 12);
  if (bytes.u32(4, true) + 8 !== bytes.data.length) invalid();
  let offset = 12;
  let canvas: { width: number; height: number } | undefined;
  let image: { width: number; height: number } | undefined;
  let orientation: number | undefined;
  let seenExif = false;
  while (offset < bytes.data.length) {
    bytes.ensure(offset, 8);
    const type = bytes.text(offset, 4);
    const length = bytes.u32(offset + 4, true);
    const data = offset + 8;
    bytes.ensure(data, length + (length % 2));
    if (length % 2 && bytes.u8(data + length) !== 0) invalid();
    if (type === 'ANIM' || type === 'ANMF') unsupported('アニメーションWebPには対応していません。静止画像を選んでください。');
    if (type === 'VP8X') {
      if (canvas || offset !== 12 || length !== 10) invalid();
      const flags = bytes.u8(data);
      if (flags & 0x02) unsupported('アニメーションWebPには対応していません。静止画像を選んでください。');
      if ((flags & 0xc1) || bytes.u24(data + 1) !== 0) invalid();
      canvas = { width: bytes.u24(data + 4) + 1, height: bytes.u24(data + 7) + 1 };
      dimensions('webp', canvas.width, canvas.height);
    } else if (type === 'VP8 ') {
      if (image || length < 10 || (bytes.u8(data) & 1) || bytes.text(data + 3, 3) !== '\x9d\x01\x2a') invalid();
      image = { width: bytes.u16(data + 6, true) & 0x3fff, height: bytes.u16(data + 8, true) & 0x3fff };
      dimensions('webp', image.width, image.height);
    } else if (type === 'VP8L') {
      if (image || length < 5 || bytes.u8(data) !== 0x2f) invalid();
      const bits = bytes.u32(data + 1, true);
      if ((bits >>> 29) !== 0) invalid();
      image = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      dimensions('webp', image.width, image.height);
    } else if (type === 'EXIF') {
      if (seenExif) invalid();
      seenExif = true;
      orientation = orientationFromExif(bytes.slice(data, length));
    }
    offset = data + length + (length % 2);
  }
  if (!image || offset !== bytes.data.length) invalid();
  if (canvas && (canvas.width !== image.width || canvas.height !== image.height)) invalid('WebPの画像サイズが一致しません。');
  return dimensions('webp', image.width, image.height, orientation);
}

export function inspectImageBytes(data: Uint8Array, enforceInputLimits = true): HeaderInfo {
  if (enforceInputLimits && data.byteLength > MAX_FILE) throw new ImageValidationError('LIMIT_EXCEEDED', '画像は1件10MiB以内にしてください。');
  if (data.byteLength < 2) invalid();
  const bytes = new Bytes(data);
  if (bytes.u16(0) === 0xffd8) return inspectJpeg(bytes);
  if (data.length >= 8 && bytes.text(0, 8) === '\x89PNG\r\n\x1a\n') return inspectPng(bytes);
  if (data.length >= 12 && bytes.text(0, 4) === 'RIFF' && bytes.text(8, 4) === 'WEBP') return inspectWebp(bytes);
  return unsupported();
}

export async function inspectImage(file: File): Promise<HeaderInfo> {
  if (file.size > MAX_FILE) throw new ImageValidationError('LIMIT_EXCEEDED', '画像は1件10MiB以内にしてください。');
  try {
    return inspectImageBytes(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    return invalid('画像ファイルを読み込めません。選び直してください。');
  }
}
