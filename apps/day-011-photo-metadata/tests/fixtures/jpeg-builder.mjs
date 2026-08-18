/* テストとサンプル生成の両方で使う「JPEGとExifを組み立てる道具」。

   アプリ側（lib/）は読んで消すだけで、書く機能を持たない。書く側をここに置くのは、
   読む側のテストに「自分で書いたものを自分で読む」以外の検証手段が要るため……ではなく、
   その逆で、Exifを差し込んだ写真を他人からもらわずに自前で用意するため。
   他人の写真をリポジトリに入れない（権利と、写り込みの両方が面倒）。 */

import { readSegments } from '../../lib/jpeg.js';

const encoder = new TextEncoder();

export function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export const asciiBytes = (value) => encoder.encode(String(value));

const pad = (bytes) => (bytes.length % 2 === 0 ? bytes : concat([bytes, new Uint8Array(1)]));

/** タグ1件を、TIFFの型番号と生バイトに直す。type を省いたときは値の形から決める。 */
function encodeEntry(entry, littleEndian) {
  const { tag } = entry;
  let { type, value } = entry;

  if (typeof value === 'string') {
    type = type ?? 2;
    const body = concat([asciiBytes(value), new Uint8Array(1)]); // NUL終端
    return { tag, type, count: body.length, data: body };
  }
  if (value instanceof Uint8Array) {
    type = type ?? 7;
    return { tag, type, count: value.length, data: value };
  }

  const list = Array.isArray(value) ? value : [value];
  const rational = typeof list[0] === 'object';
  type = type ?? (rational ? 5 : 3);
  const size = { 1: 1, 3: 2, 4: 4, 5: 8, 10: 8 }[type];
  if (!size) throw new Error(`未対応の型: ${type}`);

  const data = new Uint8Array(size * list.length);
  const view = new DataView(data.buffer);
  list.forEach((one, index) => {
    const at = index * size;
    if (type === 1) data[at] = one;
    else if (type === 3) view.setUint16(at, one, littleEndian);
    else if (type === 4) view.setUint32(at, one, littleEndian);
    else if (type === 5) {
      view.setUint32(at, one.n, littleEndian);
      view.setUint32(at + 4, one.d, littleEndian);
    } else {
      view.setInt32(at, one.n, littleEndian);
      view.setInt32(at + 4, one.d, littleEndian);
    }
  });
  return { tag, type, count: list.length, data };
}

const ifdSize = (encoded) =>
  2 + encoded.length * 12 + 4 + encoded.reduce((sum, one) => sum + (one.data.length > 4 ? pad(one.data).length : 0), 0);

function serializeIfd(encoded, base, next, littleEndian) {
  const sorted = [...encoded].sort((a, b) => a.tag - b.tag);
  const headSize = 2 + sorted.length * 12 + 4;
  const head = new Uint8Array(headSize);
  const view = new DataView(head.buffer);
  const tails = [];
  let dataAt = base + headSize;

  view.setUint16(0, sorted.length, littleEndian);
  sorted.forEach((one, index) => {
    const at = 2 + index * 12;
    view.setUint16(at, one.tag, littleEndian);
    view.setUint16(at + 2, one.type, littleEndian);
    view.setUint32(at + 4, one.count, littleEndian);
    if (one.data.length <= 4) {
      head.set(one.data, at + 8); // 4バイト以内は値をその場に置く（左詰め）
    } else {
      view.setUint32(at + 8, dataAt, littleEndian);
      const body = pad(one.data);
      tails.push(body);
      dataAt += body.length;
    }
  });
  view.setUint32(2 + sorted.length * 12, next, littleEndian);
  return concat([head, ...tails]);
}

/**
 * Exif（APP1の中身）を組み立てる。戻りは 'Exif\0\0' から始まるバイト列。
 * entries は { tag, value, type? } の配列。thumbnail を渡すと IFD1 を作る。
 */
export function buildExifPayload({ byteOrder = 'II', ifd0 = [], exif = [], gps = [], ifd1 = [], thumbnail = null } = {}) {
  const littleEndian = byteOrder === 'II';
  const encode = (list) => list.map((one) => encodeEntry(one, littleEndian));

  const exifEncoded = encode(exif);
  const gpsEncoded = encode(gps);
  const ifd0Entries = [...ifd0];
  if (exifEncoded.length) ifd0Entries.push({ tag: 0x8769, type: 4, value: 0 });
  if (gpsEncoded.length) ifd0Entries.push({ tag: 0x8825, type: 4, value: 0 });
  const ifd0Encoded = encode(ifd0Entries);

  const ifd1Entries = [...ifd1];
  if (thumbnail) {
    ifd1Entries.push({ tag: 0x0103, type: 3, value: 6 }, { tag: 0x0201, type: 4, value: 0 }, { tag: 0x0202, type: 4, value: thumbnail.length });
  }
  const ifd1Encoded = encode(ifd1Entries);

  // 置き場所を先に決める（IFD0の中のポインタは、この計算が終わらないと書けない）
  const ifd0Base = 8;
  const exifBase = ifd0Base + ifdSize(ifd0Encoded);
  const gpsBase = exifBase + (exifEncoded.length ? ifdSize(exifEncoded) : 0);
  const ifd1Base = gpsBase + (gpsEncoded.length ? ifdSize(gpsEncoded) : 0);
  const thumbnailAt = ifd1Base + (ifd1Encoded.length ? ifdSize(ifd1Encoded) : 0);

  const fix = (list, tag, value) => {
    const found = list.find((one) => one.tag === tag);
    if (!found) return;
    const view = new DataView(found.data.buffer, found.data.byteOffset, found.data.byteLength);
    view.setUint32(0, value, littleEndian);
  };
  fix(ifd0Encoded, 0x8769, exifBase);
  fix(ifd0Encoded, 0x8825, gpsBase);
  fix(ifd1Encoded, 0x0201, thumbnailAt);

  const header = new Uint8Array(8);
  header.set(asciiBytes(byteOrder), 0);
  new DataView(header.buffer).setUint16(2, 42, littleEndian);
  new DataView(header.buffer).setUint32(4, ifd0Base, littleEndian);

  const parts = [
    asciiBytes('Exif'),
    new Uint8Array(2),
    header,
    serializeIfd(ifd0Encoded, ifd0Base, ifd1Encoded.length ? ifd1Base : 0, littleEndian)
  ];
  if (exifEncoded.length) parts.push(serializeIfd(exifEncoded, exifBase, 0, littleEndian));
  if (gpsEncoded.length) parts.push(serializeIfd(gpsEncoded, gpsBase, 0, littleEndian));
  if (ifd1Encoded.length) parts.push(serializeIfd(ifd1Encoded, ifd1Base, 0, littleEndian));
  if (thumbnail) parts.push(thumbnail);
  return concat(parts);
}

