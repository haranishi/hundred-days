import test from 'node:test';
import assert from 'node:assert/strict';
import { isOpaque, numberOf, readExif, readOrientation, textOf } from '../lib/exif.js';
import { dmsToDecimal } from '../lib/format.js';
import { asciiBytes, buildExifPayload, concat, toDms } from './fixtures/jpeg-builder.mjs';

/** 壊れたExifを作るための、生のバイト列組み立て（正しく作る道具では作れないものを作る）。 */
function rawPayload({ order = 'II', ifd0Offset = 8, count = null, entries = [], next = 0, tail = new Uint8Array(0) } = {}) {
  const littleEndian = order === 'II';
  const body = new Uint8Array(2 + entries.length * 12 + 4);
  const view = new DataView(body.buffer);
  view.setUint16(0, count ?? entries.length, littleEndian);
  entries.forEach((one, index) => {
    const at = 2 + index * 12;
    view.setUint16(at, one.tag, littleEndian);
    view.setUint16(at + 2, one.type, littleEndian);
    view.setUint32(at + 4, one.count, littleEndian);
    if (one.value instanceof Uint8Array) body.set(one.value, at + 8);
    else view.setUint32(at + 8, one.value, littleEndian);
  });
  view.setUint32(2 + entries.length * 12, next, littleEndian);

  const header = new Uint8Array(8);
  header.set(asciiBytes(order), 0);
  new DataView(header.buffer).setUint16(2, 42, littleEndian);
  new DataView(header.buffer).setUint32(4, ifd0Offset, littleEndian);
  return concat([asciiBytes('Exif'), new Uint8Array(2), header, body, tail]);
}

const tag = (result, section, number) => result.sections[section].get(number);

test('IIでもMMでも同じ値が読める（バイトの並び順が逆になるだけ）', () => {
  for (const order of ['II', 'MM']) {
    const parsed = readExif(
      buildExifPayload({
        byteOrder: order,
        ifd0: [{ tag: 0x0110, value: 'Sample Camera 100' }, { tag: 0x0112, type: 3, value: 6 }],
        exif: [{ tag: 0x829d, type: 5, value: { n: 28, d: 10 } }]
      })
    );
    assert.equal(parsed.ok, true, order);
    assert.equal(parsed.byteOrder, order);
    assert.equal(textOf(tag(parsed, 'ifd0', 0x0110)), 'Sample Camera 100');
    assert.equal(numberOf(tag(parsed, 'ifd0', 0x0112)), 6);
    assert.deepEqual(tag(parsed, 'exif', 0x829d).value, { n: 28, d: 10 });
  }
});

test('GPSの度分秒は、そのまま十進に直せる形で返る', () => {
  const parsed = readExif(
    buildExifPayload({
      gps: [
        { tag: 0x0001, value: 'N' },
        { tag: 0x0002, type: 5, value: toDms(35.681236) },
        { tag: 0x0003, value: 'E' },
        { tag: 0x0004, type: 5, value: toDms(139.767125) }
      ]
    })
  );
  assert.equal(parsed.ok, true);
  const latitude = dmsToDecimal(tag(parsed, 'gps', 0x0002).value, textOf(tag(parsed, 'gps', 0x0001)));
  const longitude = dmsToDecimal(tag(parsed, 'gps', 0x0004).value, textOf(tag(parsed, 'gps', 0x0003)));
  assert.equal(latitude.toFixed(6), '35.681236');
  assert.equal(longitude.toFixed(6), '139.767125');
});

test('南半球・西経は符号が反転する', () => {
  const parsed = readExif(
    buildExifPayload({
      gps: [
        { tag: 0x0001, value: 'S' },
        { tag: 0x0002, type: 5, value: toDms(33.868) },
        { tag: 0x0003, value: 'W' },
        { tag: 0x0004, type: 5, value: toDms(70.65) }
      ]
    })
  );
  assert.ok(dmsToDecimal(tag(parsed, 'gps', 0x0002).value, 'S') < 0);
  assert.ok(dmsToDecimal(tag(parsed, 'gps', 0x0004).value, 'W') < 0);
});

