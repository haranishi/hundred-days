/* 読み取った生のタグを、画面に出す形に組み替えるところ。

   並べる順番は「見つかったときに困る順」で、UIの都合ではない。
     1. 場所（座標が分かれば生活圏が分かる）
     2. あなたにつながるもの（所有者名・シリアル番号・編集前のサムネイル）
     3. 撮影の設定（機種名や日時。困り方が一段小さい）
   危険度は色だけでなく、必ず言葉のラベル（group.label）でも示す。

   ここに名前を書いていないタグは、中身を出さずに件数だけ数える（見せる必要が無いうえ、
   知らないタグの中身をそのまま画面に出すと、それ自体が新しい漏れ口になるため）。 */

import { COPY } from './copy.js';
import { isOpaque, numberOf, readOrientation, textOf } from './exif.js';
import { isOrientationOnlyExif, readSegments, scanXmpRights, segmentBody } from './jpeg.js';
import {
  dmsToDecimal,
  formatAltitude,
  formatBytes,
  formatDirection,
  formatExifDate,
  formatExifDateTime,
  formatExposureTime,
  formatFNumber,
  formatFocalLength,
  formatGpsTime,
  formatIso,
  formatLatLon,
  formatOrientation
} from './format.js';

/** 区画の名前。画面に「どこに入っていたか」を出すのに使う。 */
export const CONTAINER_LABELS = {
  exif: 'Exif',
  xmp: 'XMP',
  'xmp-extended': 'XMP（続き）',
  iptc: 'IPTC / Photoshop',
  mpf: 'MPF（別画像の抱き合わせ）',
  comment: 'コメント',
  icc: 'ICCプロファイル',
  jfif: 'JFIF',
  'jfif-extension': 'JFIF拡張',
  adobe: 'Adobe'
};

/* 権利表示（Copyright / Artist）は「本人につながるもの」から切り離して独立させている。
   同じ束に入れると「全部消すのが正解」に見えるが、GPSやシリアル番号が「消したい情報」なのに対し、
   著作権表示は「残したい情報」で、利用者にとっての利益の向きが逆だから。 */
export const GROUP_LABELS = {
  place: '場所',
  person: '本人につながる',
  rights: '権利表示',
  settings: '撮影設定'
};

const HEADLINES = {
  place: '撮った場所が残っています',
  person: 'あなたにつながる情報が残っています',
  rights: '撮影者と著作権の表示が記録されています',
  settings: 'カメラの機種と撮った日時が残っています'
};

/* 構造のためのタグ。中身が無いので「ほかに◯件」にも数えない
   （数えると、利用者には意味の分からない件数だけが増える）。 */
const STRUCTURAL = new Set([
  'ifd0:0x8769', // ExifIFDへのポインタ
  'ifd0:0x8825', // GPS IFDへのポインタ
  'exif:0xa005', // 相互運用IFDへのポインタ
  'gps:0x0000', // GPSVersionID
  'ifd1:0x0103', // サムネイルの圧縮方式
  'ifd1:0x0201', // サムネイルの位置
  'ifd1:0x0202' // サムネイルの長さ
]);

const key = (section, tag) => `${section}:0x${tag.toString(16).padStart(4, '0')}`;

const get = (exif, section, tag) => exif?.sections?.[section]?.get(tag) ?? null;
const text = (exif, section, tag) => textOf(get(exif, section, tag));
const number = (exif, section, tag) => numberOf(get(exif, section, tag));
const raw = (exif, section, tag) => get(exif, section, tag)?.value ?? null;

/** 表示に使ったタグを覚えておく（残りが「ほかに◯件」になる）。 */
class Used {
  constructor() {
    this.set = new Set();
  }

  mark(section, ...tags) {
    for (const tag of tags) this.set.add(key(section, tag));
  }

  has(section, tag) {
    return this.set.has(key(section, tag));
  }
}

/* copy を渡すと、画面にその値をコピーするボタンが付く（消したら戻らない値を控えられるようにする）。 */
const item = (label, value, note = '', copy = '') => ({ label, value, note, copy });

