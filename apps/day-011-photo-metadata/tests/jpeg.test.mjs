import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrientationExif, isJpeg, readSegments, scanXmpRights, segmentBody, stripMetadata } from '../lib/jpeg.js';
import { readExif, readOrientation } from '../lib/exif.js';
import {
  FAKE_SCAN,
  app0Jfif,
  app1Exif,
  app1Xmp,
  app1XmpExtended,
  app13Iptc,
  app2Icc,
  app2Mpf,
  buildJpeg,
  comment,
  concat,
  segment
} from './fixtures/jpeg-builder.mjs';

const exifWith = (orientation) =>
  app1Exif({
    ifd0: orientation ? [{ tag: 0x010f, value: 'SAMPLE OPTICS' }, { tag: 0x0112, type: 3, value: orientation }] : [{ tag: 0x010f, value: 'SAMPLE OPTICS' }],
    exif: [{ tag: 0xa431, value: 'SN-0000000011' }]
  });

const kindsOf = (bytes) => readSegments(bytes).segments.map((one) => one.kind);

test('先頭3バイトだけでJPEGかどうかを決める（拡張子は見ない）', () => {
  assert.equal(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false, 'PNGの先頭');
  assert.equal(isJpeg(new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])), false, 'HEICの先頭');
  assert.equal(isJpeg(new Uint8Array([0xff, 0xd8])), false, '3バイト無い');
  assert.equal(isJpeg(null), false);
});

test('セグメントに分解し、SOSの位置を返す', () => {
  const file = buildJpeg([app0Jfif(), exifWith(1), app2Icc()]);
  const parsed = readSegments(file);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.segments.map((one) => one.kind), ['jfif', 'exif', 'icc']);
  assert.equal(parsed.scanStart, file.length - FAKE_SCAN.length);
  // 中身の切り出し位置が合っている
  assert.equal(String.fromCharCode(...segmentBody(file, parsed.segments[1]).subarray(0, 4)), 'Exif');
});

test('APP1は署名で見分ける（ExifとXMPは同じマーカー）', () => {
  const file = buildJpeg([app1Xmp(), exifWith(1), app1XmpExtended()]);
  // 「最初のAPP1を消す」実装だと、ここで XMP しか消えない
  assert.deepEqual(kindsOf(file), ['xmp', 'exif', 'xmp-extended']);
});

test('APP2もICCとMPFを取り違えない', () => {
  assert.deepEqual(kindsOf(buildJpeg([app2Icc(), app2Mpf()])), ['icc', 'mpf']);
});

test('消したあと、SOS以降のバイト列が元と完全に一致する（画素を変えていない証明）', () => {
  const file = buildJpeg([app0Jfif(), exifWith(1), app1Xmp(), app13Iptc(), app2Icc(), app2Mpf(), comment()]);
  const before = readSegments(file);
  const result = stripMetadata(file);

  assert.equal(result.ok, true);
  assert.deepEqual(
    Buffer.from(result.bytes.subarray(result.scanStart)),
    Buffer.from(file.subarray(before.scanStart)),
    'SOSからファイル末尾までが1バイトでも変わったら、それは再エンコードしたのと同じ'
  );
  assert.ok(result.bytes.length < file.length);
});

test('Exif・XMP・XMPの続き・IPTC・MPF・コメントは消える', () => {
  const file = buildJpeg([exifWith(1), app1Xmp(), app1XmpExtended(), app13Iptc(), app2Mpf(), comment()]);
  const result = stripMetadata(file);
  assert.deepEqual(result.removed.sort(), ['comment', 'exif', 'iptc', 'mpf', 'xmp', 'xmp-extended']);
  assert.deepEqual(kindsOf(result.bytes), []);
});

test('ICCプロファイルとJFIF・Adobeは残る（消すと色が変わる・復号に関わる）', () => {
  const adobe = segment(0xee, 'Adobe\0\x64\0\0\0\0');
  const file = buildJpeg([app0Jfif(), exifWith(1), app2Icc('icc-body-1234'), adobe]);
  const result = stripMetadata(file);

  assert.deepEqual(kindsOf(result.bytes), ['jfif', 'icc', 'adobe']);
  const icc = readSegments(result.bytes).segments.find((one) => one.kind === 'icc');
  assert.equal(String.fromCharCode(...segmentBody(result.bytes, icc)), 'ICC_PROFILE\0icc-body-1234');
});

test('同じ種類が複数あっても全部消す（64KBを超えると分割されるため）', () => {
  const file = buildJpeg([exifWith(1), app1Xmp('<a/>'), exifWith(1), app1Xmp('<b/>'), app13Iptc('1'), app13Iptc('2'), app2Icc()]);
  const result = stripMetadata(file);
  assert.equal(result.removed.length, 6, '最初の1つで打ち切っていない');
  assert.deepEqual(kindsOf(result.bytes), ['icc']);
});

