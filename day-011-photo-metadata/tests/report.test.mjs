import test from 'node:test';
import assert from 'node:assert/strict';
import { COPY } from '../lib/copy.js';
import { readExif } from '../lib/exif.js';
import { buildReport, verifyRemoval } from '../lib/report.js';
import { stripMetadata } from '../lib/jpeg.js';
import {
  app0Jfif,
  app13Iptc,
  app1Exif,
  app1Xmp,
  app1XmpExtended,
  app2Icc,
  app2Mpf,
  buildExifPayload,
  buildJpeg,
  comment,
  toDms
} from './fixtures/jpeg-builder.mjs';

const report = (options, kinds = ['exif']) => buildReport({ exif: readExif(buildExifPayload(options)), kinds });

const gps = [
  { tag: 0x0001, value: 'N' },
  { tag: 0x0002, type: 5, value: toDms(35.681236) },
  { tag: 0x0003, value: 'E' },
  { tag: 0x0004, type: 5, value: toDms(139.767125) }
];
const owner = [{ tag: 0xa430, value: 'SAMPLE OWNER' }, { tag: 0xa431, value: 'SN-0000000011' }];
const settings = [{ tag: 0x010f, value: 'SAMPLE OPTICS' }, { tag: 0x0110, value: 'Sample Camera 100' }];
const rights = [{ tag: 0x8298, value: '(C) 2026 SAMPLE PHOTOGRAPHER' }, { tag: 0x013b, value: 'SAMPLE PHOTOGRAPHER' }];

const ids = (built) => built.groups.map((group) => group.id);

test('並びは 場所 → 本人につながる → 権利表示 → 撮影設定', () => {
  const built = report({ ifd0: [...settings, ...rights], exif: owner, gps });
  assert.deepEqual(ids(built), ['place', 'person', 'rights', 'settings']);
  assert.equal(built.level, 'place');
  assert.equal(built.headline, '撮った場所が残っています');
});

test('権利表示は「本人につながるもの」から切り離す（消したい情報と残したい情報を同じ束にしない）', () => {
  const built = report({ ifd0: rights, exif: owner });
  const person = built.groups.find((group) => group.id === 'person');
  const rightsGroup = built.groups.find((group) => group.id === 'rights');

  assert.equal(person.items.some((one) => /著作権|Artist|撮影者/.test(one.label)), false);
  assert.deepEqual(rightsGroup.items.map((one) => one.label), ['著作権表示（Copyright）', '撮影者（Artist）']);
  assert.deepEqual(rightsGroup.items.map((one) => one.value), ['(C) 2026 SAMPLE PHOTOGRAPHER', 'SAMPLE PHOTOGRAPHER']);
  assert.match(rightsGroup.items[0].note, /控えておけます/, '消す前に値を控えられることを添える');
});

test('権利表示しか無ければ、それが見出しになる（「困る」ではなく「確認しろ」）', () => {
  const built = report({ ifd0: rights });
  assert.equal(built.level, 'rights');
  assert.equal(built.headline, '撮影者と著作権の表示が記録されています');
});

test('XMPで名前だけ見つかったものと、中身を読んでいないIPTCも権利表示に並べる', () => {
  const built = buildReport({
    exif: null,
    kinds: ['xmp', 'iptc'],
    xmpRights: [{ name: 'dc:rights', label: '著作権表示（dc:rights）', strong: false }]
  });
  const rightsGroup = built.groups.find((group) => group.id === 'rights');
  assert.deepEqual(rightsGroup.items.map((one) => one.label), ['XMPに書かれている名前', 'IPTCの区画']);
  assert.match(rightsGroup.items[0].note, /値は読んでいません/, '読んでいないことを隠さない');
  assert.match(rightsGroup.items[1].value, /中身は読んでいません/);
});

