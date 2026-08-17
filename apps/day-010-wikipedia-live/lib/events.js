/* Wikimedia EventStreams の生イベントを、画面に出してよい形へ削ぎ落とす。
   このファイルの一番の役目は「持ち込まないこと」。生イベントには匿名編集者のIPアドレスが
   user フィールドでそのまま流れてくるので、正規化した時点で捨てて二度と触らない。 */

export const STREAM_URL = 'https://stream.wikimedia.org/v2/stream/recentchange';

// 「編集」として数えるのはこの2つだけ。カテゴリ追加(categorize)やログ操作(log)は数えない
export const COUNTED_TYPES = new Set(['edit', 'new']);

export const MASK = '●●●';

/* 利用者ページ・トーク・投稿記録へのリンク。名前空間の別名は日英どちらも来る */
const USER_LINK =
  /\[\[\s*(?:利用者(?:‐会話|・トーク|‐ノート)?|User(?:[ _]talk)?|特別:投稿記録|Special:Contributions)\s*[:：/][^\]]*\]\]/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
/* 4組以上のときだけIPv6とみなす。3組までにすると 12:34:56 のような時刻表記まで伏せてしまう */
const IPV6 = /\b(?:[0-9A-Fa-f]{1,4}:){3,7}[0-9A-Fa-f]{1,4}\b/g;
const SECTION = /\/\*\s*(.*?)\s*\*\//g;
const PIPED_LINK = /\[\[([^\]|]*)\|([^\]]*)\]\]/g;
const PLAIN_LINK = /\[\[([^\]]*)\]\]/g;

/** 編集要約から、人を指してしまう文字列を伏せる。伏せたかどうかも返す。 */
export function maskComment(comment) {
  const source = typeof comment === 'string' ? comment : '';
  if (!source) return { text: '', masked: false };

  let text = source.replace(USER_LINK, MASK).replace(IPV4, MASK).replace(IPV6, MASK);
  const masked = text !== source;

  text = text
    .replace(SECTION, (_, section) => (section ? `【${section}】` : ''))
    .replace(PIPED_LINK, (_, __, label) => label)
    .replace(PLAIN_LINK, (_, label) => label)
    .replace(/\s+/g, ' ')
    .trim();

  return { text, masked };
}

/** 長い要約を読める長さで切る。切ったことが分かるように末尾に … を付ける。 */
export function shorten(text, max = 90) {
  const source = typeof text === 'string' ? text : '';
  if (source.length <= max) return source;
  return `${source.slice(0, max - 1)}…`;
}

/**
 * 生イベント → 表示用。数えない種別なら null を返す。
 * 返り値に user は含めない（含めないことをテストで固定している）。
 */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!COUNTED_TYPES.has(raw.type)) return null;

  const lengths = raw.length && typeof raw.length === 'object' ? raw.length : {};
  const before = Number.isFinite(lengths.old) ? lengths.old : 0;
  const after = Number.isFinite(lengths.new) ? lengths.new : before;
  const wiki = typeof raw.wiki === 'string' ? raw.wiki : '';
  const comment = maskComment(raw.comment);
  const url = typeof raw.title_url === 'string' && raw.title_url.startsWith('https://') ? raw.title_url : '';

  return {
    id: raw.meta && typeof raw.meta.id === 'string' ? raw.meta.id : '',
    wiki,
    host: typeof raw.server_name === 'string' ? raw.server_name : '',
    title: typeof raw.title === 'string' ? raw.title : '',
    url,
    type: raw.type,
    namespace: Number.isFinite(raw.namespace) ? raw.namespace : -1,
    bot: raw.bot === true,
    minor: raw.minor === true,
    delta: after - before,
    size: after,
    comment: comment.text,
    commentMasked: comment.masked,
    ts: Number.isFinite(raw.timestamp) ? raw.timestamp * 1000 : 0,
    isJa: wiki === 'jawiki',
  };
}

/** カードとして読ませるのは日本語版ウィキペディアの記事本体だけ。ノートも利用者ページも出さない。 */
export function isReadable(event) {
  return Boolean(event) && event.isJa === true && event.namespace === 0;
}

/**
 * 一度数えたイベントを覚えておく入れ物。
 * 再接続でストリームが同じイベントを送り直しても、数字が二重に増えないようにする。
 */
export function createSeen(limit = 1000) {
  const ids = new Set();
  const order = [];
  return {
    /** 初めて見たイベントなら true。2回目以降は false。IDが無いイベントは常に true。 */
    accept(id) {
      if (!id) return true;
      if (ids.has(id)) return false;
      ids.add(id);
      order.push(id);
      if (order.length > limit) ids.delete(order.shift());
      return true;
    },
    get size() {
      return ids.size;
    },
  };
}