test('向きが1以外のときだけ、向き1件の最小Exifを作って差し込む', () => {
  const file = buildJpeg([app0Jfif(), exifWith(6), app2Icc()]);
  const result = stripMetadata(file);

  assert.equal(result.orientation, 6);
  assert.equal(result.orientationKept, 6);
  assert.deepEqual(kindsOf(result.bytes), ['jfif', 'exif', 'icc'], 'JFIFの後ろに入る');

  const rebuilt = readSegments(result.bytes).segments.find((one) => one.kind === 'exif');
  assert.equal(rebuilt.end - rebuilt.start, 36, '中身は32バイト＋マーカーと長さで36バイト');
  assert.deepEqual(
    [...result.bytes.subarray(rebuilt.start, rebuilt.end)],
    [
      0xff, 0xe1, 0x00, 0x22,
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
      0x00, 0x01,
      0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ]
  );

  // 作ったものが自分で読めること（読めなければブラウザも読めない）
  const payload = segmentBody(result.bytes, rebuilt);
  assert.equal(readOrientation(payload), 6);
  const parsed = readExif(payload);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sections.ifd0.size, 1, '向き以外は1つも残さない');
  assert.equal(parsed.thumbnail, null);
});

test('向きが1のとき・向きが無いときは何も足さない', () => {
  for (const source of [exifWith(1), exifWith(0)]) {
    const result = stripMetadata(buildJpeg([source, app2Icc()]));
    assert.deepEqual(kindsOf(result.bytes), ['icc']);
    assert.equal(result.orientationKept, null);
  }
});

test('向きも消す指定なら、向きの情報も作り直さない', () => {
  const result = stripMetadata(buildJpeg([exifWith(8)]), { removeOrientation: true });
  assert.equal(result.orientation, 8, '元の値は伝える（画面に出すため）');
  assert.equal(result.orientationKept, null);
  assert.deepEqual(kindsOf(result.bytes), []);
});

test('buildOrientationExif は1〜8以外を受け付けない', () => {
  assert.equal(buildOrientationExif(0), null);
  assert.equal(buildOrientationExif(9), null);
  assert.equal(buildOrientationExif('6'), null);
  assert.equal(buildOrientationExif(3).length, 36);
});

test('壊れたファイルは例外を投げずに理由を返す', () => {
  assert.deepEqual(readSegments(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), { ok: false, reason: 'not-jpeg' });
  // 長さフィールドがファイルの外を指している
  assert.equal(readSegments(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x7f, 0xff, 0x41])).reason, 'truncated');
  // セグメントの区切りが 0xFF で始まっていない（途中に余計なバイトが挟まっている）
  assert.equal(
    readSegments(concat([new Uint8Array([0xff, 0xd8]), app2Icc(), new Uint8Array([0x41, 0x42, 0x43])])).reason,
    'broken'
  );
  // SOSが来ないまま終わる
  assert.equal(readSegments(buildJpeg([app2Icc()], new Uint8Array([0xff, 0xd9]))).reason, 'no-scan');
  assert.equal(stripMetadata(new Uint8Array([0x89, 0x50])).ok, false);
});

test('マーカーの前の詰め物（連続するFF）があっても読める', () => {
  const file = concat([new Uint8Array([0xff, 0xd8]), new Uint8Array([0xff, 0xff, 0xff]), app2Icc(), FAKE_SCAN]);
  const parsed = readSegments(file);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.segments.map((one) => one.kind), ['icc']);
});

test('知らないAPPセグメントは「知らない」と分類する（黙って消さない）', () => {
  const file = buildJpeg([segment(0xe5, 'unknown-app5'), app2Icc()]);
  assert.deepEqual(kindsOf(file), ['app-unknown', 'icc']);
  // 消す一覧に載っていないので残る（REQUIREMENTS.md の対象表どおり）
  assert.deepEqual(kindsOf(stripMetadata(file).bytes), ['app-unknown', 'icc']);
});

test('XMPの権利表示は、文字列の有無だけで拾う（値までは読まない）', () => {
  const file = buildJpeg([
    app1Xmp('<rdf:RDF><dc:rights>All rights reserved</dc:rights><dc:creator>SAMPLE</dc:creator></rdf:RDF>'),
    app1XmpExtended('<xmpRights:UsageTerms>Editorial use only</xmpRights:UsageTerms>'),
    app2Icc()
  ]);
  const found = scanXmpRights(file, readSegments(file).segments);

  assert.deepEqual(found.map((one) => one.name), ['xmpRights:UsageTerms', 'dc:rights', 'dc:creator']);
  // 利用条件そのものは、通常より強い警告にする
  assert.equal(found.find((one) => one.name === 'xmpRights:UsageTerms').strong, true);
  assert.equal(found.find((one) => one.name === 'dc:rights').strong, false);
});

test('XMPが無ければ何も拾わない。同じ名前を二重に数えない', () => {
  assert.deepEqual(scanXmpRights(buildJpeg([app2Icc()]), readSegments(buildJpeg([app2Icc()])).segments), []);

  const twice = buildJpeg([app1Xmp('<dc:creator>A</dc:creator>'), app1Xmp('<dc:creator>B</dc:creator>')]);
  assert.equal(scanXmpRights(twice, readSegments(twice).segments).length, 1);
});

test('ICCやコメントの中にそれらしい文字があっても、XMP以外は見に行かない', () => {
  const file = buildJpeg([comment('dc:rights'), app2Icc('dc:creator')]);
  assert.deepEqual(scanXmpRights(file, readSegments(file).segments), []);
});