test('利用条件や権利者の連絡先が入っていたら、強い警告にする', () => {
  const weak = buildReport({ exif: null, kinds: ['xmp'], xmpRights: [{ name: 'dc:creator', label: '撮影者（dc:creator）', strong: false }] });
  assert.equal(weak.rights.has, true);
  assert.equal(weak.rights.strong, false);

  const strong = buildReport({
    exif: null,
    kinds: ['xmp'],
    xmpRights: [{ name: 'xmpRights:UsageTerms', label: '利用条件（xmpRights:UsageTerms）', strong: true }]
  });
  assert.equal(strong.rights.strong, true);
});

test('場所が無ければ、本人につながるものが先頭になる', () => {
  const built = report({ ifd0: settings, exif: owner });
  assert.deepEqual(ids(built), ['person', 'settings']);
  assert.equal(built.level, 'person');
});

test('撮影設定しか無ければ、それが先頭になる', () => {
  const built = report({ ifd0: settings });
  assert.deepEqual(ids(built), ['settings']);
  assert.equal(built.level, 'settings');
});

test('中身が空のグループは出さない（空の見出しを並べない）', () => {
  const built = report({ gps });
  assert.deepEqual(ids(built), ['place']);
});

test('危険度は色だけでなく、言葉のラベルでも示す', () => {
  const built = report({ ifd0: [...settings, ...rights], exif: owner, gps });
  assert.deepEqual(built.groups.map((group) => group.label), ['場所', '本人につながる', '権利表示', '撮影設定']);
});

test('緯度経度は十進6桁で、検索すれば場所が分かることを添える', () => {
  const built = report({ gps });
  const [first] = built.groups[0].items;
  assert.equal(first.label, '緯度・経度');
  assert.equal(first.value, '35.681236, 139.767125');
  assert.match(first.note, /検索すれば場所が分かります/);
  assert.equal(built.coordinate, '35.681236, 139.767125');
  // 「検索すれば分かる」と書く以上、検索窓へ持っていける形で値を渡す
  assert.equal(first.copy, '35.681236, 139.767125', '座標はコピーできる値として持たせる');
});

test('コピーできる値を持つのは座標だけ（ほかの行に押せない見た目のボタンを増やさない）', () => {
  const built = report({ ifd0: [...settings, ...rights], exif: owner, gps });
  const withCopy = built.groups.flatMap((group) => group.items).filter((one) => one.copy);
  assert.deepEqual(withCopy.map((one) => one.label), ['緯度・経度']);
});

test('シリアル番号には「他の写真と結びつけられる」を添える（ここが見せ場）', () => {
  const built = report({ exif: owner });
  const serial = built.groups[0].items.find((one) => one.label === 'カメラ本体のシリアル番号');
  assert.equal(serial.value, 'SN-0000000011');
  assert.match(serial.note, /同じカメラで撮った他の写真と結びつけられます/);
});

test('CopyrightかArtistがあれば「権利表示あり」と判定する', () => {
  const none = report({ ifd0: settings });
  assert.equal(none.rights.has, false);

  const both = report({ ifd0: [...settings, { tag: 0x8298, value: 'Copyright 2026 Sample' }, { tag: 0x013b, value: 'Sample Photographer' }] });
  assert.equal(both.rights.has, true);
  assert.equal(both.rights.warn, true);
  assert.deepEqual(both.rights.holders, ['著作権表示：Copyright 2026 Sample', '撮影者：Sample Photographer']);

  const artistOnly = report({ ifd0: [{ tag: 0x013b, value: 'Sample Photographer' }] });
  assert.equal(artistOnly.rights.has, true);
});

test('名前を書いていないタグは中身を出さず、件数だけ数える', () => {
  const built = report({
    ifd0: [...settings, { tag: 0x011a, type: 5, value: { n: 72, d: 1 } }, { tag: 0x011b, type: 5, value: { n: 72, d: 1 } }, { tag: 0x0128, type: 3, value: 2 }]
  });
  assert.equal(built.others, 3);
  const values = built.groups.flatMap((group) => group.items.map((one) => one.value));
  assert.ok(!values.some((value) => String(value).includes('72')), '中身は画面に出さない');
});