test('IFD1のサムネイルは、返ってきた位置でそのまま切り出せる', () => {
  const thumbnail = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x41, 0x42, 0x43, 0xff, 0xd9]);
  const payload = buildExifPayload({ ifd0: [{ tag: 0x010f, value: 'SAMPLE OPTICS' }], thumbnail });
  const parsed = readExif(payload);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.thumbnail.length, thumbnail.length);
  assert.deepEqual(
    Buffer.from(payload.subarray(parsed.thumbnail.start, parsed.thumbnail.start + parsed.thumbnail.length)),
    Buffer.from(thumbnail)
  );
});

test('サムネイルが無いときは null（0バイトの画像を作らない）', () => {
  const parsed = readExif(buildExifPayload({ ifd0: [{ tag: 0x010f, value: 'SAMPLE OPTICS' }] }));
  assert.equal(parsed.thumbnail, null);
});

test('サムネイルの位置がファイルの外を指しているときも null を返す（例外を投げない）', () => {
  const payload = rawPayload({
    entries: [
      { tag: 0x0103, type: 3, count: 1, value: new Uint8Array([6, 0, 0, 0]) },
      { tag: 0x0201, type: 4, count: 1, value: 0x7fff },
      { tag: 0x0202, type: 4, count: 1, value: 64 }
    ]
  });
  // IFD0として読ませると thumbnail は IFD1 からしか作らないので、ここでは IFD1 に置き換える
  const parsed = readExif(
    rawPayload({
      entries: [{ tag: 0x010f, type: 2, count: 2, value: new Uint8Array([0x41, 0x00, 0, 0]) }],
      next: 8 + 2 + 12 + 4,
      tail: payload.subarray(6 + 8)
    })
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.thumbnail, null);
});

test('IFD0の置き場所がファイルの外を指しているときは、失敗を返す（例外を投げない）', () => {
  const parsed = readExif(rawPayload({ ifd0Offset: 0x100000 }));
  assert.deepEqual(parsed, { ok: false, reason: 'bad-ifd0' });
});

test('エントリ数が異常なときは失敗を返す', () => {
  // 0件（TIFFの規格上あり得ない）
  assert.equal(readExif(rawPayload({ count: 0 })).reason, 'bad-ifd0');
  // 実際に入っている数より多い数を名乗っている
  assert.equal(readExif(rawPayload({ count: 5000, entries: [{ tag: 0x010f, type: 2, count: 2, value: 0 }] })).reason, 'bad-ifd0');
});

test('1つのタグだけ壊れているときは、そのタグだけ飛ばして残りを読む', () => {
  const parsed = readExif(
    rawPayload({
      entries: [
        // 20バイトのASCIIだと言いながら、置き場所がファイルの外
        { tag: 0x010e, type: 2, count: 20, value: 0x7000 },
        { tag: 0x0112, type: 3, count: 1, value: new Uint8Array([3, 0, 0, 0]) }
      ]
    })
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sections.ifd0.has(0x010e), false, '壊れたタグは持ち込まない');
  assert.equal(numberOf(tag(parsed, 'ifd0', 0x0112)), 3);
  assert.equal(parsed.broken, 1, '壊れていた件数は数えておく');
});

test('知らない型のタグは飛ばす（長さを推測しない）', () => {
  const parsed = readExif(
    rawPayload({
      entries: [
        { tag: 0x0111, type: 99, count: 4, value: 0 },
        { tag: 0x0112, type: 3, count: 1, value: new Uint8Array([1, 0, 0, 0]) }
      ]
    })
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sections.ifd0.has(0x0111), false);
  assert.equal(parsed.broken, 1);
});

