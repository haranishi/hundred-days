/* JPEGのセグメント構造を直接いじるところ。

   ■ 画像を描き直さない
   canvas に描いて書き出すと、画素は必ず再圧縮され、元の量子化テーブルもICCプロファイルも失われる
   （HTML仕様上、canvas の書き出しに入るのは画素とcanvasの色空間だけ）。だからここでは
   「区切り（セグメント）を並べ替えて、要らない区画を落とし、圧縮済みの画素はそのまま写す」だけをする。

   ■ SOS以降はまるごと写す
   JPEGのセグメントは FF <marker> <長さ2バイト> <中身> の形だが、SOS（FF DA）から後ろの
   圧縮データには長さフィールドが無い。だから SOS の位置から**ファイル末尾まで**を1バイトも触らずに写す。
   これが「無劣化」の実体で、ユニットテストで固定してある。

   ■ APP1は2種類ある
   Exif も XMP も同じ APP1（FF E1）。マーカー番号で判別すると必ずXMPを取り逃すので、
   中身の先頭にある署名文字列で見分ける。同じ種類が複数入ることもある（64KBを超えると分割される）ので、
   一致したものは全部落とす。最初の1つで打ち切らない。 */

import { TAG, readExif, readOrientation } from './exif.js';

export const MARKER = { SOI: 0xd8, EOI: 0xd9, SOS: 0xda, COM: 0xfe };

/* 署名で見分ける区画。marker が同じでも中身の先頭が違えば別物として扱う。
   長い署名から先に照合する（'MPF\0' より 'ICC_PROFILE\0' が先、のような取り違えを防ぐ）。 */
const SIGNATURES = [
  { marker: 0xe1, signature: 'Exif\0\0', kind: 'exif' },
  { marker: 0xe1, signature: 'http://ns.adobe.com/xap/1.0/\0', kind: 'xmp' },
  { marker: 0xe1, signature: 'http://ns.adobe.com/xmp/extension/\0', kind: 'xmp-extended' },
  { marker: 0xe2, signature: 'ICC_PROFILE\0', kind: 'icc' },
  { marker: 0xe2, signature: 'MPF\0', kind: 'mpf' },
  { marker: 0xed, signature: 'Photoshop 3.0\0', kind: 'iptc' },
  { marker: 0xe0, signature: 'JFIF\0', kind: 'jfif' },
  { marker: 0xe0, signature: 'JFXX\0', kind: 'jfif-extension' },
  { marker: 0xee, signature: 'Adobe', kind: 'adobe' }
];

/** 落とす区画。ICC（色）とJFIF・Adobe（復号に関わる）は落とさない。 */
export const REMOVED_KINDS = new Set(['exif', 'xmp', 'xmp-extended', 'iptc', 'mpf', 'comment']);

/** 個人につながる情報が入りうる区画（画面で「どこに入っていたか」を出すのに使う）。 */
export const METADATA_KINDS = ['exif', 'xmp', 'xmp-extended', 'iptc', 'mpf', 'comment'];

/* XMPはRDF/XML＝ただのテキストなので、権利表示が入っているかどうかは
   文字列の有無だけなら安く判定できる。値のパースまではしない（v1の範囲外）。
   strong の3つは「利用条件そのもの」と「権利者の連絡先」で、ストックフォトや
   仕事で受け取った写真である見込みが高いことを示す。 */
export const XMP_RIGHTS_MARKERS = [
  { name: 'xmpRights:UsageTerms', label: '利用条件（xmpRights:UsageTerms）', strong: true },
  { name: 'xmpRights:WebStatement', label: '権利表明のURL（xmpRights:WebStatement）', strong: true },
  { name: 'plus:Licensor', label: '許諾者の連絡先（plus:Licensor）', strong: true },
  { name: 'dc:rights', label: '著作権表示（dc:rights）', strong: false },
  { name: 'dc:creator', label: '撮影者（dc:creator）', strong: false }
];

const fail = (reason) => ({ ok: false, reason });

