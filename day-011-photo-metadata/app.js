/* 画面の組み立てと、状態の切り替え。

   ■ 通信を1本も出さない
   このファイルには fetch がひとつだけあり、行き先は同じ場所に置いてある sample/sample.jpg だけ。
   利用者が置いた写真は、座標もファイル名も、どんな形でも外に出さない。
   例外の中身も画面に出さない（Exifの値やファイル名が混ざったものを、あとから外へ送る事故を防ぐ）。

   ■ 状態は main[data-state] ひとつで表す
   通った順は data-state-log に足していく。「読込中を必ず1回通ったか」をテストで見るため。 */

import { COPY } from './lib/copy.js';
import { readExif } from './lib/exif.js';
import { formatBytes } from './lib/format.js';
import { REMOVED_KINDS, isJpeg, readSegments, scanXmpRights, segmentBody, stripMetadata } from './lib/jpeg.js';
import { CONTAINER_LABELS, buildReport, verifyRemoval } from './lib/report.js';

const MAX_BYTES = 50 * 1024 * 1024;
// 一瞬で終わるときに「調べています」を出すと、偽の待ち時間を作ることになる
const LOADING_TEXT_DELAY = 120;

const GROUP_TITLES = {
  place: '撮った場所',
  person: 'あなたにつながるもの',
  settings: '撮影の設定'
};

const $ = (id) => document.getElementById(id);
const app = $('app');
const fileInput = $('file');
const loading = $('loading');
const groupsBox = $('groups');
const compare = $('compare');
const thumbImage = $('thumb-image');
const thumbCaption = $('thumb-caption');
const mainImage = $('main-image');
const mainCaption = $('main-caption');
const others = $('others');
const containers = $('containers');
const rights = $('rights');
const rightsList = $('rights-list');
const rightsCopied = $('rights-copied');
const orientationCheck = $('drop-orientation');
const orientationNote = $('orientation-note');
const orientationRow = orientationCheck.closest('.check');
const saved = $('saved');
const sampleNote = $('sample-note');
const verify = $('verify');
const verifyList = $('verify-list');

let current = null;
let thumbUrl = '';
let mainUrl = '';
let loadingTimer = 0;

// ---------------------------------------------------------------- 文言の流し込み

for (const node of document.querySelectorAll('[data-copy]')) {
  const value = COPY[node.dataset.copy];
  if (typeof value === 'string') node.textContent = value;
}

// ---------------------------------------------------------------- 状態

function setState(next) {
  app.dataset.state = next;
  const log = app.dataset.stateLog ? app.dataset.stateLog.split(',') : [];
  log.push(next);
  app.dataset.stateLog = log.join(',');
}

function startLoading() {
  setState('loading');
  loading.hidden = true;
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => {
    loading.hidden = false;
  }, LOADING_TEXT_DELAY);
}

function stopLoading() {
  clearTimeout(loadingTimer);
  loading.hidden = true;
}

function showInvalid(reason) {
  stopLoading();
  $('invalid-body').textContent = reason;
  setState('invalid');
}

function showError(reason) {
  stopLoading();
  $('error-body').textContent = reason;
  setState('error');
}

function reset() {
  releaseImages();
  current = null;
  fileInput.value = '';
  saved.hidden = true;
  verify.hidden = true;
  verifyList.replaceChildren();
  delete app.dataset.saved;
  orientationCheck.checked = false;
  setState('empty');
  // 「別の写真を試す」は画面のいちばん下にも置いてある。押した先が空の画面の途中では受け取れない
  window.scrollTo(0, 0);
}

/* 見比べに出している2枚は、どちらもこのページの中で作った blob。
   revoke し忘れると、別の写真に切り替えても前の写真がメモリに残る。 */
function releaseImages() {
  for (const [url, image] of [[thumbUrl, thumbImage], [mainUrl, mainImage]]) {
    if (!url) continue;
    URL.revokeObjectURL(url);
    image.removeAttribute('src');
  }
  thumbUrl = '';
  mainUrl = '';
}