function placeItems(exif, used) {
  const items = [];
  const latitude = dmsToDecimal(raw(exif, 'gps', 0x0002), text(exif, 'gps', 0x0001));
  const longitude = dmsToDecimal(raw(exif, 'gps', 0x0004), text(exif, 'gps', 0x0003));
  used.mark('gps', 0x0001, 0x0002, 0x0003, 0x0004);

  const coordinate = formatLatLon(latitude, longitude);
  // 「検索すれば場所が分かる」と書く以上、検索窓へ持っていく手段まで用意する
  if (coordinate) items.push(item('緯度・経度', coordinate, COPY.placeNote, coordinate));

  const altitude = formatAltitude(raw(exif, 'gps', 0x0006), raw(exif, 'gps', 0x0005));
  used.mark('gps', 0x0005, 0x0006);
  if (altitude) items.push(item('高さ', altitude));

  const date = formatExifDate(text(exif, 'gps', 0x001d));
  const time = formatGpsTime(raw(exif, 'gps', 0x0007));
  used.mark('gps', 0x0007, 0x001d);
  if (date || time) {
    items.push(item('位置を測った日時', [date, time && `${time}（世界標準時）`].filter(Boolean).join(' ')));
  }

  const direction = formatDirection(raw(exif, 'gps', 0x0011), text(exif, 'gps', 0x0010));
  used.mark('gps', 0x0010, 0x0011);
  if (direction) items.push(item('カメラの向き', direction));

  return { items, coordinate: coordinate || '', latitude, longitude };
}

const PERSON_TEXT_TAGS = [
  ['exif', 0xa430, '所有者の名前', ''],
  ['exif', 0xa431, 'カメラ本体のシリアル番号', COPY.serialNote],
  ['exif', 0xa435, 'レンズのシリアル番号', COPY.serialNote],
  ['exif', 0x9286, '書き込まれたコメント', ''],
  ['ifd0', 0x010e, '画像の説明', ''],
  ['ifd0', 0x9c9b, 'タイトル（Windows）', ''],
  ['ifd0', 0x9c9c, 'コメント（Windows）', ''],
  ['ifd0', 0x9c9d, '作成者（Windows）', ''],
  ['ifd0', 0x9c9e, 'キーワード（Windows）', '']
];

function personItems(exif, used, thumbnail) {
  const items = [];

  for (const [section, tag, label, note] of PERSON_TEXT_TAGS) {
    used.mark(section, tag);
    const entry = get(exif, section, tag);
    if (!entry) continue;
    if (isOpaque(entry)) {
      // 読めない文字コードで書かれていても「無い」ことにはしない
      items.push(item(label, `読めない形式の文字列（${formatBytes(entry.value.length)}）`, ''));
      continue;
    }
    const value = textOf(entry);
    if (value) items.push(item(label, value, note));
  }

  const maker = get(exif, 'exif', 0x927c);
  used.mark('exif', 0x927c);
  if (maker) items.push(item('メーカー独自の記録', `あり（${formatBytes(maker.count)}）`, COPY.makerNote));

  /* 断定しない言い方（COPY.thumbnailNote）は、本体の写真と並べて出しているカードの側で1回だけ言う。
     同じ文をこの行にも付けると、同じ画面に同じ文が2回出る。 */
  if (thumbnail) {
    items.push(item('埋め込みサムネイル', `あり（${formatBytes(thumbnail.length)}）`));
  }

  return items;
}

/* 権利表示のグループ。危険度の高低ではなく「性質が違うもの」として出す。
   Exifの2タグに加えて、XMPで名前だけ見つかったものと、中身を読んでいないIPTCの存在も並べる。 */
function rightsItems(exif, used, { xmp, iptc }) {
  const items = [];
  for (const [tag, label] of [
    [0x8298, '著作権表示（Copyright）'],
    [0x013b, '撮影者（Artist）']
  ]) {
    used.mark('ifd0', tag);
    const value = textOf(get(exif, 'ifd0', tag));
    if (value) items.push(item(label, value, COPY.rightsKeepHint));
  }

  if (xmp.length) {
    items.push(item('XMPに書かれている名前', xmp.map((one) => one.label).join('・'), '名前があることだけを見ています。値は読んでいません。'));
  }
  if (iptc) items.push(item('IPTCの区画', 'あり（中身は読んでいません）', COPY.rightsInOtherPlaces));
  return items;
}

