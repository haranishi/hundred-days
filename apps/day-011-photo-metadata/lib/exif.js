/* Exif（APP1 の中身）を読むところ。中身は TIFF なので、TIFF として読む。

   構造：'Exif\0\0'(6) → TIFFヘッダ(8) → IFD0 → （IFD0の中のポインタで）ExifIFD・GPS IFD →
   IFD0 の「次のIFD」が IFD1（サムネイル）。オフセットはすべて TIFF ヘッダの先頭からの相対値。

   ■ ここは他人が作ったファイルを読む場所なので、例外を投げない。
   壊れたファイルで throw すると、呼び出し側が「読めない」と「情報が無い」を区別できなくなる。
   全体が読めないときは { ok:false, reason } を返し、1つのタグだけ壊れているときはそのタグを飛ばす。

   ■ MakerNote は中身を読まない（メーカー独自形式で規格が公開されていない）。長さだけ持つ。 */

const EXIF_SIGNATURE = 'Exif\0\0';
const TIFF_MAGIC = 42;

// 1つのIFDが持つエントリ数の上限。実在するファイルは多くても数百件で、
// これを超える値は「壊れている」か「長さを偽って読ませようとしている」かのどちらか
const MAX_ENTRIES = 1000;

// 配列で持つ上限。これを超える長さは件数だけ覚えて中身は捨てる（表示にも除去にも使わないため）
const MAX_ARRAY = 64;

// TIFFの型番号 → 1要素あたりのバイト数（0 = 未知の型）
const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

export const TAG = {
  ORIENTATION: 0x0112,
  EXIF_IFD: 0x8769,
  GPS_IFD: 0x8825,
  INTEROP_IFD: 0xa005,
  MAKER_NOTE: 0x927c,
  USER_COMMENT: 0x9286,
  THUMB_OFFSET: 0x0201,
  THUMB_LENGTH: 0x0202
};

// Windowsが書き込む XPTitle / XPComment / XPAuthor / XPKeywords。中身はUCS-2（UTF-16LE）
const XP_TAGS = new Set([0x9c9b, 0x9c9c, 0x9c9d, 0x9c9e]);

const fail = (reason) => ({ ok: false, reason });

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return null;
}