// ---------------------------------------------------------------- 受け取り

async function receive(list) {
  const files = Array.from(list ?? []);
  startLoading();

  if (files.length > 1) return showInvalid(COPY.invalidMultiple);
  const file = files[0];
  if (!file) {
    stopLoading();
    setState('empty');
    return;
  }
  if (file.size === 0) return showInvalid(COPY.invalidEmpty);
  if (file.size > MAX_BYTES) return showInvalid(COPY.invalidTooBig);

  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    // 例外の中身は画面にも記録にも残さない（ファイル名が混ざりうるため）
    return showError(COPY.errorBody);
  }
  analyse(bytes, file.name, false);
}

function analyse(bytes, name, sample) {
  stopLoading();

  // 拡張子ではなく先頭バイトで判定する（.jpg に改名されたHEICを取り違えない）
  if (!isJpeg(bytes)) return setState('unsupported');

  const parsed = readSegments(bytes);
  if (!parsed.ok) return showError(COPY.errorBody);

  const kinds = parsed.segments.map((one) => one.kind);
  const exifSegment = parsed.segments.find((one) => one.kind === 'exif');
  const payload = exifSegment ? segmentBody(bytes, exifSegment) : null;
  const exif = payload ? readExif(payload) : null;
  /* Exifの中身が読めないだけなら error にしない。区画を落とすのは stripMetadata の仕事で、
     Exifの解析結果に依存しない。むしろ中身が読めない写真こそ、消せないと困る。
     error は「JPEGとして最後まで読めない」場合だけに絞る。 */
  const report = buildReport({ exif, kinds, xmpRights: scanXmpRights(bytes, parsed.segments) });

  current = { bytes, name, payload, report, size: bytes.length };
  render(report, sample);
  setState('result');
}

// ---------------------------------------------------------------- 表示

function row(item) {
  const wrap = document.createElement('div');
  wrap.className = 'row';

  const label = document.createElement('dt');
  label.className = 'row__label';
  label.textContent = item.label;

  const value = document.createElement('dd');
  value.className = 'row__value';
  const strong = document.createElement('span');
  strong.className = 'row__text';
  strong.textContent = item.value;
  value.append(strong);
  if (item.note) {
    const note = document.createElement('p');
    note.className = 'row__note';
    note.textContent = item.note;
    value.append(note);
  }
  /* 「検索すれば場所が分かる」と書いてある値は、検索窓へ持っていけないと画面の言葉が空手形になる。
     権利表示のコピーと同じ作法にそろえる。 */
  if (item.copy) {
    const line = document.createElement('div');
    line.className = 'row__copy';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--slim';
    button.textContent = `${item.label}をコピー`;
    const said = document.createElement('span');
    said.className = 'row__said';
    said.setAttribute('role', 'status');
    button.addEventListener('click', async () => {
      const ok = await copyText(item.copy);
      said.textContent = ok ? COPY.valueCopied : COPY.valueCopyFailed;
    });
    line.append(button, said);
    value.append(line);
  }

  wrap.append(label, value);
  return wrap;
}

function groupBox(group) {
  // 撮影の設定は初期状態で畳む（困り方が一段小さく、行数が多い）
  const folded = group.id === 'settings';
  const box = document.createElement(folded ? 'details' : 'section');
  box.className = 'group';
  box.dataset.level = group.id;

  const head = document.createElement(folded ? 'summary' : 'h3');
  head.className = 'group__head';
  const badge = document.createElement('span');
  // 危険度は色だけで示さない。必ず言葉のラベルを付ける
  badge.className = 'badge';
  badge.textContent = group.label;
  const title = document.createElement('span');
  title.className = 'group__title';
  title.textContent = GROUP_TITLES[group.id] ?? group.label;
  const count = document.createElement('span');
  count.className = 'group__count';
  count.textContent = `${group.items.length}件`;
  head.append(badge, title, count);

  const list = document.createElement('dl');
  list.className = 'group__list';
  for (const item of group.items) list.append(row(item));

  box.append(head, list);
  return box;
}

