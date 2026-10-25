export function join(...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
export const ascii = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(text, char => char.charCodeAt(0));
export function u32(value: number, little = false): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, little); return bytes;
}
export function exif(orientation: number, little = true): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(26); const view = new DataView(data.buffer);
  data.set(ascii(little ? 'II' : 'MM'));
  view.setUint16(2, 42, little); view.setUint32(4, 8, little); view.setUint16(8, 1, little);
  view.setUint16(10, 0x112, little); view.setUint16(12, 3, little); view.setUint32(14, 1, little);
  view.setUint16(18, orientation, little); return data;
}
export function pngChunk(type: string, data: Uint8Array = new Uint8Array()): Uint8Array<ArrayBuffer> { return join(u32(data.length), ascii(type), data, new Uint8Array(4)); }
export function png(width = 100, height = 50, chunks: readonly Uint8Array[] = []): Uint8Array<ArrayBuffer> {
  const ihdr = join(u32(width), u32(height), new Uint8Array([8, 6, 0, 0, 0]));
  return join(ascii('\x89PNG\r\n\x1a\n'), pngChunk('IHDR', ihdr), ...chunks, pngChunk('IDAT', new Uint8Array([1])), pngChunk('IEND'));
}
export function jpeg(width = 100, height = 50, orientation?: number, little = true): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [new Uint8Array([255, 216])];
  if (orientation !== undefined) {
    const payload = join(ascii('Exif\0\0'), exif(orientation, little));
    parts.push(join(new Uint8Array([255, 225, 0, payload.length + 2]), payload));
  }
  parts.push(new Uint8Array([255, 192, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 17, 0]));
  parts.push(new Uint8Array([255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 1, 255, 217]));
  return join(...parts);
}
export function webpChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> { return join(ascii(type), u32(data.length, true), data, data.length % 2 ? new Uint8Array(1) : new Uint8Array()); }
export function webp(width = 100, height = 50, extra: readonly Uint8Array[] = [], flags?: number): Uint8Array<ArrayBuffer> {
  const bits = ((width - 1) | ((height - 1) << 14)) >>> 0;
  const image = webpChunk('VP8L', join(new Uint8Array([0x2f]), u32(bits, true)));
  const extended = flags === undefined ? [] : [webpChunk('VP8X', new Uint8Array([flags, 0, 0, 0, (width - 1) & 255, ((width - 1) >> 8) & 255, ((width - 1) >> 16) & 255, (height - 1) & 255, ((height - 1) >> 8) & 255, ((height - 1) >> 16) & 255]))];
  const body = join(ascii('WEBP'), ...extended, image, ...extra);
  return join(ascii('RIFF'), u32(body.length, true), body);
}