function settingItems(exif, used) {
  const items = [];
  const add = (section, tag, label, value, note = '') => {
    used.mark(section, tag);
    if (value) items.push(item(label, value, note));
  };

  add('ifd0', 0x010f, 'メーカー', text(exif, 'ifd0', 0x010f));
  add('ifd0', 0x0110, '機種', text(exif, 'ifd0', 0x0110));
  add('exif', 0xa434, 'レンズ', text(exif, 'exif', 0xa434));
  add('ifd0', 0x0131, '使ったソフト', text(exif, 'ifd0', 0x0131));
  add('exif', 0x9003, '撮った日時', formatExifDateTime(text(exif, 'exif', 0x9003)));
  add('ifd0', 0x0112, '向き', formatOrientation(raw(exif, 'ifd0', 0x0112)));
  add('exif', 0x829a, 'シャッター速度', formatExposureTime(raw(exif, 'exif', 0x829a)));
  add('exif', 0x829d, '絞り', formatFNumber(raw(exif, 'exif', 0x829d)));

  used.mark('exif', 0x8827, 0x8833);
  const iso = formatIso(raw(exif, 'exif', 0x8827)) || formatIso(raw(exif, 'exif', 0x8833));
  if (iso) items.push(item('感度', iso));

  add('exif', 0x920a, '焦点距離', formatFocalLength(raw(exif, 'exif', 0x920a)));
  return items;
}

/** 表示に使わなかったタグの件数。中身は出さない。 */
function countOthers(exif, used) {
  let others = 0;
  for (const [section, tags] of Object.entries(exif?.sections ?? {})) {
    for (const tag of tags.keys()) {
      if (used.has(section, tag)) continue;
      if (STRUCTURAL.has(key(section, tag))) continue;
      others += 1;
    }
  }
  return others;
}

/**
 * 表示モデルを作る。
 * @param exif   readExif の戻り（{ok:false} や null も受け付ける）
 * @param kinds  ファイルに入っていた区画の種類（jpeg.js の readSegments から）
 */
export function buildReport({ exif = null, kinds = [], xmpRights = [] } = {}) {
  const ok = Boolean(exif && exif.ok);
  const used = new Used();
  const thumbnail = ok ? exif.thumbnail : null;
  const hasIptc = kinds.includes('iptc');

  const place = ok ? placeItems(exif, used) : { items: [], coordinate: '' };
  const person = ok ? personItems(exif, used, thumbnail) : [];
  const rightsGroup = rightsItems(ok ? exif : null, used, { xmp: xmpRights, iptc: hasIptc });
  const settings = ok ? settingItems(exif, used) : [];

  // 並びは「困る順」だが、権利表示だけは困り方ではなく性質が違うものとして間に置く
  const groups = [
    { id: 'place', label: GROUP_LABELS.place, items: place.items },
    { id: 'person', label: GROUP_LABELS.person, items: person },
    { id: 'rights', label: GROUP_LABELS.rights, items: rightsGroup },
    { id: 'settings', label: GROUP_LABELS.settings, items: settings }
  ].filter((group) => group.items.length > 0);

  const rights = {
    holders: [
      ['著作権表示', ok ? text(exif, 'ifd0', 0x8298) : ''],
      ['撮影者', ok ? text(exif, 'ifd0', 0x013b) : '']
    ]
      .filter(([, value]) => Boolean(value))
      .map(([label, value]) => `${label}：${value}`),
    xmp: xmpRights,
    iptc: hasIptc
  };
  // 利用条件そのものや権利者の連絡先が入っているときは、通常より強い警告にする
  rights.strong = xmpRights.some((one) => one.strong);
  rights.has = rights.holders.length > 0 || xmpRights.length > 0;
  rights.warn = rights.has || hasIptc;

  const containers = kinds
    .filter((kind, index) => kinds.indexOf(kind) === index)
    .filter((kind) => CONTAINER_LABELS[kind])
    .map((kind) => ({ kind, label: CONTAINER_LABELS[kind] }));

  const level = groups.length ? groups[0].id : 'none';

  return {
    level,
    headline: HEADLINES[level] ?? COPY.emptyResultTitle,
    groups,
    coordinate: place.coordinate,
    thumbnail,
    rights,
    containers,
    others: ok ? countOthers(exif, used) : 0,
    orientation: ok ? number(exif, 'ifd0', 0x0112) : null,
    // Exifの区画はあるのに読めなかった、という状態を「何も無い」と混ぜない
    unreadable: Boolean(exif && exif.ok === false && kinds.includes('exif')),
    hasAny: groups.length > 0 || containers.some((container) => ['xmp', 'xmp-extended', 'iptc', 'mpf', 'comment'].includes(container.kind))
  };
}