test('ASCIIのタグはNULで終わる。終端より後ろは拾わず、前後の空白も落とす', () => {
  const payload = rawPayload({
    entries: [{ tag: 0x010f, type: 2, count: 12, value: 8 + 2 + 12 + 4 }],
    tail: asciiBytes('  ABC \0ゴミ')
  });
  const parsed = readExif(payload);
  assert.equal(textOf(tag(parsed, 'ifd0', 0x010f)), 'ABC');
});

test('MakerNoteは中身を読まず、長さだけを持つ', () => {
  const parsed = readExif(
    buildExifPayload({ exif: [{ tag: 0x927c, type: 7, value: new Uint8Array(300).fill(0x41) }] })
  );
  const entry = tag(parsed, 'exif', 0x927c);
  assert.equal(entry.count, 300);
  assert.equal(isOpaque(entry), true, 'メーカー独自形式は規格が公開されていないので読まない');
  assert.equal(textOf(entry), '');
});

test('Windowsが書き込むXPタグはUTF-16LEとして読む', () => {
  const utf16 = (value) => {
    const out = new Uint8Array(value.length * 2 + 2);
    [...value].forEach((letter, index) => {
      out[index * 2] = letter.charCodeAt(0) & 0xff;
      out[index * 2 + 1] = letter.charCodeAt(0) >> 8;
    });
    return out;
  };
  const parsed = readExif(buildExifPayload({ ifd0: [{ tag: 0x9c9d, type: 1, value: utf16('撮影者テスト') }] }));
  assert.equal(textOf(tag(parsed, 'ifd0', 0x9c9d)), '撮影者テスト');
});

test('UserCommentは先頭8バイトの文字コード指定に従う。読めない指定は読まない', () => {
  const comment = (code, body) => concat([asciiBytes(code.padEnd(8, '\0')), body]);

  const ascii = readExif(buildExifPayload({ exif: [{ tag: 0x9286, type: 7, value: comment('ASCII', asciiBytes('hello there')) }] }));
  assert.equal(textOf(tag(ascii, 'exif', 0x9286)), 'hello there');

  const unicode = readExif(
    buildExifPayload({
      exif: [{ tag: 0x9286, type: 7, value: comment('UNICODE', new Uint8Array([0x42, 0x30, 0x44, 0x30])) }]
    })
  );
  assert.equal(textOf(tag(unicode, 'exif', 0x9286)), 'あい');

  const jis = readExif(buildExifPayload({ exif: [{ tag: 0x9286, type: 7, value: comment('JIS', new Uint8Array(16).fill(0x21)) }] }));
  assert.equal(isOpaque(tag(jis, 'exif', 0x9286)), true, '読めない文字コードを推測で読むと嘘になる');
});

test('Exifでないもの・短すぎるものは失敗を返す', () => {
  assert.equal(readExif(null).reason, 'not-bytes');
  assert.equal(readExif(new Uint8Array(4)).reason, 'too-short');
  assert.equal(readExif(concat([asciiBytes('XMP\0\0\0'), new Uint8Array(20)])).reason, 'not-exif');
  assert.equal(readExif(concat([asciiBytes('Exif'), new Uint8Array(2), asciiBytes('XX'), new Uint8Array(20)])).reason, 'bad-byte-order');
  assert.equal(
    readExif(concat([asciiBytes('Exif'), new Uint8Array(2), asciiBytes('II'), new Uint8Array([0, 0, 8, 0, 0, 0]), new Uint8Array(20)])).reason,
    'bad-tiff-magic'
  );
});

test('readOrientation は1〜8だけを返す', () => {
  assert.equal(readOrientation(buildExifPayload({ ifd0: [{ tag: 0x0112, type: 3, value: 8 }] })), 8);
  assert.equal(readOrientation(buildExifPayload({ ifd0: [{ tag: 0x0112, type: 3, value: 99 }] })), null);
  assert.equal(readOrientation(buildExifPayload({ ifd0: [{ tag: 0x010f, value: 'SAMPLE OPTICS' }] })), null);
  assert.equal(readOrientation(new Uint8Array(4)), null);
});