/** 度（十進）を Exif の度分秒（RATIONAL3つ）に直す。 */
export function toDms(value) {
  const size = Math.abs(value);
  const degrees = Math.floor(size);
  const minutes = Math.floor((size - degrees) * 60);
  const seconds = Math.round((size - degrees - minutes / 60) * 3600 * 1000);
  return [
    { n: degrees, d: 1 },
    { n: minutes, d: 1 },
    { n: seconds, d: 1000 }
  ];
}

/** マーカーと中身から、長さフィールド付きのセグメントを作る。 */
export function segment(marker, body) {
  const data = typeof body === 'string' ? asciiBytes(body) : body;
  // 長さフィールドは2バイト。これを超える中身は本来なら分割して入れる決まり
  if (data.length + 2 > 0xffff) throw new Error(`セグメントが大きすぎる: ${data.length}バイト`);
  const out = new Uint8Array(data.length + 4);
  out[0] = 0xff;
  out[1] = marker;
  out[2] = (data.length + 2) >> 8;
  out[3] = (data.length + 2) & 0xff;
  out.set(data, 4);
  return out;
}

/* 本物のJPEGは要らないテストのための、最小の「画素の代わり」。
   SOS から EOI までを1バイトも変えずに写せているかだけを見るので、中身は何でもよい。 */
export const FAKE_SCAN = concat([
  segment(0xda, new Uint8Array([0x01, 0x01, 0x00])),
  new Uint8Array([0x9a, 0x7f, 0x00, 0x12, 0xff, 0x00, 0x34, 0xd9, 0x55]),
  new Uint8Array([0xff, 0xd9])
]);

/** セグメントを並べてJPEGを1本組み立てる。 */
export function buildJpeg(segments, scan = FAKE_SCAN) {
  return concat([new Uint8Array([0xff, 0xd8]), ...segments, scan]);
}

export const app1Exif = (options) => segment(0xe1, buildExifPayload(options));
export const app1Xmp = (xml = '<x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>') =>
  segment(0xe1, concat([asciiBytes('http://ns.adobe.com/xap/1.0/'), new Uint8Array(1), asciiBytes(xml)]));
export const app1XmpExtended = (body = 'extended') =>
  segment(0xe1, concat([asciiBytes('http://ns.adobe.com/xmp/extension/'), new Uint8Array(1), asciiBytes(body)]));
export const app13Iptc = (body = 'photoshop') =>
  segment(0xed, concat([asciiBytes('Photoshop 3.0'), new Uint8Array(1), asciiBytes(body)]));
export const app2Icc = (body = 'icc-profile-body') =>
  segment(0xe2, concat([asciiBytes('ICC_PROFILE'), new Uint8Array(1), asciiBytes(body)]));
export const app2Mpf = (body = 'mpf-body') =>
  segment(0xe2, concat([asciiBytes('MPF'), new Uint8Array(1), asciiBytes(body)]));
export const app0Jfif = () =>
  segment(0xe0, concat([asciiBytes('JFIF'), new Uint8Array([0x00, 0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00])]));
export const comment = (body = 'てすと') => segment(0xfe, asciiBytes(body));

/* 'Exif\0\0' で始まるのに中身が壊れているAPP1。
   IFD0の置き場所がファイルの外を指しているので、読むことはできないが、区画としては落とせる。 */
export const app1BrokenExif = () =>
  segment(
    0xe1,
    concat([
      asciiBytes('Exif'),
      new Uint8Array(2),
      asciiBytes('II'),
      new Uint8Array([0x2a, 0x00]),
      new Uint8Array([0x00, 0x00, 0x10, 0x00]),
      new Uint8Array(16)
    ])
  );

/**
 * 実在するJPEGのバイト列に APP1（Exif）を差し込む。
 * JFIF(APP0)は先頭に置く決まりなので、その後ろへ入れる。
 */
export function insertApp1(jpegBytes, payload) {
  const parsed = readSegments(jpegBytes);
  if (!parsed.ok) throw new Error(`JPEGとして読めない: ${parsed.reason}`);
  const chunks = [jpegBytes.subarray(0, 2)];
  let placed = false;
  for (const one of parsed.segments) {
    if (!placed && one.marker !== 0xe0) {
      chunks.push(segment(0xe1, payload));
      placed = true;
    }
    chunks.push(jpegBytes.subarray(one.start, one.end));
  }
  if (!placed) chunks.push(segment(0xe1, payload));
  chunks.push(jpegBytes.subarray(parsed.scanStart));
  return concat(chunks);
}