test('ポインタやサムネイルの位置など、構造のためのタグは件数に数えない', () => {
  const built = report({
    ifd0: settings,
    exif: [{ tag: 0x9003, value: '2026:08:18 09:11:00' }],
    gps,
    thumbnail: new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
  });
  // ExifIFD/GPSへのポインタ2件・サムネイルの圧縮方式/位置/長さ3件は数えない
  assert.equal(built.others, 0);
});

test('サムネイルとメーカー独自の記録は「本人につながる」に入れ、行には説明を重ねない', () => {
  const built = report({
    exif: [{ tag: 0x927c, type: 7, value: new Uint8Array(120).fill(0x41) }],
    thumbnail: new Uint8Array(64).fill(0x20)
  });
  const labels = built.groups[0].items.map((one) => one.label);
  assert.deepEqual(labels, ['メーカー独自の記録', '埋め込みサムネイル']);

  /* 断定しない言い方（COPY.thumbnailNote）は、本体の写真と並べたカードの側で1回だけ出す。
     この行にも同じ文を付けると、同じ画面に同じ文が2回出る。 */
  const thumbnail = built.groups[0].items[1];
  assert.equal(thumbnail.note, '', '同じ説明をカードとこの行の両方で言わない');
  assert.match(COPY.thumbnailNote, /残っていることがあります/, '「必ず残っている」と断定しない');
  assert.equal(built.thumbnail.length, 64);
});

test('読めない文字コードのタグを「無い」ことにしない', () => {
  const built = report({ exif: [{ tag: 0x9286, type: 7, value: new Uint8Array(40).fill(0x21) }] });
  const item = built.groups[0].items[0];
  assert.equal(item.label, '書き込まれたコメント');
  assert.match(item.value, /読めない形式の文字列/);
});

test('どの区画に入っていたかを、区画の名前で出す', () => {
  const built = report({ ifd0: settings }, ['jfif', 'exif', 'xmp', 'iptc', 'icc', 'exif']);
  assert.deepEqual(built.containers.map((one) => one.kind), ['jfif', 'exif', 'xmp', 'iptc', 'icc'], '同じ区画は1回だけ');
  assert.deepEqual(built.containers.map((one) => one.label), ['JFIF', 'Exif', 'XMP', 'IPTC / Photoshop', 'ICCプロファイル']);
});

test('Exifが無くてもXMPやIPTCがあれば「何か入っている」と扱う', () => {
  const built = buildReport({ exif: { ok: false, reason: 'not-exif' }, kinds: ['xmp', 'iptc'] });
  assert.equal(built.hasAny, true);
  // IPTCは中身を読んでいないが、区画があること自体は権利表示のところで伝える
  assert.deepEqual(ids(built), ['rights']);
  assert.equal(built.rights.iptc, true);
  assert.equal(built.rights.warn, true);
});

test('本当に何も無いときは、見つからなかったと言い切る', () => {
  const built = buildReport({ exif: null, kinds: ['jfif'] });
  assert.equal(built.level, 'none');
  assert.equal(built.hasAny, false);
  assert.match(built.headline, /見つかりませんでした/);
  assert.equal(built.others, 0);
});

test('Exifの区画はあるのに読めなかったことを、情報が無いことと区別する', () => {
  const built = buildReport({ exif: { ok: false, reason: 'bad-ifd0' }, kinds: ['exif'] });
  assert.equal(built.unreadable, true);
  assert.equal(buildReport({ exif: null, kinds: ['jfif'] }).unreadable, false);
});

/* ---------------------------------------------------------------- 書き出したあとの検算 */

