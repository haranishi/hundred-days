// 公開URLの確認。この回線が rairakku.com の名前を引けない（DNS）ときだけ、行き先（pages.dev）の同じパスで代わりに確認する。
// 名前を引けない失敗に限る。HTTPエラーや接続拒否は、中継の不具合かもしれないので代わりにしない。
import { SITE_ORIGIN } from './publish-contract.mjs';

const DNS_ERROR_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);

export const errorCode = (error) => error?.cause?.code || error?.code || '';

/** 代わりの確認先を返す。代わりにできない失敗・URLなら null。 */
export function dnsFallbackUrl(error, url, { canonicalBase, siteOrigin = SITE_ORIGIN }) {
  if (!DNS_ERROR_CODES.has(errorCode(error))) return null;
  const base = `${String(canonicalBase).replace(/\/+$/, '')}/`;
  const target = String(url);
  if (!target.startsWith(base)) return null;
  return `${String(siteOrigin).replace(/\/+$/, '')}/${target.slice(base.length)}`;
}

/** 取得して { response, fetchedUrl, dnsError } を返す。dnsError は代わりの確認先で取ったときだけ入る。 */
export async function fetchPublicUrl(url, { fetchImpl = fetch, canonicalBase, siteOrigin, timeoutMs = 15000 } = {}) {
  const get = (target) => fetchImpl(target, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  try {
    return { response: await get(url), fetchedUrl: url, dnsError: '' };
  } catch (error) {
    const fallback = dnsFallbackUrl(error, url, { canonicalBase, siteOrigin });
    if (!fallback) throw error;
    return { response: await get(fallback), fetchedUrl: fallback, dnsError: errorCode(error) };
  }
}