/* 権利表示の警告。見つけているあいだは出したままにする（一度きりの通知にしない）。
   「消すな」ではなく「確認しろ」と読めるように、値そのものも出して控えられるようにする。 */
function renderRights(found) {
  rights.hidden = !found.warn;
  $('rights-strong').hidden = !found.strong;
  $('rights-normal').hidden = found.holders.length === 0;
  $('rights-iptc').hidden = !found.iptc;

  const hasValues = found.holders.length > 0;
  rightsList.hidden = !hasValues;
  $('rights-keep').hidden = !hasValues;
  rightsCopied.textContent = '';
  rightsList.replaceChildren(
    ...found.holders.map((one) => {
      const line = document.createElement('li');
      const mark = one.indexOf('：');
      if (mark < 0) {
        line.textContent = one;
        return line;
      }
      /* 「著作権表示：」までは説明、そのあとが控えてもらう値。
         値を地の文と同じ扱いにすると、狭い画面で値の途中に折り返しが入って、
         どこまでが1つの値なのか読めなくなる。等幅の1行として分けて出す。 */
      const key = document.createElement('span');
      key.className = 'warn__key';
      key.textContent = one.slice(0, mark + 1);
      const value = document.createElement('code');
      value.className = 'warn__value';
      value.textContent = one.slice(mark + 1);
      line.append(key, value);
      return line;
    })
  );
}

/** 共通シェア（shared/share.js）と同じ作法。クリップボードが使えない環境の逃げ道も同じ。 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function renderContainers(report) {
  if (!report.containers.length) {
    containers.hidden = true;
    return;
  }
  const words = report.containers.map(
    (one) => `${one.label}（${REMOVED_KINDS.has(one.kind) ? '消す' : '残す'}）`
  );
  containers.textContent = `このファイルに入っていた区画：${words.join('・')}`;
  containers.hidden = false;
}

/* 埋め込みサムネイルは、本体と並べて初めて意味が分かる（切り落としたはずのものが縮小画像に残る）。
   どちらも blob URL で出す。ここでも外へは1バイトも出さない。 */
function renderCompare(report) {
  releaseImages();
  if (!report.thumbnail || !current?.payload) {
    compare.hidden = true;
    return;
  }
  const { start, length } = report.thumbnail;
  thumbUrl = URL.createObjectURL(
    new Blob([current.payload.subarray(start, start + length)], { type: 'image/jpeg' })
  );
  thumbImage.src = thumbUrl;
  thumbCaption.textContent = formatBytes(length);

  mainUrl = URL.createObjectURL(new Blob([current.bytes], { type: 'image/jpeg' }));
  mainImage.src = mainUrl;
  mainCaption.textContent = formatBytes(current.size);
  compare.hidden = false;
}

function render(report, sample) {
  const verdict = document.querySelector('.verdict');
  verdict.dataset.level = report.level;
  const nothing = report.level === 'none';
  $('verdict-tag').textContent = nothing ? '調べ終わりました' : 'この写真でいちばん困るもの';
  // 読み取れなかったことを「入っていなかった」と混ぜない
  $('verdict').textContent = report.unreadable ? COPY.unreadableTitle : nothing ? COPY.emptyResultTitle : report.headline;
  $('verdict-file').textContent = report.unreadable
    ? COPY.exifErrorNote
    : nothing
      ? COPY.emptyResultBody
      : `${formatBytes(current.size)}のJPEGを、ブラウザの中だけで調べました。`;

  groupsBox.replaceChildren(...report.groups.map(groupBox));

  renderCompare(report);
  renderContainers(report);

  others.hidden = report.others === 0;
  others.textContent = `ここに名前を出していないタグが、ほかに${report.others}件ありました（中身は出しません）。`;

  renderRights(report.rights);

  // 向きを作り直すのは、元の向きが1以外のときだけ。1のときは足すものが無い
  const keepsOrientation = Number.isInteger(report.orientation) && report.orientation !== 1;
  orientationRow.hidden = !keepsOrientation;
  orientationNote.hidden = !keepsOrientation;

  sampleNote.hidden = !sample;
  saved.hidden = true;
  verify.hidden = true;
  verifyList.replaceChildren();
  delete app.dataset.saved;
}