const value = (checked, key) => checked.items.find((one) => one.key === key).value;
const loaded = (orientation) =>
  buildJpeg([
    app0Jfif(),
    app1Exif({
      ifd0: orientation
        ? [{ tag: 0x010f, value: 'SAMPLE OPTICS' }, { tag: 0x0112, type: 3, value: orientation }]
        : [{ tag: 0x010f, value: 'SAMPLE OPTICS' }],
      gps
    }),
    app1Xmp(),
    app1XmpExtended(),
    app13Iptc(),
    app2Mpf(),
    app2Icc(),
    comment()
  ]);

test('書き出したバイト列を読み直すと、除去対象5種が0件でICCが1件残っている', () => {
  const original = loaded(0);
  const checked = verifyRemoval(stripMetadata(original).bytes, original);

  assert.equal(checked.ok, true);
  assert.deepEqual(checked.counts, { exif: 0, xmp: 0, iptc: 0, mpf: 0, comment: 0, icc: 1, orientation: 0 });
  assert.equal(checked.items.every((one) => one.ok), true);
  for (const key of ['exif', 'xmp', 'iptc', 'mpf', 'comment']) assert.equal(value(checked, key), 'なし', key);
  assert.equal(value(checked, 'icc'), '残しています（色が変わらないように）');
  assert.equal(checked.items.find((one) => one.key === 'icc').kept, true, '消し忘れではなく決めて残したもの');
});

test('画素のデータが元と1バイトも変わっていないことも、その場で確かめる', () => {
  const original = loaded(0);
  const checked = verifyRemoval(stripMetadata(original).bytes, original);
  assert.equal(checked.pixels, true);
  assert.match(value(checked, 'pixels'), /元のまま/);
});

test('向きを残したときは、作り直したExifと元のExifを取り違えない', () => {
  const original = loaded(6);
  const checked = verifyRemoval(stripMetadata(original).bytes, original);

  assert.equal(checked.counts.exif, 0, '元のExifは残っていない');
  assert.equal(checked.counts.orientation, 1);
  assert.equal(value(checked, 'exif'), '向きの情報だけの32バイトに作り直しました');
  assert.equal(value(checked, 'orientation'), '残しています（縦写真が横倒しにならないように）');
  assert.equal(checked.items.every((one) => one.ok), true);
});

test('向きも消したときは「消しました」、元から無ければ「もともとありません」', () => {
  const rotated = loaded(6);
  assert.equal(value(verifyRemoval(stripMetadata(rotated, { removeOrientation: true }).bytes, rotated), 'orientation'), '消しました');

  const straight = loaded(0);
  assert.equal(value(verifyRemoval(stripMetadata(straight).bytes, straight), 'orientation'), 'もともとありません');
});

test('もともとICCが無いファイルで「残しています」と言わない', () => {
  const original = buildJpeg([app0Jfif(), app1Exif({ ifd0: [{ tag: 0x010f, value: 'SAMPLE OPTICS' }] })]);
  const checked = verifyRemoval(stripMetadata(original).bytes, original);
  assert.equal(value(checked, 'icc'), 'もともとありません');
  assert.equal(checked.items.find((one) => one.key === 'icc').kept, false);
});

test('消し残しがあれば、そう出す（検算が常に合格を返す作りにしない）', () => {
  // 除去を通していないバイト列をそのまま検算にかける
  const checked = verifyRemoval(loaded(0));
  assert.equal(value(checked, 'exif'), 'まだ1件残っています');
  assert.equal(value(checked, 'xmp'), 'まだ2件残っています', 'XMPと続きの2件');
  assert.equal(checked.items.find((one) => one.key === 'exif').ok, false);
  assert.equal(checked.pixels, null, '元のファイルを渡さなければ画素の比較はしない');
});

test('検算にかけたものがJPEGとして読めなければ、合格とは言わない', () => {
  const checked = verifyRemoval(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  assert.equal(checked.ok, false);
  assert.deepEqual(checked.items, []);
});