/* ---------------------------------------------------------------- 書き出したあとの検算

   保存したバイト列を、このアプリ自身でもう一度読み直す。
   免責の文章より、利用者がその場で確かめられることのほうが効く。
   「残しています」は消し忘れではなく決めて残しているものなので、そう読めるように書く。 */

const sameBytes = (a, b) => {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
};

const check = (key, label, value, { kept = false, ok = true } = {}) => ({ key, label, value, kept, ok });

/** 元のファイルに書かれていた向き（1〜8）。無ければ null。 */
function originalOrientation(original) {
  if (!original) return null;
  const parsed = readSegments(original);
  if (!parsed.ok) return null;
  const segment = parsed.segments.find((one) => one.kind === 'exif');
  return segment ? readOrientation(segmentBody(original, segment)) : null;
}

/**
 * 書き出したJPEGを読み直して、区画ごとの結果を返す。
 * original を渡すと、向きを消したのか元から無かったのかの区別と、画素の一致まで見る。
 */
export function verifyRemoval(saved, original = null) {
  const parsed = readSegments(saved);
  if (!parsed.ok) return { ok: false, reason: parsed.reason, items: [], counts: {} };

  const kinds = parsed.segments.map((one) => one.kind);
  const rebuilt = parsed.segments.filter(
    (one) => one.kind === 'exif' && isOrientationOnlyExif(segmentBody(saved, one))
  ).length;
  const count = (...names) => kinds.filter((kind) => names.includes(kind)).length;

  const counts = {
    exif: count('exif') - rebuilt,
    xmp: count('xmp', 'xmp-extended'),
    iptc: count('iptc'),
    mpf: count('mpf'),
    comment: count('comment'),
    icc: count('icc'),
    orientation: rebuilt
  };

  const gone = (key, label) =>
    check(key, label, counts[key] === 0 ? 'なし' : `まだ${counts[key]}件残っています`, { ok: counts[key] === 0 });

  const items = [
    check(
      'exif',
      'Exif',
      counts.exif > 0
        ? `まだ${counts.exif}件残っています`
        : rebuilt > 0
          ? '向きの情報だけの32バイトに作り直しました'
          : 'なし',
      { ok: counts.exif === 0, kept: counts.exif === 0 && rebuilt > 0 }
    ),
    gone('xmp', 'XMP'),
    gone('iptc', 'IPTC'),
    gone('mpf', 'MPF'),
    gone('comment', 'コメント'),
    check(
      'icc',
      'ICCプロファイル',
      counts.icc > 0 ? '残しています（色が変わらないように）' : 'もともとありません',
      { kept: counts.icc > 0 }
    )
  ];

  const before = originalOrientation(original);
  const hadOrientation = Number.isInteger(before) && before !== 1;
  items.push(
    check(
      'orientation',
      '向きの情報',
      rebuilt > 0
        ? '残しています（縦写真が横倒しにならないように）'
        : hadOrientation
          ? '消しました'
          : 'もともとありません',
      { kept: rebuilt > 0 }
    )
  );

  let pixels = null;
  if (original) {
    const source = readSegments(original);
    if (source.ok) {
      pixels = sameBytes(saved.subarray(parsed.scanStart), original.subarray(source.scanStart));
      items.push(
        check('pixels', '画素のデータ', pixels ? '元のまま（1バイトも変えていません）' : '元と違います', { ok: pixels })
      );
    }
  }

  return { ok: true, counts, items, pixels };
}