function latin1(bytes, at, length) {
  let out = '';
  const end = Math.min(at + length, bytes.length);
  for (let i = at; i < end; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

/** 先頭3バイトだけで判定する。拡張子は見ない（.jpg に改名されたHEICを取り違えないため）。 */
export function isJpeg(bytes) {
  return Boolean(bytes && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff);
}

function classify(bytes, marker, dataStart, dataEnd) {
  if (marker === MARKER.COM) return 'comment';
  const available = dataEnd - dataStart;
  for (const { marker: want, signature, kind } of SIGNATURES) {
    if (want !== marker) continue;
    if (available < signature.length) continue;
    if (latin1(bytes, dataStart, signature.length) === signature) return kind;
  }
  if (marker >= 0xe0 && marker <= 0xef) return 'app-unknown';
  return 'structure';
}

/**
 * ファイルをセグメントに分解する。
 * 成功: { ok:true, segments:[{marker, kind, start, end, dataStart, dataEnd}], scanStart }
 * 失敗: { ok:false, reason:'not-jpeg'|'broken'|'truncated'|'no-scan' }
 * start は直前の詰め物（連続する FF）も含めた位置。落とすときは詰め物ごと落とす。
 */
export function readSegments(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input ?? 0);
  if (!isJpeg(bytes)) return fail('not-jpeg');

  const segments = [];
  let at = 2;
  let scanStart = -1;

  while (at < bytes.length) {
    if (bytes[at] !== 0xff) return fail('broken');
    let markerAt = at + 1;
    while (markerAt < bytes.length && bytes[markerAt] === 0xff) markerAt += 1;
    if (markerAt >= bytes.length) return fail('truncated');

    const marker = bytes[markerAt];
    if (marker === 0x00) return fail('broken');
    // 長さを持たないマーカー（もう一度SOI・リスタート・TEM）は読み飛ばす
    if (marker === MARKER.SOI || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at = markerAt + 1;
      continue;
    }
    if (marker === MARKER.SOS) {
      scanStart = at;
      break;
    }
    if (marker === MARKER.EOI) return fail('no-scan');

    const lengthAt = markerAt + 1;
    if (lengthAt + 2 > bytes.length) return fail('truncated');
    const length = (bytes[lengthAt] << 8) | bytes[lengthAt + 1];
    if (length < 2) return fail('broken');
    const end = lengthAt + length;
    if (end > bytes.length) return fail('truncated');

    const dataStart = lengthAt + 2;
    segments.push({ marker, kind: classify(bytes, marker, dataStart, end), start: at, end, dataStart, dataEnd: end });
    at = end;
  }

  if (scanStart === -1) return fail('no-scan');
  return { ok: true, segments, scanStart };
}

/**
 * XMPの区画に権利表示の名前が出てくるかを、文字列一致だけで調べる。
 * 中身は読まない（v1では値のパースをしない）ので、返すのは「その名前があった」ことだけ。
 */
export function scanXmpRights(bytes, segments) {
  const found = new Set();
  for (const segment of segments) {
    if (segment.kind !== 'xmp' && segment.kind !== 'xmp-extended') continue;
    const body = latin1(bytes, segment.dataStart, segment.dataEnd - segment.dataStart);
    for (const marker of XMP_RIGHTS_MARKERS) if (body.includes(marker.name)) found.add(marker.name);
  }
  // 並びはファイルの中の順ではなく、上の宣言順（強い警告になるものが先）で返す
  return XMP_RIGHTS_MARKERS.filter((marker) => found.has(marker.name));
}

/** セグメントの中身（長さフィールドの後ろ）だけを切り出す。 */
export const segmentBody = (bytes, segment) => bytes.subarray(segment.dataStart, segment.dataEnd);

/**
 * Orientation 1件だけを持つ最小のExif（APP1セグメントまるごと）を組み立てる。
 * Exifを全部消すと、CSS image-orientation の初期値 from-image により
 * 縦向きで撮った写真がブラウザで横倒しに表示される。だから向きだけ作り直して残す。
 * 中身は 'Exif\0\0' + TIFFヘッダ + IFD0(1件) + 次IFD無し の32バイト。
 */
export function buildOrientationExif(orientation) {
  const value = orientation;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 8) return null;

  const payload = new Uint8Array(32);
  const view = new DataView(payload.buffer);
  // 'Exif\0\0'
  payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
  // TIFFヘッダ（ビッグエンディアン・IFD0は8バイト目から）
  payload.set([0x4d, 0x4d, 0x00, 0x2a], 6);
  view.setUint32(10, 8);
  // IFD0：エントリ1件
  view.setUint16(14, 1);
  view.setUint16(16, 0x0112); // Orientation
  view.setUint16(18, 3); // SHORT
  view.setUint32(20, 1); // 1件
  view.setUint16(24, value); // SHORT は値の置き場所の先頭2バイトに入る
  view.setUint16(26, 0);
  view.setUint32(28, 0); // 次のIFDは無い

  const segment = new Uint8Array(payload.length + 4);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment[2] = (payload.length + 2) >> 8;
  segment[3] = (payload.length + 2) & 0xff;
  segment.set(payload, 4);
  return segment;
}

/**
 * 「このアプリが向きのために作り直したExif」かどうか。
 * 除去したあとの検算で、残っているExifが元の中身なのか、こちらが足した32バイトなのかを見分ける。
 */
export function isOrientationOnlyExif(payload) {
  const parsed = readExif(payload);
  if (!parsed.ok) return false;
  const { ifd0, exif, gps, ifd1 } = parsed.sections;
  return (
    ifd0.size === 1 && ifd0.has(TAG.ORIENTATION) && exif.size === 0 && gps.size === 0 && ifd1.size === 0 && !parsed.thumbnail
  );
}

function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * メタデータの区画だけを落とした JPEG を作る。画素（SOS以降）は1バイトも変えない。
 * options.removeOrientation を true にすると、向きの情報も作り直さない。
 * 成功: { ok:true, bytes, removed:[kind], orientation, orientationKept, scanStart }
 */
export function stripMetadata(input, options = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input ?? 0);
  const parsed = readSegments(bytes);
  if (!parsed.ok) return parsed;

  const removed = [];
  const kept = [];
  let orientation = null;

  for (const segment of parsed.segments) {
    if (segment.kind === 'exif' && orientation === null) {
      orientation = readOrientation(segmentBody(bytes, segment));
    }
    // 一致したものは全部落とす。最初の1つで打ち切らない（64KB超のExifやXMPは複数に分かれる）
    if (REMOVED_KINDS.has(segment.kind)) removed.push(segment.kind);
    else kept.push(segment);
  }

  const rebuilt = options.removeOrientation || orientation === null || orientation === 1
    ? null
    : buildOrientationExif(orientation);

  const chunks = [bytes.subarray(0, 2)];
  let placed = false;
  for (const segment of kept) {
    // JFIF(APP0)は先頭に置く決まりなので、作り直したExifはその後ろへ入れる
    if (rebuilt && !placed && segment.marker !== 0xe0) {
      chunks.push(rebuilt);
      placed = true;
    }
    chunks.push(bytes.subarray(segment.start, segment.end));
  }
  if (rebuilt && !placed) chunks.push(rebuilt);

  const scanStart = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(bytes.subarray(parsed.scanStart));

  return {
    ok: true,
    bytes: concat(chunks),
    removed,
    orientation,
    orientationKept: rebuilt ? orientation : null,
    scanStart
  };
}
