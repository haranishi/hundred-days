/* 貼られたURLの検証。中継（functions/api/day-035/）と画面の両方から使う。
   ここを通ったURLだけを取りに行く。内部ネットワークへ向かう形を手前で弾くのが目的。 */

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
export const MAX_URL_LENGTH = 2048;

/* 名前で内部を指すもの。Workers の fetch は外向きなので私設アドレスには届かないが、
   届かない先に投げる前に断ったほうが、返す言葉を選べる。 */
const RESERVED_NAME = /(^|\.)(localhost|local|internal|localdomain|home|lan|onion)$/i;

/* 数値だけのホスト（127.0.0.1・2130706433・0x7f.0.0.1・[::1]）を見分ける。
   ラベルが全部10進か16進なら名前ではない、という判定。
   先頭が数字なだけのホスト（3ds.com）は名前なので通る。 */
export function isNumericHost(host) {
  if (!host) return true;
  if (host.startsWith('[') || host.includes(':')) return true;
  return host.split('.').every((label) => /^(\d+|0x[0-9a-f]+)$/i.test(label));
}

export function validateTarget(value) {
  if (typeof value !== 'string') return null;
  // 全角で貼られた「ｈｔｔｐｓ：／／…」も NFKC で普通のURLになる
  const trimmed = value.normalize('NFKC').replace(CONTROL_CHARS, '').trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || isNumericHost(host) || RESERVED_NAME.test(host)) return null;
  if (!/^[a-z]{2,}$/.test(host.split('.').at(-1))) return null;
  url.hash = '';
  return url;
}

/* 紙面の欄外に出す出所。www. は落として短くする */
export function displayHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\d*\./, '');
  } catch {
    return '';
  }
}

/* 取りに行く側。リダイレクトは自分で追い、飛び先も毎回 validateTarget に通す。
   自動追跡に任せると、最初だけ正しいURLで、途中から内部向きへ飛ばされても気づけない。
   中継（functions/api/day-035/）だけが使う。ブラウザからは呼ばない。 */
export async function fetchGuarded(url, { fetchImpl = fetch, signal, headers = {}, maxRedirects = 3 } = {}) {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await fetchImpl(current.href, { headers, redirect: 'manual', signal });
    const status = response.status;
    if (status < 300 || status > 399) return { response, finalUrl: current };
    const location = response.headers.get('location');
    if (!location) return { response, finalUrl: current };
    let next;
    try {
      next = validateTarget(new URL(location, current).href);
    } catch {
      next = null;
    }
    if (!next) return { response: null, finalUrl: current, error: 'blocked_redirect' };
    current = next;
  }
  return { response: null, finalUrl: current, error: 'too_many_redirects' };
}