// ---------------------------------------------------------------- 保存

function cleanName(name) {
  const base = String(name || 'photo')
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, '');
  return `${base || 'photo'}-cleaned.jpg`;
}

function verifyRow(item) {
  const wrap = document.createElement('div');
  wrap.className = 'verify__row';
  wrap.dataset.kept = String(item.kept);
  wrap.dataset.ok = String(item.ok);

  const label = document.createElement('dt');
  label.className = 'verify__label';
  label.textContent = item.label;

  const value = document.createElement('dd');
  value.className = 'verify__value';
  value.textContent = item.value;

  wrap.append(label, value);
  return wrap;
}

/** 書き出したバイト列を、このアプリ自身でもう一度読み直して結果を出す。 */
function showVerification(bytes) {
  const checked = verifyRemoval(bytes, current.bytes);
  if (!checked.ok) {
    verify.hidden = true;
    return;
  }
  verifyList.replaceChildren(...checked.items.map(verifyRow));
  verify.hidden = false;
}

function save() {
  if (!current) return;
  const result = stripMetadata(current.bytes, { removeOrientation: orientationCheck.checked });
  if (!result.ok) return showError(COPY.errorBody);

  const url = URL.createObjectURL(new Blob([result.bytes], { type: 'image/jpeg' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = cleanName(current.name);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  showVerification(result.bytes);
  saved.hidden = false;
  app.dataset.saved = 'true';
}

// ---------------------------------------------------------------- 操作

$('pick').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => receive(fileInput.files));
$('download').addEventListener('click', save);
$('again').addEventListener('click', reset);
for (const button of document.querySelectorAll('[data-again]')) button.addEventListener('click', reset);

$('rights-copy').addEventListener('click', async () => {
  if (!current) return;
  const ok = await copyText(current.report.rights.holders.join('\n'));
  rightsCopied.textContent = ok ? COPY.rightsCopied : COPY.rightsCopyFailed;
});

$('sample').addEventListener('click', async () => {
  startLoading();
  try {
    // 行き先はこのページと同じ場所。ここ以外に通信は出さない
    const response = await fetch('./sample/sample.jpg', { cache: 'no-store' });
    if (!response.ok) throw new Error('sample');
    analyse(new Uint8Array(await response.arrayBuffer()), 'sample.jpg', true);
  } catch {
    showError(COPY.sampleLoadError);
  }
});

// 写真を落としたときにブラウザが勝手に開いてしまわないよう、ページ全体で受け止める
const drop = $('drop');
for (const type of ['dragenter', 'dragover']) {
  document.addEventListener(type, (event) => {
    event.preventDefault();
    drop.dataset.over = 'true';
  });
}
for (const type of ['dragleave', 'dragend']) {
  document.addEventListener(type, () => delete drop.dataset.over);
}
document.addEventListener('drop', (event) => {
  event.preventDefault();
  delete drop.dataset.over;
  receive(event.dataTransfer?.files);
});

// テストと手元での確認用。写真そのものや読み取った値は載せない
window.__day011 = {
  receive: (bytes, name) => analyse(new Uint8Array(bytes), name || 'test.jpg', false),
  get state() {
    return app.dataset.state;
  },
  get log() {
    return app.dataset.stateLog.split(',');
  }
};
