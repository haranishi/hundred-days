// 別のサイトのページから、見ている人のブラウザを使って部屋に入る（WebSocket の乗っ取り）のを防ぐ。
import { isAppOrigin, isLocalHostname } from '../shared/hosts'

/**
 * Origin の見出しのホスト（名前とポート）が、届いた URL のホストと同じなら true。
 * Origin が無いもの（ブラウザ以外）・壊れたもの・"null" は通さない。
 */
export function isSameOrigin(originHeader: string | null, requestUrl: string): boolean {
  if (!originHeader || originHeader === 'null') return false
  try {
    return new URL(originHeader).host === new URL(requestUrl).host
  } catch {
    return false
  }
}

export function isAllowedOrigin(originHeader: string | null, requestUrl: string): boolean {
  if (!originHeader || originHeader === 'null') return false
  if (isSameOrigin(originHeader, requestUrl) || isAppOrigin(originHeader)) return true
  try {
    // 公開 Worker で localhost を許すと、許可リストを通らずに部屋へ入れてしまう。
    return isLocalHostname(new URL(requestUrl).hostname) && isLocalHostname(new URL(originHeader).hostname)
  } catch {
    return false
  }
}

export function corsHeaders(originHeader: string | null, requestUrl: string): Record<string, string> {
  if (!originHeader || isSameOrigin(originHeader, requestUrl) || !isAllowedOrigin(originHeader, requestUrl)) return {}
  return { 'access-control-allow-origin': originHeader, vary: 'Origin' }
}