function latin1(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

const ascii = (bytes, at, length) => latin1(bytes.subarray(at, at + length));

/** ASCIIタグはNUL終端。終端より後ろ（詰め物）は捨て、前後の空白も落とす。 */
const trimNul = (text) => {
  const cut = text.indexOf('\0');
  return (cut === -1 ? text : text.slice(0, cut)).trim();
};

/** 文字列に読めるタグかどうか（値が {kind:'bytes'} のときは読めなかったということ）。 */
export function textOf(entry) {
  if (!entry) return '';
  const { value } = entry;
  if (typeof value === 'string') return value;
  return '';
}

/** SHORT/LONG など、数として使えるものだけ数で返す。配列なら先頭。 */
export function numberOf(entry) {
  if (!entry) return null;
  const value = Array.isArray(entry.value) ? entry.value[0] : entry.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** そのタグが「中身を読まなかった塊」かどうか（MakerNoteや読めない文字コード）。 */
export const isOpaque = (entry) => Boolean(entry && entry.value && entry.value.kind === 'bytes');

function decodeUserComment(bytes, at, count, littleEndian) {
  if (count <= 8) return '';
  const code = trimNul(ascii(bytes, at, 8));
  const body = bytes.subarray(at + 8, at + count);
  if (/^ASCII/i.test(code) || code === '') return trimNul(latin1(body));
  if (/^UNICODE/i.test(code)) {
    try {
      return trimNul(new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be').decode(body));
    } catch {
      return { kind: 'bytes', length: body.length };
    }
  }
  // JIS X 0208 など。読めないものを推測で読まない
  return { kind: 'bytes', length: body.length };
}

function decodeXp(bytes, at, count) {
  try {
    return trimNul(new TextDecoder('utf-16le').decode(bytes.subarray(at, at + count)));
  } catch {
    return { kind: 'bytes', length: count };
  }
}

function decode(ctx, tag, type, count, at) {
  const { bytes, view, le } = ctx;

  if (tag === TAG.MAKER_NOTE) return { kind: 'bytes', length: count };
  if (tag === TAG.USER_COMMENT && (type === 7 || type === 1)) return decodeUserComment(bytes, at, count, le);
  if (XP_TAGS.has(tag) && (type === 1 || type === 7)) return decodeXp(bytes, at, count);

  switch (type) {
    case 2:
      return trimNul(ascii(bytes, at, count));
    case 1:
    case 6: {
      if (count > 8) return { kind: 'bytes', length: count };
      const out = [];
      for (let i = 0; i < count; i += 1) out.push(type === 1 ? bytes[at + i] : view.getInt8(at + i));
      return count === 1 ? out[0] : out;
    }
    case 7:
      return { kind: 'bytes', length: count };
    case 3:
    case 4:
    case 8:
    case 9:
    case 11:
    case 12: {
      const size = TYPE_SIZE[type];
      const read = (index) => {
        const spot = at + index * size;
        if (type === 3) return view.getUint16(spot, le);
        if (type === 4) return view.getUint32(spot, le);
        if (type === 8) return view.getInt16(spot, le);
        if (type === 9) return view.getInt32(spot, le);
        if (type === 11) return view.getFloat32(spot, le);
        return view.getFloat64(spot, le);
      };
      if (count === 1) return read(0);
      if (count > MAX_ARRAY) return { kind: 'bytes', length: count * size };
      const out = [];
      for (let i = 0; i < count; i += 1) out.push(read(i));
      return out;
    }
    case 5:
    case 10: {
      const read = (index) => {
        const spot = at + index * 8;
        return type === 5
          ? { n: view.getUint32(spot, le), d: view.getUint32(spot + 4, le) }
          : { n: view.getInt32(spot, le), d: view.getInt32(spot + 4, le) };
      };
      if (count === 1) return read(0);
      if (count > MAX_ARRAY) return { kind: 'bytes', length: count * 8 };
      const out = [];
      for (let i = 0; i < count; i += 1) out.push(read(i));
      return out;
    }
    default:
      return { kind: 'bytes', length: 0 };
  }
}

/** 1つのIFDを読む。読めないときは null（呼び出し側が「そのIFDだけ無かった」ことにできる）。 */
function readIfd(ctx, offset) {
  const { bytes, view, tiff, le } = ctx;
  if (!Number.isInteger(offset) || offset < 0) return null;
  const at = tiff + offset;
  if (at + 2 > bytes.length) return null;

  const count = view.getUint16(at, le);
  // 0件のIFDはTIFFの規格上あり得ない。上限より多いものは長さを偽っている
  if (count === 0 || count > MAX_ENTRIES) return null;
  const tail = at + 2 + count * 12 + 4;
  if (tail > bytes.length) return null;

  const tags = new Map();
  let broken = 0;
  for (let index = 0; index < count; index += 1) {
    const entryAt = at + 2 + index * 12;
    const tag = view.getUint16(entryAt, le);
    const type = view.getUint16(entryAt + 2, le);
    const size = TYPE_SIZE[type] || 0;
    const length = view.getUint32(entryAt + 4, le);
    if (!size || length > 0x0fffffff) {
      broken += 1;
      continue;
    }
    const total = size * length;
    let valueAt = entryAt + 8;
    if (total > 4) {
      valueAt = tiff + view.getUint32(entryAt + 8, le);
      // 値の置き場所がファイルの外を指している＝壊れている。そのタグだけ飛ばす
      if (valueAt < 0 || valueAt + total > bytes.length) {
        broken += 1;
        continue;
      }
    }
    tags.set(tag, { tag, type, count: length, value: decode(ctx, tag, type, length, valueAt) });
  }
  return { tags, next: view.getUint32(at + 2 + count * 12, le), broken };
}

function readThumbnail(ctx, ifd1) {
  const offset = numberOf(ifd1.get(TAG.THUMB_OFFSET));
  const length = numberOf(ifd1.get(TAG.THUMB_LENGTH));
  if (offset === null || length === null || length <= 0) return null;
  const start = ctx.tiff + offset;
  if (start < ctx.tiff || start + length > ctx.bytes.length) return null;
  return { start, length };
}

/**
 * APP1 の中身（'Exif\0\0' から始まるバイト列）を読む。
 * 成功: { ok:true, byteOrder, sections:{ifd0,exif,gps,ifd1}, thumbnail, broken }
 * 失敗: { ok:false, reason }（例外は投げない）
 * thumbnail.start は「渡したバイト列の先頭からの位置」なので、そのまま subarray に使える。
 */
export function readExif(payload) {
  const bytes = toBytes(payload);
  if (!bytes) return fail('not-bytes');
  if (bytes.length < 6 + 8) return fail('too-short');
  if (ascii(bytes, 0, 6) !== EXIF_SIGNATURE) return fail('not-exif');

  const tiff = 6;
  const order = ascii(bytes, tiff, 2);
  if (order !== 'II' && order !== 'MM') return fail('bad-byte-order');
  const le = order === 'II';

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(tiff + 2, le) !== TIFF_MAGIC) return fail('bad-tiff-magic');

  const ctx = { bytes, view, tiff, le };
  const ifd0 = readIfd(ctx, view.getUint32(tiff + 4, le));
  if (!ifd0) return fail('bad-ifd0');

  const sections = { ifd0: ifd0.tags, exif: new Map(), gps: new Map(), ifd1: new Map() };
  let broken = ifd0.broken;

  for (const [tag, name] of [
    [TAG.EXIF_IFD, 'exif'],
    [TAG.GPS_IFD, 'gps']
  ]) {
    const pointer = numberOf(ifd0.tags.get(tag));
    if (pointer === null) continue;
    const read = readIfd(ctx, pointer);
    // ポインタの先が壊れていても、IFD0まで読めた分は捨てない
    if (read) {
      sections[name] = read.tags;
      broken += read.broken;
    } else {
      broken += 1;
    }
  }

  if (ifd0.next) {
    const read = readIfd(ctx, ifd0.next);
    if (read) {
      sections.ifd1 = read.tags;
      broken += read.broken;
    }
  }

  return {
    ok: true,
    byteOrder: order,
    sections,
    thumbnail: readThumbnail(ctx, sections.ifd1),
    broken
  };
}

/**
 * Orientation だけを取り出す（1〜8以外と、読めないときは null）。
 * Exifをまるごと消したあとに向きだけ作り直すために、除去側（jpeg.js）から呼ばれる。
 */
export function readOrientation(payload) {
  const parsed = readExif(payload);
  if (!parsed.ok) return null;
  const value = numberOf(parsed.sections.ifd0.get(TAG.ORIENTATION));
  return Number.isInteger(value) && value >= 1 && value <= 8 ? value : null;
}
